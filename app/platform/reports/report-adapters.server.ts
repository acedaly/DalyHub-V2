/**
 * V2.13 RPT-03 — the FIVE source adapters: the only place a Report touches a
 * store.
 *
 * Each one maps a validated definition to ONE canonical repository read and
 * returns the cells it found. They do no arithmetic the domain does not already
 * own, they never author SQL, and they never fill an empty bucket — the
 * executor does that, by the measure's own rule, so a careless adapter cannot
 * quietly draw a Goal's silent month as a zero.
 *
 * ## Every figure comes from the read that already owns it
 *
 *   finance      `summariseRange`, which `monthSummary` is itself defined in
 *                terms of — so a report and the Finance home cannot disagree.
 *   tasks        `countCompletedByGroup` / `countCompletedInBuckets`, both over
 *                `spine_records.completed_at` (ADR-114 d4). NEVER the Activity
 *                stream, which answers a different question.
 *   goals        `listMeasurements`, the Goal's own recorded readings.
 *   obligations  `summariseDue` for what is stored; `listRecurring` plus the
 *                canonical recurrence arithmetic for what is projected.
 *   projects     the Review insight snapshots, through `listSnapshotSeries`.
 *
 * ## Nothing here is logged
 *
 * A Reports route logs a source key, a shape and a duration. No amount, no
 * payee, no group label and no row value ever reaches a log line — the boundary
 * `finance-facts.server.ts` holds, held here too.
 */

import {
  monthLabel,
  monthOf,
  rangeDirectionAmount,
  type FinanceRangeGroup,
  type FinanceRepository,
} from "~/kernel/finance";
import {
  obligationCategoryLabel,
  projectObligations,
  type ObligationRepository,
} from "~/kernel/obligations";
import {
  MAX_REPORT_GROUPS,
  MAX_REPORT_READINGS,
  type ReportCell,
  type ReportRead,
  type ReportReadRequest,
  type ReportSourceAdapters,
} from "~/kernel/reports";
import { PROJECT_HEALTH_STATE_LABELS } from "~/kernel/project-health";
import type { GoalMeasurementRepository } from "~/kernel/goals";
import type { EntityRepository } from "~/kernel/entities";
import type { ReviewInsightRepository } from "~/kernel/review-insights";
import type { ReviewRepository, ReviewType } from "~/kernel/reviews";
import type { TaskRepository } from "~/kernel/tasks";

/** How many Reviews one Project-health report reads back. */
export const REPORT_REVIEW_SERIES_LENGTH = 12;

/** The repositories the adapters read through. Nothing else is reachable. */
export interface ReportAdapterScope {
  readonly finance: FinanceRepository;
  readonly obligations: ObligationRepository;
  readonly tasks: TaskRepository;
  readonly goalMeasurements: GoalMeasurementRepository;
  readonly reviews: ReviewRepository;
  readonly reviewInsights: ReviewInsightRepository;
  readonly entities: EntityRepository;
}

/* -------------------------------------------------------------------------- */
/* Finance                                                                     */
/* -------------------------------------------------------------------------- */

const FINANCE_GROUPS: Readonly<Record<string, FinanceRangeGroup>> = {
  category: "category",
  account: "account",
  month: "month",
};

async function financeAdapter(
  scope: ReportAdapterScope,
  request: ReportReadRequest,
): Promise<ReportRead> {
  const { config, window, buckets } = request;
  const groupBy: FinanceRangeGroup =
    config.breakdown.by === "group"
      ? (FINANCE_GROUPS[config.breakdown.group] ?? "none")
      : config.breakdown.by === "time"
        ? "month"
        : "none";

  const rows = await scope.finance.summariseRange({
    fromIso: window.periodStart,
    toIso: window.periodEnd,
    groupBy,
    categoryId: config.filters.categoryId,
    accountId: config.filters.accountId,
    uncategorised: config.filters.uncategorised,
  });

  const direction = config.measure === "money_in" ? "in" : "out";
  const counting = config.measure === "transaction_count";

  // (group, currency) → the figure. The direction rule is the kernel's own, so
  // "spend" here and "spend" on the Finance home cannot come to differ.
  const totals = new Map<
    string,
    {
      key: string | null;
      label: string | null;
      currency: string;
      value: number;
      count: number;
    }
  >();
  for (const row of rows) {
    const amount = counting ? 0 : rangeDirectionAmount(row, direction);
    if (!counting && amount === null) continue;
    const composite = `${row.groupKey ?? ""}::${row.currencyCode}`;
    const existing = totals.get(composite);
    if (existing) {
      existing.value += amount ?? 0;
      existing.count += row.transactionCount;
    } else {
      totals.set(composite, {
        key: row.groupKey,
        label: row.groupLabel,
        currency: row.currencyCode,
        value: amount ?? 0,
        count: row.transactionCount,
      });
    }
  }

  const bucketKeyForMonth = monthBucketKeys(buckets);
  const cells: ReportCell[] = [];
  for (const entry of totals.values()) {
    const value = counting ? entry.count : entry.value;
    // A group whose direction total is zero contributes nothing to a spending
    // report: it is not "zero spent on Salary", it is not a spending row.
    if (!counting && value === 0) continue;

    if (config.breakdown.by === "time") {
      const bucketKey = entry.key
        ? bucketKeyForMonth.get(entry.key)
        : undefined;
      // A month outside the buckets (the window's partial oldest one) is
      // dropped rather than folded into a neighbour it did not happen in.
      if (bucketKey === undefined) continue;
      cells.push({
        key: bucketKey,
        label: monthLabel(entry.key as string),
        currencyCode: counting ? null : entry.currency,
        value,
        detail: entry.count,
      });
      continue;
    }

    cells.push({
      key: entry.key ?? "__uncategorised",
      label: labelFor(config.breakdown, entry.key, entry.label),
      currencyCode: counting ? null : entry.currency,
      value,
      detail: entry.count,
      referenceId: entry.key,
      sortKey:
        config.breakdown.by === "group" && config.breakdown.group === "month"
          ? (entry.key ?? "")
          : undefined,
    });
  }

  // A time breakdown lands several currencies in one bucket key; the executor
  // splits by currency, so the cells must be merged per (bucket, currency).
  return { cells: mergeCells(cells) };
}

/** The label a Finance group row prints. */
function labelFor(
  breakdown: ReportReadRequest["config"]["breakdown"],
  key: string | null,
  label: string | null,
): string {
  if (breakdown.by === "group" && breakdown.group === "month" && key) {
    return monthLabel(key);
  }
  if (label) return label;
  // An uncategorised row is named honestly rather than folded into anything.
  return key === null ? "Uncategorised" : key;
}

/** `YYYY-MM` → the bucket key that month falls in. */
function monthBucketKeys(
  buckets: ReportReadRequest["buckets"],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const bucket of buckets?.buckets ?? []) {
    map.set(monthOf(bucket.periodEnd), bucket.key);
  }
  return map;
}

/** Combine cells that share a key and a currency. */
function mergeCells(cells: readonly ReportCell[]): readonly ReportCell[] {
  const merged = new Map<string, ReportCell>();
  for (const cell of cells) {
    const composite = `${cell.key}::${cell.currencyCode ?? ""}`;
    const existing = merged.get(composite);
    merged.set(
      composite,
      existing
        ? {
            ...existing,
            value: (existing.value ?? 0) + (cell.value ?? 0),
            detail: (existing.detail ?? 0) + (cell.detail ?? 0),
          }
        : cell,
    );
  }
  return [...merged.values()];
}

/* -------------------------------------------------------------------------- */
/* Tasks                                                                       */
/* -------------------------------------------------------------------------- */

async function tasksAdapter(
  scope: ReportAdapterScope,
  request: ReportReadRequest,
): Promise<ReportRead> {
  const { config, window, buckets } = request;

  if (config.breakdown.by === "time" && buckets) {
    const counts = await scope.tasks.countCompletedInBuckets({
      buckets: buckets.buckets.map((bucket) => ({
        key: bucket.key,
        startsAt: new Date(bucket.startInstantIso),
        endsAt: new Date(bucket.endInstantIso),
      })),
    });
    const byKey = new Map(
      buckets.buckets.map((bucket) => [bucket.key, bucket]),
    );
    return {
      cells: counts.map((count) => ({
        key: count.key,
        label: byKey.get(count.key)?.periodEnd ?? count.key,
        currencyCode: null,
        value: count.completed,
      })),
    };
  }

  if (config.breakdown.by === "none") {
    const [count] = await scope.tasks.countCompletedTasksInWindows([
      {
        key: "total",
        startsAt: new Date(window.startInstantIso),
        endsAt: new Date(window.endInstantIso),
      },
    ]);
    return {
      cells: [
        {
          key: "total",
          label: "Tasks completed",
          currencyCode: null,
          value: count?.completed ?? 0,
        },
      ],
    };
  }

  const group =
    config.breakdown.by === "group"
      ? (config.breakdown.group as "area" | "project" | "goal")
      : "area";
  const result = await scope.tasks.countCompletedByGroup({
    window: {
      key: "window",
      startsAt: new Date(window.startInstantIso),
      endsAt: new Date(window.endInstantIso),
    },
    group,
    limit: MAX_REPORT_GROUPS,
  });

  const listed = result.rows.reduce((sum, row) => sum + row.completed, 0);
  const beyond = result.groups - result.rows.length;
  return {
    cells: result.rows.map((row) => ({
      key: row.groupId ?? "__none",
      // A completion that rolls up to nothing is real work with no bar to sit
      // in — a different statement from "you did less than you think".
      label: row.groupTitle ?? "Not in an Area",
      currencyCode: null,
      value: row.completed,
      referenceId: row.groupId,
    })),
    // Taken over EVERY row in the window, not over the returned page.
    remainders:
      beyond > 0
        ? [
            {
              currencyCode: null,
              groups: beyond,
              value: result.total - listed,
            },
          ]
        : undefined,
    recordCounts: [{ currencyCode: null, count: result.total }],
  };
}

/* -------------------------------------------------------------------------- */
/* Goals                                                                       */
/* -------------------------------------------------------------------------- */

async function goalsAdapter(
  scope: ReportAdapterScope,
  request: ReportReadRequest,
): Promise<ReportRead> {
  const { config, buckets } = request;
  const goalId = config.filters.goalId;
  /* v8 ignore next 3 -- the parser refuses a measurement report without one. */
  if (goalId === undefined || !buckets) {
    return { cells: [] };
  }

  const readings = await scope.goalMeasurements.listMeasurements(
    goalId,
    MAX_REPORT_READINGS,
  );

  /*
   * The LAST reading inside each bucket — the rule `GoalMeasurementSummary`
   * already uses for "current value", stated on the surface rather than
   * assumed. A bucket with no reading produces NO CELL, and the executor
   * leaves it absent: a month with no weigh-in is neither 70 kg nor 0 kg.
   */
  const cells: ReportCell[] = [];
  for (const bucket of buckets.buckets) {
    let latest: { measuredOn: string; value: number } | null = null;
    for (const reading of readings) {
      const day = reading.measuredOn;
      if (day < bucket.periodStart || day > bucket.periodEnd) continue;
      if (latest === null || day >= latest.measuredOn) {
        latest = { measuredOn: day, value: reading.value };
      }
    }
    if (latest === null) continue;
    cells.push({
      key: bucket.key,
      label: bucket.periodEnd,
      currencyCode: null,
      value: latest.value,
    });
  }

  return {
    cells,
    bounded: readings.length >= MAX_REPORT_READINGS,
    bound: readings.length >= MAX_REPORT_READINGS ? MAX_REPORT_READINGS : null,
    boundReason: readings.length >= MAX_REPORT_READINGS ? "row_limit" : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Projects                                                                    */
/* -------------------------------------------------------------------------- */

async function projectsAdapter(
  scope: ReportAdapterScope,
  request: ReportReadRequest,
): Promise<ReportRead> {
  const { config } = request;
  const reviewType = (config.filters.reviewType ?? "weekly") as ReviewType;

  // The anchor: the most recent COMPLETED Review of the requested type. The
  // same-type rule is the snapshot series' own, and it is why the type is part
  // of the question rather than a default a surface picks.
  const page = await scope.reviews.list({
    view: "completed",
    type: reviewType,
    sort: "recent",
    limit: 1,
  });
  const anchor = page.items[0];
  if (!anchor) {
    return {
      cells: [],
      notes: [
        {
          code: "no_records",
          text: `You have no completed ${reviewType} Reviews yet, so there is no history to read. Complete one and this report fills in.`,
          tone: "neutral",
        },
      ],
    };
  }

  const series = await scope.reviewInsights.listSnapshotSeries(
    anchor.id,
    REPORT_REVIEW_SERIES_LENGTH,
  );

  const wantedState = config.filters.healthState ?? null;
  const wantedProject = config.filters.projectId ?? null;

  // Project id → how many Reviews in the series recorded the wanted state, and
  // the live title. A snapshot stores ids, states and counts and never a title
  // (ADR-079 d3), so the name comes from the live entity.
  const tallies = new Map<string, { state: string; count: number }>();
  const byState = new Map<string, number>();
  for (const stored of series) {
    for (const project of stored.snapshot.projects) {
      if (project.health === null) continue;
      if (wantedProject !== null && project.id !== wantedProject) continue;
      if (wantedState !== null && project.health !== wantedState) continue;
      const existing = tallies.get(project.id);
      tallies.set(project.id, {
        state: project.health,
        count: (existing?.count ?? 0) + 1,
      });
      byState.set(project.health, (byState.get(project.health) ?? 0) + 1);
    }
  }

  const notes = [
    {
      code: "standing" as const,
      text: `Read across the ${series.length} most recent completed ${reviewType} ${series.length === 1 ? "Review" : "Reviews"} that captured a snapshot.`,
      tone: "neutral" as const,
    },
  ];

  if (
    config.breakdown.by === "group" &&
    config.breakdown.group === "health_state"
  ) {
    return {
      cells: [...byState.entries()].map(([state, count]) => ({
        key: state,
        label:
          PROJECT_HEALTH_STATE_LABELS[
            state as keyof typeof PROJECT_HEALTH_STATE_LABELS
          ] ?? state,
        currencyCode: null,
        value: count,
      })),
      notes,
    };
  }

  const ids = [...tallies.keys()];
  const titles =
    ids.length > 0
      ? await scope.entities.getByIds(ids)
      : new Map<string, { readonly title: string }>();

  return {
    // A Project deleted since is absent rather than named — the live title
    // through the id is the rule the across-Reviews facts already follow.
    cells: ids
      .filter((id) => titles.has(id))
      .map((id) => ({
        key: id,
        label: titles.get(id)?.title ?? id,
        currencyCode: null,
        value: tallies.get(id)?.count ?? 0,
        referenceId: id,
      })),
    notes,
  };
}

/* -------------------------------------------------------------------------- */
/* Obligations                                                                 */
/* -------------------------------------------------------------------------- */

async function obligationsAdapter(
  scope: ReportAdapterScope,
  request: ReportReadRequest,
): Promise<ReportRead> {
  const { config, window } = request;
  const projecting =
    config.measure === "recurring_count" ||
    config.measure === "recurring_expected_amount";
  return projecting
    ? projectedCommitments(scope, request)
    : storedObligations(scope, request, window);
}

async function storedObligations(
  scope: ReportAdapterScope,
  request: ReportReadRequest,
  window: ReportReadRequest["window"],
): Promise<ReportRead> {
  const { config, buckets } = request;
  const money = config.measure === "expected_amount";
  const group =
    config.breakdown.by === "group"
      ? (config.breakdown.group as "month" | "category" | "subject")
      : "month";

  const rows = await scope.obligations.summariseDue({
    fromIso: window.periodStart,
    toIso: window.periodEnd,
    groupBy: group,
    filters: config.filters.obligationCategory
      ? { categories: [config.filters.obligationCategory] }
      : undefined,
    subjectEntityId: config.filters.subjectId,
    limit: MAX_REPORT_GROUPS,
  });

  const withoutAmount = rows.reduce((sum, row) => sum + row.withoutAmount, 0);
  const notes =
    money && withoutAmount > 0
      ? [
          {
            code: "excluded" as const,
            text: `${withoutAmount} ${withoutAmount === 1 ? "commitment has" : "commitments have"} no recorded amount. They are counted here but contribute nothing to the totals — DalyHub does not estimate what it has not been told.`,
            tone: "warning" as const,
          },
        ]
      : undefined;

  const bucketKeyForMonth = monthBucketKeys(buckets);
  const cells: ReportCell[] = [];
  for (const row of rows) {
    const value = money ? row.expectedAmountMinor : row.dueCount;
    if (money && row.currencyCode === null) continue;
    if (config.breakdown.by === "time") {
      const bucketKey = row.groupKey
        ? bucketKeyForMonth.get(row.groupKey)
        : undefined;
      if (bucketKey === undefined) continue;
      cells.push({
        key: bucketKey,
        label: monthLabel(row.groupKey as string),
        currencyCode: money ? row.currencyCode : null,
        value,
        detail: row.dueCount,
      });
      continue;
    }
    cells.push({
      key: row.groupKey ?? "__none",
      label: obligationGroupLabel(group, row.groupKey, row.groupLabel),
      currencyCode: money ? row.currencyCode : null,
      value,
      detail: row.dueCount,
      referenceId: group === "subject" ? row.groupKey : null,
      sortKey: group === "month" ? (row.groupKey ?? "") : undefined,
    });
  }

  return { cells: mergeCells(cells), notes };
}

async function projectedCommitments(
  scope: ReportAdapterScope,
  request: ReportReadRequest,
): Promise<ReportRead> {
  const { config, window } = request;
  const money = config.measure === "recurring_expected_amount";

  const page = await scope.obligations.listRecurring({
    filters: config.filters.obligationCategory
      ? { categories: [config.filters.obligationCategory] }
      : undefined,
    subjectEntityId: config.filters.subjectId,
  });

  const projection = projectObligations({
    commitments: page.items,
    fromIso: window.periodStart,
    toIso: window.periodEnd,
  });

  const totals = new Map<
    string,
    { key: string; currency: string | null; value: number; count: number }
  >();
  for (const occurrence of projection.occurrences) {
    const key =
      config.breakdown.by === "group" && config.breakdown.group === "category"
        ? occurrence.category
        : occurrence.month;
    const currency = money ? occurrence.currencyCode : null;
    if (
      money &&
      (currency === null || occurrence.expectedAmountMinor === null)
    ) {
      continue;
    }
    const composite = `${key}::${currency ?? ""}`;
    const existing = totals.get(composite);
    const value = money ? (occurrence.expectedAmountMinor ?? 0) : 1;
    if (existing) {
      existing.value += value;
      existing.count += 1;
    } else {
      totals.set(composite, { key, currency, value, count: 1 });
    }
  }

  const notes: NonNullable<ReportRead["notes"]>[number][] = [];
  if (page.meterBased > 0) {
    notes.push({
      code: "excluded",
      text: `${page.meterBased} ${page.meterBased === 1 ? "commitment repeats" : "commitments repeat"} on a meter rather than a calendar, so ${page.meterBased === 1 ? "it is" : "they are"} not projected here.`,
      tone: "warning",
    });
  }
  if (money && projection.withoutAmount > 0) {
    notes.push({
      code: "excluded",
      text: `${projection.withoutAmount} ${projection.withoutAmount === 1 ? "commitment has" : "commitments have"} no recorded amount and contribute nothing to these totals.`,
      tone: "warning",
    });
  }
  if (page.bounded) {
    notes.push({
      code: "bounded_groups",
      text: "More recurring commitments exist than this projection read. Narrow it with a filter to see the rest.",
      tone: "warning",
    });
  }

  const byMonth =
    config.breakdown.by !== "group" || config.breakdown.group !== "category";
  return {
    cells: [...totals.values()].map((entry) => ({
      key: entry.key,
      label: byMonth
        ? monthLabel(entry.key)
        : (obligationCategoryLabel(entry.key) ?? entry.key),
      currencyCode: entry.currency,
      value: entry.value,
      detail: entry.count,
      sortKey: byMonth ? entry.key : undefined,
    })),
    notes,
    bounded: page.bounded,
  };
}

function obligationGroupLabel(
  group: "month" | "category" | "subject",
  key: string | null,
  label: string | null,
): string {
  if (group === "month" && key) return monthLabel(key);
  if (group === "category" && key) {
    return obligationCategoryLabel(key) ?? key;
  }
  // An obligation about nothing is a legitimate record, and it says so.
  return label ?? "Not about anything";
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */

/** Bind the five adapters to one workspace-scoped set of repositories. */
export function createReportAdapters(
  scope: ReportAdapterScope,
): ReportSourceAdapters {
  return {
    finance: (request) => financeAdapter(scope, request),
    tasks: (request) => tasksAdapter(scope, request),
    goals: (request) => goalsAdapter(scope, request),
    projects: (request) => projectsAdapter(scope, request),
    obligations: (request) => obligationsAdapter(scope, request),
  };
}
