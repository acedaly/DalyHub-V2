/**
 * V2.9 INS-03 — the WINDOW and GRAIN vocabulary Insight offers (DEBT-239).
 *
 * Pure, React-free and storage-free, over `~/kernel/history`. It replaces the
 * three fixed ranges `analytics-range.ts` offered — 7×1 day, 4×7 days, 6×14
 * days — which were bucketed to fit `MAX_TREND_PERIODS = 8` because Analytics
 * reused the Review's grouped aggregate. That constraint is gone: the history
 * kernel's reads are one statement whatever the bucket count, so the vocabulary
 * can be the one the owner actually thinks in.
 *
 * ── Why presets, and why they are still not a free date picker ──────────────
 * `analytics-range.ts` argued that a free picker is a control which must be
 * USED before the screen says anything, and that it invites comparisons the
 * reads cannot make honestly. That argument survives V2.9 intact and is not
 * re-litigated here. What changes is the LIST: six named windows the owner
 * recognises, up to two years, each with a natural previous period of exactly
 * the same length.
 *
 * ── The grain is the owner's, within what the grain can hold ───────────────
 * Each window declares a sensible default grain and offers every grain whose
 * bucket count fits `GRAIN_MAXIMUMS`. That is COMPUTED rather than listed, so
 * the offer and the bound can never disagree — and the arithmetic is exactly
 * the kind a hand-written table gets wrong: 24 months is `month` only (730 days
 * exceeds 366; 105 weeks exceeds 52), and **12 months offers days and months
 * but not weeks**, because a year is 52.14 weeks and therefore needs 53 buckets
 * against a 52-week maximum. **A grain the series cannot hold is refused, not
 * silently truncated** — the INS-03 falsification, and the reason
 * `allowedGrains` exists rather than a list somebody has to keep true.
 */

import { addCalendarDays, addCalendarMonths } from "~/kernel/datetime";
import {
  GRAIN_MAXIMUMS,
  isGrain,
  requestedBucketCount,
  type Grain,
} from "~/kernel/history";

/** The named windows Insight offers. Exactly one is always active. */
export type InsightWindowId =
  "this-week" | "4-weeks" | "12-weeks" | "6-months" | "12-months" | "24-months";

/** The grains a surface may offer. `review_period` is the Review's, not Insight's. */
export const INSIGHT_GRAINS = [
  "day",
  "week",
  "month",
] as const satisfies readonly Grain[];

interface InsightWindowDefinition {
  readonly id: InsightWindowId;
  /** The control's wording. */
  readonly label: string;
  /** How the window's start is derived from the owner's today. */
  readonly span:
    | { readonly unit: "day"; readonly count: number }
    | { readonly unit: "month"; readonly count: number };
  /** The grain the preset opens on. */
  readonly defaultGrain: Grain;
}

export const INSIGHT_WINDOWS: readonly InsightWindowDefinition[] = [
  {
    id: "this-week",
    label: "7 days",
    span: { unit: "day", count: 7 },
    defaultGrain: "day",
  },
  {
    id: "4-weeks",
    label: "4 weeks",
    span: { unit: "day", count: 28 },
    defaultGrain: "day",
  },
  {
    id: "12-weeks",
    label: "12 weeks",
    span: { unit: "day", count: 84 },
    // Weekly, because twelve weeks of daily bars is a texture rather than a
    // trend — and "completions per week for twelve weeks" is the question
    // V2.9 exists to make askable.
    defaultGrain: "week",
  },
  {
    id: "6-months",
    label: "6 months",
    span: { unit: "month", count: 6 },
    defaultGrain: "week",
  },
  {
    id: "12-months",
    label: "12 months",
    span: { unit: "month", count: 12 },
    // Monthly: a year cannot be read weekly at all (53 buckets against 52), and
    // 365 daily bars is a texture rather than a trend.
    defaultGrain: "month",
  },
  {
    id: "24-months",
    label: "24 months",
    span: { unit: "month", count: 24 },
    defaultGrain: "month",
  },
];

const WINDOW_BY_ID = new Map(
  INSIGHT_WINDOWS.map((definition) => [definition.id, definition]),
);

/** The default window, and what an unrecognised value falls back to. */
export const DEFAULT_INSIGHT_WINDOW: InsightWindowId = "12-weeks";

/** Narrow an untrusted query-string value to a window id. */
export function parseInsightWindow(value: string | null): InsightWindowId {
  return value !== null && WINDOW_BY_ID.has(value as InsightWindowId)
    ? (value as InsightWindowId)
    : DEFAULT_INSIGHT_WINDOW;
}

/** The definition behind a window id. */
export function insightWindow(id: InsightWindowId): InsightWindowDefinition {
  // Non-null by construction: `InsightWindowId` is exactly the map's key set.
  return WINDOW_BY_ID.get(id) ?? INSIGHT_WINDOWS[0];
}

/**
 * The owner-calendar days a window covers, ending on (and including)
 * `todayIso`.
 *
 * The span ENDS today rather than at the end of the current calendar week or
 * month, so a figure never counts days that have not happened — the rule
 * `rangeSpan` established and this inherits. A month-based span steps back by
 * calendar months and then one day, so "6 months" ending 4 September starts on
 * 5 March: six whole months, no double-counted boundary day.
 */
export function insightWindowDays(
  id: InsightWindowId,
  todayIso: string,
): { readonly startIso: string; readonly endIso: string } {
  const { span } = insightWindow(id);
  const startIso =
    span.unit === "day"
      ? addCalendarDays(todayIso, -(span.count - 1))
      : addCalendarDays(addCalendarMonths(todayIso, -span.count), 1);
  return { startIso, endIso: todayIso };
}

/**
 * The grains this window can be read at, in `INSIGHT_GRAINS` order.
 *
 * Computed from `requestedBucketCount` against `GRAIN_MAXIMUMS` rather than
 * listed, so the control's offer and the series' bound cannot drift apart. Two
 * years is `month` only; a year offers all three (365 days is inside 366, and
 * 52 weeks is exactly the maximum).
 *
 * Never empty: `month` fits every window this vocabulary defines, and a window
 * with no readable grain would be a control that refuses everything.
 */
export function allowedGrains(
  id: InsightWindowId,
  todayIso: string,
): readonly Grain[] {
  const { startIso, endIso } = insightWindowDays(id, todayIso);
  // `requestedBucketCount` reads only the two calendar days, so the instants
  // are irrelevant here and are given as empty rather than resolved through a
  // timezone this pure module does not have.
  const window = {
    periodStart: startIso,
    periodEnd: endIso,
    startInstantIso: "",
    endInstantIso: "",
  };
  return INSIGHT_GRAINS.filter(
    (grain) => requestedBucketCount(window, grain) <= GRAIN_MAXIMUMS[grain],
  );
}

/**
 * The grain to read this window at, given what the owner asked for.
 *
 * An unrecognised or out-of-range grain falls back to the window's default
 * rather than being truncated — the caller states the window and the grain in
 * words, so a silently substituted grain would make the page describe a series
 * it is not showing.
 */
export function resolveInsightGrain(
  id: InsightWindowId,
  requested: string | null,
  todayIso: string,
): Grain {
  const allowed = allowedGrains(id, todayIso);
  if (requested !== null && isGrain(requested)) {
    const grain = requested as Grain;
    if (allowed.includes(grain)) return grain;
  }
  const preferred = insightWindow(id).defaultGrain;
  return allowed.includes(preferred) ? preferred : allowed[allowed.length - 1];
}

/** How one bucket of a grain is named in a sentence. */
export const GRAIN_NOUNS: Readonly<Record<Grain, string>> = {
  day: "day",
  week: "week",
  month: "month",
  review_period: "Review",
};
