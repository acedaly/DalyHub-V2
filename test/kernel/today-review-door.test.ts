/**
 * STEER-05 — the week's door, against REAL D1 and the REAL Today loader.
 *
 * The pure state rule is `test/unit/today/review-door.test.ts`; the one-period-
 * authority claim is `test/unit/today/review-door-authority.test.ts`. What only
 * a real database can prove is here:
 *
 *   1. **The existence read is the same question creation asks.**
 *      `findPeriodEntry` and `create`'s idempotency lookup agree, in both
 *      directions, over every lifecycle state a Review can be in.
 *   2. **The three states are reachable through the actual loader**, from
 *      nothing, to underway, to completed — and the door's period is the
 *      owner's week under the owner's own `firstDayOfWeek`.
 *   3. **The budget** (criterion 3). `readTodayReviewDoor` is exactly ONE
 *      bounded statement; Today's whole payload costs the SAME number of
 *      statements in every one of the three states; and the absolute figure is
 *      pinned, so the day cannot grow a second Reviews read without this file
 *      going red.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import { createActivityActorContext } from "~/kernel/activity";
import { currentReviewPeriod, reviewTemplateId } from "~/kernel/reviews";
import type { FirstDayOfWeek } from "~/kernel/preferences";
import { bindWorkspaceRepositories } from "~/platform/workspaces";
import { loadTodayDay } from "~/modules/today/day/load";
import { readTodayReviewDoor } from "~/modules/today/day/review-door";

import { countingDb, makeContext, resetTables } from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_review_door_other";
const ZONE = "Australia/Brisbane";

/**
 * A FIXED owner day, so the week the door names is known rather than whatever
 * the suite happens to run on. 2026-08-26 is a Wednesday: a Monday-start week
 * runs 24–30 August and a Sunday-start week runs 23–29 August, which is what
 * makes the preference visible in the answer.
 */
const TODAY = "2026-08-26";

function scopeFor(db: D1Database = env.DB, ws = WS) {
  return bindWorkspaceRepositories(
    { DB: db },
    makeContext(ws),
    createActivityActorContext({ type: "user", id: "owner-1" }),
  );
}

function facts(overrides: { readonly firstDayOfWeek?: FirstDayOfWeek } = {}) {
  return {
    now: new Date(`${TODAY}T00:00:00.000Z`),
    timezone: ZONE,
    todayIso: TODAY,
    dateLong: "Wednesday 26 August 2026",
    hour: 9,
    ownerName: null,
    firstDayOfWeek: overrides.firstDayOfWeek ?? ("monday" as const),
    dateFormat: "d_mmm_yyyy" as const,
  };
}

/** Create the weekly Review the owner's current week would get. */
async function createCurrentWeekly(firstDayOfWeek: FirstDayOfWeek = "monday") {
  const period = currentReviewPeriod("weekly", TODAY, firstDayOfWeek);
  return scopeFor().reviews.create({
    type: "weekly",
    periodStart: period.start,
    periodEnd: period.end,
    templateId: reviewTemplateId("weekly"),
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* One question, asked once                                                    */
/* -------------------------------------------------------------------------- */

describe("the existence read is the question creation asks", () => {
  it("finds nothing before a Review exists, and the Review after", async () => {
    const scope = scopeFor();
    const period = currentReviewPeriod("weekly", TODAY, "monday");

    expect(
      await scope.reviews.findPeriodEntry("weekly", period.start, period.end),
    ).toBeNull();

    const created = await createCurrentWeekly();
    expect(created.outcome).toBe("created");

    const found = await scope.reviews.findPeriodEntry(
      "weekly",
      period.start,
      period.end,
    );
    expect(found?.id).toBe(created.review.id);
    expect(found?.title).toBe(created.review.title);
    expect(found?.periodStart).toBe(period.start);
    expect(found?.periodEnd).toBe(period.end);
    expect(found?.status).toBe("draft");
    expect(found?.archived).toBe(false);
  });

  it("agrees with creation's own idempotency: a second create returns the found Review", async () => {
    const first = await createCurrentWeekly();
    const again = await createCurrentWeekly();
    expect(again.outcome).toBe("existing");
    expect(again.review.id).toBe(first.review.id);

    const period = currentReviewPeriod("weekly", TODAY, "monday");
    const found = await scopeFor().reviews.findPeriodEntry(
      "weekly",
      period.start,
      period.end,
    );
    // The whole point of exposing creation's lookup: "there already is one" and
    // "is there one?" cannot become two rules that disagree.
    expect(found?.id).toBe(first.review.id);
  });

  it("reports the lifecycle honestly through every state", async () => {
    const scope = scopeFor();
    const period = currentReviewPeriod("weekly", TODAY, "monday");
    const created = await createCurrentWeekly();
    const read = () =>
      scope.reviews.findPeriodEntry("weekly", period.start, period.end);

    await scope.reviews.setStatus(created.review.id, "in_progress");
    expect((await read())?.status).toBe("in_progress");

    await scope.reviews.complete(created.review.id);
    expect((await read())?.status).toBe("completed");

    await scope.reviews.archive(created.review.id);
    const archived = await read();
    expect(archived?.archived).toBe(true);

    await scope.reviews.restore(created.review.id);
    expect((await read())?.archived).toBe(false);
  });

  it("never answers with another period's Review, or another workspace's", async () => {
    const scope = scopeFor();
    const period = currentReviewPeriod("weekly", TODAY, "monday");
    // The week BEFORE the owner's current one.
    await scope.reviews.create({
      type: "weekly",
      periodStart: "2026-08-17",
      periodEnd: "2026-08-23",
      templateId: reviewTemplateId("weekly"),
    });
    expect(
      await scope.reviews.findPeriodEntry("weekly", period.start, period.end),
    ).toBeNull();

    // …and a Review for the same week in a different workspace.
    await scopeFor(env.DB, OTHER).reviews.create({
      type: "weekly",
      periodStart: period.start,
      periodEnd: period.end,
      templateId: reviewTemplateId("weekly"),
    });
    expect(
      await scope.reviews.findPeriodEntry("weekly", period.start, period.end),
    ).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The three states, through the real loader                                   */
/* -------------------------------------------------------------------------- */

describe("Today offers the current period's Review", () => {
  it("offers Start when the week has no Review", async () => {
    const day = await loadTodayDay(scopeFor(), facts());
    expect(day.reviewDoor.state).toBe("start");
    expect(day.reviewDoor.href).toBe("/reviews/new");
    expect(day.reviewDoor.reviewId).toBeNull();
    // The period is the owner's week, from the ONE authority — and it is named.
    expect(day.reviewDoor.periodStart).toBe("2026-08-24");
    expect(day.reviewDoor.periodEnd).toBe("2026-08-30");
    expect(day.reviewDoor.periodLabel).toBe("24 Aug 2026–30 Aug 2026");
  });

  it("offers Continue into the guided flow once one is underway", async () => {
    const created = await createCurrentWeekly();
    const day = await loadTodayDay(scopeFor(), facts());
    expect(day.reviewDoor.state).toBe("continue");
    expect(day.reviewDoor.reviewId).toBe(created.review.id);
    expect(day.reviewDoor.href).toBe(
      `/reviews/${encodeURIComponent(created.review.id)}/guide`,
    );
  });

  it("shows the quiet completed state, and offers no urging, once it is done", async () => {
    const created = await createCurrentWeekly();
    await scopeFor().reviews.complete(created.review.id);

    const day = await loadTodayDay(scopeFor(), facts());
    expect(day.reviewDoor.state).toBe("completed");
    // The canonical record, to re-read — never back into the guided flow.
    expect(day.reviewDoor.href).toBe(
      `/reviews/${encodeURIComponent(created.review.id)}`,
    );
    // The period is still named, so the completed state says WHICH week closed.
    expect(day.reviewDoor.periodLabel).toBe("24 Aug 2026–30 Aug 2026");
  });

  it("reads the owner's own week start, so the offer and the Review agree", async () => {
    /*
     * The preference is the whole reason this must go through
     * `currentReviewPeriod`. A Sunday-start owner's current week is 23–29
     * August, not 24–30, and a door that had derived its own Monday week would
     * offer to start a Review the workspace already holds.
     */
    const created = await createCurrentWeekly("sunday");
    expect(created.review.periodStart).toBe("2026-08-23");

    const sunday = await loadTodayDay(
      scopeFor(),
      facts({ firstDayOfWeek: "sunday" }),
    );
    expect(sunday.reviewDoor.periodStart).toBe("2026-08-23");
    expect(sunday.reviewDoor.periodEnd).toBe("2026-08-29");
    expect(sunday.reviewDoor.state).toBe("continue");
    expect(sunday.reviewDoor.reviewId).toBe(created.review.id);

    // The SAME workspace, read as a Monday-start owner, is a different week —
    // and that week has no Review, so the honest answer is "start one".
    const monday = await loadTodayDay(scopeFor(), facts());
    expect(monday.reviewDoor.periodStart).toBe("2026-08-24");
    expect(monday.reviewDoor.state).toBe("start");
  });

  it("keeps the door standing when the Reviews read fails", async () => {
    /*
     * `safely` is the day's rule and the door obeys it: a failing section costs
     * ITSELF, never the page. Here the whole scope is unusable, so the loader
     * takes every fallback — and the door still names the owner's real week and
     * still offers the way in, because which week it is is arithmetic over a
     * preference rather than a read.
     */
    const broken = {
      prepare: () => {
        throw new Error("no database");
      },
    } as unknown as D1Database;
    const day = await loadTodayDay(scopeFor(broken), facts());
    expect(day.reviewDoor.state).toBe("start");
    expect(day.reviewDoor.periodStart).toBe("2026-08-24");
    expect(day.reviewDoor.href).toBe("/reviews/new");
  });
});

/* -------------------------------------------------------------------------- */
/* The budget (criterion 3)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What Today's loader costs on an empty workspace.
 *
 * MEASURED at **20** on `main` immediately before STEER-05, **21** with the
 * week's door, and **22** since V2.7 RECALL-03. DEBT-34's closing condition
 * asked for "query count unchanged", and this item could not honour it: nothing
 * Today already reads touches `review_details`, so there was no existing
 * statement for the existence read to ride on. The cost is therefore recorded
 * rather than absorbed — ADR-110 decision 7's posture — here, in
 * `TODAY_DASHBOARD.md`, and in the debt entry itself. Pinning the absolute
 * figure is what makes a SECOND Reviews read, or a per-state read, fail this
 * file rather than pass unnoticed.
 *
 * ── Why it moved to 22 (V2.7 RECALL-03) ─────────────────────────────────────
 *
 * The attention rail's waiting row learned ONE additional fact — how many
 * waiting Tasks have a follow-up due — and that fact costs exactly ONE bounded
 * aggregate (`countWaitingTasks`), read in parallel beside the waiting page
 * inside `readWaiting`. The roadmap budgeted "at most one bounded count read"
 * and "Today's 21-statement budget moves by at most 1, and the test that pins
 * it is updated deliberately, never quietly"; this comment IS that deliberate
 * update.
 *
 * It could not ride an existing statement. The waiting PAGE is bounded at
 * `WAITING_LIMIT` (50), so counting follow-ups over its rows would understate
 * the fact on any workspace holding more waiting work than that — the same
 * class of quiet untruth RECALL-03 removes from the Waiting subtitle. A count
 * the database answers for the whole workspace is worth one statement.
 *
 * The figure stays ABSOLUTE and pinned: a second follow-up read, a per-Task
 * count, or a digest read leaking into Today's loader fails here.
 */
const TODAY_STATEMENT_BUDGET = 22;

describe("the door costs exactly one bounded statement", () => {
  it("is one statement on its own, found or not", async () => {
    const counting = countingDb(env.DB);
    const scope = scopeFor(counting.db);
    const input = {
      todayIso: TODAY,
      firstDayOfWeek: "monday" as const,
      dateFormat: "d_mmm_yyyy" as const,
    };

    counting.reset();
    await readTodayReviewDoor(scope, input);
    expect(counting.prepareCount()).toBe(1);

    await createCurrentWeekly();
    counting.reset();
    const found = await readTodayReviewDoor(scope, input);
    expect(found.state).toBe("continue");
    // Finding one must not cost a section read: the door asked a yes/no
    // question and `ReviewPeriodEntry` is the shape that answers it in one.
    expect(counting.prepareCount()).toBe(1);
  });

  it("costs Today the same in all three states, and no more than the pinned budget", async () => {
    const counting = countingDb(env.DB);
    const measure = async () => {
      counting.reset();
      const day = await loadTodayDay(scopeFor(counting.db), facts());
      return { count: counting.prepareCount(), state: day.reviewDoor.state };
    };

    const start = await measure();
    expect(start.state).toBe("start");
    expect(start.count).toBe(TODAY_STATEMENT_BUDGET);

    const created = await createCurrentWeekly();
    const underway = await measure();
    expect(underway.state).toBe("continue");
    expect(underway.count).toBe(TODAY_STATEMENT_BUDGET);

    await scopeFor().reviews.complete(created.review.id);
    const done = await measure();
    expect(done.state).toBe("completed");
    expect(done.count).toBe(TODAY_STATEMENT_BUDGET);
  });
});
