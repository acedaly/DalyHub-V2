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
  ASSET_DISPOSED,
  ASSET_STATUS_CHANGED,
  ASSET_UPDATED,
  AssetNotFoundError,
  AssetValidationError,
  InvalidAssetCursorError,
} from "~/kernel/assets";
import { ReservedEntityTypeError } from "~/kernel/entities";

import { env } from "cloudflare:test";

import {
  countActivitiesOfType,
  countAssetRows,
  countRows,
  FakeClock,
  latestActivityPayload,
  makeAssetHistoryRepository,
  makeAssetRepository,
  makeContext,
  makeLinkRepository,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

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
    // The V2.0.0 defect: `asset_events` / `asset_obligations` reference the
    // entity row with ON DELETE RESTRICT (migration 0025), and the purge batch
    // never deleted them — so any Asset with history could never be permanently
    // deleted, and the UI offered a retry that could not succeed.
    const repo = assets();
    const history = makeAssetHistoryRepository(makeContext(WS), {
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
    await history.createObligation(asset.id, {
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
      await rowsReferencing("asset_obligations", "asset_id", asset.id),
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
    const links = makeLinkRepository(makeContext(WS), {
      idGenerator: sequentialIds("lnk"),
    });
    const asset = await repo.create({ title: "Boat", assetType: "vehicle" });
    await history.recordEvent(asset.id, {
      category: "service",
      title: "Antifoul",
      eventDate: "2026-05-01",
    });
    await history.createObligation(asset.id, {
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
      await rowsReferencing("asset_obligations", "asset_id", asset.id),
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
    const asset = await repo.create({
      title: "Camera",
      assetType: "equipment",
    });
    await history.recordEvent(asset.id, {
      category: "purchase",
      title: "Bought",
      eventDate: "2026-01-15",
    });

    const foreign = assets(OTHER, "f");
    // Fail-closed: the foreign workspace observes nothing to delete, and the
    // rows are untouched.
    const result = await foreign.permanentlyDelete(asset.id);
    expect(result.deleted).toBe(false);
    expect(await rowsReferencing("entities", "id", asset.id)).toBe(1);
    expect(await rowsReferencing("asset_events", "asset_id", asset.id)).toBe(1);
  });
});
