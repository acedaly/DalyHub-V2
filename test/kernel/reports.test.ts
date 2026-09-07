/**
 * V2.13 — real Workers/D1 integration tests for REPORTS.
 *
 * These are the release's evidence, and they are deliberately not tests of the
 * executor's arithmetic (that is `test/unit/reports/report-executor.test.ts`,
 * against fake adapters). What is proven here can only be proven against a real
 * database:
 *
 *   1. **MACHINE-VALUE PARITY.** Every built-in's figures equal the canonical
 *      read the surface that owns them already uses — computed twice, on one
 *      fixture built to expose a second implementation.
 *   2. **HOSTILE WORKSPACE.** A foreign report id, category, account, Area,
 *      Goal or subject is indistinguishable from one that does not exist, and a
 *      foreign filter narrows to nothing rather than broadening a total.
 *   3. **THE STATEMENT BUDGET.** Each built-in's statement count is flat in
 *      workspace size — never one per group, per bucket or per entity.
 *   4. **EXPORT/RESTORE.** A saved definition survives the archive round trip
 *      and answers identically afterwards.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import { monthDirectionTotals, monthEnd, monthStart } from "~/kernel/finance";
import {
  BUILT_IN_REPORTS,
  executeReport,
  findBuiltInReport,
  parseReportDefinition,
  reportMeasure,
  REPORT_CONFIG_VERSION,
  serialiseReportDefinition,
  type ReportConfig,
  type ReportResult,
} from "~/kernel/reports";
import { SavedViewValidationError } from "~/kernel/views";
import { createReportAdapters } from "~/platform/reports/report-adapters.server";

import {
  createAssetHistoryRepository,
  createAssetRepository,
  createEntityRepository,
  createFinanceRepository,
  createGoalMeasurementRepository,
  createObligationRepository,
  createReviewInsightRepository,
  createReviewRepository,
  createTaskRepository,
} from "~/platform/storage/d1";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeGoalRepository,
  makeReportRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_reports";
const OTHER = "ws_reports_other";
const OWNER = "owner-reports";
const OTHER_OWNER = "owner-reports-b";

/** Every figure in this file is synthetic. DEBT-198 forbids real money here. */
const TODAY = "2026-09-07";
const nextId = sequentialIds("rp");

function startOfOwnerDay(dayIso: string): Date {
  // Sydney is UTC+10 across this fixture's whole span (the 2026 DST change is
  // 4 October, after every date used below).
  return new Date(`${dayIso}T00:00:00.000+10:00`);
}

/**
 * The adapter scope, built over a SUPPLIED database.
 *
 * The factories are called directly rather than through `test/kernel/support`'s
 * helpers, which bind `env.DB`: the statement-budget tests hand a counting proxy
 * here, and a helper that ignored it would count nothing and pass vacuously.
 */
function scopeFor(workspaceId: string, db: D1Database = env.DB) {
  const context = makeContext(workspaceId);
  const clock = new FakeClock(`${TODAY}T02:00:00.000Z`).now;
  return {
    finance: createFinanceRepository(db, context, { clock }),
    // Wired as the composition root wires it — see `makeObligationRepository`.
    obligations: createObligationRepository(db, context, {
      clock,
      proofGateway: createAssetHistoryRepository(db, context, { clock }),
      settlementGateway: createFinanceRepository(db, context, { clock }),
      meterUnits: ["km", "mi", "hours", "cycles", "count"],
    }),
    tasks: createTaskRepository(db, context),
    goalMeasurements: createGoalMeasurementRepository(db, context),
    reviews: createReviewRepository(db, context),
    reviewInsights: createReviewInsightRepository(db, context),
    entities: createEntityRepository(db, context),
  };
}

async function run(
  config: ReportConfig,
  workspaceId = WS,
  db: D1Database = env.DB,
): Promise<ReportResult> {
  const scope = scopeFor(workspaceId, db);
  const execution = await executeReport(config, {
    todayIso: TODAY,
    startOfOwnerDay,
    availableSources: ["tasks", "goals", "projects", "obligations", "finance"],
    adapters: createReportAdapters(
      scope as unknown as Parameters<typeof createReportAdapters>[0],
    ),
    now: new Date(`${TODAY}T02:00:00.000Z`),
  });
  if (!execution.ok) {
    throw new Error(`refused: ${execution.refusal.code}`);
  }
  return execution.result;
}

/** The definition a built-in carries, with any missing filter supplied. */
function builtIn(
  id: string,
  filters: Record<string, unknown> = {},
): ReportConfig {
  const definition = findBuiltInReport(id);
  if (!definition) throw new Error(`no built-in ${id}`);
  const parsed = parseReportDefinition({
    ...definition.config,
    filters: { ...definition.config.filters, ...filters },
  });
  if (!parsed.ok) throw new Error(`built-in ${id} did not parse`);
  return parsed.config;
}

/** The single block's rows, keyed by label. Every value is definitely present. */
function rowsOf(result: ReportResult, currencyCode: string | null = null) {
  const block = result.blocks.find(
    (candidate) => candidate.currencyCode === currencyCode,
  );
  return new Map(
    (block?.rows ?? []).map((row) => [row.label, row.value ?? 0] as const),
  );
}

/* -------------------------------------------------------------------------- */
/* The fixture                                                                 */
/* -------------------------------------------------------------------------- */

interface Fixture {
  readonly accountId: string;
  readonly groceriesId: string;
  readonly housingId: string;
  readonly incomeId: string;
  readonly areaHealthId: string;
  readonly areaWorkId: string;
  readonly goalId: string;
}

/**
 * A workspace built to EXPOSE a second implementation.
 *
 * It carries, all at once: a transfer pair (which must be excluded), a refund
 * inside a spending category (which must REDUCE spend rather than count as
 * income), an uncategorised outflow AND an uncategorised inflow (which must not
 * net against each other), two currencies (which must never meet), an income
 * category (which must not appear in a spending report), a completed Task in
 * each of two Areas plus one attached to nothing, an obligation with an amount
 * and one without, a meter-recurring obligation (which cannot be projected) and
 * a Goal with readings in two months and a silent month between them.
 */
async function seedFixture(workspaceId: string): Promise<Fixture> {
  const context = makeContext(workspaceId);
  const scope = scopeFor(workspaceId);
  const spine = makeSpineRepository(context);

  const account = await scope.finance.createAccount({
    title: "Everyday",
    accountType: "transaction",
    currencyCode: "AUD",
    openingBalance: "0.00",
    openingDate: "2025-01-01",
  });
  const savings = await scope.finance.createAccount({
    title: "Savings",
    accountType: "savings",
    currencyCode: "AUD",
    openingBalance: "0.00",
    openingDate: "2025-01-01",
  });
  // A second CURRENCY lives on its own account, because a transaction takes its
  // currency from the account it is in. Its figures must never meet the AUD ones.
  const sterling = await scope.finance.createAccount({
    title: "UK current",
    accountType: "transaction",
    currencyCode: "GBP",
    openingBalance: "0.00",
    openingDate: "2025-01-01",
  });

  const categories = await scope.finance.listCategories();
  const named = (name: string) => {
    const found = categories.find((category) => category.name === name);
    if (!found) throw new Error(`starter category ${name} missing`);
    return found.id;
  };
  const groceries = named("Groceries");
  const housing = named("Housing");
  const income = named("Income");

  const entry = async (
    categoryId: string | null,
    amount: string,
    occurredOn: string,
    accountId = account.id,
  ) =>
    scope.finance.createTransaction({
      accountId,
      occurredOn,
      amount,
      payeeDisplay: "Synthetic",
      categoryId,
    });

  // Two months of spending, so a month breakdown has more than one bucket.
  await entry(groceries, "-120.00", "2026-08-04");
  await entry(groceries, "-80.00", "2026-09-02");
  // A REFUND inside a spending category: it REDUCES Groceries, and it is not
  // income. A second implementation typically counts it as money in.
  await entry(groceries, "30.00", "2026-09-03");
  await entry(housing, "-2000.00", "2026-09-01");
  await entry(income, "5000.00", "2026-09-01");
  // Uncategorised, both directions. They must not net against each other.
  await entry(null, "-45.00", "2026-09-04");
  await entry(null, "12.00", "2026-09-05");
  await entry(groceries, "-99.00", "2026-09-06", sterling.id);

  // A TRANSFER pair, which every spending figure must exclude.
  const out = await entry(null, "-500.00", "2026-09-02");
  const back = await entry(null, "500.00", "2026-09-02", savings.id);
  await scope.finance.linkTransfer(out.id, back.id);

  /*
   * The spine. The Half marathon Project hangs off a GOAL rather than an Area,
   * so the report's ancestry has to walk project → goal → area — the precedence
   * a second implementation gets wrong by looking only at project → area.
   */
  const health = await spine.createArea({ title: "Health" });
  const work = await spine.createArea({ title: "Work" });
  const goal = await spine.createGoal({
    title: "Reach 70 kg",
    areaId: health.id,
  });
  const project = await spine.createProject({
    title: "Half marathon",
    parent: { kind: "goal", id: goal.id },
  });
  const workProject = await spine.createProject({
    title: "Q3 launch",
    parent: { kind: "area", id: work.id },
  });

  /** Complete a Task AT a given instant, by binding the clock to it. */
  const completeAt = async (
    title: string,
    parent: { kind: "area" | "project"; id: string },
    at: string,
  ) => {
    const dated = makeSpineRepository(context, {
      clock: new FakeClock(at).now,
    });
    const task = await dated.createTask({ title, parent });
    await dated.complete(task.id);
    return task;
  };

  await completeAt(
    "Long run",
    { kind: "project", id: project.id },
    "2026-08-20T09:00:00+10:00",
  );
  await completeAt(
    "Tempo run",
    { kind: "project", id: project.id },
    "2026-09-01T09:00:00+10:00",
  );
  await completeAt(
    "Ship beta",
    { kind: "project", id: workProject.id },
    "2026-09-02T09:00:00+10:00",
  );
  await completeAt(
    "Book a physio",
    { kind: "area", id: health.id },
    "2026-09-03T09:00:00+10:00",
  );
  // A Task completed and then REOPENED counts NOWHERE: the report reads current
  // completion state, never `task.completed` events.
  const reopened = await completeAt(
    "Reopened",
    { kind: "project", id: project.id },
    "2026-09-04T09:00:00+10:00",
  );
  await spine.reopen(reopened.id);

  // Goal measurements: two readings in July, none in August, one in September.
  await scope.goalMeasurements.createMeasurement(goal.id, {
    value: 78,
    measuredOn: "2026-07-05",
  });
  await scope.goalMeasurements.createMeasurement(goal.id, {
    value: 79,
    measuredOn: "2026-07-02",
  });
  await scope.goalMeasurements.createMeasurement(goal.id, {
    value: 74,
    measuredOn: "2026-09-04",
  });

  // Obligations: one with an amount, one WITHOUT (which is counted rather than
  // estimated), and a monthly subscription.
  await scope.obligations.create({
    category: "insurance",
    title: "Car insurance",
    dueDate: "2026-10-15",
    expectedAmount: "820.00",
    currencyCode: "AUD",
    recurrenceKind: "months",
    recurrenceInterval: 12,
  });
  await scope.obligations.create({
    category: "bill",
    title: "Electricity",
    dueDate: "2026-11-02",
    recurrenceKind: "months",
    recurrenceInterval: 3,
  });
  await scope.obligations.create({
    category: "subscription",
    title: "Streaming",
    dueDate: "2026-09-20",
    expectedAmount: "19.99",
    currencyCode: "AUD",
    recurrenceKind: "months",
    recurrenceInterval: 1,
  });

  return {
    accountId: account.id,
    groceriesId: groceries,
    housingId: housing,
    incomeId: income,
    areaHealthId: health.id,
    areaWorkId: work.id,
    goalId: goal.id,
  };
}

let fixture: Fixture;

beforeEach(async () => {
  await resetTables([WS, OTHER]);
  fixture = await seedFixture(WS);
});

/* -------------------------------------------------------------------------- */
/* Machine-value parity                                                        */
/* -------------------------------------------------------------------------- */

describe("machine-value parity with the surfaces these reports summarise", () => {
  it("Finance: the range read and the MONTH summary are one implementation", async () => {
    const scope = scopeFor(WS);
    const month = "2026-09";
    const summary = await scope.finance.monthSummary(month);
    const range = await scope.finance.summariseRange({
      fromIso: monthStart(month),
      toIso: monthEnd(month),
      groupBy: "category",
    });

    // Row for row, over a fixture holding a transfer, a refund, an archived
    // category's absence, two uncategorised directions and two currencies.
    expect(range).toHaveLength(summary.categories.length);
    expect(
      range.map((row) => [row.groupKey, row.currencyCode, row.netMinor]).sort(),
    ).toEqual(
      summary.categories
        .map((row) => [row.categoryId, row.currencyCode, row.netMinor])
        .sort(),
    );
  });

  it("Built-in 1: spending by category equals the Finance month's own totals", async () => {
    const scope = scopeFor(WS);
    const august = await scope.finance.monthSummary("2026-08");
    const september = await scope.finance.monthSummary("2026-09");
    /*
     * The canonical figure is the Finance home's OWN arithmetic, and it reports
     * categorised spend and uncategorised spend as two figures rather than one
     * — deliberately, so a month with forty uncategorised rows cannot
     * understate spending. The report's "Money out" is both, with the
     * uncategorised part as its own named row, so parity is their sum.
     */
    const audOut = (
      summary: Awaited<ReturnType<typeof scope.finance.monthSummary>>,
    ) => {
      const totals = monthDirectionTotals(summary);
      const aud = (
        entries: readonly { currencyCode: string; minorUnits: number }[],
      ) => entries.find((t) => t.currencyCode === "AUD")?.minorUnits ?? 0;
      return aud(totals.out) + aud(totals.uncategorisedOut);
    };
    const canonicalAud = audOut(august) + audOut(september);

    const result = await run(builtIn("spend-by-category"));
    const aud = result.blocks.find((block) => block.currencyCode === "AUD");
    expect(aud?.total).toBe(canonicalAud);

    // The refund REDUCED Groceries rather than counting as income: 12,000 in
    // August plus 8,000 less 3,000 in September.
    expect(rowsOf(result, "AUD").get("Groceries")).toBe(12_000 + 8_000 - 3_000);
    expect(rowsOf(result, "AUD").get("Housing")).toBe(200_000);
    // The income category is not a spending row at all.
    expect(rowsOf(result, "AUD").has("Income")).toBe(false);
    // The uncategorised OUTFLOW is its own row, and the inflow did not net it.
    expect(rowsOf(result, "AUD").get("Uncategorised")).toBe(4_500);
  });

  it("Built-in 1: transfers are excluded — the falsification", async () => {
    const result = await run(builtIn("spend-by-category"));
    const aud = result.blocks.find((block) => block.currencyCode === "AUD");
    // The transfer leg is 50,000. If it were counted, the uncategorised row
    // would be 54,500 and the total 50,000 larger.
    expect(rowsOf(result, "AUD").get("Uncategorised")).not.toBe(54_500);
    expect(aud?.total).toBe(12_000 + 8_000 - 3_000 + 200_000 + 4_500);
  });

  it("Built-in 1: the two currencies never meet", async () => {
    const result = await run(builtIn("spend-by-category"));
    expect(result.blocks.map((block) => block.currencyCode)).toEqual([
      "AUD",
      "GBP",
    ]);
    expect(result.blocks[1].total).toBe(9_900);
    // The sum that must exist nowhere in the result.
    expect(result.blocks.some((block) => block.total === 231_400)).toBe(false);
    expect(result.notes.map((note) => note.code)).toContain("mixed_currency");
  });

  it("Built-in 3: completed Tasks by Area equals the completion authority", async () => {
    const scope = scopeFor(WS);
    const window = {
      key: "w",
      // The built-in's own window: 12 weeks ending today, in the owner's zone.
      startsAt: startOfOwnerDay("2026-06-15"),
      endsAt: startOfOwnerDay("2026-09-08"),
    };
    const [canonical] = await scope.tasks.countCompletedTasksInWindows([
      window,
    ]);

    const result = await run(builtIn("completed-tasks-by-area"));
    const rows = rowsOf(result);
    const listed = [...rows.values()].reduce((sum, value) => sum + value, 0);

    // Every completion is attributed somewhere, including the one with no Area.
    expect(listed).toBe(canonical.completed);
    // Health is THREE: two through project -> goal -> area, and one Task
    // sitting directly in the Area. The goal hop is the precedence a second
    // implementation gets wrong.
    expect(rows.get("Health")).toBe(3);
    expect(rows.get("Work")).toBe(1);
    // The reopened Task counts NOWHERE: current completion state, not events.
    expect(canonical.completed).toBe(4);
  });

  it("Built-in 3: the historical-attribution note travels with the figures", async () => {
    const result = await run(builtIn("completed-tasks-by-area"));
    expect(result.notes.find((note) => note.code === "standing")?.text).toMatch(
      /where each Task sits today/i,
    );
  });

  it("Built-in 2: Goal measurements are the recorded readings, gaps and all", async () => {
    const scope = scopeFor(WS);
    const canonical = await scope.goalMeasurements.listMeasurements(
      fixture.goalId,
    );
    expect(canonical).toHaveLength(3);

    const result = await run(
      builtIn("goal-measurements", { goalId: fixture.goalId }),
    );
    const block = result.blocks[0];
    expect(block.rows).toHaveLength(12);

    /*
     * The buckets are NOT calendar months. The history kernel generates them
     * backward from the window's END so the most recent one is always whole, so
     * a window ending 7 September tiles into 8 Aug – 7 Sep, 8 Jul – 7 Aug, and
     * so on. That rule is `bucketWindow`'s and this report inherits it rather
     * than acquiring a second one — which is exactly why every row prints its
     * own span rather than a month name alone.
     */
    const bucketFor = (dayIso: string) =>
      block.rows.find(
        (row) =>
          row.period !== null &&
          row.period.startIso <= dayIso &&
          dayIso <= row.period.endIso,
      );

    // The bucket holding 2 and 5 July shows the LAST reading in it (5 July's
    // 78), not the first and not a mean.
    expect(bucketFor("2026-07-05")?.value).toBe(78);
    // The bucket 8 July – 7 August held no weigh-in at all. It is ABSENT —
    // never 0, never carried forward, never interpolated.
    expect(bucketFor("2026-07-20")?.value).toBeNull();
    expect(bucketFor("2026-08-01")?.value).toBeNull();
    // And the one after it holds September's reading.
    expect(bucketFor("2026-09-04")?.value).toBe(74);
    expect(block.rows.some((row) => row.value === 0)).toBe(false);
    // Twelve monthly weigh-ins do not add up to anything.
    expect(block.total).toBeNull();
  });

  it("Built-in 4: obligations due equals the canonical obligation read", async () => {
    const scope = scopeFor(WS);
    const canonical = await scope.obligations.list({ today: TODAY });
    const inWindow = canonical.items.filter(
      (obligation) =>
        obligation.dueDate !== null &&
        obligation.dueDate >= TODAY &&
        obligation.dueDate <= "2026-12-05",
    );

    const result = await run(builtIn("obligations-next-90-days"));
    const rows = rowsOf(result);
    const total = [...rows.values()].reduce((sum, value) => sum + value, 0);
    expect(total).toBe(inWindow.length);
    expect(rows.get("September 2026")).toBe(1);
    expect(rows.get("October 2026")).toBe(1);
    expect(rows.get("November 2026")).toBe(1);
  });

  it("Built-in 6: a commitment with no amount is counted, never estimated", async () => {
    const result = await run(builtIn("recurring-commitments-by-month"));
    // Electricity has no recorded amount, so it appears in no money total.
    expect(
      result.notes.some((note) => /no recorded amount/i.test(note.text)),
    ).toBe(true);

    const aud = result.blocks.find((block) => block.currencyCode === "AUD");
    // Streaming repeats monthly at $19.99; the insurance renews once a year.
    // September through August is twelve streaming occurrences plus one
    // insurance renewal in October — nothing estimated for Electricity.
    expect(aud?.total).toBe(12 * 1_999 + 82_000);
  });

  it("Built-in 6: a METER commitment cannot be projected onto a calendar", async () => {
    const scope = scopeFor(WS);
    const car = await createAssetRepository(env.DB, makeContext(WS)).create({
      title: "Ute",
      assetType: "vehicle",
    });
    await scope.obligations.create({
      category: "service",
      title: "Car service",
      subjectEntityId: car.id,
      dueDate: "2026-10-01",
      recurrenceKind: "meter",
      meterThreshold: 100_000,
      meterInterval: 10_000,
      meterUnit: "km",
    });

    const result = await run(builtIn("recurring-commitments-by-month"));
    expect(
      result.notes.some((note) =>
        /meter rather than a calendar/i.test(note.text),
      ),
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Hostile workspace                                                           */
/* -------------------------------------------------------------------------- */

describe("hostile workspace", () => {
  beforeEach(async () => {
    await seedFixture(OTHER);
  });

  it("a foreign report id is indistinguishable from one that does not exist", async () => {
    const mine = makeReportRepository(makeContext(WS), {
      idGenerator: nextId,
    });
    const theirs = makeReportRepository(makeContext(OTHER), {
      idGenerator: nextId,
    });
    const saved = await theirs.create(OTHER_OWNER, {
      name: "Their spending",
      config: parseReportDefinition(builtIn("spend-by-category")),
    });

    expect(await mine.get(OWNER, saved.id)).toBeNull();
    expect(await mine.get(OTHER_OWNER, saved.id)).toBeNull();
    // Deleting one you cannot see is a defined no-op, not an error that
    // discloses that it exists.
    expect(await mine.remove(OWNER, saved.id)).toBe(false);
  });

  it("a foreign CATEGORY narrows to nothing rather than broadening a total", async () => {
    const other = scopeFor(OTHER);
    const theirCategories = await other.finance.listCategories();
    const theirGroceries = theirCategories.find((c) => c.name === "Groceries");
    expect(theirGroceries).toBeDefined();

    const result = await run({
      ...builtIn("spend-by-category"),
      filters: { categoryId: theirGroceries?.id },
    });
    // Not "every category", and not their figures either.
    expect(result.blocks.every((block) => block.rows.length === 0)).toBe(true);
    expect(result.notes.map((note) => note.code)).toContain("no_records");
  });

  it("declares no Task filter it cannot apply", () => {
    /*
     * The registry's honesty property, asserted rather than assumed: a filter a
     * measure DECLARES must be applied by the read behind it, because a
     * declared filter no read applies computes a BROADER figure than the owner
     * asked for and presents it under their name. V2.13's completion reads
     * answer a window and a grouping and take no ancestry predicate, so the
     * Tasks measure declares no filters at all.
     */
    const measure = reportMeasure("completed_count");
    expect(measure?.filters).toEqual([]);
    expect(measure?.requiredFilters).toEqual([]);
  });

  it("a foreign GOAL yields no readings, and does not disclose the Goal", async () => {
    const otherFixture = scopeFor(OTHER);
    const theirGoals = await makeGoalRepository(makeContext(OTHER)).listGoals();
    const theirGoal = theirGoals.items[0];
    expect(theirGoal).toBeDefined();
    expect(
      await otherFixture.goalMeasurements.listMeasurements(theirGoal.id),
    ).not.toHaveLength(0);

    const result = await run(
      builtIn("goal-measurements", { goalId: theirGoal.id }),
    );
    expect(result.blocks[0].rows.every((row) => row.value === null)).toBe(true);
  });

  it("a foreign ACCOUNT contributes nothing", async () => {
    const other = scopeFor(OTHER);
    const theirAccounts = await other.finance.listAccountsWithBalances();
    const result = await run({
      ...builtIn("spend-by-category"),
      filters: { accountId: theirAccounts[0].account.id },
    });
    expect(result.blocks.every((block) => block.rows.length === 0)).toBe(true);
  });

  it("a foreign SUBJECT narrows an obligation report to nothing", async () => {
    const otherSpine = makeSpineRepository(makeContext(OTHER));
    const theirArea = await otherSpine.createArea({ title: "Theirs" });
    const result = await run({
      ...builtIn("obligations-next-90-days"),
      filters: { subjectId: theirArea.id },
    });
    expect(result.blocks.every((block) => block.rows.length === 0)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Storage: a kind, not a table                                                */
/* -------------------------------------------------------------------------- */

describe("a saved report is a saved-view KIND", () => {
  it("lives in the same table, and the two other kinds cannot see it", async () => {
    const reports = makeReportRepository(makeContext(WS), {
      idGenerator: nextId,
    });
    const saved = await reports.create(OWNER, {
      name: "Household spending",
      config: parseReportDefinition(builtIn("spend-by-category")),
    });
    expect(saved.kind).toBe("report");

    const row = await env.DB.prepare(
      "SELECT kind, config FROM task_saved_views WHERE workspace_id = ? AND id = ?",
    )
      .bind(WS, saved.id)
      .first<{ kind: string; config: string }>();
    expect(row?.kind).toBe("report");
    // Stored CANONICALLY: only known keys with known values reach the column.
    expect(JSON.parse(row?.config ?? "{}")).toEqual(
      JSON.parse(serialiseReportDefinition(saved.config)),
    );

    // No new table. The whole kind cost a codec.
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%report%'",
    ).all<{ name: string }>();
    expect(tables.results ?? []).toEqual([]);
  });

  it("refuses to STORE a definition it could not read back", async () => {
    const reports = makeReportRepository(makeContext(WS), {
      idGenerator: nextId,
    });
    await expect(
      reports.create(OWNER, {
        name: "Nonsense",
        config: {
          ok: true,
          config: { ...builtIn("spend-by-category"), source: "payroll" },
        } as never,
      }),
    ).rejects.toBeInstanceOf(SavedViewValidationError);
  });

  it("reads a FUTURE definition as incompatible, and leaves its bytes alone", async () => {
    // Written by hand, as a later build would have written it.
    const future = JSON.stringify({
      version: REPORT_CONFIG_VERSION + 1,
      source: "dreams",
      measure: "vibes",
    });
    await env.DB.prepare(
      `INSERT INTO task_saved_views
         (workspace_id, id, owner_id, kind, name, config_version, config, created_at, updated_at)
       VALUES (?, ?, ?, 'report', ?, ?, ?, ?, ?)`,
    )
      .bind(
        WS,
        "future-report",
        OWNER,
        "From the future",
        REPORT_CONFIG_VERSION + 1,
        future,
        `${TODAY}T00:00:00.000Z`,
        `${TODAY}T00:00:00.000Z`,
      )
      .run();

    const reports = makeReportRepository(makeContext(WS));
    const read = await reports.get(OWNER, "future-report");
    expect(read?.config.ok).toBe(false);
    // The definition is preserved verbatim, so nothing is lost by opening it.
    expect(serialiseReportDefinition(read!.config)).toBe(future);
  });
});

/* -------------------------------------------------------------------------- */
/* Export and restore                                                          */
/* -------------------------------------------------------------------------- */

describe("export and restore", () => {
  it("a saved definition survives the archive and answers identically", async () => {
    const reports = makeReportRepository(makeContext(WS), {
      idGenerator: nextId,
    });
    const saved = await reports.create(OWNER, {
      name: "Household spending",
      config: parseReportDefinition(builtIn("spend-by-category")),
    });
    const before = await run(builtIn("spend-by-category"));

    // The snapshot's own projection, exactly as the export reads it.
    const rows = await env.DB.prepare(
      `SELECT id, kind, name, config_version, config
         FROM task_saved_views WHERE workspace_id = ? AND owner_id = ?`,
    )
      .bind(WS, OWNER)
      .all<{
        id: string;
        kind: string;
        name: string;
        config_version: number;
        config: string;
      }>();
    const archived = (rows.results ?? []).find((row) => row.id === saved.id);
    expect(archived?.kind).toBe("report");

    // Destroy and restore the row from the archived projection.
    await env.DB.prepare(
      "DELETE FROM task_saved_views WHERE workspace_id = ? AND id = ?",
    )
      .bind(WS, saved.id)
      .run();
    expect(await reports.get(OWNER, saved.id)).toBeNull();

    await env.DB.prepare(
      `INSERT INTO task_saved_views
         (workspace_id, id, owner_id, kind, name, config_version, config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        WS,
        archived!.id,
        OWNER,
        archived!.kind,
        archived!.name,
        archived!.config_version,
        archived!.config,
        `${TODAY}T00:00:00.000Z`,
        `${TODAY}T00:00:00.000Z`,
      )
      .run();

    const restored = await reports.get(OWNER, saved.id);
    expect(restored?.name).toBe("Household spending");
    expect(restored?.config.ok).toBe(true);
    if (!restored?.config.ok) throw new Error("restored definition unreadable");

    const after = await run(restored.config.config);
    // The same MACHINE VALUES, not merely the same shape.
    expect(
      after.blocks.map((block) => [block.currencyCode, block.total]),
    ).toEqual(before.blocks.map((block) => [block.currencyCode, block.total]));
  });
});

/* -------------------------------------------------------------------------- */
/* The statement budget                                                        */
/* -------------------------------------------------------------------------- */

describe("the statement budget", () => {
  /**
   * Each built-in's statement count, and the ONE property that matters: it does
   * not grow with the workspace. Never one query per group, per bucket or per
   * entity.
   */
  const BUDGET: Readonly<Record<string, number>> = {
    "spend-by-category": 1,
    "completed-tasks-by-area": 2,
    "obligations-next-90-days": 1,
    "recurring-commitments-by-month": 1,
  };

  it("holds at a SMALL workspace", async () => {
    for (const [id, expected] of Object.entries(BUDGET)) {
      const counter = countingDb(env.DB);
      await run(builtIn(id), WS, counter.db);
      expect(counter.prepareCount(), `${id} at a small workspace`).toBe(
        expected,
      );
    }
  });

  it("holds UNCHANGED at a much larger workspace", async () => {
    const scope = scopeFor(WS);
    const spine = makeSpineRepository(makeContext(WS));
    const accounts = await scope.finance.listAccountsWithBalances();
    const accountId = accounts[0].account.id;
    const categories = await scope.finance.listCategories();

    // Two hundred more transactions across every starter category, and forty
    // more completed Tasks across ten more Areas.
    for (let index = 0; index < 200; index += 1) {
      await scope.finance.createTransaction({
        accountId,
        occurredOn: `2026-0${(index % 8) + 1}-1${index % 10}`,
        amount: `-${1 + (index % 90)}.00`,
        payeeDisplay: `Synthetic ${index}`,
        categoryId: categories[index % categories.length].id,
      });
    }
    const dated = makeSpineRepository(makeContext(WS), {
      clock: new FakeClock("2026-08-15T09:00:00+10:00").now,
    });
    for (let index = 0; index < 10; index += 1) {
      const area = await spine.createArea({ title: `Area ${index}` });
      for (let inner = 0; inner < 4; inner += 1) {
        const task = await dated.createTask({
          title: `Bulk ${index}-${inner}`,
          parent: { kind: "area", id: area.id },
        });
        await dated.complete(task.id);
      }
    }

    for (const [id, expected] of Object.entries(BUDGET)) {
      const counter = countingDb(env.DB);
      await run(builtIn(id), WS, counter.db);
      expect(counter.prepareCount(), `${id} at a large workspace`).toBe(
        expected,
      );
    }
  });

  it("is flat in the number of BUCKETS a series asks for", async () => {
    const config: ReportConfig = {
      ...builtIn("spend-by-category"),
      measure: "money_in",
      breakdown: { by: "time", grain: "month" },
      sort: "chronological",
      visual: "trend",
    };
    const twelve = countingDb(env.DB);
    await run(config, WS, twelve.db);

    const twentyFour = countingDb(env.DB);
    await run(
      { ...config, window: { kind: "preset", preset: "24-months" } },
      WS,
      twentyFour.db,
    );
    // Twice the buckets, the same number of statements.
    expect(twentyFour.prepareCount()).toBe(twelve.prepareCount());
  });
});

/* -------------------------------------------------------------------------- */
/* Every built-in runs                                                         */
/* -------------------------------------------------------------------------- */

describe("every built-in", () => {
  it("executes against a real workspace without a refusal", async () => {
    for (const definition of BUILT_IN_REPORTS) {
      const config =
        definition.requiredFilter === "goalId"
          ? builtIn(definition.id, { goalId: fixture.goalId })
          : builtIn(definition.id);
      const result = await run(config);
      expect(result.availability, definition.id).toBe("ok");
      // Every one of them carries the qualification its measure declares.
      expect(
        result.notes.some((note) => note.code === "standing"),
        definition.id,
      ).toBe(true);
    }
  });
});
