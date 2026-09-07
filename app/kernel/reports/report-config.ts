/**
 * V2.13 RPT-00 — the report DEFINITION: parsing, validation and canonical
 * serialisation.
 *
 * ── Two failure rules, on purpose ──────────────────────────────────────────
 * The saved-view seam requires `parse` to be TOTAL, and a cross-module view is
 * parsed LENIENTLY: an unknown key or a removed dimension drops and the rest is
 * kept. That is exactly right for a FILTER — dropping one widens a list the
 * owner can see is wider. It is exactly wrong for a REPORT, because a report
 * returns a NUMBER, and a number computed from a question the owner did not ask
 * looks identical to one computed from the question they did.
 *
 * So a report definition is split:
 *
 *   - **The question** — source, measure, window, breakdown and every filter.
 *     Unreadable means INCOMPATIBLE. Nothing is defaulted, nothing is dropped,
 *     the stored bytes are preserved verbatim, and the surface says the
 *     definition was written by a different version instead of answering a
 *     different question (ADR-121 decision 1).
 *   - **Presentation** — sort and visual. An unrecognised or incompatible value
 *     falls back to the measure's declared default, because how a figure is
 *     drawn cannot change what was asked.
 *
 * ── Canonical on write ─────────────────────────────────────────────────────
 * `serialiseReportDefinition` emits keys in a FIXED order and omits nothing
 * that is set, so two equivalent definitions always serialise identically and
 * `equals` is text equality. What is stored is always the re-serialised,
 * validated definition, so only known keys with known values ever reach the
 * column.
 *
 * Pure: no storage, no clock, no JSX. The checks that need to know what day it
 * is live in `report-window.ts`.
 */

import { INSIGHT_WINDOWS } from "~/kernel/analytics";
import { calendarDaysBetween } from "~/kernel/datetime";
import { isGrain, type Grain } from "~/kernel/history";
import { OBLIGATION_CATEGORIES } from "~/kernel/obligations";
import { PROJECT_HEALTH_STATES } from "~/kernel/project-health";
import { REVIEW_TYPES } from "~/kernel/reviews";
import { SavedViewValidationError } from "~/kernel/views";

import {
  MAX_AHEAD_DAYS,
  MAX_CUSTOM_DAYS,
  REPORT_CONFIG_VERSION,
  REPORT_FILTER_KEYS,
  REPORT_ID_MAX_LENGTH,
  SHAPE_VISUALS,
  breakdownShape,
  isReportGroup,
  isReportMeasure,
  isReportSource,
  type ReportBreakdown,
  type ReportConfig,
  type ReportDefinition,
  type ReportFilterKey,
  type ReportFilters,
  type ReportIncompatibility,
  type ReportSort,
  type ReportVisual,
  type ReportWindow,
} from "./report-vocabulary";
import {
  reportMeasure,
  shapeSorts,
  supportsBreakdown,
  supportsSort,
  supportsVisual,
  type ReportMeasureDefinition,
} from "./report-source";

/* -------------------------------------------------------------------------- */
/* Small total readers                                                         */
/* -------------------------------------------------------------------------- */

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function member<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** An id-shaped value: bounded, non-empty, no control characters. */
function id(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > REPORT_ID_MAX_LENGTH)
    return null;
  // eslint-disable-next-line no-control-regex -- reject C0/C1 control characters.
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return null;
  return trimmed;
}

function wholeNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d{1,6}$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

function calendarDay(value: unknown): string | null {
  if (typeof value !== "string" || !CALENDAR_DAY.test(value)) return null;
  // Reject a day the calendar does not have (2026-02-31), rather than letting
  // it through to arithmetic that would silently roll it forward.
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : null;
}

const INSIGHT_WINDOW_IDS = INSIGHT_WINDOWS.map((definition) => definition.id);

/* -------------------------------------------------------------------------- */
/* The question half — unreadable means incompatible                          */
/* -------------------------------------------------------------------------- */

function readWindow(raw: unknown): ReportWindow | null {
  const source = record(raw);
  if (!source) return null;
  const kind = member(source.kind, ["preset", "ahead", "custom"] as const);
  if (kind === "preset") {
    const preset = member(source.preset, INSIGHT_WINDOW_IDS);
    return preset ? { kind, preset } : null;
  }
  if (kind === "ahead") {
    const days = wholeNumber(source.days);
    // REFUSED rather than clamped: a window shortened here would be described
    // in words as the window that was asked for.
    return days !== null && days <= MAX_AHEAD_DAYS ? { kind, days } : null;
  }
  if (kind === "custom") {
    const startIso = calendarDay(source.startIso);
    const endIso = calendarDay(source.endIso);
    if (startIso === null || endIso === null || startIso > endIso) return null;
    // Bounded, and REFUSED rather than clamped for the same reason `ahead` is:
    // a shortened window would still be described as the one that was asked
    // for, and a saved report would repeat that description forever.
    if (calendarDaysBetween(startIso, endIso) + 1 > MAX_CUSTOM_DAYS)
      return null;
    return { kind, startIso, endIso };
  }
  return null;
}

function readBreakdown(raw: unknown): ReportBreakdown | null {
  const source = record(raw);
  if (!source) return null;
  const by = member(source.by, ["none", "time", "group"] as const);
  if (by === "none") return { by };
  if (by === "time") {
    return isGrain(source.grain) ? { by, grain: source.grain as Grain } : null;
  }
  if (by === "group") {
    return isReportGroup(source.group) ? { by, group: source.group } : null;
  }
  return null;
}

/**
 * Read the filters.
 *
 * An UNRECOGNISED key fails the whole definition rather than being ignored, and
 * that is the opposite of `parseCrossViewConfig`'s rule for a deliberate
 * reason: a filter NARROWS, so a build that silently ignores one computes a
 * BROADER figure than the owner saved, presented under the same name. Widening
 * a list is visible; widening a total is not.
 */
function readFilters(raw: unknown): ReportFilters | null {
  const source = record(raw);
  if (!source) return null;
  const known = new Set<string>(REPORT_FILTER_KEYS);
  for (const key of Object.keys(source)) {
    if (source[key] === undefined || source[key] === null) continue;
    if (!known.has(key)) return null;
  }

  const filters: { -readonly [K in keyof ReportFilters]: ReportFilters[K] } =
    {};
  const idFields = [
    "areaId",
    "projectId",
    "goalId",
    "categoryId",
    "accountId",
    "subjectId",
  ] as const;
  for (const key of idFields) {
    if (source[key] === undefined || source[key] === null) continue;
    const value = id(source[key]);
    if (value === null) return null;
    filters[key] = value;
  }

  if (source.uncategorised !== undefined && source.uncategorised !== null) {
    if (source.uncategorised !== true && source.uncategorised !== "1") {
      return null;
    }
    filters.uncategorised = true;
  }
  if (
    source.obligationCategory !== undefined &&
    source.obligationCategory !== null
  ) {
    const value = member(source.obligationCategory, OBLIGATION_CATEGORIES);
    if (value === null) return null;
    filters.obligationCategory = value;
  }
  if (source.healthState !== undefined && source.healthState !== null) {
    const value = member(source.healthState, PROJECT_HEALTH_STATES);
    if (value === null) return null;
    filters.healthState = value;
  }
  if (source.reviewType !== undefined && source.reviewType !== null) {
    const value = member(source.reviewType, REVIEW_TYPES);
    if (value === null) return null;
    filters.reviewType = value;
  }

  // `categoryId` and `uncategorised` are two answers to one question, and
  // together they select nothing. Refused rather than silently preferring one.
  if (filters.categoryId !== undefined && filters.uncategorised === true) {
    return null;
  }
  return filters;
}

/* -------------------------------------------------------------------------- */
/* Parse (total)                                                               */
/* -------------------------------------------------------------------------- */

function incompatible(
  reason: ReportIncompatibility,
  version: number,
  raw: unknown,
): ReportDefinition {
  return { ok: false, reason, version, raw };
}

/**
 * Decode an untrusted value — a stored JSON blob, a URL-derived object — into a
 * definition. TOTAL: it never throws.
 */
export function parseReportDefinition(raw: unknown): ReportDefinition {
  const source = record(raw);
  if (!source) return incompatible("not_an_object", 0, raw);

  const version =
    typeof source.version === "number" && Number.isSafeInteger(source.version)
      ? source.version
      : 0;
  if (version < 1 || version > REPORT_CONFIG_VERSION) {
    return incompatible("unknown_version", version, raw);
  }

  if (!isReportSource(source.source)) {
    return incompatible("unknown_source", version, raw);
  }
  if (!isReportMeasure(source.measure)) {
    return incompatible("unknown_measure", version, raw);
  }
  const measure = reportMeasure(source.measure);
  if (!measure || measure.source !== source.source) {
    return incompatible("unknown_measure", version, raw);
  }

  const window = readWindow(source.window);
  if (window === null || !measure.windowKinds.includes(window.kind)) {
    return incompatible("unreadable_question", version, raw);
  }

  const breakdown = readBreakdown(source.breakdown);
  if (breakdown === null || !supportsBreakdown(measure, breakdown)) {
    return incompatible("unreadable_question", version, raw);
  }

  const filters = readFilters(source.filters ?? {});
  if (filters === null)
    return incompatible("unreadable_question", version, raw);
  for (const key of REPORT_FILTER_KEYS) {
    if (filters[key] === undefined) continue;
    if (!measure.filters.includes(key)) {
      return incompatible("unreadable_question", version, raw);
    }
  }
  for (const key of measure.requiredFilters) {
    if (filters[key] === undefined) {
      return incompatible("unreadable_question", version, raw);
    }
  }

  // Presentation: lenient, because it cannot change what was asked.
  const sort = readSort(source.sort, breakdown, measure);
  const visual = readVisual(source.visual, breakdown, measure);

  return {
    ok: true,
    config: {
      version: REPORT_CONFIG_VERSION,
      source: source.source,
      measure: measure.key,
      window,
      breakdown,
      filters,
      sort,
      visual,
    },
  };
}

function readSort(
  raw: unknown,
  breakdown: ReportBreakdown,
  measure: ReportMeasureDefinition,
): ReportSort {
  const requested = member(raw, [
    "value_desc",
    "value_asc",
    "label_asc",
    "label_desc",
    "chronological",
  ] as const);
  if (requested !== null && supportsSort(breakdown, requested))
    return requested;
  if (supportsSort(breakdown, measure.defaultSort)) return measure.defaultSort;
  // Never empty: `shapeSorts` returns at least one member for every shape, and
  // the FIRST is the one that shape reads best in — chronological for a series.
  return shapeSorts(breakdownShape(breakdown))[0];
}

function readVisual(
  raw: unknown,
  breakdown: ReportBreakdown,
  measure: ReportMeasureDefinition,
): ReportVisual {
  const requested = member(raw, ["number", "table", "bars", "trend"] as const);
  if (requested !== null && supportsVisual(breakdown, requested)) {
    return requested;
  }
  if (supportsVisual(breakdown, measure.defaultVisual)) {
    return measure.defaultVisual;
  }
  /*
   * The measure's default draws its default BREAKDOWN, and the owner may have
   * chosen another axis. Falling back to the shape's own first visual gives a
   * series its trend rather than demoting it to a table, and `SHAPE_VISUALS` is
   * the one place that order is declared.
   */
  return SHAPE_VISUALS[breakdownShape(breakdown)][0];
}

/* -------------------------------------------------------------------------- */
/* Validate for write (strict)                                                 */
/* -------------------------------------------------------------------------- */

/** Why a write was refused, in the owner's words. */
const REPORT_WRITE_REFUSALS: Readonly<Record<ReportIncompatibility, string>> = {
  not_an_object: "must be a report definition object",
  unknown_version: "this report format is not one DalyHub can save",
  unknown_source: "that is not something DalyHub can report on",
  unknown_measure: "that figure is not one this source can produce",
  unreadable_question:
    "part of the question could not be understood, so it was not saved",
};

/**
 * Validate a definition ON WRITE. Unlike the read path there is no
 * "incompatible" outcome: a definition this build cannot read is a definition
 * it must not store, so this THROWS, and the seam turns the throw into a
 * refusal the owner sees.
 */
export function validateReportDefinitionForWrite(
  value: unknown,
): ReportDefinition {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SavedViewValidationError(
      "config",
      "must be a report definition object",
    );
  }
  const source = value as Record<string, unknown>;
  const parsed = parseReportDefinition(
    // A definition handed in without a version is this build's; a WRONG version
    // is still refused below.
    source.version === undefined
      ? { ...source, version: REPORT_CONFIG_VERSION }
      : value,
  );
  if (!parsed.ok) {
    throw new SavedViewValidationError(
      "config",
      REPORT_WRITE_REFUSALS[parsed.reason],
    );
  }
  return parsed;
}

/* -------------------------------------------------------------------------- */
/* Canonical serialisation                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The canonical JSON text of a definition: keys in a FIXED order, so two
 * equivalent definitions always serialise identically.
 *
 * An INCOMPATIBLE definition round-trips its stored value verbatim. Nothing in
 * the product writes one — `validateForWrite` refuses — but the repository's
 * rename path re-serialises whatever it read, and a rename must never rewrite a
 * definition it could not understand.
 */
export function serialiseReportDefinition(
  definition: ReportDefinition,
): string {
  if (!definition.ok) return JSON.stringify(definition.raw ?? null);
  const config = definition.config;

  const filters: Record<string, unknown> = {};
  for (const key of REPORT_FILTER_KEYS) {
    const value = config.filters[key as ReportFilterKey];
    if (value !== undefined) filters[key] = value;
  }

  return JSON.stringify({
    version: config.version,
    source: config.source,
    measure: config.measure,
    window:
      config.window.kind === "preset"
        ? { kind: "preset", preset: config.window.preset }
        : config.window.kind === "ahead"
          ? { kind: "ahead", days: config.window.days }
          : {
              kind: "custom",
              startIso: config.window.startIso,
              endIso: config.window.endIso,
            },
    breakdown:
      config.breakdown.by === "none"
        ? { by: "none" }
        : config.breakdown.by === "time"
          ? { by: "time", grain: config.breakdown.grain }
          : { by: "group", group: config.breakdown.group },
    filters,
    sort: config.sort,
    visual: config.visual,
  });
}

/** True when two definitions describe the same question and presentation. */
export function reportDefinitionsEqual(
  a: ReportDefinition,
  b: ReportDefinition,
): boolean {
  return serialiseReportDefinition(a) === serialiseReportDefinition(b);
}

/** How many filter dimensions a definition narrows by (drives the badge). */
export function reportFilterCount(config: ReportConfig): number {
  return REPORT_FILTER_KEYS.filter((key) => config.filters[key] !== undefined)
    .length;
}
