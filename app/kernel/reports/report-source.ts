/**
 * V2.13 RPT-01 — the SOURCE REGISTRY: the one authority on what a report may
 * ask.
 *
 * Five sources, each declaring its measures; each MEASURE declaring its unit,
 * the grains and the groups it supports, how an empty bucket reads, which
 * filters apply, which are required, and its defaults. That is the whole
 * grammar, and it lives here rather than in a loader, an executor or a
 * component — the shape `SHARED_DIMENSION_SUPPORT` established for cross-module
 * views, applied to aggregates (ADR-121 decision 3).
 *
 * ── Why per MEASURE rather than per source ─────────────────────────────────
 * Because the honest support genuinely differs inside one source. Finance can
 * group money by category and by account; it cannot group a Goal measurement by
 * anything, because a Goal report is about one Goal's readings. Declaring
 * support on the source would force the union of every measure's, and a control
 * offering a combination the read cannot answer is how an aggregate starts
 * lying.
 *
 * ── Defaults live here, not in the UI ──────────────────────────────────────
 * Every measure declares the window, breakdown, sort and visual it opens on.
 * A builder reads them; it does not carry a table of its own.
 *
 * Pure: no storage, no clock, no JSX.
 */

import type { Grain } from "~/kernel/history";

import {
  type ReportBreakdown,
  type ReportEmptyBucket,
  type ReportFilterKey,
  type ReportGroup,
  type ReportMeasureKey,
  type ReportShape,
  type ReportSort,
  type ReportSourceKey,
  type ReportUnit,
  type ReportVisual,
  type ReportWindow,
  type ReportWindowKind,
  breakdownShape,
} from "./report-vocabulary";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How a measure's buckets combine.
 *
 *   `sum`     add the records in the bucket (completions, money, counts).
 *   `latest`  take the LAST recorded reading in the bucket. The rule
 *             `GoalMeasurementSummary` already uses for "current value", stated
 *             on the surface rather than assumed. A bucket with no reading is
 *             ABSENT, never zero and never interpolated.
 */
export type ReportAggregation = "sum" | "latest";

export interface ReportMeasureDefinition {
  readonly key: ReportMeasureKey;
  readonly source: ReportSourceKey;
  /** The owner's words for the figure ("Money out"). */
  readonly label: string;
  /** The question this measure answers, in one line, for the builder. */
  readonly question: string;
  readonly unit: ReportUnit;
  readonly aggregation: ReportAggregation;
  readonly emptyBucket: ReportEmptyBucket;
  /** Grains this measure can be read at, in `HISTORY_GRAINS` order. */
  readonly grains: readonly Grain[];
  /** Group axes this measure supports. */
  readonly groups: readonly ReportGroup[];
  /** True when `{ by: "none" }` — a single figure — is meaningful. */
  readonly allowsScalar: boolean;
  readonly windowKinds: readonly ReportWindowKind[];
  /** Filters this measure understands. Anything else is refused. */
  readonly filters: readonly ReportFilterKey[];
  /** Filters without which the question is not answerable. */
  readonly requiredFilters: readonly ReportFilterKey[];
  readonly defaultWindow: ReportWindow;
  readonly defaultBreakdown: ReportBreakdown;
  readonly defaultSort: ReportSort;
  readonly defaultVisual: ReportVisual;
  /**
   * A sentence the RESULT always carries, stating an approximation this measure
   * makes. Null when it makes none. It is not a footnote a surface may choose
   * to draw: the executor puts it in `ReportResult.notes`, so the claim and its
   * qualification travel together (ADR-121 decision 5).
   */
  readonly standingNote: string | null;
}

export interface ReportSourceDefinition {
  readonly key: ReportSourceKey;
  readonly label: string;
  readonly description: string;
  /**
   * The module that owns this source, so a report can be checked against the
   * owner's module-visibility preference BEFORE a row is read — the same check
   * `availableViewScopes` performs for cross-module views.
   */
  readonly moduleId: string;
  readonly measures: readonly ReportMeasureDefinition[];
}

/* -------------------------------------------------------------------------- */
/* The registry                                                                */
/* -------------------------------------------------------------------------- */

const TWELVE_MONTHS: ReportWindow = { kind: "preset", preset: "12-months" };
const TWELVE_WEEKS: ReportWindow = { kind: "preset", preset: "12-weeks" };

export const REPORT_SOURCE_DEFINITIONS: readonly ReportSourceDefinition[] = [
  {
    key: "tasks",
    label: "Tasks",
    description: "What you finished, and where it landed.",
    moduleId: "tasks",
    measures: [
      {
        key: "completed_count",
        source: "tasks",
        label: "Tasks completed",
        question: "How many Tasks did I complete?",
        unit: "count",
        aggregation: "sum",
        emptyBucket: "zero",
        grains: ["day", "week", "month"],
        groups: ["area", "project", "goal"],
        allowsScalar: true,
        windowKinds: ["preset", "custom"],
        filters: ["areaId", "projectId", "goalId"],
        requiredFilters: [],
        defaultWindow: TWELVE_WEEKS,
        defaultBreakdown: { by: "group", group: "area" },
        defaultSort: "value_desc",
        defaultVisual: "bars",
        /*
         * ADR-121 decision 5 / DEBT-251. The spine keeps no link history, so a
         * completion is attributed through the CURRENT links. Saying so is what
         * makes the approximation honest; hiding it is what would not.
         */
        standingNote:
          "Attributed to where each Task sits today. DalyHub does not record which Area, Project or Goal a Task belonged to when it was completed, so moving a Task moves its history.",
      },
    ],
  },
  {
    key: "goals",
    label: "Goals",
    description: "The readings you have recorded against a Goal.",
    moduleId: "goals",
    measures: [
      {
        key: "measurement_value",
        source: "goals",
        label: "Measurement",
        question: "How has this Goal's measurement moved?",
        unit: "value",
        aggregation: "latest",
        // A LEVEL. A month with no reading is a month with no reading.
        emptyBucket: "absent",
        grains: ["week", "month"],
        // No group axis: a Goal's readings are in the Goal's own unit, and
        // kilograms and books share no axis. One Goal per report, by design.
        groups: [],
        allowsScalar: false,
        windowKinds: ["preset", "custom"],
        filters: ["goalId"],
        requiredFilters: ["goalId"],
        defaultWindow: TWELVE_MONTHS,
        defaultBreakdown: { by: "time", grain: "month" },
        defaultSort: "chronological",
        defaultVisual: "trend",
        standingNote:
          "Each period shows the last reading recorded in it. A period with no reading is left empty rather than filled in.",
      },
    ],
  },
  {
    key: "projects",
    label: "Projects",
    description: "What your Reviews recorded about your Projects.",
    moduleId: "projects",
    measures: [
      {
        key: "health_state_reviews",
        source: "projects",
        label: "Reviews recording this state",
        question: "Which Projects repeatedly appeared in one state?",
        unit: "count",
        aggregation: "sum",
        emptyBucket: "zero",
        // The axis is the Review series itself, which is not a calendar grain.
        grains: [],
        groups: ["project", "health_state"],
        allowsScalar: false,
        windowKinds: ["preset"],
        filters: ["healthState", "reviewType", "projectId"],
        // The same-type rule: a weekly Review's series holds only weekly
        // Reviews, so the type is part of the question rather than a default a
        // surface picks.
        requiredFilters: ["reviewType"],
        defaultWindow: TWELVE_MONTHS,
        defaultBreakdown: { by: "group", group: "project" },
        defaultSort: "value_desc",
        defaultVisual: "table",
        standingNote:
          "Read from the snapshot each completed Review captured. Reviews of other types are never mixed in, and a Review with no snapshot shortens the series rather than leaving a hole.",
      },
    ],
  },
  {
    key: "obligations",
    label: "Life Admin",
    description: "What falls due, and what it is expected to cost.",
    moduleId: "obligations",
    measures: [
      {
        key: "due_count",
        source: "obligations",
        label: "Obligations due",
        question: "What falls due, and when?",
        unit: "count",
        aggregation: "sum",
        emptyBucket: "zero",
        grains: ["week", "month"],
        groups: ["month", "category", "subject"],
        allowsScalar: true,
        windowKinds: ["ahead", "custom"],
        filters: ["obligationCategory", "subjectId"],
        requiredFilters: [],
        defaultWindow: { kind: "ahead", days: 90 },
        defaultBreakdown: { by: "group", group: "month" },
        defaultSort: "label_asc",
        defaultVisual: "bars",
        standingNote:
          "Open obligations only. Completed, dismissed and on-hold commitments are not counted.",
      },
      {
        key: "expected_amount",
        source: "obligations",
        label: "Expected cost",
        question: "What are my commitments expected to cost?",
        unit: "money",
        aggregation: "sum",
        emptyBucket: "zero",
        grains: ["month"],
        groups: ["month", "category"],
        allowsScalar: true,
        windowKinds: ["ahead", "custom"],
        filters: ["obligationCategory", "subjectId"],
        requiredFilters: [],
        defaultWindow: { kind: "ahead", days: 90 },
        defaultBreakdown: { by: "group", group: "month" },
        defaultSort: "label_asc",
        defaultVisual: "bars",
        standingNote:
          "Only amounts DalyHub has been told. An obligation with no recorded amount is counted separately and never estimated.",
      },
      {
        key: "recurring_count",
        source: "obligations",
        label: "Known commitments",
        question: "What known commitments are coming up?",
        unit: "count",
        aggregation: "sum",
        emptyBucket: "zero",
        grains: ["month"],
        groups: ["month", "category"],
        allowsScalar: true,
        windowKinds: ["ahead"],
        filters: ["obligationCategory", "subjectId"],
        requiredFilters: [],
        defaultWindow: { kind: "ahead", days: 365 },
        defaultBreakdown: { by: "group", group: "month" },
        defaultSort: "label_asc",
        defaultVisual: "bars",
        standingNote:
          "A projection of KNOWN commitments from their own recurrence rules — not a forecast of future spending. Commitments that repeat on a meter rather than a calendar cannot be projected and are excluded.",
      },
      {
        key: "recurring_expected_amount",
        source: "obligations",
        label: "Expected cost of known commitments",
        question: "What are my recurring commitments expected to cost?",
        unit: "money",
        aggregation: "sum",
        emptyBucket: "zero",
        grains: ["month"],
        groups: ["month", "category"],
        allowsScalar: true,
        windowKinds: ["ahead"],
        filters: ["obligationCategory", "subjectId"],
        requiredFilters: [],
        defaultWindow: { kind: "ahead", days: 365 },
        defaultBreakdown: { by: "group", group: "month" },
        defaultSort: "label_asc",
        defaultVisual: "bars",
        standingNote:
          "A projection of KNOWN commitments from their own recurrence rules — not a forecast of future spending. Only amounts DalyHub has been told; meter-based commitments are excluded.",
      },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    description: "Where your money went.",
    moduleId: "finance",
    measures: [
      {
        key: "money_out",
        source: "finance",
        label: "Money out",
        question: "Where did my money go?",
        unit: "money",
        aggregation: "sum",
        emptyBucket: "zero",
        grains: ["month"],
        groups: ["category", "account", "month"],
        allowsScalar: true,
        windowKinds: ["preset", "custom"],
        filters: ["categoryId", "accountId", "uncategorised"],
        requiredFilters: [],
        defaultWindow: TWELVE_MONTHS,
        defaultBreakdown: { by: "group", group: "category" },
        defaultSort: "value_desc",
        defaultVisual: "bars",
        standingNote:
          "Transfers between your own accounts are excluded. A refund reduces the category it was refunded to, exactly as it does on the Finance home.",
      },
      {
        key: "money_in",
        source: "finance",
        label: "Money in",
        question: "What did I earn, and when?",
        unit: "money",
        aggregation: "sum",
        emptyBucket: "zero",
        grains: ["month"],
        groups: ["category", "account", "month"],
        allowsScalar: true,
        windowKinds: ["preset", "custom"],
        filters: ["categoryId", "accountId", "uncategorised"],
        requiredFilters: [],
        defaultWindow: TWELVE_MONTHS,
        defaultBreakdown: { by: "time", grain: "month" },
        defaultSort: "chronological",
        defaultVisual: "trend",
        standingNote: "Transfers between your own accounts are excluded.",
      },
      {
        key: "transaction_count",
        source: "finance",
        label: "Transactions",
        question: "How many transactions, and where?",
        unit: "count",
        aggregation: "sum",
        emptyBucket: "zero",
        grains: ["month"],
        groups: ["category", "account", "month"],
        allowsScalar: true,
        windowKinds: ["preset", "custom"],
        filters: ["categoryId", "accountId", "uncategorised"],
        requiredFilters: [],
        defaultWindow: TWELVE_MONTHS,
        defaultBreakdown: { by: "group", group: "category" },
        defaultSort: "value_desc",
        defaultVisual: "bars",
        standingNote: "Transfers between your own accounts are excluded.",
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Lookups                                                                     */
/* -------------------------------------------------------------------------- */

const SOURCE_BY_KEY = new Map<ReportSourceKey, ReportSourceDefinition>(
  REPORT_SOURCE_DEFINITIONS.map((source) => [source.key, source]),
);

const MEASURE_BY_KEY = new Map<ReportMeasureKey, ReportMeasureDefinition>(
  REPORT_SOURCE_DEFINITIONS.flatMap((source) =>
    source.measures.map(
      (measure) =>
        [measure.key, measure] as const satisfies readonly [
          ReportMeasureKey,
          ReportMeasureDefinition,
        ],
    ),
  ),
);

/** The definition behind a source key. Total over the closed set. */
export function reportSource(key: ReportSourceKey): ReportSourceDefinition {
  const definition = SOURCE_BY_KEY.get(key);
  /* v8 ignore next 3 -- unreachable over the closed set; a guard, not a branch. */
  if (!definition) {
    throw new Error(`Unknown report source: ${key}`);
  }
  return definition;
}

/** The definition behind a measure key, or null when this build has none. */
export function reportMeasure(key: string): ReportMeasureDefinition | null {
  return MEASURE_BY_KEY.get(key as ReportMeasureKey) ?? null;
}

/** Every measure this build offers, in registry order. */
export const REPORT_MEASURE_DEFINITIONS: readonly ReportMeasureDefinition[] =
  REPORT_SOURCE_DEFINITIONS.flatMap((source) => source.measures);

/**
 * The sources an owner can currently see, given the modules they have hidden.
 *
 * Checked BEFORE any row is read, exactly as `availableViewScopes` is: a saved
 * report naming a module the owner later disabled is reported as unavailable
 * rather than executed, and the saved row is untouched.
 */
export function availableReportSources(
  hiddenModuleIds: readonly string[],
): readonly ReportSourceKey[] {
  const hidden = new Set(hiddenModuleIds);
  return REPORT_SOURCE_DEFINITIONS.filter(
    (source) => !hidden.has(source.moduleId),
  ).map((source) => source.key);
}

/* -------------------------------------------------------------------------- */
/* Support questions                                                           */
/* -------------------------------------------------------------------------- */

/** The breakdown axes this measure supports, in the order a control offers them. */
export function measureBreakdowns(
  measure: ReportMeasureDefinition,
): readonly ReportBreakdown[] {
  const options: ReportBreakdown[] = [];
  if (measure.allowsScalar) options.push({ by: "none" });
  for (const grain of measure.grains) options.push({ by: "time", grain });
  for (const group of measure.groups) options.push({ by: "group", group });
  return options;
}

/** True when the measure supports this exact breakdown. */
export function supportsBreakdown(
  measure: ReportMeasureDefinition,
  breakdown: ReportBreakdown,
): boolean {
  if (breakdown.by === "none") return measure.allowsScalar;
  if (breakdown.by === "time") return measure.grains.includes(breakdown.grain);
  return measure.groups.includes(breakdown.group);
}

/**
 * The sorts that can honestly order this shape.
 *
 * A time series has exactly one: chronological. Anything else redraws a series
 * in an order that is not time, which is a different chart pretending to be a
 * trend.
 */
export function shapeSorts(shape: ReportShape): readonly ReportSort[] {
  return shape === "series"
    ? ["chronological"]
    : shape === "scalar"
      ? ["value_desc"]
      : ["value_desc", "value_asc", "label_asc", "label_desc"];
}

/** True when this sort can order this breakdown's shape. */
export function supportsSort(
  breakdown: ReportBreakdown,
  sort: ReportSort,
): boolean {
  return shapeSorts(breakdownShape(breakdown)).includes(sort);
}

/** True when this visual can honestly draw this breakdown's shape. */
export function supportsVisual(
  breakdown: ReportBreakdown,
  visual: ReportVisual,
): boolean {
  const shape = breakdownShape(breakdown);
  return shape === "scalar"
    ? visual === "number" || visual === "table"
    : shape === "series"
      ? visual === "trend" || visual === "table"
      : visual === "bars" || visual === "table";
}
