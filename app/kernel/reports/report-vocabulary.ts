/**
 * V2.13 RPT-01 — the REPORT VOCABULARY: every closed key set a definition can
 * name, and the shape a definition has.
 *
 * Pure: no storage, no clock, no JSX, no registry. This file is the alphabet;
 * `report-source.ts` is the grammar (which letters may follow which), and
 * `report-config.ts` is the parser. Splitting them this way is what lets the
 * registry declare per-measure support without the shape types and the registry
 * importing each other.
 *
 * ── A definition names KEYS, never a query ─────────────────────────────────
 * Everything below is a closed set of stable stored strings, or an id validated
 * against the workspace by the read that uses it. A `ReportConfig` can never
 * carry SQL, a column name, an operator, a formula, an expression or a function
 * body; the executor maps an already-validated key to its OWN trusted canonical
 * read, exactly as `CrossViewConfig` maps a validated dimension to a trusted
 * predicate (ADR-082, ADR-121 decision 3). Adding a measure means adding
 * deterministic code, and there is no path by which the owner can author one.
 *
 * ── One breakdown AXIS ─────────────────────────────────────────────────────
 * A report breaks its measure down by TIME (a `Grain`) or by a GROUP, never
 * both (ADR-121 decision 2). That is why {@link ReportBreakdown} is a union
 * rather than two optional fields: a combination the product does not support
 * is not expressible, rather than expressible and refused.
 */

import type { Grain } from "~/kernel/history";
import type { ObligationCategory } from "~/kernel/obligations";
import type { ProjectHealthState } from "~/kernel/project-health";
import type { ReviewType } from "~/kernel/reviews";
import type { InsightWindowId } from "~/kernel/analytics";

/** The current definition format version. Bump only for a SHAPE change. */
export const REPORT_CONFIG_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* Sources                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The stores a Report may ask about.
 *
 * A source belongs only if the owner can ask a useful question over it AND a
 * canonical bounded read answers it. Notes, Meetings, People, Diary, Habits and
 * Assets are deliberately absent: their collections are real and none of them
 * answers a question in the shape of a measure. **A source exists because a
 * question exists, not because a table does** (ADR-121 decision 3).
 */
export const REPORT_SOURCES = [
  "tasks",
  "goals",
  "projects",
  "obligations",
  "finance",
] as const;

export type ReportSourceKey = (typeof REPORT_SOURCES)[number];

export function isReportSource(value: unknown): value is ReportSourceKey {
  return (
    typeof value === "string" &&
    (REPORT_SOURCES as readonly string[]).includes(value)
  );
}

/* -------------------------------------------------------------------------- */
/* Measures                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every measure in the product, in one flat closed set.
 *
 * Flat and globally unique rather than nested per source, so a stored key is
 * unambiguous on its own and a measure can never be read under another source's
 * rules. The registry says which source owns each one.
 *
 * There is deliberately NO generic measure — no productivity score, no health
 * score, no financial-wellness index, no goal score. A single number mixing
 * unlike facts would look precise and mean nothing (ADR-079 d6, ADR-110 d4).
 */
export const REPORT_MEASURES = [
  /* tasks */
  "completed_count",
  /* goals */
  "measurement_value",
  /* projects */
  "health_state_reviews",
  /* obligations */
  "due_count",
  "expected_amount",
  "recurring_count",
  "recurring_expected_amount",
  /* finance */
  "money_out",
  "money_in",
  "transaction_count",
] as const;

export type ReportMeasureKey = (typeof REPORT_MEASURES)[number];

export function isReportMeasure(value: unknown): value is ReportMeasureKey {
  return (
    typeof value === "string" &&
    (REPORT_MEASURES as readonly string[]).includes(value)
  );
}

/**
 * What a measure's numbers ARE.
 *
 *   `count`  a number of records. Dimensionless.
 *   `money`  integer minor units in ONE currency (ADR-049). A money result
 *            carries one block per currency and never sums across them.
 *   `value`  a Goal measurement in the Goal's own unit — kilograms, books,
 *            kilometres. Never added to anything.
 */
export const REPORT_UNITS = ["count", "money", "value"] as const;
export type ReportUnit = (typeof REPORT_UNITS)[number];

/**
 * How a bucket with no records reads.
 *
 *   `zero`    a FLOW — completions, money, counts. No records in a month
 *             genuinely means zero, and drawing zero is honest.
 *   `absent`  a LEVEL — a Goal measurement. A month with no weigh-in is neither
 *             70 kg nor 0 kg. The row's value is `null`, the surface says "no
 *             reading", and nothing is interpolated, carried forward or drawn
 *             through (ADR-121 decision 4).
 */
export const REPORT_EMPTY_BUCKETS = ["zero", "absent"] as const;
export type ReportEmptyBucket = (typeof REPORT_EMPTY_BUCKETS)[number];

/* -------------------------------------------------------------------------- */
/* Groups                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The categorical axes a measure can be broken down by. One closed set; the
 * registry declares which measures support which, so an unsupported Cartesian
 * combination is not expressible.
 */
export const REPORT_GROUPS = [
  "area",
  "project",
  "goal",
  "category",
  "account",
  "month",
  "subject",
  "health_state",
] as const;

export type ReportGroup = (typeof REPORT_GROUPS)[number];

export function isReportGroup(value: unknown): value is ReportGroup {
  return (
    typeof value === "string" &&
    (REPORT_GROUPS as readonly string[]).includes(value)
  );
}

/** How one group axis is named on the control that selects it. */
export const REPORT_GROUP_LABELS: Readonly<Record<ReportGroup, string>> = {
  area: "Area",
  project: "Project",
  goal: "Goal",
  category: "Category",
  account: "Account",
  month: "Month",
  subject: "What it is about",
  health_state: "Health",
};

/* -------------------------------------------------------------------------- */
/* Windows                                                                     */
/* -------------------------------------------------------------------------- */

export const REPORT_WINDOW_KINDS = ["preset", "ahead", "custom"] as const;
export type ReportWindowKind = (typeof REPORT_WINDOW_KINDS)[number];

/** The longest forward window an `ahead` report may ask for, in owner days. */
export const MAX_AHEAD_DAYS = 730;
/** The longest fixed window a `custom` report may ask for, in owner days. */
export const MAX_CUSTOM_DAYS = 1096;

/**
 * The period a report asks about.
 *
 *   `preset`  one of V2.9's six named backward windows, resolved against the
 *             owner's calendar day. **DYNAMIC**: "last 12 months" moves with
 *             time, which is the whole point of saving a question. A preset is
 *             NEVER serialised into today's exact dates.
 *   `ahead`   a forward window of N owner days from today, for the questions
 *             that are about the future. Dynamic, bounded by `MAX_AHEAD_DAYS`.
 *   `custom`  an explicit inclusive pair of owner wall-calendar days.
 *             **FIXED**: it means the same period forever. Bounded by
 *             `MAX_CUSTOM_DAYS`, and refused rather than clamped if longer.
 *
 * The dynamic/fixed distinction is explicit in the stored shape, so a saved
 * report can never be one when the owner meant the other.
 */
export type ReportWindow =
  | { readonly kind: "preset"; readonly preset: InsightWindowId }
  | { readonly kind: "ahead"; readonly days: number }
  | {
      readonly kind: "custom";
      readonly startIso: string;
      readonly endIso: string;
    };

/** True when this window moves with the owner's calendar day. */
export function isDynamicWindow(window: ReportWindow): boolean {
  return window.kind !== "custom";
}

/* -------------------------------------------------------------------------- */
/* Breakdown                                                                   */
/* -------------------------------------------------------------------------- */

/** The ONE axis a measure is broken down by. See the file header. */
export type ReportBreakdown =
  | { readonly by: "none" }
  | { readonly by: "time"; readonly grain: Grain }
  | { readonly by: "group"; readonly group: ReportGroup };

/** The result shape a breakdown produces. Total over the union. */
export function breakdownShape(breakdown: ReportBreakdown): ReportShape {
  return breakdown.by === "none"
    ? "scalar"
    : breakdown.by === "time"
      ? "series"
      : "grouped";
}

export const REPORT_SHAPES = ["scalar", "series", "grouped"] as const;
export type ReportShape = (typeof REPORT_SHAPES)[number];

/* -------------------------------------------------------------------------- */
/* Filters                                                                     */
/* -------------------------------------------------------------------------- */

/** The maximum length of an id-shaped filter value (mirrors `ID_MAX_LENGTH`). */
export const REPORT_ID_MAX_LENGTH = 128;

/**
 * The closed filter dimensions.
 *
 * Every value is either a stable id validated against the WORKSPACE by the read
 * that uses it, or a member of an existing closed vocabulary. Nothing here is a
 * display name, and nothing here is free text.
 */
export interface ReportFilters {
  /** Spine anchors. */
  readonly areaId?: string;
  readonly projectId?: string;
  readonly goalId?: string;
  /** Finance anchors. */
  readonly categoryId?: string;
  readonly accountId?: string;
  /** Only transactions with no category. Mutually exclusive with `categoryId`. */
  readonly uncategorised?: true;
  /** Life Admin. */
  readonly obligationCategory?: ObligationCategory;
  /** The entity an obligation is about. */
  readonly subjectId?: string;
  /** Projects. */
  readonly healthState?: ProjectHealthState;
  /** Reviews — which Review series a Project report reads. */
  readonly reviewType?: ReviewType;
}

/** The canonical filter key order — the one place the key set is enumerated. */
export const REPORT_FILTER_KEYS = [
  "areaId",
  "projectId",
  "goalId",
  "categoryId",
  "accountId",
  "uncategorised",
  "obligationCategory",
  "subjectId",
  "healthState",
  "reviewType",
] as const satisfies readonly (keyof ReportFilters)[];

export type ReportFilterKey = (typeof REPORT_FILTER_KEYS)[number];

/** How each filter is named on the control that sets it. */
export const REPORT_FILTER_LABELS: Readonly<Record<ReportFilterKey, string>> = {
  areaId: "Area",
  projectId: "Project",
  goalId: "Goal",
  categoryId: "Category",
  accountId: "Account",
  uncategorised: "Uncategorised only",
  obligationCategory: "Kind",
  subjectId: "About",
  healthState: "Health",
  reviewType: "Review type",
};

/* -------------------------------------------------------------------------- */
/* Sort and visual                                                             */
/* -------------------------------------------------------------------------- */

/**
 * How rows are ordered. Five values, and deliberately no multi-column sorting:
 * no built-in needs one, and an arbitrary sort expression is the first step
 * towards a query language.
 *
 * `chronological` is the ONLY legal sort for a time breakdown, because a series
 * drawn out of order is not a series.
 */
export const REPORT_SORTS = [
  "value_desc",
  "value_asc",
  "label_asc",
  "label_desc",
  "chronological",
] as const;

export type ReportSort = (typeof REPORT_SORTS)[number];

export const REPORT_SORT_LABELS: Readonly<Record<ReportSort, string>> = {
  value_desc: "Largest first",
  value_asc: "Smallest first",
  label_asc: "A – Z",
  label_desc: "Z – A",
  chronological: "Oldest first",
};

/**
 * How a result is drawn. Four, and no chart library.
 *
 * The TABLE is not one of four alternatives in the sense that matters: it is
 * rendered for every report on every viewport whatever this says, and this
 * chooses what is drawn BESIDE it. `table` means "the table alone".
 */
export const REPORT_VISUALS = ["number", "table", "bars", "trend"] as const;
export type ReportVisual = (typeof REPORT_VISUALS)[number];

export const REPORT_VISUAL_LABELS: Readonly<Record<ReportVisual, string>> = {
  number: "Number",
  table: "Table",
  bars: "Bars",
  trend: "Trend",
};

/** Which visuals can honestly draw each shape. */
export const SHAPE_VISUALS: Readonly<
  Record<ReportShape, readonly ReportVisual[]>
> = {
  scalar: ["number", "table"],
  series: ["trend", "table"],
  grouped: ["bars", "table"],
};

/* -------------------------------------------------------------------------- */
/* The definition                                                              */
/* -------------------------------------------------------------------------- */

/** A complete, validated report definition. The question, never the answer. */
export interface ReportConfig {
  readonly version: number;
  readonly source: ReportSourceKey;
  readonly measure: ReportMeasureKey;
  readonly window: ReportWindow;
  readonly breakdown: ReportBreakdown;
  readonly filters: ReportFilters;
  readonly sort: ReportSort;
  readonly visual: ReportVisual;
}

/**
 * What a stored row decodes to.
 *
 * The saved-view seam requires `parse` to be TOTAL, and a report definition has
 * two halves with opposite failure rules:
 *
 *   - **Presentation** — sort and visual. An unrecognised value falls back to
 *     the measure's default, exactly as a cross-module view drops a removed
 *     dimension. Substituting one cannot change WHAT was asked.
 *   - **The question** — source, measure, window, grain, group and every
 *     filter. An unrecognised value here CANNOT be defaulted, because a default
 *     would silently answer a different question from the one the owner saved.
 *
 * So a row this build cannot read decodes to `incompatible` rather than to
 * something plausible: the surface says the definition was written by a
 * different version and refuses to execute or mutate it, and the stored bytes
 * are left exactly as they are (ADR-121 decision 1).
 */
export type ReportDefinition =
  | { readonly ok: true; readonly config: ReportConfig }
  | {
      readonly ok: false;
      readonly reason: ReportIncompatibility;
      /** The version the row claims, for the sentence the surface prints. */
      readonly version: number;
      /** The stored value, preserved verbatim so a re-serialise loses nothing. */
      readonly raw: unknown;
    };

/** Why a stored definition could not be read under this build's rules. */
export const REPORT_INCOMPATIBILITIES = [
  "not_an_object",
  "unknown_version",
  "unknown_source",
  "unknown_measure",
  "unreadable_question",
] as const;

export type ReportIncompatibility = (typeof REPORT_INCOMPATIBILITIES)[number];

/** The sentence the surface prints for each incompatibility. */
export const REPORT_INCOMPATIBILITY_MESSAGES: Readonly<
  Record<ReportIncompatibility, string>
> = {
  not_an_object: "This report’s definition could not be read.",
  unknown_version:
    "This report was saved by a newer version of DalyHub and can’t be opened here.",
  unknown_source: "This report asks about something DalyHub no longer offers.",
  unknown_measure: "This report asks for a figure DalyHub no longer offers.",
  unreadable_question:
    "Part of this report’s question could not be read, so it wasn’t guessed at.",
};
