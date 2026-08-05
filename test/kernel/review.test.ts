import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  REVIEW_ARCHIVED,
  REVIEW_COMPLETED,
  REVIEW_CREATED,
  REVIEW_DELETED,
  REVIEW_REOPENED,
  REVIEW_UPDATED,
  ReviewArchivedError,
  ReviewStorageError,
  ReviewValidationError,
} from "~/kernel/reviews";
import { ReservedEntityTypeError } from "~/kernel/entities";
import { REVIEWS_ACTIVITY_DESCRIPTORS } from "~/modules/reviews/review-activity";
import { UNIVERSAL_RELATED_LINK } from "~/platform/entity-links/universal-links";
import {
  buildWorkspaceActivityDescriptors,
  toActivityItem,
  type ActivityItem,
} from "~/shared/activity-feed/model";

import {
  countActivitiesOfType,
  countLinkRows,
  countReviewRows,
  countReviewSectionRows,
  countRows,
  FakeClock,
  latestActivityPayload,
  makeActivityRepository,
  makeContext,
  makeLinkRepository,
  makeRepository,
  makeReviewRepository,
  resetTables,
  seedEntity,
  sequentialIds,
} from "./support";

/** Flatten a rendered activity item's segments to the text a reader sees. */
function segmentText(item: ActivityItem): string {
  return item.presentation.segments
    .map((segment) => {
      if (segment.kind === "text" || segment.kind === "emphasis")
        return segment.text;
      if (segment.kind === "actor") return item.actor.label;
      return segment.entityId;
    })
    .join("");
}

const WS = "test-review-workspace";
const OTHER = "test-review-other";

function reviews(
  ws = WS,
  prefix = "review",
  options?: Parameters<typeof makeReviewRepository>[1],
) {
  return makeReviewRepository(makeContext(ws), {
    clock: new FakeClock("2026-07-27T00:00:00.000Z").now,
    idGenerator: sequentialIds(prefix),
    ...options,
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("Review repository", () => {
  it("atomically creates entity, detail, initial sections and Activity", async () => {
    const result = await reviews().create({
      type: "weekly",
      periodStart: "2026-07-27",
      periodEnd: "2026-08-02",
      title: "Weekly Review — 27 July–2 August 2026",
    });
    expect(result.outcome).toBe("created");
    expect(result.review.type).toBe("weekly");
    expect(result.review.status).toBe("draft");
    expect(result.review.periodStart).toBe("2026-07-27");
    expect(result.review.periodEnd).toBe("2026-08-02");
    expect(await countRows()).toBe(1);
    expect(await countReviewRows()).toBe(1);
    expect(await countReviewSectionRows()).toBe(10);
    expect(await countActivitiesOfType(REVIEW_CREATED)).toBe(1);
  });

  it("rejects invalid input and rolls back injected create failures", async () => {
    await expect(
      reviews().create({
        type: "custom",
        periodStart: "2026-08-02",
        periodEnd: "2026-07-27",
        title: "Bad",
      }),
    ).rejects.toBeInstanceOf(ReviewValidationError);
    expect(await countRows()).toBe(0);
    await expect(
      reviews(WS, "broken", { createFault: "after-details" }).create({
        type: "weekly",
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        title: "Broken",
      }),
    ).rejects.toBeTruthy();
    expect(await countRows()).toBe(0);
    expect(await countReviewRows()).toBe(0);
    expect(await countActivitiesOfType(REVIEW_CREATED)).toBe(0);
  });

  it("reserves review creation to the Review repository", async () => {
    await expect(
      makeRepository(makeContext(WS)).create({ type: "review", title: "X" }),
    ).rejects.toBeInstanceOf(ReservedEntityTypeError);
  });

  it("prevents duplicate standard periods while allowing overlapping custom reviews", async () => {
    const repo = reviews();
    const first = await repo.create({
      type: "monthly",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      title: "July Review",
    });
    const duplicate = await repo.create({
      type: "monthly",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      title: "Duplicate July",
    });
    expect(duplicate.outcome).toBe("existing");
    expect(duplicate.review.id).toBe(first.review.id);
    await repo.create({
      type: "custom",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-15",
      title: "First custom",
    });
    await repo.create({
      type: "custom",
      periodStart: "2026-07-10",
      periodEnd: "2026-07-31",
      title: "Second custom",
    });
    expect(await countReviewRows()).toBe(3);
  });

  it("restores an archived standard-period duplicate instead of creating another identity", async () => {
    const repo = reviews();
    const first = await repo.create({
      type: "annual",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      title: "Annual",
    });
    await repo.archive(first.review.id);
    const duplicate = await repo.create({
      type: "annual",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      title: "Annual duplicate",
    });
    expect(duplicate.outcome).toBe("existing_restored");
    expect(duplicate.review.id).toBe(first.review.id);
    expect(duplicate.review.archivedAt).toBeNull();
    expect(await countReviewRows()).toBe(1);
  });

  it("keeps workspaces isolated in reads and lists", async () => {
    const other = await reviews(OTHER, "other").create({
      type: "weekly",
      periodStart: "2026-07-27",
      periodEnd: "2026-08-02",
      title: "Other",
    });
    expect(await reviews().get(other.review.id)).toBeNull();
    expect(
      (await reviews().list({ view: "current", today: "2026-07-28" })).items,
    ).toEqual([]);
  });

  it("updates sections without leaking private reflection text to Activity payloads", async () => {
    const repo = reviews();
    const review = (
      await repo.create({
        type: "weekly",
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        title: "Weekly",
      })
    ).review;
    await repo.updateSection(
      review.id,
      "summary.overall",
      "Private reflection about people, diary and decisions.",
    );
    expect(await countActivitiesOfType(REVIEW_UPDATED)).toBe(1);
    expect(await latestActivityPayload(REVIEW_UPDATED)).toBe(
      '{"sections":["summary.overall"]}',
    );
  });

  it("completes, reopens, archives and restores with structural Activity", async () => {
    const repo = reviews();
    const review = (
      await repo.create({
        type: "weekly",
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        title: "Weekly",
      })
    ).review;
    const completed = await repo.complete(review.id);
    expect(completed.review.status).toBe("completed");
    expect(completed.review.completedAt).not.toBeNull();
    const reopened = await repo.reopen(review.id);
    expect(reopened.review.status).toBe("in_progress");
    expect(reopened.review.completedAt).toBeNull();
    await repo.archive(review.id);
    await expect(
      repo.updateSection(review.id, "summary.lessons", "Nope"),
    ).rejects.toBeInstanceOf(ReviewArchivedError);
    const restored = await repo.restore(review.id);
    expect(restored.review.archivedAt).toBeNull();
    expect(await countActivitiesOfType(REVIEW_COMPLETED)).toBe(1);
    expect(await countActivitiesOfType(REVIEW_REOPENED)).toBe(1);
    expect(await countActivitiesOfType(REVIEW_ARCHIVED)).toBe(1);
  });

  it("resolves concurrent duplicate standard creation deterministically", async () => {
    const [a, b] = await Promise.all([
      reviews(WS, "raceA").create({
        type: "quarterly",
        periodStart: "2026-07-01",
        periodEnd: "2026-09-30",
        title: "Q3",
      }),
      reviews(WS, "raceB").create({
        type: "quarterly",
        periodStart: "2026-07-01",
        periodEnd: "2026-09-30",
        title: "Q3 duplicate",
      }),
    ]);
    expect(a.review.id).toBe(b.review.id);
    expect(await countReviewRows()).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* AUDIT-04 / DEBT-80 — permanent deletion integrity                          */
/* -------------------------------------------------------------------------- */

/**
 * The V2.0.1 defects, all reproduced against real Workers/D1 before the fix:
 *
 *   1. The Activity append was placed FIRST in the purge batch. The recorder's
 *      `WHERE changes() > 0` guard reads the statement IMMEDIATELY BEFORE it, so
 *      a leading append fired off a stale, unrelated change count — two raced
 *      purges wrote TWO tombstones for one destroyed Review.
 *   2. The tombstone payload was `{}`, so the event could not say WHICH Review
 *      was destroyed once the entity row was gone.
 *   3. The batch then deleted every `activity_subjects` row for the Review —
 *      including the subject it had just inserted for its own event.
 *   4. ACTIVE links were deleted outright rather than refusing the purge.
 *   5. Two concurrent purges left the loser raising
 *      `ReviewStorageError: D1_ERROR: FOREIGN KEY constraint failed` instead of
 *      an idempotent no-op.
 */
describe("Review permanent deletion (guarded)", () => {
  async function rowsReferencing(table: string, column: string, id: string) {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`,
    )
      .bind(id)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async function tombstonePayloads(): Promise<
    { reviewId?: string; title?: string }[]
  > {
    const rows = await env.DB.prepare(
      "SELECT payload_json FROM activities WHERE type = ? ORDER BY id",
    )
      .bind(REVIEW_DELETED)
      .all<{ payload_json: string }>();
    return rows.results.map(
      (r) =>
        JSON.parse(r.payload_json) as { reviewId?: string; title?: string },
    );
  }

  /** Subject rows attached to any `review.deleted` event (must always be zero). */
  async function tombstoneSubjectCount(): Promise<number> {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM activity_subjects s
       JOIN activities a ON a.workspace_id = s.workspace_id AND a.id = s.activity_id
       WHERE a.type = ?`,
    )
      .bind(REVIEW_DELETED)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async function makeReview(repo = reviews(), title = "Weekly") {
    return (
      await repo.create({
        type: "custom",
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        title,
      })
    ).review;
  }

  it("Review test 1 — a successful purge writes exactly one subject-less review.deleted tombstone", async () => {
    const repo = reviews();
    const review = await makeReview(repo, "Weekly Review — 27 July 2026");
    // Authored sections and historical Activity that must survive as events.
    await repo.updateSection(review.id, "summary.overall", "A good week.");
    await repo.updateSection(review.id, "summary.lessons", "Ship smaller.");
    await repo.complete(review.id);
    const historicalBefore =
      (await countActivitiesOfType(REVIEW_CREATED)) +
      (await countActivitiesOfType(REVIEW_UPDATED)) +
      (await countActivitiesOfType(REVIEW_COMPLETED));
    expect(historicalBefore).toBe(4);
    expect(await countReviewSectionRows()).toBe(10);
    expect(
      await rowsReferencing("activity_subjects", "entity_id", review.id),
    ).toBeGreaterThan(0);

    const result = await repo.permanentlyDelete(review.id);
    expect(result.deleted).toBe(true);

    // Entity, details and every section row are gone.
    expect(await repo.get(review.id, { includeDeleted: true })).toBeNull();
    expect(await rowsReferencing("entities", "id", review.id)).toBe(0);
    expect(await countReviewRows()).toBe(0);
    expect(await countReviewSectionRows()).toBe(0);

    // The append-only Activity rows SURVIVE (ADR-012); only their obsolete
    // subject pointers to the vanished entity are removed.
    expect(
      (await countActivitiesOfType(REVIEW_CREATED)) +
        (await countActivitiesOfType(REVIEW_UPDATED)) +
        (await countActivitiesOfType(REVIEW_COMPLETED)),
    ).toBe(historicalBefore);
    expect(
      await rowsReferencing("activity_subjects", "entity_id", review.id),
    ).toBe(0);

    // Exactly ONE tombstone, naming the Review, with NO subject row of its own.
    expect(await countActivitiesOfType(REVIEW_DELETED)).toBe(1);
    expect(await tombstonePayloads()).toEqual([
      { reviewId: review.id, title: "Weekly Review — 27 July 2026" },
    ]);
    expect(await tombstoneSubjectCount()).toBe(0);

    // The workspace feed renders it truthfully, naming the destroyed Review from
    // the payload rather than an anonymous "this review".
    const page = await makeActivityRepository(makeContext(WS)).listForWorkspace(
      {
        type: REVIEW_DELETED,
      },
    );
    expect(page.items).toHaveLength(1);
    // Asserted against BOTH descriptor maps that can carry this event. The
    // module map is the Reviews surface; the CROSS-MODULE map is what the Today /
    // workspace feed builds from — and that is the surface that matters here,
    // because the Review's own record page no longer exists to read it on.
    for (const descriptors of [
      REVIEWS_ACTIVITY_DESCRIPTORS,
      buildWorkspaceActivityDescriptors(),
    ]) {
      const item = toActivityItem(page.items[0], { descriptors });
      expect(item.isKnownType).toBe(true);
      expect(item.subjects).toEqual([]);
      expect(segmentText(item)).toContain("permanently deleted");
      expect(segmentText(item)).toContain("Weekly Review — 27 July 2026");
    }
  });

  it("Review test 2 — a second purge is an idempotent no-op with no ReviewStorageError", async () => {
    const repo = reviews();
    const review = await makeReview(repo, "Purge twice");

    const first = await repo.permanentlyDelete(review.id);
    const second = await repo.permanentlyDelete(review.id);

    expect(first.deleted).toBe(true);
    expect(second.deleted).toBe(false);
    expect(second.blockedReason).toBeUndefined();
    expect(await countActivitiesOfType(REVIEW_DELETED)).toBe(1);
    expect(await tombstonePayloads()).toEqual([
      { reviewId: review.id, title: "Purge twice" },
    ]);
  });

  it("Review test 3 — two concurrent purges: one deletes, one no-ops, and neither leaks a D1 error", async () => {
    const review = await makeReview(reviews(), "Concurrent");
    // Two independent repositories, so BOTH pre-read the Review as present and
    // both submit their guarded batch — the exact stale-read race that used to
    // surface a raw FOREIGN KEY constraint failure to the caller.
    const a = reviews(WS, "concA");
    const b = reviews(WS, "concB");
    const settled = await Promise.allSettled([
      a.permanentlyDelete(review.id),
      b.permanentlyDelete(review.id),
    ]);

    // Neither call may reject: expected concurrency loss is a result, not a throw.
    expect(settled.every((s) => s.status === "fulfilled")).toBe(true);
    const outcomes = settled.map((s) =>
      s.status === "fulfilled" ? s.value.deleted : "threw",
    );
    expect(outcomes.filter((o) => o === true)).toHaveLength(1);
    expect(outcomes.filter((o) => o === false)).toHaveLength(1);

    // Exactly one tombstone, and no partial Review records left behind.
    expect(await countActivitiesOfType(REVIEW_DELETED)).toBe(1);
    expect(await tombstoneSubjectCount()).toBe(0);
    expect(await tombstonePayloads()).toEqual([
      { reviewId: review.id, title: "Concurrent" },
    ]);
    expect(await countReviewRows()).toBe(0);
    expect(await countReviewSectionRows()).toBe(0);
    expect(await rowsReferencing("entities", "id", review.id)).toBe(0);
  });

  it("Review test 4 — an active link blocks the purge and writes no tombstone; unlinking releases it", async () => {
    const repo = reviews();
    const review = await makeReview(repo, "Linked review");
    await repo.updateSection(review.id, "summary.overall", "Reflection kept.");
    await seedEntity(WS, "area-linked", { type: "area", title: "Health" });
    const links = makeLinkRepository(makeContext(WS));
    const created = await links.create({
      sourceEntityId: review.id,
      targetEntityId: "area-linked",
      type: UNIVERSAL_RELATED_LINK,
    });
    expect(await countLinkRows()).toBe(1);

    const blocked = await repo.permanentlyDelete(review.id);
    expect(blocked.deleted).toBe(false);
    expect(blocked.blockedReason).toBe("has_links");
    expect(blocked.linkCount).toBe(1);

    // The active relationship SURVIVES — it is never severed to make a delete
    // succeed — and so does every Review row.
    expect(await countLinkRows()).toBe(1);
    expect(await countReviewRows()).toBe(1);
    expect(await countReviewSectionRows()).toBe(10);
    expect(await rowsReferencing("entities", "id", review.id)).toBe(1);
    expect(await countActivitiesOfType(REVIEW_DELETED)).toBe(0);
    // The linked Area is untouched.
    expect(
      await makeRepository(makeContext(WS)).getById("area-linked"),
    ).not.toBeNull();

    // Once the owner unlinks, the purge succeeds.
    await links.unlink(created.link.id);
    const ok = await repo.permanentlyDelete(review.id);
    expect(ok.deleted).toBe(true);
    expect(await countActivitiesOfType(REVIEW_DELETED)).toBe(1);
    expect(
      await makeRepository(makeContext(WS)).getById("area-linked"),
    ).not.toBeNull();
  });

  it("Review test 5 — a SOFT-DELETED link does not block, and its stale row is purged", async () => {
    const repo = reviews();
    const review = await makeReview(repo, "Formerly linked");
    await seedEntity(WS, "area-soft", { type: "area", title: "Career" });
    const links = makeLinkRepository(makeContext(WS));
    const created = await links.create({
      sourceEntityId: review.id,
      targetEntityId: "area-soft",
      type: UNIVERSAL_RELATED_LINK,
    });
    await links.unlink(created.link.id);
    // The physical row survives an unlink — it is the historical record of a
    // relationship that once existed, and it still holds a foreign key.
    expect(await countLinkRows()).toBe(1);

    const result = await repo.permanentlyDelete(review.id);
    expect(result.deleted).toBe(true);
    // The stale row is removed with the Review it belonged to, leaving nothing
    // dangling — but the Area it pointed at is untouched.
    expect(await countLinkRows()).toBe(0);
    expect(await countActivitiesOfType(REVIEW_DELETED)).toBe(1);
    expect(
      await makeRepository(makeContext(WS)).getById("area-soft"),
    ).not.toBeNull();
  });

  it("Review test 6 — an injected failure rolls the entity deletion AND its tombstone back together", async () => {
    for (const fault of ["after-entity", "after-tombstone"] as const) {
      await resetTables([WS, OTHER]);
      const repo = reviews(WS, `f_${fault}`, { deleteFault: fault });
      const review = await makeReview(repo, "Rollback");
      await repo.updateSection(review.id, "summary.overall", "Kept.");
      const activitiesBefore = await countActivitiesOfType(REVIEW_UPDATED);

      await expect(repo.permanentlyDelete(review.id)).rejects.toBeInstanceOf(
        ReviewStorageError,
      );

      // Nothing committed independently: entity, details, sections and subject
      // pointers all survive, and no tombstone exists.
      expect(await rowsReferencing("entities", "id", review.id)).toBe(1);
      expect(await countReviewRows()).toBe(1);
      expect(await countReviewSectionRows()).toBe(10);
      expect(
        await rowsReferencing("activity_subjects", "entity_id", review.id),
      ).toBeGreaterThan(0);
      expect(await countActivitiesOfType(REVIEW_DELETED)).toBe(0);
      expect(await countActivitiesOfType(REVIEW_UPDATED)).toBe(
        activitiesBefore,
      );
      expect(await repo.get(review.id)).not.toBeNull();
    }
  });

  it("a cross-workspace caller cannot purge a Review, and forges no tombstone", async () => {
    const review = await makeReview(reviews(), "Private");
    const foreign = reviews(OTHER, "foreign");
    const result = await foreign.permanentlyDelete(review.id);
    expect(result.deleted).toBe(false);
    expect(await countReviewRows()).toBe(1);
    expect(await countActivitiesOfType(REVIEW_DELETED)).toBe(0);
  });
});
