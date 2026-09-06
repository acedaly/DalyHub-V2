/**
 * PERF-01 — what a navigation COSTS, pinned.
 *
 * The owner's report was wall-clock: `/tasks` about 450 ms and `/today` about
 * 850 ms in authenticated production, against a 115 ms Cloudflare Access
 * redirect that proves the network is not the problem. A CI runner cannot
 * reproduce those numbers and must not pretend to, so nothing here asserts a
 * duration. What it asserts instead are the three STRUCTURAL properties that
 * decide them:
 *
 *   1. **How many statements** a route costs — the existing house measure, and
 *      the one that catches a read introduced per row.
 *   2. **How DEEP** those statements are — the longest chain that had to wait,
 *      which is the number of serial D1 round trips and therefore the term that
 *      actually multiplies the network. Twenty statements in three waves and
 *      twenty in twenty cost the same budget and feel completely different, and
 *      before this item Today spent ELEVEN waves for thirty-eight statements.
 *   3. **How large the payload is** — the bytes the `.data` response carries.
 *
 * Every property is measured at TWO workspace sizes, because a single
 * measurement cannot tell a constant from a coincidence: a loader that reads one
 * row per Task looks perfectly flat at ten Tasks.
 *
 * The measurement runs the REAL route loaders against the REAL D1 in the Workers
 * pool, with the binding instrumented — so the numbers include the workspace
 * check and the preferences read every loader pays before its own work starts,
 * which an injected scope would silently omit.
 *
 * On the exact figures: the STATEMENT counts and the depth are asserted as
 * ceilings rather than equalities where a chunked read makes the count a
 * function of the page (see `/today` and `/tasks`), and as equalities where the
 * route's contract says the number is flat. Depth is an OBSERVED serialisation
 * measure — a statement counts one level deeper when it was issued after another
 * had already finished — so it can read one higher than the true dependency
 * depth when one query in a concurrent wave is much slower than its neighbours.
 * That makes it a good regression detector and a poor absolute, which is why it
 * is bounded rather than equated. It was stable across repeated runs at both
 * sizes when these ceilings were set.
 *
 * **Every fixture is synthetic** (`navigation-fixture.ts`).
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { loader as todayLoader } from "~/modules/today/routes/index";
import { loader as tasksLoader } from "~/modules/tasks/routes/index";
import { loader as projectsLoader } from "~/modules/projects/routes/index";
import { loader as goalsLoader } from "~/modules/goals/routes/index";
import { loader as obligationsLoader } from "~/modules/obligations/routes/index";
import { loader as financeLoader } from "~/modules/finance/routes/index";
import { loader as analyticsLoader } from "~/modules/analytics/routes/index";
import { createActivityActorContext } from "~/kernel/activity";
import { bindWorkspaceRepositories } from "~/platform/workspaces";

import { makeContext, resetTables } from "./support";
import {
  LARGE,
  SMALL,
  seedNavigationWorkspace,
  type FixtureSize,
} from "./navigation-fixture";
import {
  measurable,
  measureLoader,
  PERF_OWNER,
  type LoaderMeasurement,
  type MeasurableLoader,
} from "./navigation-measure";
import {
  explainQueryPlan,
  planFindings,
  profileDb,
  schemaTableNames,
} from "./perf-instrument";

const WS = "test-default-workspace";

/** The budget one route must stay inside, at one workspace size. */
interface RouteBudget {
  /** Most `prepare()` calls the loader may make. */
  readonly statements: number;
  /** Most serial round trips it may spend. */
  readonly depth: number;
  /** Most bytes its `.data` payload may carry. */
  readonly bytes: number;
}

interface RouteUnderTest {
  readonly name: string;
  readonly loader: MeasurableLoader;
  readonly url: string;
  readonly small: RouteBudget;
  readonly large: RouteBudget;
}

/*
 * The ceilings, measured on this fixture at the head of PERF-01. The `was`
 * column is what the same measurement returned BEFORE the item, so a reader can
 * see which number this file is protecting and by how much.
 *
 *                depth: was → now      statements: was → now
 *   /today            11 → 5                    38 → 38
 *   /tasks             8 → 4                    11 → 11
 *   /projects          9 → 3                    15 → 15
 *   /goals             9 → 5                    23 → 22
 *   /obligations       4 → 3                     4 → 4
 *   /finance           5 → 3                     9 → 9
 *   /analytics         6 → 4                    14 → 14
 *
 * The ceilings are the measured value, with no headroom on statements (the
 * number is exact and a change should be deliberate) and none on depth either
 * (it was identical across repeated runs at both sizes). A route that legitimately
 * grows raises its ceiling in the same change, with the new measurement quoted.
 */
const ROUTES: readonly RouteUnderTest[] = [
  {
    name: "/today",
    loader: measurable(todayLoader),
    url: "https://perf.test/today",
    small: { statements: 34, depth: 5, bytes: 12_000 },
    // Four more statements than the small workspace, and every one of them is a
    // CHUNK of the two page aggregates (240 Tasks is three chunks of 80 rather
    // than one) — not a read per row, and not a read per section. They cost no
    // extra depth, which is the property the chunking change was about.
    large: { statements: 38, depth: 5, bytes: 120_000 },
  },
  {
    name: "/tasks",
    loader: measurable(tasksLoader),
    url: "https://perf.test/tasks",
    small: { statements: 9, depth: 4, bytes: 12_000 },
    large: { statements: 11, depth: 4, bytes: 60_000 },
  },
  {
    name: "/projects",
    loader: measurable(projectsLoader),
    url: "https://perf.test/projects",
    small: { statements: 15, depth: 3, bytes: 10_000 },
    large: { statements: 15, depth: 3, bytes: 40_000 },
  },
  {
    name: "/goals",
    loader: measurable(goalsLoader),
    url: "https://perf.test/goals",
    small: { statements: 22, depth: 5, bytes: 10_000 },
    large: { statements: 22, depth: 5, bytes: 30_000 },
  },
  {
    name: "/obligations",
    loader: measurable(obligationsLoader),
    url: "https://perf.test/obligations",
    small: { statements: 4, depth: 3, bytes: 6_000 },
    large: { statements: 4, depth: 3, bytes: 30_000 },
  },
  {
    name: "/finance",
    loader: measurable(financeLoader),
    url: "https://perf.test/finance",
    small: { statements: 9, depth: 3, bytes: 4_000 },
    large: { statements: 9, depth: 3, bytes: 12_000 },
  },
  {
    name: "/analytics",
    loader: measurable(analyticsLoader),
    url: "https://perf.test/analytics",
    small: { statements: 14, depth: 4, bytes: 10_000 },
    large: { statements: 14, depth: 4, bytes: 12_000 },
  },
];

/**
 * Seed once per size and measure every route against it.
 *
 * Seeding the large workspace is the expensive part of this file, so it is done
 * twice in total rather than fourteen times.
 */
async function measureAll(
  size: FixtureSize,
): Promise<ReadonlyMap<string, LoaderMeasurement>> {
  await resetTables([WS]);
  await seedNavigationWorkspace(WS, size);
  const results = new Map<string, LoaderMeasurement>();
  for (const route of ROUTES) {
    results.set(route.name, await measureLoader(route.loader, route.url));
  }
  return results;
}

let small: ReadonlyMap<string, LoaderMeasurement>;
let large: ReadonlyMap<string, LoaderMeasurement>;

beforeAll(async () => {
  small = await measureAll(SMALL);
  large = await measureAll(LARGE);
}, 600_000);

describe("PERF-01 — every hot route stays inside its budget", () => {
  for (const route of ROUTES) {
    it(`${route.name} costs what it says it costs`, () => {
      for (const [budget, results] of [
        [route.small, () => small],
        [route.large, () => large],
      ] as const) {
        const measured = results().get(route.name)!;
        expect(measured.statements).toBeLessThanOrEqual(budget.statements);
        expect(measured.depth).toBeLessThanOrEqual(budget.depth);
        expect(measured.payloadBytes).toBeLessThanOrEqual(budget.bytes);
        // A loader that measured ZERO statements degraded to its empty state
        // instead of reading, which would make every ceiling above vacuous.
        expect(measured.statements).toBeGreaterThan(0);
      }
    });
  }

  it("costs the SAME depth at ten Tasks and at two hundred", () => {
    /*
     * The property a single measurement cannot establish. Statements may grow
     * with the page — a chunked aggregate is `ceil(ids / 80)` statements — but
     * the number of serial ROUND TRIPS must not, because that is what the
     * network multiplies. This is the assertion the sequential-chunk defect
     * would have failed: Today went from 7 waves to 11 between these two sizes
     * before PERF-01, purely because the page crossed a chunk boundary.
     */
    for (const route of ROUTES) {
      expect(`${route.name} depth ${large.get(route.name)!.depth}`).toBe(
        `${route.name} depth ${small.get(route.name)!.depth}`,
      );
    }
  });
});

describe("PERF-01 — the page aggregates read their chunks together", () => {
  /*
   * The targeted proof, at the unit where it is deterministic.
   *
   * The route budgets above bound the whole loader; this bounds the two reads
   * the defect was actually in. Both take a page of ids, split it by arithmetic
   * into chunks of eighty because D1 accepts a finite number of bound
   * parameters, and issue one statement per chunk. Nothing about chunk *n*
   * depends on chunk *n-1*, so all of them belong to one round trip — and before
   * PERF-01 each was awaited before the next, which on Today's 240-Task page was
   * three serial round trips per aggregate and six across the pair.
   *
   * `depth === 1` is the whole claim, and it is exact rather than bounded: a
   * single method issuing statements in one tick has no room for jitter.
   */
  let taskIds: readonly string[] = [];

  beforeAll(async () => {
    await resetTables([WS]);
    const seeded = await seedNavigationWorkspace(WS, LARGE);
    taskIds = seeded.taskIds;
  }, 600_000);

  function scopeOver(db: D1Database) {
    return bindWorkspaceRepositories(
      { DB: db },
      makeContext(WS),
      createActivityActorContext({ type: "user", id: PERF_OWNER }),
    );
  }

  it("reads checklist progress for a multi-chunk page in ONE round trip", async () => {
    const profile = profileDb(env.DB);
    const ids = taskIds.slice(0, 240);
    // The page really does span several chunks — otherwise the assertion below
    // would hold for a reason that has nothing to do with concurrency.
    expect(ids.length).toBeGreaterThan(160);
    await scopeOver(profile.db).tasks.listChecklistProgress(ids);
    expect(profile.executions()).toBeGreaterThan(1);
    expect(profile.depth()).toBe(1);
  });

  it("reads blocked summaries for a multi-chunk page in ONE round trip", async () => {
    const profile = profileDb(env.DB);
    const ids = taskIds.slice(0, 240);
    expect(ids.length).toBeGreaterThan(160);
    await scopeOver(profile.db).tasks.listBlockedSummaries(ids);
    expect(profile.executions()).toBeGreaterThan(1);
    expect(profile.depth()).toBe(1);
  });

  it("reads the open subset of a multi-chunk id list in ONE round trip", async () => {
    const profile = profileDb(env.DB);
    const ids = taskIds.slice(0, 240);
    await scopeOver(profile.db).tasks.listOpenTaskIds(ids);
    expect(profile.executions()).toBeGreaterThan(1);
    expect(profile.depth()).toBe(1);
  });
});

describe("PERF-01 — every hot statement reaches its tables by index", () => {
  /*
   * The Phase 5 finding, kept.
   *
   * `EXPLAIN QUERY PLAN` was run over every distinct statement the seven hot
   * loaders issue on the large workspace — 109 of them — and NOT ONE scans a
   * base table. Every predicate lands on an index. That is why this item adds no
   * index: an index is warranted when a measurement shows an avoidable scan, and
   * the measurement showed none.
   *
   * What this test protects is that finding. Dropping an index that a hot read
   * depends on turns its SEARCH into a SCAN, and this fails naming the table.
   *
   * A `SCAN` of a materialised CTE or a co-routine subquery is NOT a finding and
   * is not counted: DalyHub's projections are composed out of named CTEs, so
   * those lines are everywhere and no index can address them. The scanned name
   * is checked against the schema's actual table names — see `planFindings`.
   */
  it("issues no statement that scans a base table", async () => {
    await resetTables([WS]);
    await seedNavigationWorkspace(WS, LARGE);
    const tables = await schemaTableNames(env.DB);
    const findings: string[] = [];
    let explained = 0;
    for (const route of ROUTES) {
      const measured = await measureLoader(route.loader, route.url);
      const seen = new Set<string>();
      for (const record of measured.records) {
        if (record.batched || seen.has(record.sql)) continue;
        seen.add(record.sql);
        const plan = await explainQueryPlan(
          env.DB,
          record.sql,
          record.bindings,
        );
        explained += 1;
        const found = planFindings(plan, tables);
        if (!found.scansTable) continue;
        findings.push(
          `${route.name} scans ${found.scannedTables.join(", ")}: ${record.sql
            .replace(/\s+/g, " ")
            .slice(0, 120)}`,
        );
      }
    }
    // A pass with nothing explained would be a pass that proved nothing.
    expect(explained).toBeGreaterThan(80);
    expect(findings).toEqual([]);
  }, 600_000);
});
