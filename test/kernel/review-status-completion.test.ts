/**
 * DEBT-187 — there is ONE path to a completed Review, and it captures the
 * snapshot.
 *
 * The Review record edited its status with a native `<select>` plus a **Save
 * status** button, in a Settings row directly above a **Complete review**
 * command. The two controls were not equivalent, and that was the real finding
 * rather than the interaction one: `intent=set_status` wrote the column, while
 * `intent=complete` ALSO captured the REVIEW-03 `review_insight_snapshots` row
 * — the record of what was true at this Review point, and the only thing that
 * lets the NEXT Review say what changed. Choosing "Completed" from the select
 * therefore completed a Review with no snapshot behind it, silently and
 * irreversibly (a re-completion refreshes a snapshot; it cannot recover a
 * period whose facts have since moved).
 *
 * These drive the ROUTE rather than the repository, because the route is where
 * the two paths diverged, and they assert the DATABASE rather than a response
 * body, because the response was `{ ok: true }` in both cases — which is
 * exactly why nothing caught it.
 */

import { RouterContextProvider } from "react-router";
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "~/kernel/auth";
import { addCalendarDays } from "~/kernel/datetime";
import { setAuthenticatedSession } from "~/platform/request";
import { action as reviewMutateAction } from "~/modules/reviews/routes/mutate";

import {
  FakeClock,
  makeContext,
  makeReviewRepository,
  resetTables,
  sequentialIds,
} from "./support";

/** The route resolves the authenticated owner's DEFAULT workspace. */
const WS = "test-default-workspace";

/*
 * ONE generator for the whole file. Building it inside `reviewRepo()` would hand
 * every seeded Review the same id, which silently makes a two-Review assertion
 * about one Review — the exact shape DEBT-173 is about, at one file's scale.
 */
const nextReviewId = sequentialIds("debt187-review");

function reviewRepo() {
  return makeReviewRepository(makeContext(WS), {
    clock: new FakeClock("2026-08-24T00:00:00.000Z").now,
    idGenerator: nextReviewId,
  });
}

/*
 * A DISTINCT period per seeded Review, deliberately.
 *
 * `create` is idempotent for a (type, period) pair, so two calls with the same
 * week hand back the SAME Review — which would quietly turn the two-path
 * assertion below into one Review completed twice, and make it a test that
 * cannot fail. Each seed takes its own week.
 */
let seedWeek = 0;
async function seedWeeklyReview(): Promise<string> {
  const start = addCalendarDays("2026-08-17", seedWeek * -7);
  seedWeek += 1;
  const { review } = await reviewRepo().create({
    type: "weekly",
    periodStart: start,
    periodEnd: addCalendarDays(start, 6),
  });
  return review.id;
}

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject: "owner", email: "owner@example.com", displayName: null },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

async function mutate(
  reviewId: string,
  fields: Record<string, string>,
): Promise<{ readonly status: number; readonly body: unknown }> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const response = (await reviewMutateAction({
    request: new Request(`https://app.test/reviews/${reviewId}/mutate`, {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: { reviewId },
  } as unknown as Parameters<typeof reviewMutateAction>[0])) as Response;
  return { status: response.status, body: await response.json() };
}

async function storedStatus(reviewId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT status FROM review_details WHERE workspace_id = ? AND entity_id = ?",
  )
    .bind(WS, reviewId)
    .first<{ status: string }>();
  return row?.status ?? null;
}

async function snapshotCount(reviewId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM review_insight_snapshots WHERE workspace_id = ? AND review_id = ?",
  )
    .bind(WS, reviewId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

describe("DEBT-187 — no route to a completed Review skips its snapshot", () => {
  beforeEach(async () => {
    await resetTables([WS]);
    seedWeek = 0;
  });

  it("captures the snapshot when the status field reaches `completed`", async () => {
    /*
     * The failing case. Against the previous implementation this test reaches
     * `completed` with ZERO snapshot rows: `set_status` wrote the column and
     * returned `{ ok: true }`, and the Review was completed with nothing behind
     * it.
     */
    const reviewId = await seedWeeklyReview();
    expect(await snapshotCount(reviewId)).toBe(0);

    const result = await mutate(reviewId, {
      intent: "set_status",
      status: "completed",
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ kind: "lifecycle", ok: true });
    expect(await storedStatus(reviewId)).toBe("completed");
    expect(await snapshotCount(reviewId)).toBe(1);
  });

  it("captures the snapshot when the Complete command is used", async () => {
    // The path that was always correct, asserted so the convergence cannot be
    // "fixed" by breaking the other one.
    const reviewId = await seedWeeklyReview();
    const result = await mutate(reviewId, { intent: "complete" });

    expect(result.body).toMatchObject({ kind: "lifecycle", ok: true });
    expect(await storedStatus(reviewId)).toBe("completed");
    expect(await snapshotCount(reviewId)).toBe(1);
  });

  it("the two paths are the SAME act, not two similar ones", async () => {
    const viaField = await seedWeeklyReview();
    const viaCommand = await seedWeeklyReview();
    // Two Reviews, not one — see `seedWeeklyReview`.
    expect(viaField).not.toBe(viaCommand);
    await mutate(viaField, { intent: "set_status", status: "completed" });
    await mutate(viaCommand, { intent: "complete" });

    expect(await storedStatus(viaField)).toBe(await storedStatus(viaCommand));
    expect(await snapshotCount(viaField)).toBe(await snapshotCount(viaCommand));
    expect(await snapshotCount(viaField)).toBe(1);
  });

  it("still writes an ordinary status without capturing anything", async () => {
    // `draft` and `in progress` are the values that are genuinely a choice, and
    // neither is a completion — so neither writes a snapshot.
    const reviewId = await seedWeeklyReview();
    const result = await mutate(reviewId, {
      intent: "set_status",
      status: "in_progress",
    });

    expect(result.body).toMatchObject({ kind: "lifecycle", ok: true });
    expect(await storedStatus(reviewId)).toBe("in_progress");
    expect(await snapshotCount(reviewId)).toBe(0);
  });
});
