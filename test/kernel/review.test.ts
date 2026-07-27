import { beforeEach, describe, expect, it } from "vitest";

import {
  REVIEW_ARCHIVED,
  REVIEW_COMPLETED,
  REVIEW_CREATED,
  REVIEW_REOPENED,
  REVIEW_UPDATED,
  ReviewArchivedError,
  ReviewValidationError,
} from "~/kernel/reviews";
import { ReservedEntityTypeError } from "~/kernel/entities";
import { UNIVERSAL_RELATED_LINK } from "~/platform/entity-links/universal-links";

import {
  countActivitiesOfType,
  countLinkRows,
  countReviewRows,
  countReviewSectionRows,
  countRows,
  FakeClock,
  latestActivityPayload,
  makeContext,
  makeLinkRepository,
  makeRepository,
  makeReviewRepository,
  resetTables,
  seedEntity,
  sequentialIds,
} from "./support";

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

  it("permanently deletes Review-owned rows and links without deleting linked records", async () => {
    const repo = reviews();
    const review = (
      await repo.create({
        type: "weekly",
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        title: "Weekly",
      })
    ).review;
    await seedEntity(WS, "area-1", { type: "area", title: "Health" });
    await makeLinkRepository(makeContext(WS)).create({
      sourceEntityId: review.id,
      targetEntityId: "area-1",
      type: UNIVERSAL_RELATED_LINK,
    });
    expect(await countLinkRows()).toBe(1);
    const deleted = await repo.permanentlyDelete(review.id);
    expect(deleted.deleted).toBe(true);
    expect(await countReviewRows()).toBe(0);
    expect(await countReviewSectionRows()).toBe(0);
    expect(await countLinkRows()).toBe(0);
    expect(
      await makeRepository(makeContext(WS)).getById("area-1"),
    ).not.toBeNull();
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
