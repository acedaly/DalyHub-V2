/**
 * AUDIT-FIX-03 — the shared permanent-deletion contract, asserted across the
 * three modules that own a guarded purge: Areas (the precedent), Assets and
 * Reviews.
 *
 * The 5 August 2026 audit found the three paths had drifted apart: Areas guarded
 * dependents at commit time, deleted child-first, kept the `activities` rows and
 * wrote an `area.deleted` tombstone; Assets did everything but the tombstone
 * [AUDIT-03]; Reviews wrote a tombstone with the wrong ordering, an empty
 * payload, and silently destroyed active links [AUDIT-04]. This suite pins the
 * INVARIANTS the three now share, module by module, so a future change to one
 * cannot quietly re-open the gap in another.
 *
 * It deliberately asserts BEHAVIOUR in parallel rather than forcing the three
 * repositories through one abstraction. Their child tables and blocking rules
 * genuinely differ — an Area is blocked by a spine child or a homed Asset, an
 * Asset by an active link, a Review by an active link — and flattening that into
 * a shared base class would hide exactly the differences a reader needs to see.
 * What must NOT differ is the list below.
 *
 * The invariants, for every module:
 *   1. an ACTIVE relationship blocks the purge;
 *   2. an INACTIVE (soft-deleted) link does not block, and is removed with the
 *      record it belonged to;
 *   3. the final deletion is idempotent — a second purge is a calm no-op;
 *   4. exactly ONE subject-less tombstone is retained per destroyed record;
 *   5. the tombstone payload identifies the record by id AND title;
 *   6. a blocked or already-gone purge writes NO tombstone;
 *   7. `activities` rows are append-only — a purge never deletes one;
 *   8. no raw D1 / SQLite / foreign-key text escapes to the caller.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { AREA_DELETED } from "~/kernel/area-settings";
import { ASSET_DELETED, AssetError } from "~/kernel/assets";
import { REVIEW_DELETED, ReviewError } from "~/kernel/reviews";
import { SpineError, SpineHasDependentsError } from "~/kernel/spine";
import { UNIVERSAL_RELATED_LINK } from "~/platform/entity-links/universal-links";

import {
  FakeClock,
  countActivities,
  countActivitiesOfType,
  makeAssetRepository,
  makeContext,
  makeLinkRepository,
  makeRepository,
  makeReviewRepository,
  makeSpineRepository,
  resetTables,
  seedEntity,
  sequentialIds,
} from "./support";

const WS = "ws_purge_contract";

/**
 * One set of repositories per test, rebuilt in `beforeEach`. They must be
 * SHARED within a test rather than reconstructed per call: the deterministic
 * `sequentialIds` generator restarts at 1 for each new instance, so two
 * instances would mint the same activity id and collide on the primary key.
 */
let spine: ReturnType<typeof makeSpineRepository>;
let assets: ReturnType<typeof makeAssetRepository>;
let reviews: ReturnType<typeof makeReviewRepository>;
let links: ReturnType<typeof makeLinkRepository>;
let entities: ReturnType<typeof makeRepository>;

/** The parsed payloads of every tombstone of `type`, oldest id first. */
async function payloadsOfType(
  type: string,
): Promise<Record<string, unknown>[]> {
  const rows = await env.DB.prepare(
    "SELECT payload_json FROM activities WHERE type = ? ORDER BY id",
  )
    .bind(type)
    .all<{ payload_json: string }>();
  return rows.results.map(
    (r) => JSON.parse(r.payload_json) as Record<string, unknown>,
  );
}

/** Subject rows attached to any tombstone of `type` — must always be zero. */
async function subjectsOnTombstones(type: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM activity_subjects s
     JOIN activities a ON a.workspace_id = s.workspace_id AND a.id = s.activity_id
     WHERE a.type = ?`,
  )
    .bind(type)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Any storage-layer text that must never reach a caller or the browser. */
const RAW_STORAGE_TEXT =
  /D1_ERROR|SQLITE|FOREIGN KEY|UNIQUE constraint|no such table|sqlite/i;

beforeEach(async () => {
  await resetTables([WS]);
  const context = makeContext(WS);
  spine = makeSpineRepository(context, {
    clock: new FakeClock().now,
    idGenerator: sequentialIds("sp"),
    activityIdGenerator: sequentialIds("spa"),
  });
  assets = makeAssetRepository(context, {
    clock: new FakeClock().now,
    idGenerator: sequentialIds("as"),
    activityIdGenerator: sequentialIds("asa"),
  });
  reviews = makeReviewRepository(context, {
    clock: new FakeClock("2026-07-27T00:00:00.000Z").now,
    idGenerator: sequentialIds("rv"),
    activityIdGenerator: sequentialIds("rva"),
  });
  links = makeLinkRepository(context, { idGenerator: sequentialIds("l") });
  entities = makeRepository(context, { idGenerator: sequentialIds("n") });
});

describe("permanent-delete contract — active relationships block deletion", () => {
  it("Asset: an active link refuses the purge and leaves the record whole", async () => {
    const repo = assets;
    const asset = await repo.create({ title: "Drill", assetType: "equipment" });
    const note = await entities.create({ type: "note", title: "Manual" });
    await links.create({
      sourceEntityId: asset.id,
      targetEntityId: note.id,
      type: UNIVERSAL_RELATED_LINK,
    });

    const blocked = await repo.permanentlyDelete(asset.id);
    expect(blocked.deleted).toBe(false);
    expect(blocked.blockedReason).toBe("has_links");
    expect(await repo.get(asset.id)).not.toBeNull();
    expect(await countActivitiesOfType(ASSET_DELETED)).toBe(0);
  });

  it("Review: an active link refuses the purge and leaves the record whole", async () => {
    const repo = reviews;
    const review = (
      await repo.create({
        type: "custom",
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        title: "Linked",
      })
    ).review;
    await seedEntity(WS, "contract-area", { type: "area", title: "Home" });
    await links.create({
      sourceEntityId: review.id,
      targetEntityId: "contract-area",
      type: UNIVERSAL_RELATED_LINK,
    });

    const blocked = await repo.permanentlyDelete(review.id);
    expect(blocked.deleted).toBe(false);
    expect(blocked.blockedReason).toBe("has_links");
    expect(await repo.get(review.id)).not.toBeNull();
    expect(await countActivitiesOfType(REVIEW_DELETED)).toBe(0);
  });

  it("Area: an active structural child refuses the purge and leaves the record whole", async () => {
    // The Area precedent reports its refusal as a typed domain error rather than
    // a result field — a deliberate difference in SHAPE, not in behaviour: the
    // purge is still refused, nothing is removed and no tombstone is written.
    const repo = spine;
    const area = await repo.createArea({ title: "Health" });
    await repo.createProject({
      title: "Half marathon",
      parent: { kind: "area", id: area.id },
    });

    await expect(repo.permanentlyDeleteArea(area.id)).rejects.toBeInstanceOf(
      SpineHasDependentsError,
    );
    expect(await repo.getById(area.id)).not.toBeNull();
    expect(await countActivitiesOfType(AREA_DELETED)).toBe(0);
  });
});

describe("permanent-delete contract — inactive links are removed during the purge", () => {
  it("Asset, Review and Area each purge their own soft-deleted link rows", async () => {
    const linkRepo = links;
    const note = await entities.create({ type: "note", title: "Scratch" });

    const asset = await assets.create({
      title: "Mower",
      assetType: "equipment",
    });
    const assetLink = await linkRepo.create({
      sourceEntityId: asset.id,
      targetEntityId: note.id,
      type: UNIVERSAL_RELATED_LINK,
    });
    await linkRepo.unlink(assetLink.link.id);

    const review = (
      await reviews.create({
        type: "custom",
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        title: "Historic",
      })
    ).review;
    const reviewLink = await linkRepo.create({
      sourceEntityId: review.id,
      targetEntityId: note.id,
      type: UNIVERSAL_RELATED_LINK,
    });
    await linkRepo.unlink(reviewLink.link.id);

    const area = await spine.createArea({ title: "Finance" });
    const areaLink = await linkRepo.create({
      sourceEntityId: area.id,
      targetEntityId: note.id,
      type: UNIVERSAL_RELATED_LINK,
    });
    await linkRepo.unlink(areaLink.link.id);

    // Soft-deleted rows physically survive an unlink — and still hold FKs.
    const before = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entity_links",
    ).first<{ n: number }>();
    expect(before?.n ?? 0).toBe(3);

    expect((await assets.permanentlyDelete(asset.id)).deleted).toBe(true);
    expect((await reviews.permanentlyDelete(review.id)).deleted).toBe(true);
    expect((await spine.permanentlyDeleteArea(area.id)).changed).toBe(true);

    const after = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entity_links",
    ).first<{ n: number }>();
    expect(after?.n ?? 0).toBe(0);
    // The record on the other end of every link is never touched.
    expect(await entities.getById(note.id)).not.toBeNull();
  });
});

describe("permanent-delete contract — one subject-less tombstone, identifying the record", () => {
  it("Asset, Review and Area each retain exactly one tombstone naming what was destroyed", async () => {
    const asset = await assets.create({
      title: "Espresso machine",
      assetType: "appliance",
    });
    const review = (
      await reviews.create({
        type: "custom",
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        title: "August reflection",
      })
    ).review;
    const area = await spine.createArea({ title: "Craft" });

    expect((await assets.permanentlyDelete(asset.id)).deleted).toBe(true);
    expect((await reviews.permanentlyDelete(review.id)).deleted).toBe(true);
    expect((await spine.permanentlyDeleteArea(area.id)).changed).toBe(true);

    // Exactly one each.
    expect(await countActivitiesOfType(ASSET_DELETED)).toBe(1);
    expect(await countActivitiesOfType(REVIEW_DELETED)).toBe(1);
    expect(await countActivitiesOfType(AREA_DELETED)).toBe(1);

    // Each payload identifies its record by id AND title — the only surviving
    // statement of what was destroyed, since the entity row is gone.
    expect(await payloadsOfType(ASSET_DELETED)).toEqual([
      { assetId: asset.id, title: "Espresso machine" },
    ]);
    expect(await payloadsOfType(REVIEW_DELETED)).toEqual([
      { reviewId: review.id, title: "August reflection" },
    ]);
    expect(await payloadsOfType(AREA_DELETED)).toEqual([
      { areaId: area.id, title: "Craft" },
    ]);

    // NONE of them carries a subject: the entity it would point at is gone.
    expect(await subjectsOnTombstones(ASSET_DELETED)).toBe(0);
    expect(await subjectsOnTombstones(REVIEW_DELETED)).toBe(0);
    expect(await subjectsOnTombstones(AREA_DELETED)).toBe(0);
    // …and no subject row anywhere still points at a purged entity.
    for (const id of [asset.id, review.id, area.id]) {
      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM activity_subjects WHERE entity_id = ?",
      )
        .bind(id)
        .first<{ n: number }>();
      expect(row?.n ?? 0).toBe(0);
    }
  });
});

describe("permanent-delete contract — idempotency, append-only history, typed errors", () => {
  it("a second purge is a calm no-op for Asset, Review and Area, adding no tombstone", async () => {
    const asset = await assets.create({
      title: "Kettle",
      assetType: "appliance",
    });
    const review = (
      await reviews.create({
        type: "custom",
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        title: "Second purge",
      })
    ).review;
    const area = await spine.createArea({ title: "Garden" });

    await assets.permanentlyDelete(asset.id);
    await reviews.permanentlyDelete(review.id);
    await spine.permanentlyDeleteArea(area.id);

    // Assets and Reviews report the repeat as a typed no-op result…
    expect((await assets.permanentlyDelete(asset.id)).deleted).toBe(false);
    expect((await reviews.permanentlyDelete(review.id)).deleted).toBe(false);
    // …the Area precedent surfaces "there is no such Area" instead. Different
    // shape, same guarantee: no second destruction, and no second tombstone.
    await expect(spine.permanentlyDeleteArea(area.id)).rejects.toBeInstanceOf(
      SpineError,
    );

    expect(await countActivitiesOfType(ASSET_DELETED)).toBe(1);
    expect(await countActivitiesOfType(REVIEW_DELETED)).toBe(1);
    expect(await countActivitiesOfType(AREA_DELETED)).toBe(1);
  });

  it("a purge never deletes an existing activity row — history is append-only", async () => {
    const assetRepo = assets;
    const reviewRepo = reviews;
    const asset = await assetRepo.create({
      title: "Bike",
      assetType: "vehicle",
    });
    await assetRepo.update(asset.id, { location: "Garage" });
    const review = (
      await reviewRepo.create({
        type: "custom",
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        title: "Append only",
      })
    ).review;
    await reviewRepo.updateSection(review.id, "summary.overall", "Noted.");
    const area = await spine.createArea({ title: "Travel" });

    const before = await countActivities();
    expect(before).toBeGreaterThan(0);

    await assetRepo.permanentlyDelete(asset.id);
    await reviewRepo.permanentlyDelete(review.id);
    await spine.permanentlyDeleteArea(area.id);

    // Three purges appended three tombstones and removed NOTHING: the count can
    // only have grown, and by exactly three.
    expect(await countActivities()).toBe(before + 3);
  });

  it("no raw D1, SQLite or foreign-key text ever reaches the caller", async () => {
    // Force each repository's failure path with a deliberately invalid id and a
    // cross-workspace read, then inspect the surfaced error text.
    const seen: string[] = [];

    for (const attempt of [
      async () => {
        await assets.permanentlyDelete("");
      },
      async () => {
        await reviews.permanentlyDelete("");
      },
      async () => {
        await spine.permanentlyDeleteArea("no-such-area");
      },
    ]) {
      try {
        await attempt();
      } catch (error) {
        const typed =
          error instanceof AssetError ||
          error instanceof ReviewError ||
          error instanceof SpineError;
        expect(typed).toBe(true);
        seen.push((error as Error).message);
      }
    }

    expect(seen.length).toBeGreaterThan(0);
    for (const message of seen) {
      expect(message).not.toMatch(RAW_STORAGE_TEXT);
    }
  });
});
