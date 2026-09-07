/**
 * V2.13 RPT-03 — resolving a report's WINDOW, and refusing a grain it cannot
 * hold.
 *
 * There is no Report-specific date system here. A window resolves to the two
 * owner wall-calendar days V2.9's `ActivityWindow` is built from, through
 * `insightWindowDays` for a preset and through `addCalendarDays` for the two
 * shapes V2.9 does not have; the instants are added by the caller, which is the
 * only layer that knows the owner's timezone (AUDIT-14). The bucket arithmetic
 * is `requestedBucketCount`'s, against `GRAIN_MAXIMUMS`.
 *
 * ── Refused, never truncated ────────────────────────────────────────────────
 * A window that would need more buckets than its grain allows is REFUSED with a
 * named reason. Quietly shortening it is the INS-03 falsification, and it is
 * worse for a Report than for Insight: a report is SAVED, so a silent
 * substitution would answer a different question every time it was opened, for
 * as long as it existed.
 *
 * Pure: the owner's calendar day arrives as an argument.
 */

import {
  allowedGrains,
  insightWindowDays,
  INSIGHT_WINDOWS,
} from "~/kernel/analytics";
import { addCalendarDays, calendarDaysBetween } from "~/kernel/datetime";
import {
  GRAIN_MAXIMUMS,
  requestedBucketCount,
  type Grain,
} from "~/kernel/history";

import type { ReportConfig, ReportWindow } from "./report-vocabulary";

/** An inclusive pair of owner wall-calendar days. */
export interface ReportWindowDays {
  readonly startIso: string;
  readonly endIso: string;
}

const PRESET_LABELS = new Map(
  INSIGHT_WINDOWS.map((definition) => [definition.id, definition.label]),
);

/**
 * The owner-calendar days a window covers, given the owner's today.
 *
 * A `preset` ends today and reaches back — `insightWindowDays`' rule, unchanged,
 * so a figure never counts days that have not happened. An `ahead` window STARTS
 * today and reaches forward, inclusive of today, because "due in the next 90
 * days" includes something due this afternoon. A `custom` window is itself.
 */
export function resolveReportWindowDays(
  window: ReportWindow,
  todayIso: string,
): ReportWindowDays {
  if (window.kind === "preset") {
    return insightWindowDays(window.preset, todayIso);
  }
  if (window.kind === "ahead") {
    return {
      startIso: todayIso,
      endIso: addCalendarDays(todayIso, window.days - 1),
    };
  }
  return { startIso: window.startIso, endIso: window.endIso };
}

/** How the window is named in a sentence and on a control. */
export function reportWindowLabel(window: ReportWindow): string {
  if (window.kind === "preset") {
    return PRESET_LABELS.get(window.preset) ?? window.preset;
  }
  if (window.kind === "ahead") {
    return window.days === 1 ? "Next 1 day" : `Next ${window.days} days`;
  }
  return `${window.startIso} to ${window.endIso}`;
}

/** How many owner-calendar days a window spans. */
export function reportWindowLength(
  window: ReportWindow,
  todayIso: string,
): number {
  const { startIso, endIso } = resolveReportWindowDays(window, todayIso);
  return calendarDaysBetween(startIso, endIso) + 1;
}

/**
 * The grains this window can actually hold, in `HISTORY_GRAINS` order.
 *
 * For a preset this is `allowedGrains`' answer verbatim — one authority, so the
 * control's offer and the series' bound cannot drift apart. For the two shapes
 * V2.9 does not have, it is the same arithmetic applied here.
 */
export function reportWindowGrains(
  window: ReportWindow,
  todayIso: string,
  candidates: readonly Grain[],
): readonly Grain[] {
  if (window.kind === "preset") {
    const allowed = new Set(allowedGrains(window.preset, todayIso));
    return candidates.filter((grain) => allowed.has(grain));
  }
  const { startIso, endIso } = resolveReportWindowDays(window, todayIso);
  const span = {
    periodStart: startIso,
    periodEnd: endIso,
    startInstantIso: "",
    endInstantIso: "",
  };
  return candidates.filter(
    (grain) =>
      grain !== "review_period" &&
      requestedBucketCount(span, grain) <= GRAIN_MAXIMUMS[grain],
  );
}

/** Why a definition cannot be executed as it stands. */
export const REPORT_REFUSALS = [
  "grain_exceeds_maximum",
  "source_unavailable",
] as const;

export type ReportRefusalCode = (typeof REPORT_REFUSALS)[number];

export interface ReportRefusal {
  readonly code: ReportRefusalCode;
  /** The sentence the surface prints. Never a stack trace, never a code alone. */
  readonly message: string;
}

/**
 * Check a definition against the day it is being opened on.
 *
 * Everything that can be decided without a calendar is already decided by
 * `parseReportDefinition`; this is the remainder — whether the grain fits the
 * window TODAY, and whether the source's module is available to this owner.
 * Returns `null` when the definition can be executed.
 */
export function checkReportConfig(
  config: ReportConfig,
  input: {
    readonly todayIso: string;
    /** The sources the owner can currently see. */
    readonly availableSources: readonly string[];
  },
): ReportRefusal | null {
  if (!input.availableSources.includes(config.source)) {
    return {
      code: "source_unavailable",
      message:
        "This report asks about a module you have turned off. Turn it back on in Settings to open the report.",
    };
  }
  if (config.breakdown.by !== "time") return null;

  const grain = config.breakdown.grain;
  const allowed = reportWindowGrains(config.window, input.todayIso, [grain]);
  if (allowed.length > 0) return null;

  const span = resolveReportWindowDays(config.window, input.todayIso);
  const needed = requestedBucketCount(
    {
      periodStart: span.startIso,
      periodEnd: span.endIso,
      startInstantIso: "",
      endInstantIso: "",
    },
    grain,
  );
  const noun = grain === "day" ? "days" : grain === "week" ? "weeks" : "months";
  return {
    code: "grain_exceeds_maximum",
    message: `That period needs ${needed} ${noun}, and DalyHub reads at most ${GRAIN_MAXIMUMS[grain]}. Choose a shorter period or a coarser one — nothing has been shortened for you.`,
  };
}
