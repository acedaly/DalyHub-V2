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
  rangeDirectionAmount,
  type FinanceRangeGroup,
  type FinanceRepository,
} from "~/kernel/finance";
import {
  obligationCategoryLabel,
  MAX_PROJECTED_OCCURRENCES,
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
        ? "bucket"
        : "none";

  const rows = await scope.finance.summariseRange({
    fromIso: window.periodStart,
    toIso: window.periodEnd,
    groupBy,
    /*
     * A time breakdown groups on the buckets the executor actually drew, never
     * on calendar months translated into them: a report's buckets run backward
     * from the window's END, so the two disagree for any mid-month window, and
     * at a week grain several buckets share a month and the translation is not
     * even a function.
     */
    buckets:
      groupBy === "bucket"
        ? (buckets?.buckets ?? []).map((bucket) => ({
            key: bucket.key,
            startIso: bucket.periodStart,
            endIso: bucket.periodEnd,
          }))
        : undefined,
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

  const bucketEnd = bucketEnds(buckets);
  const cells: ReportCell[] = [];
  for (const entry of totals.values()) {
    const value = counting ? entry.count : entry.value;
    // A group whose direction total is zero contributes nothing to a spending
    // report: it is not "zero spent on Salary", it is not a spending row.
    if (!counting && value === 0) continue;

    if (config.breakdown.by === "time") {
      /*
       * The group key IS the bucket key: the read grouped on the spans the
       * executor drew, so there is nothing to translate and nothing to drop.
       * The LABEL is the bucket's own end rather than a calendar-month name,
       * because a rolling 8 Aug - 7 Sep span is not "September" — printing it
       * as one was the misattribution this axis removed.
       */
      if (entry.key === null) continue;
      cells.push({
        key: entry.key,
        label: bucketEnd.get(entry.key) ?? entry.key,
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

/**
 * Bucket key -> the bucket's own last day.
 *
 * A series row is NAMED by the executor from the bucket's period, so this is
 * only the fallback label — and it is a date rather than a month name on
 * purpose: buckets run backward from the window's end, so a "month" bucket is a
 * rolling span that no calendar-month name describes.
 */
function bucketEnds(
  buckets: ReportReadRequest["buckets"],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const bucket of buckets?.buckets ?? []) {
    map.set(bucket.key, bucket.periodEnd);
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
  const { config, window } = request;
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

  const wholeSeries = await scope.reviewInsights.listSnapshotSeries(
    anchor.id,
    REPORT_REVIEW_SERIES_LENGTH,
  );

  /*
   * The PERIOD narrows the population, because it is part of the question.
   *
   * Without this the control was decorative: a 4-week report and a 24-month one
   * read the same twelve snapshots and printed the same figures under different
   * date ranges — a figure that does not answer the question shown beside it.
   *
   * A Review is placed by ITS OWN period, not by when its snapshot happened to
   * be written: a Review covering 1-7 September belongs to a September report
   * whether it was completed on the 7th or written up on the 9th. The snapshot
   * carries that period, so no second read is needed to know it.
   */
  const series = wholeSeries.filter(
    (stored) =>
      stored.snapshot.periodEnd >= window.periodStart &&
      stored.snapshot.periodEnd <= window.periodEnd,
  );

  /*
   * The READ bound, stated when it can actually hide something. The series is
   * the most recent `REPORT_REVIEW_SERIES_LENGTH` Reviews before the anchor, so
   * a period reaching back past the oldest of them contains Reviews this report
   * did not read. Saying "none in this period" then would be false.
   */
  const oldestRead = wholeSeries.at(0)?.snapshot.periodEnd ?? null;
  const reachesPastTheRead =
    wholeSeries.length >= REPORT_REVIEW_SERIES_LENGTH &&
    oldestRead !== null &&
    window.periodStart < oldestRead;
  const readBoundNote = reachesPastTheRead
    ? ([
        {
          code: "bounded_series" as const,
          text: `This report reads the ${REPORT_REVIEW_SERIES_LENGTH} most recent ${reviewType} Reviews. The period reaches back further than that, so older Reviews inside it are not counted here.`,
          tone: "warning" as const,
        },
      ] as const)
    : ([] as const);

  if (series.length === 0) {
    return {
      cells: [],
      notes: [
        ...readBoundNote,
        {
          code: "no_records",
          text: `No ${reviewType} Review this report read was completed in this period, so there is nothing to read across. Widen the period and this report fills in.`,
          tone: "neutral",
        },
      ],
    };
  }

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
    ...readBoundNote,
    {
      code: "standing" as const,
      text: `Read across the ${series.length} completed ${reviewType} ${series.length === 1 ? "Review" : "Reviews"} in this period that captured a snapshot.`,
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
  const timeAxis = config.breakdown.by === "time";
  const group = timeAxis
    ? ("bucket" as const)
    : ((config.breakdown as { group: string }).group as
        "month" | "category" | "subject");

  const summary = await scope.obligations.summariseDue({
    fromIso: window.periodStart,
    toIso: window.periodEnd,
    groupBy: group,
    // The spans the executor drew, never calendar months translated into them.
    buckets: timeAxis
      ? (buckets?.buckets ?? []).map((bucket) => ({
          key: bucket.key,
          startIso: bucket.periodStart,
          endIso: bucket.periodEnd,
        }))
      : undefined,
    filters: config.filters.obligationCategory
      ? { categories: [config.filters.obligationCategory] }
      : undefined,
    subjectEntityId: config.filters.subjectId,
    limit: MAX_REPORT_GROUPS,
  });
  const rows = summary.rows;

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

  // A bucket's label is its own span: a rolling period is not a calendar month
  // and must never be printed as one.
  const bucketEnd = bucketEnds(buckets);
  const cells: ReportCell[] = [];
  for (const row of rows) {
    const value = money ? row.expectedAmountMinor : row.dueCount;
    if (money && row.currencyCode === null) continue;
    if (timeAxis) {
      // The group key IS the bucket key, so nothing is translated or dropped.
      if (row.groupKey === null) continue;
      cells.push({
        key: row.groupKey,
        label: bucketEnd.get(row.groupKey) ?? row.groupKey,
        currencyCode: money ? row.currencyCode : null,
        value,
        detail: row.dueCount,
      });
      continue;
    }
    cells.push({
      key: row.groupKey ?? "__none",
      label: obligationGroupLabel(
        group as "month" | "category" | "subject",
        row.groupKey,
        row.groupLabel,
      ),
      currencyCode: money ? row.currencyCode : null,
      value,
      detail: row.dueCount,
      referenceId: group === "subject" ? row.groupKey : null,
      sortKey: group === "month" ? (row.groupKey ?? "") : undefined,
    });
  }

  /*
   * What the bounded page LEFT OUT, stated arithmetically.
   *
   * The page is capped at `MAX_REPORT_GROUPS` (group, currency) pairs; the
   * range's own totals come from the same population, so the difference is the
   * remainder rather than a guess. Reporting it is not decoration: a total that
   * is quietly short is the exact failure this release forbids everywhere else.
   */
  const merged = mergeCells(cells);
  const shown = new Map<string, number>();
  for (const cell of merged) {
    const key = cell.currencyCode ?? "";
    shown.set(key, (shown.get(key) ?? 0) + (cell.value ?? 0));
  }
  const omitted = Math.max(0, summary.groups - merged.length);
  const remainders = summary.overall
    .filter((row) => !money || row.currencyCode !== null)
    .map((row) => {
      const key = money ? (row.currencyCode ?? "") : "";
      const whole = money ? row.expectedAmountMinor : row.dueCount;
      return {
        currencyCode: money ? row.currencyCode : null,
        groups: omitted,
        value: whole - (shown.get(key) ?? 0),
      };
    })
    .filter((entry) => entry.value !== 0);

  const bounded = omitted > 0 && remainders.length > 0;

  return {
    cells: merged,
    notes,
    bounded,
    remainders: bounded ? remainders : undefined,
  };
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
  /*
   * The OTHER bound, which is per commitment rather than per list: a frequent
   * recurrence — daily, over a 365-day window — stops at
   * `MAX_PROJECTED_OCCURRENCES`, and the occurrences past it are simply not in
   * the totals. Saying so is not optional. A bound that is computed and then
   * dropped is worse than no bound, because the figure looks complete.
   */
  if (projection.boundedCommitments > 0) {
    notes.push({
      code: "bounded_series",
      text: `${projection.boundedCommitments} ${projection.boundedCommitments === 1 ? "commitment repeats" : "commitments repeat"} often enough to reach this projection's limit of ${MAX_PROJECTED_OCCURRENCES} occurrences each. Later occurrences are not counted here, so ${projection.boundedCommitments === 1 ? "its" : "their"} contribution is a floor rather than a total.`,
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
    bounded: page.bounded || projection.boundedCommitments > 0,
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
