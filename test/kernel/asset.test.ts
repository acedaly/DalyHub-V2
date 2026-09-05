/**
 * ASSET-01 — Asset kernel / D1 integration tests (real Workers runtime, isolated D1).
 *
 * Proves the load-bearing repository guarantees: atomic create (entity + detail +
 * one event), validation-writes-nothing, reserved-type guard, fail-closed reads,
 * workspace isolation, archive/restore, status transitions, money precision, date &
 * URL validation, cursor pagination + scope binding + invalid-cursor rejection, the
 * expiring-soon and service-due queries, Activity privacy (no serial/policy numbers,
 * prices or private notes ever reach a payload), injected-failure rollback, and the
 * guarded permanent delete.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  ASSET_ARCHIVED,
  ASSET_CREATED,
  ASSET_DELETED,
  ASSET_DISPOSED,
  ASSET_STATUS_CHANGED,
  ASSET_UPDATED,
  AssetNotFoundError,
  AssetStorageError,
  AssetValidationError,
  InvalidAssetCursorError,
} from "~/kernel/assets";
import { ReservedEntityTypeError } from "~/kernel/entities";
import { ASSETS_ACTIVITY_DESCRIPTORS } from "~/modules/assets/asset-activity";
import {
  buildWorkspaceActivityDescriptors,
  toActivityItem,
  type ActivityItem,
} from "~/shared/activity-feed/model";

import { env } from "cloudflare:test";

import {
  countActivitiesOfType,
  countAssetRows,
  countRows,
  FakeClock,
  latestActivityPayload,
  makeActivityRepository,
  makeAssetHistoryRepository,
  makeObligationRepository,
  makeAssetRepository,
  makeContext,
  makeLinkRepository,
  makeRepository,
  resetTables,
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

const WS = "test-default-workspace";
const OTHER = "ws_asset_other";

function assets(
  ws = WS,
  prefix = "a",
  options?: Parameters<typeof makeAssetRepository>[1],
) {
  return makeAssetRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
    ...options,
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("create", () => {
  it("atomically writes entity, detail and one asset.created event", async () => {
    const repo = assets();
    const asset = await repo.create({ title: "Ute", assetType: "vehicle" });
    expect(asset.title).toBe("Ute");
    expect(asset.assetType).toBe("vehicle");
    expect(asset.status).toBe("active");
    expect(await countRows()).toBe(1);
    expect(await countAssetRows()).toBe(1);
    expect(await countActivitiesOfType(ASSET_CREATED)).toBe(1);
  });

  it("parses money to integer minor units without floats", async () => {
    const repo = assets();
    const asset = await repo.create({
      title: "Fridge",
      assetType: "appliance",
      currencyCode: "AUD",
      purchasePrice: "1234.56",
      replacementValue: "2000",
    });
    expect(asset.purchasePriceMinor).toBe(123456);
    expect(asset.replacementValueMinor).toBe(200000);
    expect(asset.currencyCode).toBe("AUD");
  });

  it("rejects invalid input and writes nothing", async () => {
    await expect(
      assets().create({ title: "   ", assetType: "vehicle" }),
    ).rejects.toBeInstanceOf(AssetValidationError);
    await expect(
      assets().create({ title: "X", assetType: "not-a-type" }),
    ).rejects.toBeInstanceOf(AssetValidationError);
    await expect(
      assets().create({
        title: "X",
        assetType: "vehicle",
        purchasePrice: "12.999",
        currencyCode: "AUD",
      }),
    ).rejects.toBeInstanceOf(AssetValidationError);
    await expect(
      assets().create({
        title: "X",
        assetType: "vehicle",
        warrantyExpiry: "2026-13-40",
      }),
    ).rejects.toBeInstanceOf(AssetValidationError);
    await expect(
      assets().create({
        title: "X",
        assetType: "vehicle",
        url: "javascript:alert(1)",
      }),
    ).rejects.toBeInstanceOf(AssetValidationError);
    expect(await countRows()).toBe(0);
    expect(await countAssetRows()).toBe(0);
  });

  it("the generic entity repository refuses to create an asset", async () => {
    await expect(
      makeRepository(makeContext(WS)).create({ type: "asset", title: "X" }),
    ).rejects.toBeInstanceOf(ReservedEntityTypeError);
  });

  it("rolls the whole create back on an injected batch failure", async () => {
    const repo = assets(WS, "a", { createFault: "after-details" });
    await expect(
      repo.create({ title: "Y", assetType: "tool" }),
    ).rejects.toBeTruthy();
    expect(await countRows()).toBe(0);
    expect(await countAssetRows()).toBe(0);
    expect(await countActivitiesOfType(ASSET_CREATED)).toBe(0);
  });
});

describe("read + isolation", () => {
  it("fails closed: missing / wrong-type / cross-workspace read as null", async () => {
    const repo = assets();
    const asset = await repo.create({
      title: "Laptop",
      assetType: "electronics",
    });
    expect(await repo.get("nope")).toBeNull();
    // Same id in another workspace is invisible here.
    expect(await assets(OTHER).get(asset.id)).toBeNull();
  });

  it("keeps workspaces isolated in list", async () => {
    await assets(OTHER, "o").create({ title: "Other", assetType: "other" });
    const page = await assets().list({ view: "all" });
    expect(page.items).toHaveLength(0);
  });
});

describe("update + status", () => {
  it("touches only changed fields and appends asset.updated", async () => {
    const repo = assets();
    const asset = await repo.create({ title: "Drill", assetType: "tool" });
    const first = await repo.update(asset.id, { manufacturer: "Makita" });
    expect(first.changed).toBe(true);
    expect(first.asset.manufacturer).toBe("Makita");
    expect(await countActivitiesOfType(ASSET_UPDATED)).toBe(1);
    // Idempotent no-op appends nothing.
    const again = await repo.update(asset.id, { manufacturer: "Makita" });
    expect(again.changed).toBe(false);
    expect(await countActivitiesOfType(ASSET_UPDATED)).toBe(1);
  });

  it("emits asset.status_changed and asset.disposed for status transitions", async () => {
    const repo = assets();
    const asset = await repo.create({ title: "Van", assetType: "vehicle" });
    await repo.update(asset.id, { status: "under_repair" });
    expect(await countActivitiesOfType(ASSET_STATUS_CHANGED)).toBe(1);
    await repo.update(asset.id, { status: "disposed" });
    expect(await countActivitiesOfType(ASSET_DISPOSED)).toBe(1);
  });

  it("throws AssetNotFoundError updating a missing asset", async () => {
    await expect(
      assets().update("missing", { model: "x" }),
    ).rejects.toBeInstanceOf(AssetNotFoundError);
  });
});

describe("archive lifecycle", () => {
  it("archives and restores idempotently, distinct from status", async () => {
    const repo = assets();
    const asset = await repo.create({ title: "Trailer", assetType: "trailer" });
    const a = await repo.archive(asset.id);
    expect(a.outcome).toBe("archived");
    expect(a.changed).toBe(true);
    expect(a.asset.status).toBe("active"); // status untouched by archive
    expect(await countActivitiesOfType(ASSET_ARCHIVED)).toBe(1);
    const a2 = await repo.archive(asset.id);
    expect(a2.outcome).toBe("already_archived");
    expect(a2.changed).toBe(false);
    const r = await repo.restore(asset.id);
    expect(r.outcome).toBe("restored");
    expect(r.changed).toBe(true);
  });

  it("archived assets leave the active collection but keep a direct read", async () => {
    const repo = assets();
    const asset = await repo.create({
      title: "Old TV",
      assetType: "electronics",
    });
    await repo.archive(asset.id);
    expect((await repo.list({ view: "all" })).items).toHaveLength(0);
    expect((await repo.list({ view: "archived" })).items).toHaveLength(1);
    expect(await repo.get(asset.id)).not.toBeNull();
  });
});

describe("cursor pagination", () => {
  it("paginates deterministically and binds the cursor to its scope", async () => {
    const clock = new FakeClock();
    const repo = makeAssetRepository(makeContext(WS), {
      clock: clock.now,
      idGenerator: sequentialIds("a"),
    });
    for (let i = 0; i < 3; i++) {
      clock.advance(1000);
      await repo.create({ title: `Asset ${i}`, assetType: "other" });
    }
    const first = await repo.list({ view: "all", limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();
    const second = await repo.list({
      view: "all",
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    // A cursor issued for `all` is rejected under a different view/scope.
    await expect(
      repo.list({ view: "archived", limit: 2, cursor: first.nextCursor! }),
    ).rejects.toBeInstanceOf(InvalidAssetCursorError);
  });

  it("rejects a malformed cursor", async () => {
    await expect(
      assets().list({ view: "all", cursor: "!!not-base64!!" }),
    ).rejects.toBeInstanceOf(InvalidAssetCursorError);
  });
});

describe("date-driven views + filters", () => {
  it("expiring-soon returns assets due within the horizon, filtering the full collection", async () => {
    const repo = assets();
    await repo.create({
      title: "Rego",
      assetType: "vehicle",
      renewalDate: "2026-08-01",
    });
    await repo.create({
      title: "Far",
      assetType: "vehicle",
      warrantyExpiry: "2030-01-01",
    });
    const page = await repo.list({ view: "expiring", today: "2026-07-20" });
    expect(page.items.map((a) => a.title)).toEqual(["Rego"]);
  });

  it("service-due returns assets with an upcoming/overdue next service", async () => {
    const repo = assets();
    await repo.create({
      title: "Mower",
      assetType: "equipment",
      nextServiceDate: "2026-07-10", // overdue relative to today
    });
    await repo.create({ title: "Idle", assetType: "equipment" });
    const page = await repo.list({ view: "service_due", today: "2026-07-20" });
    expect(page.items.map((a) => a.title)).toEqual(["Mower"]);
  });

  it("filters by type and status over the whole workspace", async () => {
    const repo = assets();
    await repo.create({ title: "Car", assetType: "vehicle", status: "loaned" });
    await repo.create({ title: "Book", assetType: "document" });
    const byType = await repo.list({
      view: "all",
      filters: { type: "vehicle" },
    });
    expect(byType.items.map((a) => a.title)).toEqual(["Car"]);
    const byStatus = await repo.list({
      view: "all",
      filters: { status: "loaned" },
    });
    expect(byStatus.items.map((a) => a.title)).toEqual(["Car"]);
  });
});

describe("Activity privacy (§17)", () => {
  it("never leaks serial numbers, prices or private notes into payloads", async () => {
    const repo = assets();
    const asset = await repo.create({
      title: "Camera",
      assetType: "electronics",
      serialNumber: "SECRET-SERIAL-123",
      currencyCode: "AUD",
      purchasePrice: "999.99",
      maintenanceNotes: "confidential fault history",
    });
    await repo.update(asset.id, {
      serialNumber: "SECRET-SERIAL-456",
      purchasePrice: "1500.00",
      currencyCode: "AUD",
      maintenanceNotes: "more private notes",
    });
    const createdPayload = await latestActivityPayload(ASSET_CREATED);
    const updatedPayload = await latestActivityPayload(ASSET_UPDATED);
    for (const payload of [createdPayload, updatedPayload]) {
      expect(payload).not.toBeNull();
      expect(payload!).not.toContain("SECRET-SERIAL");
      expect(payload!).not.toContain("999.99");
      expect(payload!).not.toContain("150000");
      expect(payload!).not.toContain("confidential");
      expect(payload!).not.toContain("private notes");
    }
    // The update payload lists only field NAMES.
    expect(JSON.parse(updatedPayload!).fields).toContain("serialNumber");
  });
});

describe("permanent deletion (guarded)", () => {
  it("refuses to delete while active links reference the asset, then succeeds once unlinked", async () => {
    const repo = assets();
    const links = makeLinkRepository(makeContext(WS), {
      idGenerator: sequentialIds("lnk"),
    });
    const asset = await repo.create({ title: "Bike", assetType: "vehicle" });
    const note = await makeRepository(makeContext(WS), {
      idGenerator: sequentialIds("note"),
    }).create({ type: "note", title: "About the bike" });
    const created = await links.create({
      sourceEntityId: asset.id,
      targetEntityId: note.id,
      type: "link.related",
    });

    const blocked = await repo.permanentlyDelete(asset.id);
    expect(blocked.deleted).toBe(false);
    expect(blocked.blockedReason).toBe("has_links");
    // The linked note is never touched.
    expect(await countAssetRows()).toBe(1);

    await links.unlink(created.link.id);
    const ok = await repo.permanentlyDelete(asset.id);
    expect(ok.deleted).toBe(true);
    expect(await repo.get(asset.id)).toBeNull();
    expect(await countAssetRows()).toBe(0);
  });

  /** Rows in `table` whose `column` references this asset, INCLUDING soft-deleted. */
  async function rowsReferencing(table: string, column: string, id: string) {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`,
    )
      .bind(id)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  it("permanently deletes an Asset that HAS history events and obligations (V2.0.1)", async () => {
    // The V2.0.0 defect: `asset_events` / `obligation_details` reference the
    // entity row with ON DELETE RESTRICT (migration 0025), and the purge batch
    // never deleted them — so any Asset with history could never be permanently
    // deleted, and the UI offered a retry that could not succeed.
    const repo = assets();
    const history = makeAssetHistoryRepository(makeContext(WS), {
      idGenerator: sequentialIds("h"),
    });
    // V2.10 LIFE-01 — obligations live in the ONE shared store now, wired
    // with the Assets adapter as its proof gateway exactly as the product is.
    const obligations = makeObligationRepository(makeContext(WS), {
      idGenerator: sequentialIds("h"),
    });
    const asset = await repo.create({ title: "Car", assetType: "vehicle" });
    await history.recordEvent(asset.id, {
      category: "service",
      title: "Major service",
      eventDate: "2026-07-01",
    });
    const softDeleted = await history.recordEvent(asset.id, {
      category: "repair",
      title: "Old repair",
      eventDate: "2026-06-01",
    });
    const obligation = await obligations.create({
      subjectEntityId: asset.id,
      category: "registration",
      title: "Renew registration",
      dueDate: "2026-09-30",
    });
    // A soft-deleted event keeps its physical row — and its RESTRICT reference —
    // so an owner "deleting the history first" could never unblock the purge.
    // The purge itself must remove it.
    await history.deleteEvent(softDeleted.id);

    const result = await repo.permanentlyDelete(asset.id);
    expect(result.deleted).toBe(true);
    expect(await repo.get(asset.id, { includeDeleted: true })).toBeNull();

    // No rows remain for this Asset anywhere — the full six-table footprint.
    expect(await rowsReferencing("asset_events", "asset_id", asset.id)).toBe(0);
    expect(
      await rowsReferencing(
        "obligation_details",
        "subject_entity_id",
        asset.id,
      ),
    ).toBe(0);
    /*
     * V2.10 LIFE-01 — and the obligation's WHOLE footprint with it, not only
     * its detail row. An obligation is an entity, so its `entities` row, its
     * `obligation.subject` projection link and its own Activity subject
     * pointers all have to go: each holds an `ON DELETE RESTRICT` foreign key,
     * and any one left behind fails the entire purge at commit — which is how
     * this regressed, reporting a perfectly ordinary Asset as un-purgeable.
     */
    expect(await rowsReferencing("entities", "id", obligation.id)).toBe(0);
    expect(
      await rowsReferencing("obligation_details", "entity_id", obligation.id),
    ).toBe(0);
    expect(
      await rowsReferencing("entity_links", "source_entity_id", obligation.id),
    ).toBe(0);
    expect(
      await rowsReferencing("activity_subjects", "entity_id", obligation.id),
    ).toBe(0);
    expect(await rowsReferencing("asset_details", "entity_id", asset.id)).toBe(
      0,
    );
    expect(
      await rowsReferencing("entity_links", "source_entity_id", asset.id),
    ).toBe(0);
    expect(
      await rowsReferencing("entity_links", "target_entity_id", asset.id),
    ).toBe(0);
    expect(
      await rowsReferencing("activity_subjects", "entity_id", asset.id),
    ).toBe(0);
    expect(await rowsReferencing("entities", "id", asset.id)).toBe(0);
  });

  it("a link-blocked purge removes NOTHING — history and obligations survive intact", async () => {
    const repo = assets();
    const history = makeAssetHistoryRepository(makeContext(WS), {
      idGenerator: sequentialIds("h"),
    });
    // V2.10 LIFE-01 — obligations live in the ONE shared store now, wired
    // with the Assets adapter as its proof gateway exactly as the product is.
    const obligations = makeObligationRepository(makeContext(WS), {
      idGenerator: sequentialIds("h"),
    });
    const links = makeLinkRepository(makeContext(WS), {
      idGenerator: sequentialIds("lnk"),
    });
    const asset = await repo.create({ title: "Boat", assetType: "vehicle" });
    await history.recordEvent(asset.id, {
      category: "service",
      title: "Antifoul",
      eventDate: "2026-05-01",
    });
    await obligations.create({
      subjectEntityId: asset.id,
      category: "insurance",
      title: "Renew insurance",
      dueDate: "2026-12-01",
    });
    const note = await makeRepository(makeContext(WS), {
      idGenerator: sequentialIds("note"),
    }).create({ type: "note", title: "Mooring details" });
    await links.create({
      sourceEntityId: asset.id,
      targetEntityId: note.id,
      type: "link.related",
    });

    const blocked = await repo.permanentlyDelete(asset.id);
    expect(blocked.deleted).toBe(false);
    expect(blocked.blockedReason).toBe("has_links");
    // All-or-nothing: the blocked purge left every row in place.
    expect(await rowsReferencing("asset_events", "asset_id", asset.id)).toBe(1);
    expect(
      await rowsReferencing(
        "obligation_details",
        "subject_entity_id",
        asset.id,
      ),
    ).toBe(1);
    expect(await rowsReferencing("asset_details", "entity_id", asset.id)).toBe(
      1,
    );
    expect(await rowsReferencing("entities", "id", asset.id)).toBe(1);
  });

  it("a cross-workspace caller cannot purge an Asset or its history", async () => {
    const repo = assets();
    const history = makeAssetHistoryRepository(makeContext(WS), {
      idGenerator: sequentialIds("h"),
    });
    // V2.10 LIFE-01 — obligations live in the ONE shared store now, wired
    // with the Assets adapter as its proof gateway exactly as the product is.
    const obligations = makeObligationRepository(makeContext(WS), {
      idGenerator: sequentialIds("h"),
    });
    const asset = await repo.create({
      title: "Camera",
      assetType: "equipment",
    });
    await history.recordEvent(asset.id, {
      category: "purchase",
      title: "Bought",
      eventDate: "2026-01-15",
    });
    await obligations.create({
      subjectEntityId: asset.id,
      category: "warranty",
      title: "Warranty expires",
      dueDate: "2027-01-15",
    });

    const foreign = assets(OTHER, "f");
    // Fail-closed: the foreign workspace observes nothing to delete, and the
    // rows are untouched.
    const result = await foreign.permanentlyDelete(asset.id);
    expect(result.deleted).toBe(false);
    expect(await rowsReferencing("entities", "id", asset.id)).toBe(1);
    expect(await rowsReferencing("asset_events", "asset_id", asset.id)).toBe(1);
    // Including the obligations ABOUT it: a foreign purge reaches nothing.
    expect(
      await rowsReferencing(
        "obligation_details",
        "subject_entity_id",
        asset.id,
      ),
    ).toBe(1);
    // Fail-closed means fail-SILENT: a foreign no-op must not forge a tombstone
    // claiming this workspace's Asset was destroyed.
    expect(await countActivitiesOfType(ASSET_DELETED)).toBe(0);
  });

  /* ---------------------------------------------------------------------- */
  /* AUDIT-03 / DEBT-79 — the retained deletion tombstone                    */
  /* ---------------------------------------------------------------------- */

  /**
   * The V2.0.1 defect: a permanent Asset delete destroyed the entity, its
   * details, its whole ASSET-02 history and every obligation, and recorded
   * NOTHING. The workspace was left unable to answer "what happened to that
   * Asset, who removed it, and when" — the single question an audit trail
   * exists to answer. These five tests pin the corrected contract.
   */

  /** Subject rows pointing at `id`, and the parsed tombstone payloads. */
  async function tombstonePayloads(): Promise<
    { assetId?: string; title?: string }[]
  > {
    const rows = await env.DB.prepare(
      "SELECT payload_json FROM activities WHERE type = ? ORDER BY id",
    )
      .bind(ASSET_DELETED)
      .all<{ payload_json: string }>();
    return rows.results.map(
      (r) => JSON.parse(r.payload_json) as { assetId?: string; title?: string },
    );
  }

  it("Asset test 1 — a successful purge writes exactly one subject-less asset.deleted tombstone", async () => {
    const repo = assets();
    const history = makeAssetHistoryRepository(makeContext(WS), {
      idGenerator: sequentialIds("h"),
    });
    // V2.10 LIFE-01 — obligations live in the ONE shared store now, wired
    // with the Assets adapter as its proof gateway exactly as the product is.
    const obligations = makeObligationRepository(makeContext(WS), {
      idGenerator: sequentialIds("h"),
    });
    const asset = await repo.create({
      title: "Workshop compressor",
      assetType: "equipment",
    });
    await history.recordEvent(asset.id, {
      category: "service",
      title: "Annual service",
      eventDate: "2026-07-01",
    });
    const obligation = await obligations.create({
      subjectEntityId: asset.id,
      category: "insurance",
      title: "Renew cover",
      dueDate: "2026-11-30",
    });
    // Historical Activity about the Asset, which must SURVIVE the purge.
    await repo.update(asset.id, { location: "Shed" });
    await repo.archive(asset.id);
    const historicalBefore =
      (await countActivitiesOfType(ASSET_CREATED)) +
      (await countActivitiesOfType(ASSET_UPDATED)) +
      (await countActivitiesOfType(ASSET_ARCHIVED));
    expect(historicalBefore).toBe(3);
    expect(
      await rowsReferencing("activity_subjects", "entity_id", asset.id),
    ).toBeGreaterThan(0);

    const result = await repo.permanentlyDelete(asset.id);
    expect(result.deleted).toBe(true);

    // Every Asset-owned domain row is gone.
    expect(await repo.get(asset.id, { includeDeleted: true })).toBeNull();
    expect(await rowsReferencing("entities", "id", asset.id)).toBe(0);
    expect(await rowsReferencing("asset_details", "entity_id", asset.id)).toBe(
      0,
    );
    expect(await rowsReferencing("asset_events", "asset_id", asset.id)).toBe(0);
    expect(
      await rowsReferencing(
        "obligation_details",
        "subject_entity_id",
        asset.id,
      ),
    ).toBe(0);
    /*
     * V2.10 LIFE-01 — and the obligation's WHOLE footprint with it, not only
     * its detail row. An obligation is an entity, so its `entities` row, its
     * `obligation.subject` projection link and its own Activity subject
     * pointers all have to go: each holds an `ON DELETE RESTRICT` foreign key,
     * and any one left behind fails the entire purge at commit — which is how
     * this regressed, reporting a perfectly ordinary Asset as un-purgeable.
     */
    expect(await rowsReferencing("entities", "id", obligation.id)).toBe(0);
    expect(
      await rowsReferencing("obligation_details", "entity_id", obligation.id),
    ).toBe(0);
    expect(
      await rowsReferencing("entity_links", "source_entity_id", obligation.id),
    ).toBe(0);
    expect(
      await rowsReferencing("activity_subjects", "entity_id", obligation.id),
    ).toBe(0);

    // The append-only Activity rows SURVIVE — removing a subject pointer must
    // never remove the event it points at (ADR-012).
    expect(
      (await countActivitiesOfType(ASSET_CREATED)) +
        (await countActivitiesOfType(ASSET_UPDATED)) +
        (await countActivitiesOfType(ASSET_ARCHIVED)),
    ).toBe(historicalBefore);
    // …but their now-obsolete subject pointers are gone, so nothing dangles.
    expect(
      await rowsReferencing("activity_subjects", "entity_id", asset.id),
    ).toBe(0);

    // Exactly ONE tombstone, carrying the id and title, with NO subject row.
    expect(await countActivitiesOfType(ASSET_DELETED)).toBe(1);
    const payloads = await tombstonePayloads();
    expect(payloads[0]).toEqual({
      assetId: asset.id,
      title: "Workshop compressor",
    });
    const tombstoneSubjects = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM activity_subjects s
       JOIN activities a ON a.workspace_id = s.workspace_id AND a.id = s.activity_id
       WHERE a.type = ?`,
    )
      .bind(ASSET_DELETED)
      .first<{ n: number }>();
    expect(tombstoneSubjects?.n ?? 0).toBe(0);

    // The workspace feed still renders it, and renders it TRUTHFULLY: the
    // destroyed Asset is named from the payload, not from a vanished subject.
    const page = await makeActivityRepository(makeContext(WS)).listForWorkspace(
      {
        type: ASSET_DELETED,
      },
    );
    expect(page.items).toHaveLength(1);
    // Asserted against BOTH descriptor maps that can carry this event. The
    // module map is the Assets surface; the CROSS-MODULE map is what the Today /
    // workspace feed builds from — and that is the surface that matters here,
    // because the Asset's own record page no longer exists to read it on.
    for (const descriptors of [
      ASSETS_ACTIVITY_DESCRIPTORS,
      buildWorkspaceActivityDescriptors(),
    ]) {
      const item = toActivityItem(page.items[0], { descriptors });
      expect(item.isKnownType).toBe(true);
      expect(item.subjects).toEqual([]);
      expect(segmentText(item)).toContain("permanently deleted");
      expect(segmentText(item)).toContain("Workshop compressor");
    }
  });

  it("Asset test 2 — a second purge is an idempotent no-op that writes no second tombstone", async () => {
    const repo = assets();
    const asset = await repo.create({
      title: "Ladder",
      assetType: "equipment",
    });

    const first = await repo.permanentlyDelete(asset.id);
    const second = await repo.permanentlyDelete(asset.id);

    expect(first.deleted).toBe(true);
    expect(second.deleted).toBe(false);
    expect(second.blockedReason).toBeUndefined();
    // One destruction, one tombstone — a repeat request never inflates the audit
    // trail, and never throws.
    expect(await countActivitiesOfType(ASSET_DELETED)).toBe(1);
    expect(await tombstonePayloads()).toEqual([
      { assetId: asset.id, title: "Ladder" },
    ]);
  });

  it("Asset test 3 — an active link blocks the purge and writes no tombstone; unlinking releases it", async () => {
    const repo = assets();
    const links = makeLinkRepository(makeContext(WS), {
      idGenerator: sequentialIds("lnk"),
    });
    const history = makeAssetHistoryRepository(makeContext(WS), {
      idGenerator: sequentialIds("h"),
    });
    // V2.10 LIFE-01 — obligations live in the ONE shared store now, wired
    // with the Assets adapter as its proof gateway exactly as the product is.
    const obligations = makeObligationRepository(makeContext(WS), {
      idGenerator: sequentialIds("h"),
    });
    const asset = await repo.create({ title: "Trailer", assetType: "vehicle" });
    await history.recordEvent(asset.id, {
      category: "service",
      title: "Bearings",
      eventDate: "2026-04-02",
    });
    const note = await makeRepository(makeContext(WS), {
      idGenerator: sequentialIds("note"),
    }).create({ type: "note", title: "Trailer paperwork" });
    const created = await links.create({
      sourceEntityId: asset.id,
      targetEntityId: note.id,
      type: "link.related",
    });
    /*
     * V2.10 LIFE-01 — an obligation about this Asset writes an
     * `obligation.subject` link too, and that link must NOT be counted here.
     * It is the projection of the obligation's own foreign key (ADR-118
     * decision 1), not a relationship the owner made: counted, it would report
     * `linkCount: 2` and leave the Asset permanently un-purgeable, because the
     * owner has no way to remove a link the picker never offered them.
     */
    await obligations.create({
      subjectEntityId: asset.id,
      category: "registration",
      title: "Renew registration",
      dueDate: "2026-10-01",
    });

    const blocked = await repo.permanentlyDelete(asset.id);
    expect(blocked.deleted).toBe(false);
    expect(blocked.blockedReason).toBe("has_links");
    expect(blocked.linkCount).toBe(1);
    // All-or-nothing: every row survives, and NO tombstone claims otherwise.
    expect(await rowsReferencing("entities", "id", asset.id)).toBe(1);
    expect(await rowsReferencing("asset_details", "entity_id", asset.id)).toBe(
      1,
    );
    expect(await rowsReferencing("asset_events", "asset_id", asset.id)).toBe(1);
    expect(
      await rowsReferencing("activity_subjects", "entity_id", asset.id),
    ).toBeGreaterThan(0);
    expect(await countActivitiesOfType(ASSET_DELETED)).toBe(0);
    // The linked Note is never touched to make the delete succeed.
    expect(
      await makeRepository(makeContext(WS)).getById(note.id),
    ).not.toBeNull();

    // Soft-deleting the link releases the guard; the stale row is purged with it —
    // and so is the obligation, whose own link never held the guard shut.
    await links.unlink(created.link.id);
    const ok = await repo.permanentlyDelete(asset.id);
    expect(ok.deleted).toBe(true);
    expect(
      await rowsReferencing(
        "obligation_details",
        "subject_entity_id",
        asset.id,
      ),
    ).toBe(0);
    expect(await countActivitiesOfType(ASSET_DELETED)).toBe(1);
    expect(
      await rowsReferencing("entity_links", "source_entity_id", asset.id),
    ).toBe(0);
  });

  it("Asset test 4 — a link created after the precheck blocks at COMMIT, partially deleting nothing", async () => {
    // The read→submit race: the precheck sees no active link, then one appears
    // before the batch commits. Every destructive statement repeats the guard, so
    // the whole batch matches zero rows rather than half-destroying the Asset.
    const repo = assets();
    const history = makeAssetHistoryRepository(makeContext(WS), {
      idGenerator: sequentialIds("h"),
    });
    // V2.10 LIFE-01 — obligations live in the ONE shared store now, wired
    // with the Assets adapter as its proof gateway exactly as the product is.
    const obligations = makeObligationRepository(makeContext(WS), {
      idGenerator: sequentialIds("h"),
    });
    const asset = await repo.create({ title: "Kayak", assetType: "equipment" });
    await history.recordEvent(asset.id, {
      category: "purchase",
      title: "Bought",
      eventDate: "2026-02-01",
    });
    const note = await makeRepository(makeContext(WS), {
      idGenerator: sequentialIds("note"),
    }).create({ type: "note", title: "Kayak notes" });
    const obligation = await obligations.create({
      subjectEntityId: asset.id,
      category: "inspection",
      title: "Hull check",
      dueDate: "2026-12-01",
    });

    // Simulate the racing writer: the link lands between the repository's
    // precheck and the guarded batch. Inserting it directly is exactly what a
    // concurrent request would have committed.
    await env.DB.prepare(
      `INSERT INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type,
          created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, 'link.related', ?, ?, NULL)`,
    )
      .bind(
        "race-link-1",
        WS,
        asset.id,
        note.id,
        "2026-07-17T00:00:00.000Z",
        "2026-07-17T00:00:00.000Z",
      )
      .run();

    const raced = await repo.permanentlyDelete(asset.id);
    // Truthful blocked outcome, not a silent success and not a raw error.
    expect(raced.deleted).toBe(false);
    expect(raced.blockedReason).toBe("has_links");
    // Nothing partially deleted.
    expect(await rowsReferencing("entities", "id", asset.id)).toBe(1);
    expect(await rowsReferencing("asset_details", "entity_id", asset.id)).toBe(
      1,
    );
    expect(await rowsReferencing("asset_events", "asset_id", asset.id)).toBe(1);
    expect(
      await rowsReferencing("entity_links", "source_entity_id", asset.id),
    ).toBe(1);
    // The obligations about it are part of "nothing": they carry the same guard,
    // so a blocked purge leaves the commitment standing rather than quietly
    // destroying it while the Asset it is about survives.
    expect(await rowsReferencing("entities", "id", obligation.id)).toBe(1);
    expect(
      await rowsReferencing("obligation_details", "entity_id", obligation.id),
    ).toBe(1);
    expect(
      await rowsReferencing("entity_links", "source_entity_id", obligation.id),
    ).toBe(1);
    expect(await countActivitiesOfType(ASSET_DELETED)).toBe(0);
  });

  it("Asset test 5 — an injected failure rolls the entity deletion AND its tombstone back together", async () => {
    for (const fault of ["after-entity", "after-tombstone"] as const) {
      await resetTables([WS, OTHER]);
      const repo = assets(WS, `f_${fault}`, { deleteFault: fault });
      const history = makeAssetHistoryRepository(makeContext(WS), {
        idGenerator: sequentialIds(`h_${fault}`),
      });
      // V2.10 LIFE-01 — obligations live in the ONE shared store now, wired
      // with the Assets adapter as its proof gateway exactly as the product is.
      const obligations = makeObligationRepository(makeContext(WS), {
        idGenerator: sequentialIds(`h_${fault}`),
      });
      const asset = await repo.create({
        title: "Generator",
        assetType: "equipment",
      });
      await history.recordEvent(asset.id, {
        category: "service",
        title: "Oil change",
        eventDate: "2026-03-03",
      });
      await obligations.create({
        subjectEntityId: asset.id,
        category: "registration",
        title: "Rego",
        dueDate: "2026-10-01",
      });

      await expect(repo.permanentlyDelete(asset.id)).rejects.toBeInstanceOf(
        AssetStorageError,
      );

      // The whole batch rolled back: entity, details, history, obligations and
      // subject pointers all survive, and no tombstone was committed.
      expect(await rowsReferencing("entities", "id", asset.id)).toBe(1);
      expect(
        await rowsReferencing("asset_details", "entity_id", asset.id),
      ).toBe(1);
      expect(await rowsReferencing("asset_events", "asset_id", asset.id)).toBe(
        1,
      );
      expect(
        await rowsReferencing(
          "obligation_details",
          "subject_entity_id",
          asset.id,
        ),
      ).toBe(1);
      expect(
        await rowsReferencing("activity_subjects", "entity_id", asset.id),
      ).toBeGreaterThan(0);
      expect(await countActivitiesOfType(ASSET_DELETED)).toBe(0);
      // And the Asset is still fully readable through the repository.
      expect(await repo.get(asset.id)).not.toBeNull();
    }
  });
});
