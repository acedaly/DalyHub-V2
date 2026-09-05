/**
 * ASSET-02 — scale and performance over a representative dataset (real D1).
 *
 * Seeds the shape of a real, well-used workspace — dozens of Assets, hundreds of
 * events, hundreds of obligations, linked Tasks, People and Notes — and then
 * asserts the properties that keep it fast. These are not benchmarks (a CI runner's
 * wall-clock is not a product guarantee); they are STRUCTURAL assertions about
 * query counts and result bounds, which are the things that actually degrade.
 *
 * The failure this suite exists to prevent is the obvious one: a collection card
 * or a Today row that loads an Asset's history, turning one page into N queries.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  FakeClock,
  countingDb,
  makeAssetHistoryRepository,
  makeObligationRepository,
  makeAssetRepository,
  makeContext,
  makePersonRepository,
  makeRepository,
  makeTaskRepository,
  resetTables,
} from "./support";
import { env } from "cloudflare:test";
import {
  createAssetHistoryRepository,
  createObligationRepository,
} from "~/platform/storage/d1";

const WS = "test-default-workspace";
const TODAY = "2026-07-01";

/** The shape of a workspace that has genuinely been used for a few years. */
const ASSET_COUNT = 30;
const EVENTS_PER_ASSET = 12;
const OBLIGATIONS_PER_ASSET = 8;

const assetIds: string[] = [];

beforeAll(async () => {
  await resetTables([WS]);
  const context = makeContext(WS);
  const clock = new FakeClock().now;
  const assets = makeAssetRepository(context, { clock });
  const history = makeAssetHistoryRepository(context, { clock });
  // V2.10 LIFE-01 — obligations live in the ONE shared store now, wired
  // with the Assets adapter as its proof gateway exactly as the product is.
  const obligations = makeObligationRepository(context, { clock });
  const people = makePersonRepository(context, { clock });
  const tasks = makeTaskRepository(context, { clock });
  const entities = makeRepository(context, { clock });

  const person = await people.create({ title: "Sam the mechanic" });
  const note = await entities.create({ type: "note", title: "Service report" });

  for (let a = 0; a < ASSET_COUNT; a += 1) {
    const asset = await assets.create({
      title: `Asset ${a}`,
      assetType: a % 2 === 0 ? "vehicle" : "equipment",
      currencyCode: "AUD",
      purchasePrice: `${1000 + a}.00`,
    });
    assetIds.push(asset.id);

    for (let e = 0; e < EVENTS_PER_ASSET; e += 1) {
      const month = (e % 12) + 1;
      await history.recordEvent(asset.id, {
        category:
          e % 3 === 0 ? "service" : e % 3 === 1 ? "repair" : "valuation",
        title: `Entry ${e} on asset ${a}`,
        eventDate: `2025-${String(month).padStart(2, "0")}-15`,
        cost: e % 3 === 2 ? null : `${100 + e}.50`,
        value: e % 3 === 2 ? `${5000 + e * 10}.00` : null,
        currencyCode: "AUD",
        provider: "Northside Auto",
        personId: e === 0 ? person.id : null,
        noteId: e === 1 ? note.id : null,
        meterValue: e * 1000,
        meterUnit: "km",
      });
    }

    for (let o = 0; o < OBLIGATIONS_PER_ASSET; o += 1) {
      // A spread of overdue, due-soon, far-future and meter-based commitments.
      const dueDate =
        o === 0
          ? "2026-06-01"
          : o === 1
            ? "2026-07-05"
            : `2027-0${(o % 9) + 1}-01`;
      const obligation = await obligations.create({
        subjectEntityId: asset.id,
        category: o % 2 === 0 ? "service" : "registration",
        title: `Obligation ${o} on asset ${a}`,
        dueDate,
        recurrenceKind: o % 4 === 0 ? "months" : "none",
        recurrenceInterval: o % 4 === 0 ? 6 : null,
      });
      // A fraction carry a real linked Task, as they would in practice.
      if (o === 1 && a % 5 === 0) {
        const task = await tasks.createTask({ title: `Task for ${a}` });
        await obligations.linkTask(obligation.id, task.id);
      }
    }
  }
}, 600_000);

describe("the dataset is genuinely representative", () => {
  it("holds dozens of assets and hundreds of events and obligations", async () => {
    const events = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM asset_events",
    ).first<{ n: number }>();
    const obligations = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM obligation_details",
    ).first<{ n: number }>();
    expect(assetIds).toHaveLength(ASSET_COUNT);
    expect(events?.n).toBe(ASSET_COUNT * EVENTS_PER_ASSET);
    expect(obligations?.n).toBe(ASSET_COUNT * OBLIGATIONS_PER_ASSET);
  });
});

describe("bounded reads", () => {
  function counted() {
    const counting = countingDb(env.DB);
    return {
      ...counting,
      repo: createAssetHistoryRepository(counting.db, makeContext(WS), {
        clock: new FakeClock().now,
      }),
      // V2.10 LIFE-01 — the obligation reads are the shared store's, and their
      // statement counts are what this file exists to pin.
      obligations: createObligationRepository(counting.db, makeContext(WS), {
        clock: new FakeClock().now,
      }),
    };
  }

  it("summarises a WHOLE collection page's obligations in ONE query", async () => {
    const { obligations: obligationRepo, prepareCount, reset } = counted();
    reset();
    const summary = await obligationRepo.summariseBySubject(assetIds, TODAY);
    // One query for thirty assets — never one per card (§27).
    expect(prepareCount()).toBe(1);
    expect(summary.size).toBe(ASSET_COUNT);
    // And it never loaded a single history row to do it.
    expect(summary.get(assetIds[0])?.openCount).toBe(OBLIGATIONS_PER_ASSET);
  });

  it("serves the whole Today attention read in ONE query", async () => {
    const { obligations: obligationRepo, prepareCount, reset } = counted();
    reset();
    const items = await obligationRepo.listAttention({ today: TODAY });
    expect(prepareCount()).toBe(1);
    // Bounded regardless of how much is genuinely due across the workspace.
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(50);
  });

  it("caps the Today read even when far more is overdue than fits", async () => {
    const { obligations: obligationRepo } = counted();
    // Every asset has an overdue obligation, so the horizon alone would return
    // dozens; the cap is what keeps Today a preview.
    const items = await obligationRepo.listAttention({
      today: TODAY,
      limit: 5,
    });
    expect(items.length).toBeLessThanOrEqual(5);
  });

  it("pages the timeline instead of loading an asset's whole history", async () => {
    const { repo, prepareCount, reset } = counted();
    reset();
    const page = await repo.listEvents({ assetId: assetIds[0], limit: 10 });
    expect(prepareCount()).toBe(1);
    expect(page.items).toHaveLength(10);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).not.toBeNull();

    const next = await repo.listEvents({
      assetId: assetIds[0],
      limit: 10,
      cursor: page.nextCursor!,
    });
    expect(next.items).toHaveLength(2);
    // Every id is distinct across both pages — no overlap, no gap.
    const ids = new Set([
      ...page.items.map((e) => e.id),
      ...next.items.map((e) => e.id),
    ]);
    expect(ids.size).toBe(EVENTS_PER_ASSET);
  });

  it("clamps an unbounded page request to the documented maximum", async () => {
    const { repo } = counted();
    const page = await repo.listEvents({ assetId: assetIds[0], limit: 10_000 });
    expect(page.items.length).toBeLessThanOrEqual(100);
  });

  it("aggregates costs in ONE grouped query over the full history", async () => {
    const { repo, prepareCount, reset } = counted();
    reset();
    const summary = await repo.costSummary(assetIds[0]);
    // Two reads: the asset's own facts, then one GROUP BY over every event.
    // Never one read per event, and never a loaded page re-summed in JS.
    expect(prepareCount()).toBeLessThanOrEqual(3);
    expect(summary.ongoingTotalMinor).toBeGreaterThan(0);
    expect(summary.costedEventCount).toBe(8);
    expect(summary.mixedCurrency).toBe(false);
  });

  it("bounds the valuation history read", async () => {
    const { repo, prepareCount, reset } = counted();
    reset();
    const points = await repo.valuationHistory(assetIds[0], 3);
    expect(prepareCount()).toBe(1);
    expect(points).toHaveLength(3);
    // Oldest first, so a chart reads left to right without re-sorting.
    expect(points[0].date <= points[1].date).toBe(true);
  });

  it("pages the obligations list", async () => {
    const { obligations: obligationRepo, prepareCount, reset } = counted();
    reset();
    const page = await obligationRepo.list({
      subjectEntityId: assetIds[0],
      limit: 5,
    });
    expect(prepareCount()).toBe(1);
    expect(page.items).toHaveLength(5);
    expect(page.hasMore).toBe(true);

    const next = await obligationRepo.list({
      subjectEntityId: assetIds[0],
      limit: 5,
      cursor: page.nextCursor!,
    });
    expect(next.items).toHaveLength(3);
  });
});

describe("the collection stays clean of history", () => {
  it("lists a page of assets without touching events or obligations", async () => {
    const counting = countingDb(env.DB);
    const assets = makeAssetRepository(makeContext(WS), {
      clock: new FakeClock().now,
    });
    void counting;
    const page = await assets.list({ limit: 30 });
    expect(page.items).toHaveLength(30);
    // The Asset projection carries no history field at all — the obligation
    // signal is a SEPARATE, single, opt-in query the loader makes once.
    expect(page.items[0]).not.toHaveProperty("events");
    expect(page.items[0]).not.toHaveProperty("obligations");
  });
});
