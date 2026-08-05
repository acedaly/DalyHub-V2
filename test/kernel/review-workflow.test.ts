/**
 * REVIEW-02 — the guided weekly Review against the REAL Workers runtime and D1.
 *
 * Everything here runs the committed migrations against an isolated local D1, so
 * these are the tests that prove the storage contract rather than the model:
 * the migration applies over realistic populated data, existing Reviews keep
 * working with no backfill, workspace isolation holds, the authored-content
 * concurrency guard actually refuses a stale write, navigation writes no
 * Activity, and the purge takes the new child rows with it.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  REVIEW_UPDATED,
  ReviewArchivedError,
  ReviewConflictError,
  ReviewNotFoundError,
  ReviewValidationError,
  answeredReviewSectionIds,
  deriveWeeklyReviewProgress,
  type WeeklyReviewStepId,
} from "~/kernel/reviews";

import {
  FakeClock,
  makeContext,
  makeReviewRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-review-workflow-workspace";
const OTHER = "test-review-workflow-other";

function reviews(
  ws = WS,
  prefix = "review",
  isoNow = "2026-08-03T00:00:00.000Z",
) {
  return makeReviewRepository(makeContext(ws), {
    clock: new FakeClock(isoNow).now,
    idGenerator: sequentialIds(prefix),
  });
}

async function weekly(repo = reviews()) {
  const { review } = await repo.create({
    type: "weekly",
    periodStart: "2026-07-27",
    periodEnd: "2026-08-02",
  });
  return review;
}

async function countWorkflowRows(table: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{
    n: number;
  }>();
  return row?.n ?? 0;
}

async function countActivity(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM activities",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* Migration compatibility                                                     */
/* -------------------------------------------------------------------------- */

describe("migration 0029 over existing Reviews", () => {
  it("creates both tables with the closed step vocabulary enforced", async () => {
    const tables = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'
         AND name IN ('review_workflow_state', 'review_step_acknowledgements')
       ORDER BY name`,
    ).all<{ name: string }>();
    expect((tables.results ?? []).map((row) => row.name)).toEqual([
      "review_step_acknowledgements",
      "review_workflow_state",
    ]);

    const review = await weekly();
    await expect(
      env.DB.prepare(
        `INSERT INTO review_workflow_state
           (workspace_id, review_id, current_step, revision, updated_at)
         VALUES (?, ?, 'not-a-step', 1, '2026-08-03T00:00:00.000Z')`,
      )
        .bind(WS, review.id)
        .run(),
    ).rejects.toThrow();
  });

  it("leaves a populated pre-existing Review untouched and readable", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    await repo.updateSection(review.id, "summary.overall", "A good week.");
    await repo.updateSection(review.id, "summary.next_focus", "Ship SET-02.");

    // No guided-flow row exists for it — exactly the state every Review created
    // before this migration is in.
    expect(await countWorkflowRows("review_workflow_state")).toBe(0);
    expect(await countWorkflowRows("review_step_acknowledgements")).toBe(0);

    const state = await repo.getWorkflowState(review.id);
    expect(state.currentStep).toBeNull();
    expect(state.acknowledgedSteps).toEqual([]);
    expect(state.revision).toBe(0);
    expect(state.updatedAt).toBeNull();

    // And the derived position is sensible rather than a crash or step one.
    const stored = await repo.get(review.id);
    const progress = deriveWeeklyReviewProgress({
      status: stored!.status,
      answeredSectionIds: answeredReviewSectionIds(stored!.sections),
      inboxRemaining: 0,
      acknowledgedSteps: state.acknowledgedSteps,
      bookmarkedStep: state.currentStep,
    });
    expect(progress.currentStepId).toBe("overview");
    expect(progress.canComplete).toBe(true);
  });

  it("preserves the Review's stored template version", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    expect(review.templateId).toBe("review.weekly.v1");
    await repo.setWorkflowStep(review.id, "reflection");
    await repo.setStepAcknowledged(review.id, "projects", true);
    const after = await repo.get(review.id);
    expect(after?.templateId).toBe("review.weekly.v1");
  });
});

/* -------------------------------------------------------------------------- */
/* The resume bookmark                                                         */
/* -------------------------------------------------------------------------- */

describe("the resume bookmark", () => {
  it("persists a deliberate position and reads it back", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    const result = await repo.setWorkflowStep(review.id, "projects");
    expect(result.changed).toBe(true);
    expect(result.conflict).toBe(false);
    expect(result.state.currentStep).toBe("projects");
    expect(result.state.revision).toBe(1);

    const reread = await repo.getWorkflowState(review.id);
    expect(reread.currentStep).toBe("projects");
    expect(reread.updatedAt).not.toBeNull();
  });

  it("advances the revision on every accepted move", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    await repo.setWorkflowStep(review.id, "inbox");
    const second = await repo.setWorkflowStep(review.id, "projects");
    expect(second.state.revision).toBe(2);
  });

  it("treats a move to the step already stored as an idempotent no-op", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    await repo.setWorkflowStep(review.id, "inbox");
    const again = await repo.setWorkflowStep(review.id, "inbox");
    expect(again.changed).toBe(false);
    expect(again.conflict).toBe(false);
    expect(again.state.revision).toBe(1);
  });

  it("refuses a stale write rather than overwriting a newer position", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    // Tab A and tab B both loaded revision 1.
    await repo.setWorkflowStep(review.id, "inbox");
    // Tab B moves on.
    await repo.setWorkflowStep(review.id, "alignment", { expectedRevision: 1 });
    // Tab A, still holding revision 1, tries to move.
    const stale = await repo.setWorkflowStep(review.id, "projects", {
      expectedRevision: 1,
    });
    expect(stale.conflict).toBe(true);
    expect(stale.changed).toBe(false);
    // Nothing was overwritten: tab B's position stands.
    expect(stale.state.currentStep).toBe("alignment");
    expect((await repo.getWorkflowState(review.id)).currentStep).toBe(
      "alignment",
    );
  });

  it("rejects a step id outside the closed vocabulary", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    await expect(
      repo.setWorkflowStep(review.id, "wizard" as WeeklyReviewStepId),
    ).rejects.toBeInstanceOf(ReviewValidationError);
  });

  it("refuses to move the bookmark on an archived Review", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    await repo.archive(review.id);
    await expect(
      repo.setWorkflowStep(review.id, "inbox"),
    ).rejects.toBeInstanceOf(ReviewArchivedError);
  });

  it("does not disclose a Review that is not in this workspace", async () => {
    const review = await weekly(reviews());
    await expect(
      reviews(OTHER, "other").setWorkflowStep(review.id, "inbox"),
    ).rejects.toBeInstanceOf(ReviewNotFoundError);
    expect(
      (await reviews(OTHER, "other2").getWorkflowState(review.id)).currentStep,
    ).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Explicit acknowledgements                                                   */
/* -------------------------------------------------------------------------- */

describe("explicit step acknowledgements", () => {
  it("records and withdraws a deliberate decision, idempotently", async () => {
    const repo = reviews();
    const review = await weekly(repo);

    const first = await repo.setStepAcknowledged(review.id, "projects", true);
    expect(first.changed).toBe(true);
    expect(first.state.acknowledgedSteps).toEqual(["projects"]);

    const again = await repo.setStepAcknowledged(review.id, "projects", true);
    expect(again.changed).toBe(false);
    expect(again.state.acknowledgedSteps).toEqual(["projects"]);

    const removed = await repo.setStepAcknowledged(
      review.id,
      "projects",
      false,
    );
    expect(removed.changed).toBe(true);
    expect(removed.state.acknowledgedSteps).toEqual([]);
  });

  it("returns acknowledgements in canonical step order, not insertion order", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    await repo.setStepAcknowledged(review.id, "alignment", true);
    await repo.setStepAcknowledged(review.id, "overview", true);
    await repo.setStepAcknowledged(review.id, "inbox", true);
    expect((await repo.getWorkflowState(review.id)).acknowledgedSteps).toEqual([
      "overview",
      "inbox",
      "alignment",
    ]);
  });

  it("refuses to acknowledge the completion step — its truth is the lifecycle", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    await expect(
      repo.setStepAcknowledged(review.id, "complete", true),
    ).rejects.toBeInstanceOf(ReviewValidationError);
  });

  it("keeps another workspace's acknowledgements invisible", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    await repo.setStepAcknowledged(review.id, "projects", true);
    expect(
      (await reviews(OTHER, "o").getWorkflowState(review.id)).acknowledgedSteps,
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Activity                                                                    */
/* -------------------------------------------------------------------------- */

describe("Activity", () => {
  it("writes NO Activity for navigation or acknowledgement", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    const before = await countActivity();

    await repo.setWorkflowStep(review.id, "inbox");
    await repo.setWorkflowStep(review.id, "projects");
    await repo.setStepAcknowledged(review.id, "projects", true);
    await repo.setStepAcknowledged(review.id, "projects", false);

    expect(await countActivity()).toBe(before);
  });

  it("still writes exactly one event for a genuine section change", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    const before = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE type = ?",
    )
      .bind(REVIEW_UPDATED)
      .first<{ n: number }>();
    await repo.updateSection(review.id, "summary.overall", "Something real");
    const after = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE type = ?",
    )
      .bind(REVIEW_UPDATED)
      .first<{ n: number }>();
    expect((after?.n ?? 0) - (before?.n ?? 0)).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Authored-content concurrency                                                */
/* -------------------------------------------------------------------------- */

describe("authored-response concurrency", () => {
  it("accepts a write that quotes the version it loaded", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    const loaded = review.sections.find(
      (section) => section.sectionId === "summary.overall",
    )!;
    const result = await repo.updateSection(
      review.id,
      "summary.overall",
      "First draft",
      { expectedUpdatedAt: loaded.updatedAt },
    );
    expect(result.changed).toBe(true);
    expect(
      result.review.sections.find((s) => s.sectionId === "summary.overall")
        ?.body,
    ).toBe("First draft");
  });

  it("refuses a stale write, and the newer text survives", async () => {
    // The clock has to move, or the two writes share a timestamp and there is
    // nothing to detect.
    const first = reviews(WS, "review", "2026-08-03T00:00:00.000Z");
    const review = await weekly(first);
    const base = review.sections.find(
      (s) => s.sectionId === "summary.overall",
    )!.updatedAt;

    const later = reviews(WS, "review-b", "2026-08-03T01:00:00.000Z");
    await later.updateSection(review.id, "summary.overall", "Phone version");

    // The desktop tab still holds the version it loaded.
    await expect(
      later.updateSection(review.id, "summary.overall", "Desktop version", {
        expectedUpdatedAt: base,
      }),
    ).rejects.toBeInstanceOf(ReviewConflictError);

    const after = await later.get(review.id);
    expect(
      after?.sections.find((s) => s.sectionId === "summary.overall")?.body,
    ).toBe("Phone version");
  });

  it("treats re-saving identical text as a harmless no-op, not a conflict", async () => {
    const repo = reviews(WS, "review", "2026-08-03T00:00:00.000Z");
    const review = await weekly(repo);
    const later = reviews(WS, "review-b", "2026-08-03T01:00:00.000Z");
    await later.updateSection(review.id, "summary.overall", "Same text");
    const stored = (await later.get(review.id))!.sections.find(
      (s) => s.sectionId === "summary.overall",
    )!;
    const result = await later.updateSection(
      review.id,
      "summary.overall",
      "Same text",
      { expectedUpdatedAt: stored.updatedAt },
    );
    expect(result.changed).toBe(false);
  });

  it("leaves the unversioned path exactly as it was", async () => {
    const repo = reviews(WS, "review", "2026-08-03T00:00:00.000Z");
    const review = await weekly(repo);
    const later = reviews(WS, "review-b", "2026-08-03T01:00:00.000Z");
    await later.updateSection(review.id, "summary.overall", "One");
    // No expected version quoted: the historical last-write-wins behaviour.
    const result = await later.updateSection(
      review.id,
      "summary.overall",
      "Two",
    );
    expect(result.changed).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Lifecycle and purge                                                         */
/* -------------------------------------------------------------------------- */

describe("lifecycle interaction", () => {
  it("keeps the bookmark and acknowledgements across complete and reopen", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    await repo.updateSection(review.id, "summary.overall", "Done well");
    await repo.updateSection(review.id, "summary.next_focus", "Next up");
    await repo.setWorkflowStep(review.id, "complete");
    await repo.setStepAcknowledged(review.id, "projects", true);

    await repo.complete(review.id);
    let state = await repo.getWorkflowState(review.id);
    expect(state.currentStep).toBe("complete");
    expect(state.acknowledgedSteps).toEqual(["projects"]);

    await repo.reopen(review.id);
    state = await repo.getWorkflowState(review.id);
    expect(state.currentStep).toBe("complete");
    expect(state.acknowledgedSteps).toEqual(["projects"]);

    const reopened = await repo.get(review.id);
    expect(reopened?.status).toBe("in_progress");
    expect(reopened?.completedAt).toBeNull();
    // The responses written during the guided flow survive untouched.
    expect(
      reopened?.sections.find((s) => s.sectionId === "summary.next_focus")
        ?.body,
    ).toBe("Next up");
  });

  it("takes the guided-flow rows with the Review when it is purged", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    await repo.setWorkflowStep(review.id, "projects");
    await repo.setStepAcknowledged(review.id, "projects", true);
    expect(await countWorkflowRows("review_workflow_state")).toBe(1);
    expect(await countWorkflowRows("review_step_acknowledgements")).toBe(1);

    const result = await repo.permanentlyDelete(review.id);
    expect(result.deleted).toBe(true);
    expect(await countWorkflowRows("review_workflow_state")).toBe(0);
    expect(await countWorkflowRows("review_step_acknowledgements")).toBe(0);
  });

  it("still writes exactly one purge tombstone with the new child deletes in place", async () => {
    const repo = reviews();
    const review = await weekly(repo);
    await repo.setWorkflowStep(review.id, "inbox");
    await repo.permanentlyDelete(review.id);
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE type = 'review.deleted'",
    ).first<{ n: number }>();
    expect(row?.n).toBe(1);
    // A repeat purge is an idempotent no-op that writes no second tombstone.
    expect((await repo.permanentlyDelete(review.id)).deleted).toBe(false);
    const again = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE type = 'review.deleted'",
    ).first<{ n: number }>();
    expect(again?.n).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Weekly periods and the first-day-of-week preference                         */
/* -------------------------------------------------------------------------- */

describe("weekly periods stay wall-calendar", () => {
  it("keeps duplicate-period protection with the guided flow in play", async () => {
    const repo = reviews();
    const first = await weekly(repo);
    await repo.setWorkflowStep(first.id, "reflection");
    const second = await repo.create({
      type: "weekly",
      periodStart: "2026-07-27",
      periodEnd: "2026-08-02",
    });
    expect(second.outcome).toBe("existing");
    expect(second.review.id).toBe(first.id);
    // One Review, one bookmark — never a second identity for the same week.
    expect(await countWorkflowRows("review_workflow_state")).toBe(1);
  });

  it("keeps a period crossing a month and a year boundary as stored strings", async () => {
    const repo = reviews();
    const { review } = await repo.create({
      type: "weekly",
      periodStart: "2025-12-29",
      periodEnd: "2026-01-04",
    });
    await repo.setWorkflowStep(review.id, "focus");
    const stored = await repo.get(review.id);
    expect(stored?.periodStart).toBe("2025-12-29");
    expect(stored?.periodEnd).toBe("2026-01-04");
  });
});
