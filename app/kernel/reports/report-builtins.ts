/**
 * V2.13 RPT-05 — the SIX built-in reports, as code.
 *
 * ── Why code and not rows ──────────────────────────────────────────────────
 * Everybody gets the canonical examples; there is no migration, no seeded row
 * per workspace, no duplicate, and nothing the owner can accidentally delete.
 * A later version can improve a built-in in place. The same choice
 * `CROSS_VIEW_SYSTEM_VIEWS` and the Tasks built-in views already make, for the
 * same reasons, recorded in migration `0022`: *"derived in code, so they cost
 * no storage, cannot be deleted, and cannot silently mutate."*
 *
 * ── Opening one and changing it does not edit it ───────────────────────────
 * A built-in is immutable. Changing a control on one and pressing save writes
 * an ORDINARY saved report; the built-in is untouched. There is deliberately no
 * "built-in changed globally" semantics, because a shared definition that one
 * edit rewrites for every future opening is a surprise nobody asked for.
 *
 * ── They are examples of the vocabulary, not a chart gallery ───────────────
 * Each one answers a question the owner actually asked for, and between them
 * they exercise every source, both breakdown axes, all three units and all
 * four visuals. None of them exists to demonstrate a shape.
 *
 * One of the six needs a filter only the workspace can supply: a measurement
 * report is about ONE Goal, and no built-in can know which. `requiredFilter`
 * names it, so the surface asks rather than guessing, and a built-in with an
 * unanswered requirement is presented as a question to complete rather than as
 * a broken report. Every other built-in is complete as it stands.
 */

import { REVIEW_TYPES } from "~/kernel/reviews";

import type { ReportConfig, ReportFilterKey } from "./report-vocabulary";
import { REPORT_CONFIG_VERSION } from "./report-vocabulary";

export interface BuiltInReportDefinition {
  /** Stable across versions: a link to a built-in must keep working. */
  readonly id: string;
  readonly title: string;
  /** The question, in the owner's words. Shown on the collection card. */
  readonly question: string;
  /**
   * A filter the owner must choose before this can be executed — a Goal for a
   * measurement series. `null` when the definition is complete as it stands.
   */
  readonly requiredFilter: ReportFilterKey | null;
  readonly config: ReportConfig;
}

const V = REPORT_CONFIG_VERSION;

export const BUILT_IN_REPORTS: readonly BuiltInReportDefinition[] = [
  {
    id: "spend-by-category",
    title: "Spending by category",
    question: "Where did my money go over the last year?",
    requiredFilter: null,
    config: {
      version: V,
      source: "finance",
      measure: "money_out",
      window: { kind: "preset", preset: "12-months" },
      breakdown: { by: "group", group: "category" },
      filters: {},
      sort: "value_desc",
      visual: "bars",
    },
  },
  {
    id: "goal-measurements",
    title: "Goal measurements",
    question: "How has this Goal moved over the last year?",
    // A Goal report is about ONE Goal: kilograms and books share no axis.
    requiredFilter: "goalId",
    config: {
      version: V,
      source: "goals",
      measure: "measurement_value",
      window: { kind: "preset", preset: "12-months" },
      breakdown: { by: "time", grain: "month" },
      filters: {},
      sort: "chronological",
      visual: "trend",
    },
  },
  {
    id: "completed-tasks-by-area",
    title: "Completed Tasks by Area",
    question: "How many Tasks did I complete, and where did they land?",
    requiredFilter: null,
    config: {
      version: V,
      source: "tasks",
      measure: "completed_count",
      window: { kind: "preset", preset: "12-weeks" },
      breakdown: { by: "group", group: "area" },
      filters: {},
      sort: "value_desc",
      visual: "bars",
    },
  },
  {
    id: "obligations-next-90-days",
    title: "Obligations due in the next 90 days",
    question: "What falls due in the next three months?",
    requiredFilter: null,
    config: {
      version: V,
      source: "obligations",
      measure: "due_count",
      window: { kind: "ahead", days: 90 },
      breakdown: { by: "group", group: "month" },
      filters: {},
      sort: "label_asc",
      visual: "bars",
    },
  },
  {
    id: "project-health-across-reviews",
    title: "Project health across Reviews",
    question: "Which Projects repeatedly appeared at risk?",
    // The same-type rule is answered rather than asked: weekly is the Review
    // the product schedules, and the owner can change it on the report.
    requiredFilter: null,
    config: {
      version: V,
      source: "projects",
      measure: "health_state_reviews",
      window: { kind: "preset", preset: "12-months" },
      breakdown: { by: "group", group: "project" },
      filters: { healthState: "at_risk", reviewType: REVIEW_TYPES[0] },
      sort: "value_desc",
      visual: "table",
    },
  },
  {
    id: "recurring-commitments-by-month",
    title: "Recurring commitments by month",
    question: "What known commitments are expected each month?",
    requiredFilter: null,
    config: {
      version: V,
      source: "obligations",
      measure: "recurring_expected_amount",
      window: { kind: "ahead", days: 365 },
      breakdown: { by: "group", group: "month" },
      filters: {},
      sort: "label_asc",
      visual: "bars",
    },
  },
];

const BY_ID = new Map(BUILT_IN_REPORTS.map((report) => [report.id, report]));

/** The built-in with this id, or null. Total over untrusted input. */
export function findBuiltInReport(id: unknown): BuiltInReportDefinition | null {
  return typeof id === "string" ? (BY_ID.get(id) ?? null) : null;
}

/** True when this id names a built-in rather than a saved row. */
export function isBuiltInReportId(id: unknown): boolean {
  return findBuiltInReport(id) !== null;
}
