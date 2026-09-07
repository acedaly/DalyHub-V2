/**
 * V2.13 RPT-04 — the ONE codec between a report's URL and its definition.
 *
 * The URL **is** the definition, exactly as it is for a cross-module view
 * (ADR-059's rule, unchanged): the same shape backs the address bar, the loader
 * payload and the persisted row, so a saved report and a copied link can never
 * mean different things.
 *
 * ── What a report URL carries, and what it never will ──────────────────────
 * Source, measure, window, breakdown, sort, visual, and **ids** for filters.
 * Never an amount, a payee, a memo, a category NAME, an account NAME, or any
 * value from a result. A URL is shoulder-surfable, shareable and logged, and
 * the Finance module already holds this line for the same reason ("a Finance
 * URL that carried WOOLWORTHS DUBBO would put the owner's week in a browser
 * history"). Reports hold it too.
 *
 * ── Decoding is TOTAL and never guesses ────────────────────────────────────
 * Every value goes through `parseReportDefinition`, so a hand-edited parameter
 * produces an INCOMPATIBLE definition the surface refuses to execute — not a
 * plausible substitute answering a different question.
 */

import {
  parseReportDefinition,
  REPORT_CONFIG_VERSION,
  serialiseReportDefinition,
  type ReportConfig,
  type ReportDefinition,
} from "~/kernel/reports";

/** Every search parameter this surface owns. Anything else is left untouched. */
export const REPORT_PARAMS = {
  /** The saved row's id, or a built-in's, so the page can say what it IS. */
  report: "report",
  source: "src",
  measure: "m",
  window: "w",
  breakdown: "by",
  sort: "sort",
  visual: "as",
  area: "area",
  project: "project",
  goal: "goal",
  category: "cat",
  account: "acct",
  uncategorised: "uncat",
  obligationCategory: "kind",
  subject: "about",
  healthState: "health",
  reviewType: "rtype",
} as const;

function text(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value === null || value.length === 0 ? undefined : value;
}

/* -------------------------------------------------------------------------- */
/* Window                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The window, as one compact parameter.
 *
 *   `w=12-months`               a preset — DYNAMIC, moves with the calendar
 *   `w=ahead:90`                a forward window — dynamic
 *   `w=2026-01-01..2026-06-30`  a custom range — FIXED forever
 *
 * One parameter rather than three, because the three shapes are alternatives
 * and a URL carrying two of them would have to pick, which is a guess.
 */
function readWindow(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  if (raw.startsWith("ahead:")) {
    return { kind: "ahead", days: raw.slice("ahead:".length) };
  }
  const dots = raw.indexOf("..");
  if (dots > 0) {
    return {
      kind: "custom",
      startIso: raw.slice(0, dots),
      endIso: raw.slice(dots + 2),
    };
  }
  return { kind: "preset", preset: raw };
}

function writeWindow(window: ReportConfig["window"]): string {
  return window.kind === "preset"
    ? window.preset
    : window.kind === "ahead"
      ? `ahead:${window.days}`
      : `${window.startIso}..${window.endIso}`;
}

/* -------------------------------------------------------------------------- */
/* Breakdown                                                                   */
/* -------------------------------------------------------------------------- */

/** `by=g:category`, `by=t:month`, or `by=none`. */
function readBreakdown(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  if (raw === "none") return { by: "none" };
  if (raw.startsWith("t:")) return { by: "time", grain: raw.slice(2) };
  if (raw.startsWith("g:")) return { by: "group", group: raw.slice(2) };
  return { by: raw };
}

function writeBreakdown(breakdown: ReportConfig["breakdown"]): string {
  return breakdown.by === "none"
    ? "none"
    : breakdown.by === "time"
      ? `t:${breakdown.grain}`
      : `g:${breakdown.group}`;
}

/* -------------------------------------------------------------------------- */
/* Decode                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Decode a URL into a definition. Never throws; an unreadable one comes back as
 * INCOMPATIBLE rather than as something plausible.
 */
export function definitionFromParams(
  params: URLSearchParams,
): ReportDefinition {
  return parseReportDefinition({
    version: REPORT_CONFIG_VERSION,
    source: text(params, REPORT_PARAMS.source),
    measure: text(params, REPORT_PARAMS.measure),
    window: readWindow(text(params, REPORT_PARAMS.window)),
    breakdown: readBreakdown(text(params, REPORT_PARAMS.breakdown)),
    filters: {
      areaId: text(params, REPORT_PARAMS.area),
      projectId: text(params, REPORT_PARAMS.project),
      goalId: text(params, REPORT_PARAMS.goal),
      categoryId: text(params, REPORT_PARAMS.category),
      accountId: text(params, REPORT_PARAMS.account),
      uncategorised: text(params, REPORT_PARAMS.uncategorised),
      obligationCategory: text(params, REPORT_PARAMS.obligationCategory),
      subjectId: text(params, REPORT_PARAMS.subject),
      healthState: text(params, REPORT_PARAMS.healthState),
      reviewType: text(params, REPORT_PARAMS.reviewType),
    },
    sort: text(params, REPORT_PARAMS.sort),
    visual: text(params, REPORT_PARAMS.visual),
  });
}

/**
 * Merge one change into the definition the URL currently carries.
 *
 * The builder edits a URL rather than a form model, so the address bar is
 * always exactly what is on screen and a reload is a no-op. The merge happens
 * on the RAW parameters, so a change that makes the definition unreadable
 * reaches the surface as a refusal rather than being silently discarded.
 */
export function paramsFromConfig(config: ReportConfig): URLSearchParams {
  const params = new URLSearchParams();
  params.set(REPORT_PARAMS.source, config.source);
  params.set(REPORT_PARAMS.measure, config.measure);
  params.set(REPORT_PARAMS.window, writeWindow(config.window));
  params.set(REPORT_PARAMS.breakdown, writeBreakdown(config.breakdown));
  params.set(REPORT_PARAMS.sort, config.sort);
  params.set(REPORT_PARAMS.visual, config.visual);

  const filters = config.filters;
  const set = (key: string, value: string | undefined): void => {
    if (value !== undefined && value.length > 0) params.set(key, value);
  };
  set(REPORT_PARAMS.area, filters.areaId);
  set(REPORT_PARAMS.project, filters.projectId);
  set(REPORT_PARAMS.goal, filters.goalId);
  set(REPORT_PARAMS.category, filters.categoryId);
  set(REPORT_PARAMS.account, filters.accountId);
  if (filters.uncategorised) params.set(REPORT_PARAMS.uncategorised, "1");
  set(REPORT_PARAMS.obligationCategory, filters.obligationCategory);
  set(REPORT_PARAMS.subject, filters.subjectId);
  set(REPORT_PARAMS.healthState, filters.healthState);
  set(REPORT_PARAMS.reviewType, filters.reviewType);
  return params;
}

/** The path that opens a definition, with its identity where it has one. */
export function reportHref(
  config: ReportConfig,
  identity?: { readonly savedId?: string; readonly builtInId?: string },
): string {
  if (identity?.savedId) {
    // A saved report is addressed by its OWN url; the definition lives in
    // storage, so the query string would be a second copy free to drift.
    return `/reports/${encodeURIComponent(identity.savedId)}`;
  }
  const params = paramsFromConfig(config);
  if (identity?.builtInId) params.set(REPORT_PARAMS.report, identity.builtInId);
  return `/reports/view?${params.toString()}`;
}

/** True when the URL's definition differs from the stored one. */
export function isModified(
  current: ReportDefinition,
  stored: ReportDefinition | null,
): boolean {
  return (
    stored !== null &&
    serialiseReportDefinition(current) !== serialiseReportDefinition(stored)
  );
}
