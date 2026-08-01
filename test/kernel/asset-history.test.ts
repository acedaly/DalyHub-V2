/**
 * ASSET-02 — Asset history & obligations kernel / D1 integration tests.
 *
 * Real Workers runtime, real isolated D1, the real committed migrations. These
 * prove the load-bearing guarantees the feature rests on: atomic event recording,
 * FORWARD-ONLY canonical-fact projection (history never rewrites the present),
 * meter semantics including the honest "no reading" state, date and meter
 * recurrence, EXACTLY ONE successor under retry and concurrency, the Task
 * authority contract (a ticked Task is not proof the work happened), cost
 * aggregation that never mixes currencies, valuation history, cross-workspace
 * rejection, archived/deleted Asset behaviour, timeline pagination and the bounded
 * Today attention query.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  ASSET_EVENT_CREATED,
  ASSET_METER_UPDATED,
  ASSET_OBLIGATION_COMPLETED,
  ASSET_OBLIGATION_CREATED,
  AssetNotFoundError,
  AssetValidationError,
  InvalidAssetCursorError,
  evaluateObligation,
} from "~/kernel/assets";
import type { ObligationTaskGateway } from "~/kernel/assets";

import {
  FakeClock,
  countActivitiesOfType,
  countAssetEventRows,
  countAssetObligationRows,
  latestActivityPayload,
  makeAssetHistoryRepository,
  makeAssetRepository,
  makeContext,
  makePersonRepository,
  makeRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_asset_history_other";

function assets(ws = WS, prefix = "a") {
  return makeAssetRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
  });
}

/** A recording gateway, so the Task authority contract is asserted, not assumed. */
function recordingGateway(
  behaviour: Partial<ObligationTaskGateway> = {},
): ObligationTaskGateway & {
  readonly completed: string[];
  readonly rescheduled: [string, string | null][];
} {
  const completed: string[] = [];
  const rescheduled: [string, string | null][] = [];
  return {
    completed,
    rescheduled,
    async completeTask(taskId) {
      completed.push(taskId);
      return behaviour.completeTask
        ? behaviour.completeTask(taskId)
        : "completed";
    },
    async rescheduleTask(taskId, dueDate) {
      rescheduled.push([taskId, dueDate]);
      return behaviour.rescheduleTask
        ? behaviour.rescheduleTask(taskId, dueDate)
        : true;
    },
  };
}

function history(
  ws = WS,
  prefix = "h",
  options: Parameters<typeof makeAssetHistoryRepository>[1] = {},
) {
  return makeAssetHistoryRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
    ...options,
  });
}

async function ute(ws = WS, prefix = "a") {
  return assets(ws, prefix).create({ title: "Ute", assetType: "vehicle" });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

describe("recordEvent", () => {
  it("writes the event and exactly one asset.event_created, atomically", async () => {
    const asset = await ute();
    const repo = history();
    const event = await repo.recordEvent(asset.id, {
      category: "service",
      title: "60,000 km service",
      eventDate: "2026-07-01",
      cost: "489.50",
      currencyCode: "AUD",
      provider: "Northside Auto",
    });

    expect(event.category).toBe("service");
    expect(event.costMinor).toBe(48_950);
    expect(event.currencyCode).toBe("AUD");
    expect(await countAssetEventRows()).toBe(1);
    expect(await countActivitiesOfType(ASSET_EVENT_CREATED)).toBe(1);
  });

  it("keeps the Activity payload structural — no cost, provider or reading", async () => {
    const asset = await ute();
    await history().recordEvent(asset.id, {
      category: "repair",
      title: "New alternator",
      eventDate: "2026-07-02",
      cost: "1200.00",
      provider: "Northside Auto",
      meterValue: 61_000,
      meterUnit: "km",
    });
    const raw = await latestActivityPayload(ASSET_EVENT_CREATED);
    const payload: unknown = JSON.parse(raw ?? "{}");
    expect(payload).toEqual({
      category: "repair",
      hasCost: true,
      hasMeter: true,
    });
    expect(raw).not.toContain("Northside");
    expect(raw).not.toContain("1200");
    expect(raw).not.toContain("61000");
  });

  it("rejects an event against an asset in another workspace (fails closed)", async () => {
    const asset = await ute(OTHER, "o");
    await expect(
      history(WS).recordEvent(asset.id, {
        category: "service",
        title: "Service",
        eventDate: "2026-07-01",
      }),
    ).rejects.toBeInstanceOf(AssetNotFoundError);
    expect(await countAssetEventRows()).toBe(0);
  });

  it("rejects a linked Person from another workspace", async () => {
    const asset = await ute();
    const stranger = await makeRepository(makeContext(OTHER)).create({
      type: "note",
      title: "Elsewhere",
    });
    await expect(
      history().recordEvent(asset.id, {
        category: "service",
        title: "Service",
        eventDate: "2026-07-01",
        personId: stranger.id,
      }),
    ).rejects.toBeInstanceOf(AssetValidationError);
    expect(await countAssetEventRows()).toBe(0);
  });

  it("writes nothing when validation fails", async () => {
    const asset = await ute();
    await expect(
      history().recordEvent(asset.id, {
        category: "not_a_category",
        title: "Nope",
        eventDate: "2026-07-01",
      }),
    ).rejects.toBeInstanceOf(AssetValidationError);
    expect(await countAssetEventRows()).toBe(0);
    expect(await countActivitiesOfType(ASSET_EVENT_CREATED)).toBe(0);
  });

  it("rejects a next-due date before the event itself", async () => {
    const asset = await ute();
    await expect(
      history().recordEvent(asset.id, {
        category: "service",
        title: "Service",
        eventDate: "2026-07-01",
        nextDueDate: "2026-06-01",
      }),
    ).rejects.toBeInstanceOf(AssetValidationError);
  });

  it("rejects a meter reading with no unit, and a negative reading", async () => {
    const asset = await ute();
    const repo = history();
    await expect(
      repo.recordEvent(asset.id, {
        category: "history",
        title: "Reading",
        eventDate: "2026-07-01",
        meterValue: 100,
      }),
    ).rejects.toBeInstanceOf(AssetValidationError);
    await expect(
      repo.recordEvent(asset.id, {
        category: "history",
        title: "Reading",
        eventDate: "2026-07-01",
        meterValue: -5,
        meterUnit: "km",
      }),
    ).rejects.toBeInstanceOf(AssetValidationError);
  });
});

describe("canonical facts (§3 — history never rewrites the present)", () => {
  it("advances next service and last service from a service event", async () => {
    const asset = await ute();
    await history().recordEvent(asset.id, {
      category: "service",
      title: "Service",
      eventDate: "2026-07-01",
      nextDueDate: "2027-01-01",
    });
    const refreshed = await assets().get(asset.id);
    expect(refreshed?.nextServiceDate).toBe("2027-01-01");
    expect(refreshed?.lastServiceDate).toBe("2026-07-01");
  });

  it("does NOT rewind a canonical date when back-filling older history", async () => {
    const asset = await ute();
    const repo = history();
    await repo.recordEvent(asset.id, {
      category: "service",
      title: "Recent service",
      eventDate: "2026-07-01",
      nextDueDate: "2027-01-01",
    });
    await repo.recordEvent(asset.id, {
      category: "service",
      title: "Service from years ago",
      eventDate: "2024-02-01",
      nextDueDate: "2024-08-01",
    });
    const refreshed = await assets().get(asset.id);
    expect(refreshed?.nextServiceDate).toBe("2027-01-01");
    expect(refreshed?.lastServiceDate).toBe("2026-07-01");
  });

  it("advances the meter forward-only and never backwards", async () => {
    const asset = await ute();
    const repo = history();
    await repo.recordMeterReading({
      assetId: asset.id,
      value: 60_000,
      unit: "km",
      readingDate: "2026-07-01",
    });
    let refreshed = await assets().get(asset.id);
    expect(refreshed?.currentMeterValue).toBe(60_000);
    expect(refreshed?.currentMeterUnit).toBe("km");

    // An older, smaller reading is retained as HISTORY but does not move the fact.
    const older = await repo.recordMeterReading({
      assetId: asset.id,
      value: 45_000,
      unit: "km",
      readingDate: "2025-01-01",
    });
    expect(older.advancedCurrentReading).toBe(false);
    refreshed = await assets().get(asset.id);
    expect(refreshed?.currentMeterValue).toBe(60_000);
    expect(await countAssetEventRows()).toBe(2);
  });

  it("appends asset.meter_updated only when the reading actually advanced", async () => {
    const asset = await ute();
    const repo = history();
    await repo.recordMeterReading({
      assetId: asset.id,
      value: 60_000,
      unit: "km",
      readingDate: "2026-07-01",
    });
    expect(await countActivitiesOfType(ASSET_METER_UPDATED)).toBe(1);
    await repo.recordMeterReading({
      assetId: asset.id,
      value: 10,
      unit: "km",
      readingDate: "2020-01-01",
    });
    expect(await countActivitiesOfType(ASSET_METER_UPDATED)).toBe(1);
  });

  it("advances the warranty expiry forward-only from a warranty event", async () => {
    const asset = await ute();
    const repo = history();
    await repo.recordEvent(asset.id, {
      category: "warranty",
      title: "Extended warranty",
      eventDate: "2026-07-01",
      warrantyExpiry: "2029-07-01",
    });
    await repo.recordEvent(asset.id, {
      category: "warranty",
      title: "Original warranty (back-filled)",
      eventDate: "2024-01-01",
      warrantyExpiry: "2027-01-01",
    });
    const refreshed = await assets().get(asset.id);
    expect(refreshed?.warrantyExpiry).toBe("2029-07-01");
  });
});

describe("event lifecycle", () => {
  it("edits, archives, restores and soft-deletes an event", async () => {
    const asset = await ute();
    const repo = history();
    const event = await repo.recordEvent(asset.id, {
      category: "repair",
      title: "Alternator",
      eventDate: "2026-07-02",
    });

    const noop = await repo.updateEvent(event.id, { title: "Alternator" });
    expect(noop.changed).toBe(false);

    const edited = await repo.updateEvent(event.id, {
      title: "Alternator replaced",
    });
    expect(edited.changed).toBe(true);
    expect(edited.event.title).toBe("Alternator replaced");

    const archived = await repo.archiveEvent(event.id);
    expect(archived.event.archivedAt).not.toBeNull();
    const restored = await repo.restoreEvent(event.id);
    expect(restored.event.archivedAt).toBeNull();

    expect(await repo.deleteEvent(event.id)).toBe(true);
    expect(await repo.getEvent(event.id)).toBeNull();
    expect(await countAssetEventRows()).toBe(0);
  });

  it("hides archived events from the default timeline but keeps them", async () => {
    const asset = await ute();
    const repo = history();
    const event = await repo.recordEvent(asset.id, {
      category: "history",
      title: "Hail damage",
      eventDate: "2026-06-01",
    });
    await repo.archiveEvent(event.id);

    const visible = await repo.listEvents({ assetId: asset.id });
    expect(visible.items).toHaveLength(0);
    const all = await repo.listEvents({
      assetId: asset.id,
      filters: { includeArchived: true },
    });
    expect(all.items).toHaveLength(1);
  });
});

describe("timeline pagination", () => {
  it("pages newest-first with a scope-bound cursor", async () => {
    const asset = await ute();
    const repo = history();
    for (let i = 1; i <= 5; i += 1) {
      await repo.recordEvent(asset.id, {
        category: "history",
        title: `Entry ${i}`,
        eventDate: `2026-07-0${i}`,
      });
    }

    const first = await repo.listEvents({ assetId: asset.id, limit: 2 });
    expect(first.items.map((e) => e.title)).toEqual(["Entry 5", "Entry 4"]);
    expect(first.hasMore).toBe(true);

    const second = await repo.listEvents({
      assetId: asset.id,
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((e) => e.title)).toEqual(["Entry 3", "Entry 2"]);

    // The cursor is bound to its filter scope, so it cannot cross into another.
    await expect(
      repo.listEvents({
        assetId: asset.id,
        limit: 2,
        cursor: first.nextCursor!,
        filters: { categories: ["service"] },
      }),
    ).rejects.toBeInstanceOf(InvalidAssetCursorError);
  });

  it("filters by category over the whole history", async () => {
    const asset = await ute();
    const repo = history();
    await repo.recordEvent(asset.id, {
      category: "service",
      title: "Service",
      eventDate: "2026-07-01",
    });
    await repo.recordEvent(asset.id, {
      category: "repair",
      title: "Repair",
      eventDate: "2026-07-02",
    });
    const page = await repo.listEvents({
      assetId: asset.id,
      filters: { categories: ["service"] },
    });
    expect(page.items.map((e) => e.title)).toEqual(["Service"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Costs and valuation                                                        */
/* -------------------------------------------------------------------------- */

describe("recorded costs", () => {
  it("groups ongoing costs and keeps the purchase price separate", async () => {
    const asset = await assets().create({
      title: "Ute",
      assetType: "vehicle",
      currencyCode: "AUD",
      purchasePrice: "42000.00",
    });
    const repo = history();
    await repo.recordEvent(asset.id, {
      category: "service",
      title: "Service",
      eventDate: "2026-01-01",
      cost: "400.00",
      currencyCode: "AUD",
    });
    await repo.recordEvent(asset.id, {
      category: "repair",
      title: "Repair",
      eventDate: "2026-02-01",
      cost: "250.50",
      currencyCode: "AUD",
    });
    await repo.recordEvent(asset.id, {
      category: "registration",
      title: "Rego",
      eventDate: "2026-03-01",
      cost: "870.00",
      currencyCode: "AUD",
    });

    const summary = await repo.costSummary(asset.id);
    expect(summary.currencyCode).toBe("AUD");
    expect(summary.byGroup.service).toBe(40_000);
    expect(summary.byGroup.repair).toBe(25_050);
    expect(summary.byGroup.renewal).toBe(87_000);
    expect(summary.ongoingTotalMinor).toBe(152_050);
    expect(summary.purchasePriceMinor).toBe(4_200_000);
    expect(summary.lifetimeTotalMinor).toBe(4_352_050);
    expect(summary.costedEventCount).toBe(3);
    expect(summary.mixedCurrency).toBe(false);
  });

  it("never adds two currencies together — it reports the exclusion", async () => {
    const asset = await assets().create({
      title: "Laptop",
      assetType: "electronics",
      currencyCode: "AUD",
    });
    const repo = history();
    await repo.recordEvent(asset.id, {
      category: "repair",
      title: "Screen",
      eventDate: "2026-01-01",
      cost: "300.00",
      currencyCode: "AUD",
    });
    await repo.recordEvent(asset.id, {
      category: "repair",
      title: "Battery",
      eventDate: "2026-02-01",
      cost: "120.00",
      currencyCode: "AUD",
    });
    await repo.recordEvent(asset.id, {
      category: "repair",
      title: "Bought abroad",
      eventDate: "2026-03-01",
      cost: "100.00",
      currencyCode: "USD",
    });

    const summary = await repo.costSummary(asset.id);
    expect(summary.currencyCode).toBe("AUD");
    expect(summary.byGroup.repair).toBe(42_000);
    expect(summary.mixedCurrency).toBe(true);
    expect(summary.excludedCurrencies).toEqual(["USD"]);
  });
});

describe("valuation history", () => {
  it("returns valuation events oldest-first and ignores other categories", async () => {
    const asset = await ute();
    const repo = history();
    await repo.recordEvent(asset.id, {
      category: "valuation",
      title: "Insurance valuation",
      eventDate: "2026-01-01",
      value: "38000.00",
      currencyCode: "AUD",
      provider: "AAMI",
    });
    await repo.recordEvent(asset.id, {
      category: "valuation",
      title: "Dealer quote",
      eventDate: "2026-06-01",
      value: "35500.00",
      currencyCode: "AUD",
    });
    await repo.recordEvent(asset.id, {
      category: "repair",
      title: "Not a valuation",
      eventDate: "2026-07-01",
      cost: "100.00",
    });

    const points = await repo.valuationHistory(asset.id);
    expect(points.map((p) => p.valueMinor)).toEqual([3_800_000, 3_550_000]);
    expect(points[0].source).toBe("AAMI");
  });
});

/* -------------------------------------------------------------------------- */
/* Obligations                                                                */
/* -------------------------------------------------------------------------- */

describe("createObligation", () => {
  it("creates a date obligation with one asset.obligation_created", async () => {
    const asset = await ute();
    const obligation = await history().createObligation(asset.id, {
      category: "registration",
      title: "Renew registration",
      dueDate: "2026-09-30",
    });
    expect(obligation.status).toBe("open");
    expect(obligation.sequence).toBe(0);
    expect(obligation.seriesId).toBe(obligation.id);
    expect(await countAssetObligationRows()).toBe(1);
    expect(await countActivitiesOfType(ASSET_OBLIGATION_CREATED)).toBe(1);
  });

  it("refuses an obligation with neither a due date nor a meter target", async () => {
    const asset = await ute();
    await expect(
      history().createObligation(asset.id, {
        category: "reminder",
        title: "Something",
      }),
    ).rejects.toBeInstanceOf(AssetValidationError);
    expect(await countAssetObligationRows()).toBe(0);
  });

  it("refuses a meter target with no unit, and a meter repeat with no interval", async () => {
    const asset = await ute();
    const repo = history();
    await expect(
      repo.createObligation(asset.id, {
        category: "service",
        title: "Service",
        meterThreshold: 70_000,
      }),
    ).rejects.toBeInstanceOf(AssetValidationError);
    await expect(
      repo.createObligation(asset.id, {
        category: "service",
        title: "Service",
        meterThreshold: 70_000,
        meterUnit: "km",
        recurrenceKind: "meter",
      }),
    ).rejects.toBeInstanceOf(AssetValidationError);
  });

  it("refuses a date repeat with no due date to advance from", async () => {
    const asset = await ute();
    await expect(
      history().createObligation(asset.id, {
        category: "service",
        title: "Service",
        meterThreshold: 70_000,
        meterUnit: "km",
        recurrenceKind: "months",
        recurrenceInterval: 6,
      }),
    ).rejects.toBeInstanceOf(AssetValidationError);
  });

  it("refuses an obligation on an asset in another workspace", async () => {
    const asset = await ute(OTHER, "o");
    await expect(
      history(WS).createObligation(asset.id, {
        category: "service",
        title: "Service",
        dueDate: "2026-09-01",
      }),
    ).rejects.toBeInstanceOf(AssetNotFoundError);
  });
});

describe("date-based recurrence", () => {
  it("completes, records the proof, and creates EXACTLY ONE successor", async () => {
    const asset = await ute();
    const repo = history();
    const obligation = await repo.createObligation(asset.id, {
      category: "service",
      title: "6-monthly service",
      dueDate: "2026-07-01",
      recurrenceKind: "months",
      recurrenceInterval: 6,
    });

    const result = await repo.completeObligation(obligation.id, {
      completedOn: "2026-07-05",
      cost: "489.50",
      currencyCode: "AUD",
      provider: "Northside Auto",
      meterValue: 61_200,
      meterUnit: "km",
    });

    expect(result.obligation.status).toBe("completed");
    expect(result.successor).not.toBeNull();
    // Anchored on the day the work was ACTUALLY done, not the day it was due.
    expect(result.successor?.dueDate).toBe("2027-01-05");
    expect(result.successor?.sequence).toBe(1);
    expect(result.successor?.seriesId).toBe(obligation.seriesId);

    // The proof exists as history, in the right category.
    const event = await repo.getEvent(result.event.id);
    expect(event?.category).toBe("service");
    expect(event?.costMinor).toBe(48_950);
    expect(event?.obligationId).toBe(obligation.id);

    // Canonical facts moved.
    const refreshed = await assets().get(asset.id);
    expect(refreshed?.nextServiceDate).toBe("2027-01-05");
    expect(refreshed?.currentMeterValue).toBe(61_200);

    expect(await countAssetObligationRows()).toBe(2);
    expect(await countActivitiesOfType(ASSET_OBLIGATION_COMPLETED)).toBe(1);
  });

  it("is idempotent under a retry — no second event, no second successor", async () => {
    const asset = await ute();
    const repo = history();
    const obligation = await repo.createObligation(asset.id, {
      category: "registration",
      title: "Rego",
      dueDate: "2026-09-30",
      recurrenceKind: "years",
      recurrenceInterval: 1,
    });

    const first = await repo.completeObligation(obligation.id, {
      completedOn: "2026-09-20",
    });
    const retry = await repo.completeObligation(obligation.id, {
      completedOn: "2026-09-20",
    });

    expect(retry.event.id).toBe(first.event.id);
    expect(retry.successor?.id).toBe(first.successor?.id);
    expect(await countAssetEventRows()).toBe(1);
    expect(await countAssetObligationRows()).toBe(2);
    expect(await countActivitiesOfType(ASSET_OBLIGATION_COMPLETED)).toBe(1);
  });

  it("creates exactly one successor under concurrent completion", async () => {
    const asset = await ute();
    const repo = history();
    const obligation = await repo.createObligation(asset.id, {
      category: "inspection",
      title: "Annual inspection",
      dueDate: "2026-07-01",
      recurrenceKind: "years",
      recurrenceInterval: 1,
    });

    const [a, b] = await Promise.all([
      repo.completeObligation(obligation.id, { completedOn: "2026-07-01" }),
      repo.completeObligation(obligation.id, { completedOn: "2026-07-01" }),
    ]);

    // One of them won; both report the SAME completion.
    expect(a.obligation.status).toBe("completed");
    expect(b.obligation.status).toBe("completed");
    expect(await countAssetObligationRows()).toBe(2);
    expect(await countAssetEventRows()).toBe(1);
  });

  it("honours an explicit next due date over the calculated one", async () => {
    const asset = await ute();
    const repo = history();
    const obligation = await repo.createObligation(asset.id, {
      category: "registration",
      title: "Rego",
      dueDate: "2026-09-30",
      recurrenceKind: "years",
      recurrenceInterval: 1,
    });
    const result = await repo.completeObligation(obligation.id, {
      completedOn: "2026-09-20",
      // The date printed on the new certificate beats arithmetic.
      nextDueDate: "2027-10-15",
    });
    expect(result.successor?.dueDate).toBe("2027-10-15");
    const refreshed = await assets().get(asset.id);
    expect(refreshed?.renewalDate).toBe("2027-10-15");
  });

  it("creates no successor for a one-off obligation", async () => {
    const asset = await ute();
    const repo = history();
    const obligation = await repo.createObligation(asset.id, {
      category: "reminder",
      title: "Sell the roof rack",
      dueDate: "2026-08-01",
    });
    const result = await repo.completeObligation(obligation.id);
    expect(result.successor).toBeNull();
    expect(await countAssetObligationRows()).toBe(1);
  });
});

describe("meter-based recurrence", () => {
  it("advances the threshold by the interval from the reading at completion", async () => {
    const asset = await ute();
    const repo = history();
    await repo.recordMeterReading({
      assetId: asset.id,
      value: 59_500,
      unit: "km",
      readingDate: "2026-06-01",
    });
    const obligation = await repo.createObligation(asset.id, {
      category: "service",
      title: "Service every 10,000 km",
      meterThreshold: 60_000,
      meterUnit: "km",
      meterInterval: 10_000,
      recurrenceKind: "meter",
    });

    const result = await repo.completeObligation(obligation.id, {
      completedOn: "2026-07-01",
      meterValue: 60_400,
      meterUnit: "km",
    });

    // 60,400 (the reading the work was done at) + 10,000 — not 60,000 + 10,000,
    // so being 400 km late does not permanently shift the schedule early.
    expect(result.successor?.meterThreshold).toBe(70_400);
    expect(result.successor?.meterUnit).toBe("km");
    const refreshed = await assets().get(asset.id);
    expect(refreshed?.currentMeterValue).toBe(60_400);
  });

  it("reads as 'reading required', never overdue, with no current reading", async () => {
    const asset = await ute();
    const repo = history();
    const obligation = await repo.createObligation(asset.id, {
      category: "service",
      title: "Service at 60,000 km",
      meterThreshold: 60_000,
      meterUnit: "km",
    });
    const evaluation = evaluateObligation(obligation, "2026-07-01", null);
    expect(evaluation.state).toBe("unknown");
    expect(evaluation.text).toBe("Current meter reading needed");
  });

  it("does not compare incompatible units", async () => {
    const asset = await ute();
    const repo = history();
    await repo.recordMeterReading({
      assetId: asset.id,
      value: 40_000,
      unit: "mi",
      readingDate: "2026-06-01",
    });
    const obligation = await repo.createObligation(asset.id, {
      category: "service",
      title: "Service at 60,000 km",
      meterThreshold: 60_000,
      meterUnit: "km",
    });
    const evaluation = evaluateObligation(obligation, "2026-07-01", {
      value: 40_000,
      unit: "mi",
    });
    expect(evaluation.meterState).toBe("incompatible");
    expect(evaluation.text).toContain("mi");
  });
});

describe("obligation lifecycle", () => {
  it("dismisses, holds and reopens; refuses to reopen a completed occurrence", async () => {
    const asset = await ute();
    const repo = history();
    const obligation = await repo.createObligation(asset.id, {
      category: "reminder",
      title: "Check the tyres",
      dueDate: "2026-08-01",
    });

    const held = await repo.setObligationStatus(obligation.id, "on_hold");
    expect(held.obligation.status).toBe("on_hold");
    const reopened = await repo.setObligationStatus(obligation.id, "open");
    expect(reopened.obligation.status).toBe("open");
    const dismissed = await repo.setObligationStatus(
      obligation.id,
      "dismissed",
    );
    expect(dismissed.obligation.status).toBe("dismissed");
    expect(
      (await repo.setObligationStatus(obligation.id, "dismissed")).changed,
    ).toBe(false);

    await repo.setObligationStatus(obligation.id, "open");
    await repo.completeObligation(obligation.id);
    await expect(
      repo.setObligationStatus(obligation.id, "open"),
    ).rejects.toBeInstanceOf(AssetValidationError);
  });

  it("keeps the completed obligation as history when its proof is deleted", async () => {
    const asset = await ute();
    const repo = history();
    const obligation = await repo.createObligation(asset.id, {
      category: "service",
      title: "Service",
      dueDate: "2026-07-01",
      recurrenceKind: "months",
      recurrenceInterval: 6,
    });
    const result = await repo.completeObligation(obligation.id, {
      completedOn: "2026-07-01",
    });
    await repo.deleteEvent(result.event.id);

    const reread = await repo.getObligation(obligation.id);
    expect(reread?.status).toBe("completed");
    expect(reread?.completedEventId).toBeNull();
    // The successor — and therefore the recurrence — is untouched.
    const successor = await repo.getObligation(result.successor!.id);
    expect(successor?.status).toBe("open");
    expect(successor?.sequence).toBe(1);
  });

  it("sorts open work before completed in the obligations list", async () => {
    const asset = await ute();
    const repo = history();
    const done = await repo.createObligation(asset.id, {
      category: "reminder",
      title: "Old thing",
      dueDate: "2026-01-01",
    });
    await repo.completeObligation(done.id);
    await repo.createObligation(asset.id, {
      category: "reminder",
      title: "Next thing",
      dueDate: "2026-12-01",
    });

    const page = await repo.listObligations({ assetId: asset.id });
    expect(page.items[0].title).toBe("Next thing");
    expect(page.items.at(-1)!.title).toBe("Old thing");
  });
});

/* -------------------------------------------------------------------------- */
/* Task integration (§7 — the authority contract)                             */
/* -------------------------------------------------------------------------- */

describe("linked Task authority", () => {
  async function taskFor(title: string): Promise<string> {
    const tasks = makeTaskRepository(makeContext(WS));
    const task = await tasks.createTask({ title });
    return task.id;
  }

  it("links a Task and rejects a Task from another workspace", async () => {
    const asset = await ute();
    const repo = history();
    const obligation = await repo.createObligation(asset.id, {
      category: "registration",
      title: "Rego",
      dueDate: "2026-09-30",
    });
    const taskId = await taskFor("Renew the rego");

    const linked = await repo.linkObligationTask(obligation.id, taskId);
    expect(linked.created).toBe(true);
    expect(linked.obligation.taskId).toBe(taskId);
    expect((await repo.linkObligationTask(obligation.id, taskId)).created).toBe(
      false,
    );

    const stranger = await makeTaskRepository(makeContext(OTHER)).createTask({
      title: "Elsewhere",
    });
    await expect(
      repo.linkObligationTask(obligation.id, stranger.id),
    ).rejects.toBeInstanceOf(AssetValidationError);
  });

  it("does NOT complete the obligation when the Task is ticked off", async () => {
    const asset = await ute();
    const repo = history();
    const obligation = await repo.createObligation(asset.id, {
      category: "service",
      title: "Service",
      dueDate: "2026-07-01",
    });
    const taskId = await taskFor("Book the service");
    await repo.linkObligationTask(obligation.id, taskId);

    await makeTaskRepository(makeContext(WS)).completeTask(taskId);

    const reconciled = await repo.reconcileObligationTask(obligation.id);
    expect(reconciled.taskState).toBe("completed");
    // The obligation is STILL OPEN: ticking a task is not proof of servicing.
    expect(reconciled.obligation.status).toBe("open");
    expect(await countAssetEventRows()).toBe(0);
  });

  it("heals a pointer to a deleted Task so a fresh one can be created", async () => {
    const asset = await ute();
    const repo = history();
    const obligation = await repo.createObligation(asset.id, {
      category: "service",
      title: "Service",
      dueDate: "2026-07-01",
    });
    const taskId = await taskFor("Book the service");
    await repo.linkObligationTask(obligation.id, taskId);

    await makeSpineRepository(makeContext(WS)).softDelete(taskId);

    const reconciled = await repo.reconcileObligationTask(obligation.id);
    expect(reconciled.taskState).toBe("missing");
    expect(reconciled.obligation.taskId).toBeNull();
    expect(reconciled.changed).toBe(true);
  });

  it("completes the open linked Task when the obligation is completed", async () => {
    const asset = await ute();
    const gateway = recordingGateway();
    const repo = history(WS, "h", { taskGateway: gateway });
    const obligation = await repo.createObligation(asset.id, {
      category: "service",
      title: "Service",
      dueDate: "2026-07-01",
    });
    const taskId = await taskFor("Book the service");
    await repo.linkObligationTask(obligation.id, taskId);

    const result = await repo.completeObligation(obligation.id);
    expect(gateway.completed).toEqual([taskId]);
    expect(result.taskOutcome).toBe("completed");
  });

  it("moves the linked Task's due date when the obligation is rescheduled", async () => {
    const asset = await ute();
    const gateway = recordingGateway();
    const repo = history(WS, "h", { taskGateway: gateway });
    const obligation = await repo.createObligation(asset.id, {
      category: "service",
      title: "Service",
      dueDate: "2026-07-01",
    });
    const taskId = await taskFor("Book the service");
    await repo.linkObligationTask(obligation.id, taskId);

    await repo.updateObligation(obligation.id, { dueDate: "2026-08-15" });
    expect(gateway.rescheduled).toEqual([[taskId, "2026-08-15"]]);
  });

  it("keeps the obligation when the linked Task is deleted", async () => {
    const asset = await ute();
    const repo = history();
    const obligation = await repo.createObligation(asset.id, {
      category: "service",
      title: "Service",
      dueDate: "2026-07-01",
    });
    const taskId = await taskFor("Book the service");
    await repo.linkObligationTask(obligation.id, taskId);
    await makeSpineRepository(makeContext(WS)).softDelete(taskId);

    expect(await repo.getObligation(obligation.id)).not.toBeNull();
    expect(await countAssetObligationRows()).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Today attention query and collection summaries                             */
/* -------------------------------------------------------------------------- */

describe("listAttention (the Today read seam)", () => {
  it("returns overdue and due-soon obligations with the asset context", async () => {
    const asset = await ute();
    const repo = history();
    await repo.createObligation(asset.id, {
      category: "registration",
      title: "Renew registration",
      dueDate: "2026-07-10",
      leadDays: 14,
    });
    await repo.createObligation(asset.id, {
      category: "insurance",
      title: "Insurance renewal",
      dueDate: "2028-01-01",
    });

    const items = await repo.listAttention({ today: "2026-07-01" });
    expect(items).toHaveLength(1);
    expect(items[0].assetTitle).toBe("Ute");
    expect(items[0].assetType).toBe("vehicle");
    expect(items[0].obligation.title).toBe("Renew registration");
  });

  it("excludes obligations on an ARCHIVED asset", async () => {
    const asset = await ute();
    const repo = history();
    await repo.createObligation(asset.id, {
      category: "registration",
      title: "Renew registration",
      dueDate: "2026-07-02",
    });
    expect(await repo.listAttention({ today: "2026-07-01" })).toHaveLength(1);

    await assets().archive(asset.id);
    expect(await repo.listAttention({ today: "2026-07-01" })).toHaveLength(0);
  });

  it("excludes completed, dismissed and on-hold obligations", async () => {
    const asset = await ute();
    const repo = history();
    const a = await repo.createObligation(asset.id, {
      category: "reminder",
      title: "One",
      dueDate: "2026-07-02",
    });
    const b = await repo.createObligation(asset.id, {
      category: "reminder",
      title: "Two",
      dueDate: "2026-07-02",
    });
    await repo.completeObligation(a.id);
    await repo.setObligationStatus(b.id, "on_hold");
    expect(await repo.listAttention({ today: "2026-07-01" })).toHaveLength(0);
  });

  it("reports whether a linked Task is still open, for deduplication", async () => {
    const asset = await ute();
    const repo = history();
    const obligation = await repo.createObligation(asset.id, {
      category: "service",
      title: "Service",
      dueDate: "2026-07-02",
    });
    const task = await makeTaskRepository(makeContext(WS)).createTask({
      title: "Book the service",
    });
    await repo.linkObligationTask(obligation.id, task.id);

    let items = await repo.listAttention({ today: "2026-07-01" });
    expect(items[0].hasOpenTask).toBe(true);

    await makeTaskRepository(makeContext(WS)).completeTask(task.id);
    items = await repo.listAttention({ today: "2026-07-01" });
    expect(items[0].hasOpenTask).toBe(false);
  });

  it("never reaches across workspaces", async () => {
    const mine = await ute();
    const theirs = await ute(OTHER, "o");
    await history().createObligation(mine.id, {
      category: "reminder",
      title: "Mine",
      dueDate: "2026-07-02",
    });
    await history(OTHER, "oh").createObligation(theirs.id, {
      category: "reminder",
      title: "Theirs",
      dueDate: "2026-07-02",
    });
    const items = await history().listAttention({ today: "2026-07-01" });
    expect(items.map((i) => i.obligation.title)).toEqual(["Mine"]);
  });
});

describe("summariseObligations (the collection signal)", () => {
  it("counts overdue and due-soon per asset in ONE query", async () => {
    const repo = history();
    const a = await ute(WS, "a");
    const b = await assets(WS, "b").create({
      title: "Mower",
      assetType: "equipment",
    });
    await repo.createObligation(a.id, {
      category: "registration",
      title: "Rego",
      dueDate: "2026-06-01",
    });
    await repo.createObligation(a.id, {
      category: "service",
      title: "Service",
      dueDate: "2026-07-05",
      leadDays: 14,
    });
    await repo.createObligation(b.id, {
      category: "service",
      title: "Blade sharpen",
      dueDate: "2029-01-01",
    });

    const summary = await repo.summariseObligations([a.id, b.id], "2026-07-01");
    expect(summary.get(a.id)).toMatchObject({
      openCount: 2,
      overdueCount: 1,
      dueSoonCount: 1,
      nextDueDate: "2026-06-01",
    });
    expect(summary.get(b.id)).toMatchObject({
      openCount: 1,
      overdueCount: 0,
      dueSoonCount: 0,
    });
  });

  it("flags an asset whose meter obligation has no reading", async () => {
    const asset = await ute();
    const repo = history();
    await repo.createObligation(asset.id, {
      category: "service",
      title: "Service at 60,000 km",
      meterThreshold: 60_000,
      meterUnit: "km",
    });
    const summary = await repo.summariseObligations([asset.id], "2026-07-01");
    expect(summary.get(asset.id)?.needsMeterReading).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Asset lifecycle                                                            */
/* -------------------------------------------------------------------------- */

describe("asset lifecycle", () => {
  it("keeps history when the asset is archived, and restores it intact", async () => {
    const asset = await ute();
    const repo = history();
    await repo.recordEvent(asset.id, {
      category: "service",
      title: "Service",
      eventDate: "2026-07-01",
    });
    const obligation = await repo.createObligation(asset.id, {
      category: "service",
      title: "Next service",
      dueDate: "2027-01-01",
    });

    await assets().archive(asset.id);
    expect((await repo.listEvents({ assetId: asset.id })).items).toHaveLength(
      1,
    );
    // Archiving stops it ASKING for things, without reopening or losing anything.
    expect(await repo.listAttention({ today: "2026-12-28" })).toHaveLength(0);

    await assets().restore(asset.id);
    const reread = await repo.getObligation(obligation.id);
    expect(reread?.status).toBe("open");
    expect(await repo.listAttention({ today: "2026-12-28" })).toHaveLength(1);
  });

  it("refuses to record against a soft-deleted asset", async () => {
    const asset = await ute();
    await makeRepository(makeContext(WS)).softDelete(asset.id);
    await expect(
      history().recordEvent(asset.id, {
        category: "service",
        title: "Service",
        eventDate: "2026-07-01",
      }),
    ).rejects.toBeInstanceOf(AssetNotFoundError);
  });

  it("stops a deleted asset's obligations reaching Today", async () => {
    const asset = await ute();
    const repo = history();
    await repo.createObligation(asset.id, {
      category: "reminder",
      title: "Something",
      dueDate: "2026-07-02",
    });
    await makeRepository(makeContext(WS)).softDelete(asset.id);
    expect(await repo.listAttention({ today: "2026-07-01" })).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Relationships                                                              */
/* -------------------------------------------------------------------------- */

describe("provider and Person relationships (§14)", () => {
  it("stores a plain provider name with no Person, and never mints one", async () => {
    const asset = await ute();
    const before = await makeRepository(makeContext(WS)).list({ limit: 100 });
    const event = await history().recordEvent(asset.id, {
      category: "service",
      title: "Service",
      eventDate: "2026-07-01",
      provider: "Northside Auto",
    });
    expect(event.provider).toBe("Northside Auto");
    expect(event.personId).toBeNull();
    const after = await makeRepository(makeContext(WS)).list({ limit: 100 });
    expect(after.items.length).toBe(before.items.length);
  });

  it("stores a provider name AND a linked Person together", async () => {
    const asset = await ute();
    const person = await makePersonRepository(makeContext(WS)).create({
      title: "Sam the mechanic",
    });
    const event = await history().recordEvent(asset.id, {
      category: "service",
      title: "Service",
      eventDate: "2026-07-01",
      provider: "Northside Auto",
      personId: person.id,
    });
    expect(event.provider).toBe("Northside Auto");
    expect(event.personId).toBe(person.id);
  });

  it("links a Note without creating a second notes system", async () => {
    const asset = await ute();
    const note = await makeRepository(makeContext(WS)).create({
      type: "note",
      title: "Service report",
    });
    const event = await history().recordEvent(asset.id, {
      category: "service",
      title: "Service",
      eventDate: "2026-07-01",
      noteId: note.id,
    });
    expect(event.noteId).toBe(note.id);
  });
});

/* -------------------------------------------------------------------------- */
/* Rollback                                                                   */
/* -------------------------------------------------------------------------- */

describe("atomicity", () => {
  it("rolls the whole event write back when a later statement fails", async () => {
    const asset = await ute();
    const repo = history(WS, "h", { mutationFault: "after-domain" });
    await expect(
      repo.recordEvent(asset.id, {
        category: "service",
        title: "Service",
        eventDate: "2026-07-01",
        nextDueDate: "2027-01-01",
      }),
    ).rejects.toBeTruthy();
    expect(await countAssetEventRows()).toBe(0);
    expect(await countActivitiesOfType(ASSET_EVENT_CREATED)).toBe(0);
    const refreshed = await assets().get(asset.id);
    expect(refreshed?.nextServiceDate).toBeNull();
  });

  it("rolls a whole completion back — no event, no successor, no fact change", async () => {
    const asset = await ute();
    const setup = history();
    const obligation = await setup.createObligation(asset.id, {
      category: "service",
      title: "Service",
      dueDate: "2026-07-01",
      recurrenceKind: "months",
      recurrenceInterval: 6,
    });

    const faulty = history(WS, "f", { mutationFault: "after-domain" });
    await expect(
      faulty.completeObligation(obligation.id, { completedOn: "2026-07-01" }),
    ).rejects.toBeTruthy();

    expect(await countAssetEventRows()).toBe(0);
    expect(await countAssetObligationRows()).toBe(1);
    expect((await setup.getObligation(obligation.id))?.status).toBe("open");
    expect((await assets().get(asset.id))?.nextServiceDate).toBeNull();
  });
});
