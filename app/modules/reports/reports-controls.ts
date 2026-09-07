/**
 * V2.13 RPT-04 — the BUILDER's controls, derived from the registry.
 *
 * Configuring a report should feel like configuring a view, not like writing a
 * query. So the builder is progressive and every control is a list of links:
 *
 *     Source → Measure → Period → Group or grain → Filters → Show as
 *
 * ── Only what the current selection supports ───────────────────────────────
 * Every option comes from `~/kernel/reports`' registry and from what the chosen
 * WINDOW can actually hold. A combination the executor would refuse is never
 * offered, so the builder cannot produce a definition the page then rejects —
 * the same property `allowedGrains` gives the Insight grain control.
 *
 * ── Changing a control never silently changes the question ─────────────────
 * Changing the SOURCE resets the measure and its defaults, because a measure
 * belongs to one source. Changing the MEASURE resets the breakdown, the sort
 * and the visual to that measure's declared defaults, and drops every filter
 * the new measure does not understand. Changing the WINDOW drops a grain the
 * new window cannot hold. Each of those is a reset the owner can SEE in the
 * control they just used, rather than a value the loader quietly substituted —
 * the rule the Insight window control already follows.
 *
 * Pure: it builds URLs and reads the registry. No storage, no clock beyond the
 * owner's day it is handed.
 */

import {
  GRAIN_LABELS,
  INSIGHT_WINDOWS,
  type InsightWindowId,
} from "~/kernel/analytics";
import {
  OBLIGATION_CATEGORY_OPTIONS,
  type ObligationCategory,
} from "~/kernel/obligations";
import {
  PROJECT_HEALTH_STATES,
  PROJECT_HEALTH_STATE_LABELS,
} from "~/kernel/project-health";
import {
  REPORT_GROUP_LABELS,
  REPORT_SORT_LABELS,
  REPORT_SOURCE_DEFINITIONS,
  REPORT_VISUAL_LABELS,
  breakdownShape,
  measureBreakdowns,
  reportMeasure,
  reportWindowGrains,
  shapeSorts,
  supportsVisual,
  type ReportBreakdown,
  type ReportConfig,
  type ReportFilterKey,
  type ReportMeasureDefinition,
  type ReportVisual,
  type ReportWindow,
} from "~/kernel/reports";
import { STANDARD_REVIEW_TYPES } from "~/kernel/reviews";

import { paramsFromConfig } from "./reports-url-state";
import type { ReportControl, ReportOption } from "./reports-view";

/** A vocabulary the workspace supplies for an id-shaped filter. */
export interface ReportFilterVocabulary {
  readonly key: ReportFilterKey;
  readonly label: string;
  readonly options: readonly { readonly id: string; readonly title: string }[];
}

/** The forward windows an `ahead` measure offers. Named, never a free number. */
const AHEAD_DAYS: readonly { readonly days: number; readonly label: string }[] =
  [
    { days: 30, label: "Next 30 days" },
    { days: 90, label: "Next 90 days" },
    { days: 180, label: "Next 6 months" },
    { days: 365, label: "Next 12 months" },
  ];

/**
 * Build every control for one definition.
 *
 * `vocabularies` carries only the id-shaped filters the caller could populate
 * cheaply; a filter with no vocabulary is simply not offered as a control. It
 * remains expressible in the URL, which is what keeps a shared link working
 * when the offer is narrower than the vocabulary.
 */
export function buildReportControls(input: {
  readonly config: ReportConfig;
  readonly todayIso: string;
  readonly vocabularies?: readonly ReportFilterVocabulary[];
}): readonly ReportControl[] {
  const { config, todayIso } = input;
  const measure = reportMeasure(config.measure);
  if (!measure) return [];

  const controls: ReportControl[] = [
    sourceControl(config),
    measureControl(config, measure),
    windowControl(config, measure, todayIso),
  ];

  const breakdown = breakdownControl(config, measure, todayIso);
  if (breakdown) controls.push(breakdown);

  for (const filter of filterControls(config, measure, input.vocabularies)) {
    controls.push(filter);
  }

  controls.push(visualControl(config));
  const sort = sortControl(config);
  if (sort) controls.push(sort);
  return controls;
}

/* -------------------------------------------------------------------------- */
/* Structure                                                                   */
/* -------------------------------------------------------------------------- */

function href(config: ReportConfig): string {
  return `/reports/view?${paramsFromConfig(config).toString()}`;
}

/**
 * A definition rebuilt around one measure, using that measure's own declared
 * defaults and keeping only the filters it understands.
 *
 * This is the ONE place a control resets anything, so a reset can never be a
 * loader falling back behind the owner's back.
 */
function forMeasure(
  measure: ReportMeasureDefinition,
  keep: ReportConfig,
): ReportConfig {
  const filters: Record<string, unknown> = {};
  for (const key of measure.filters) {
    const value = keep.filters[key];
    if (value !== undefined) filters[key] = value;
  }
  return {
    version: keep.version,
    source: measure.source,
    measure: measure.key,
    window: measure.defaultWindow,
    breakdown: measure.defaultBreakdown,
    filters: filters as ReportConfig["filters"],
    sort: measure.defaultSort,
    visual: measure.defaultVisual,
  };
}

function sourceControl(config: ReportConfig): ReportControl {
  return {
    id: "source",
    label: "About",
    value: config.source,
    options: REPORT_SOURCE_DEFINITIONS.map((source) => ({
      value: source.key,
      label: source.label,
      // A source's FIRST measure is its headline question, and switching source
      // must land on a complete definition rather than a half-built one.
      href: href(forMeasure(source.measures[0], config)),
    })),
  };
}

function measureControl(
  config: ReportConfig,
  measure: ReportMeasureDefinition,
): ReportControl {
  const source = REPORT_SOURCE_DEFINITIONS.find(
    (candidate) => candidate.key === config.source,
  );
  return {
    id: "measure",
    label: "Measure",
    value: measure.key,
    options: (source?.measures ?? []).map((candidate) => ({
      value: candidate.key,
      label: candidate.label,
      href: href(forMeasure(candidate, config)),
    })),
  };
}

function windowControl(
  config: ReportConfig,
  measure: ReportMeasureDefinition,
  todayIso: string,
): ReportControl {
  const options: ReportOption[] = [];

  if (measure.windowKinds.includes("preset")) {
    for (const definition of INSIGHT_WINDOWS) {
      options.push(
        windowOption(
          config,
          measure,
          { kind: "preset", preset: definition.id as InsightWindowId },
          definition.label,
          todayIso,
        ),
      );
    }
  }
  if (measure.windowKinds.includes("ahead")) {
    for (const ahead of AHEAD_DAYS) {
      options.push(
        windowOption(
          config,
          measure,
          { kind: "ahead", days: ahead.days },
          ahead.label,
          todayIso,
        ),
      );
    }
  }

  const value =
    config.window.kind === "preset"
      ? config.window.preset
      : config.window.kind === "ahead"
        ? `ahead:${config.window.days}`
        : "custom";

  return { id: "window", label: "Period", value, options };
}

/**
 * One window option, with the breakdown repaired if the new window cannot hold
 * the current grain.
 *
 * Repaired here rather than at the loader, because the owner is choosing the
 * window and the control they clicked is where a consequence belongs.
 */
function windowOption(
  config: ReportConfig,
  measure: ReportMeasureDefinition,
  window: ReportWindow,
  label: string,
  todayIso: string,
): ReportOption {
  let breakdown = config.breakdown;
  if (breakdown.by === "time") {
    const allowed = reportWindowGrains(window, todayIso, measure.grains);
    if (!allowed.includes(breakdown.grain)) {
      breakdown =
        allowed.length > 0
          ? { by: "time", grain: allowed[allowed.length - 1] }
          : measure.defaultBreakdown;
    }
  }
  return {
    value:
      window.kind === "preset"
        ? window.preset
        : `ahead:${(window as { days: number }).days}`,
    label,
    href: href(repairPresentation({ ...config, window, breakdown })),
  };
}

function breakdownControl(
  config: ReportConfig,
  measure: ReportMeasureDefinition,
  todayIso: string,
): ReportControl | null {
  const allowedGrains = reportWindowGrains(
    config.window,
    todayIso,
    measure.grains,
  );
  const options = measureBreakdowns(measure)
    // A grain this window cannot hold is never OFFERED, so the refusal the
    // executor would issue can only be reached through a hand-edited URL.
    .filter(
      (breakdown) =>
        breakdown.by !== "time" || allowedGrains.includes(breakdown.grain),
    )
    .map((breakdown) => ({
      value: breakdownValue(breakdown),
      label: breakdownLabel(breakdown),
      href: href(repairPresentation({ ...config, breakdown })),
    }));

  return options.length > 1
    ? {
        id: "breakdown",
        label: "Break down",
        value: breakdownValue(config.breakdown),
        options,
      }
    : null;
}

function breakdownValue(breakdown: ReportBreakdown): string {
  return breakdown.by === "none"
    ? "none"
    : breakdown.by === "time"
      ? `t:${breakdown.grain}`
      : `g:${breakdown.group}`;
}

function breakdownLabel(breakdown: ReportBreakdown): string {
  return breakdown.by === "none"
    ? "Total only"
    : breakdown.by === "time"
      ? GRAIN_LABELS[breakdown.grain]
      : REPORT_GROUP_LABELS[breakdown.group];
}

/** Keep the sort and the visual legal for whatever shape the breakdown makes. */
function repairPresentation(config: ReportConfig): ReportConfig {
  const shape = breakdownShape(config.breakdown);
  const sorts = shapeSorts(shape);
  const visual: ReportVisual = supportsVisual(config.breakdown, config.visual)
    ? config.visual
    : shape === "series"
      ? "trend"
      : shape === "scalar"
        ? "number"
        : "bars";
  return {
    ...config,
    sort: sorts.includes(config.sort) ? config.sort : sorts[0],
    visual,
  };
}

function visualControl(config: ReportConfig): ReportControl {
  const shape = breakdownShape(config.breakdown);
  const options: ReportVisual[] =
    shape === "scalar"
      ? ["number", "table"]
      : shape === "series"
        ? ["trend", "table"]
        : ["bars", "table"];
  return {
    id: "visual",
    label: "Show as",
    value: config.visual,
    options: options.map((visual) => ({
      value: visual,
      label: REPORT_VISUAL_LABELS[visual],
      href: href({ ...config, visual }),
    })),
  };
}

function sortControl(config: ReportConfig): ReportControl | null {
  const sorts = shapeSorts(breakdownShape(config.breakdown));
  // A series has exactly one legal order, so there is nothing to choose.
  if (sorts.length < 2) return null;
  return {
    id: "sort",
    label: "Order",
    value: config.sort,
    options: sorts.map((sort) => ({
      value: sort,
      label: REPORT_SORT_LABELS[sort],
      href: href({ ...config, sort }),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                     */
/* -------------------------------------------------------------------------- */

function filterControls(
  config: ReportConfig,
  measure: ReportMeasureDefinition,
  vocabularies: readonly ReportFilterVocabulary[] = [],
): readonly ReportControl[] {
  const controls: ReportControl[] = [];

  for (const key of measure.filters) {
    // The CLOSED vocabularies need no read at all, so they are always offered.
    if (key === "obligationCategory") {
      controls.push(
        closedFilter(config, key, "Kind", "Any kind", [
          ...OBLIGATION_CATEGORY_OPTIONS.map((option) => ({
            value: option.value as ObligationCategory,
            label: option.label,
          })),
        ]),
      );
      continue;
    }
    if (key === "healthState") {
      controls.push(
        closedFilter(config, key, "Health", "Any state", [
          ...PROJECT_HEALTH_STATES.map((state) => ({
            value: state,
            label: PROJECT_HEALTH_STATE_LABELS[state],
          })),
        ]),
      );
      continue;
    }
    if (key === "reviewType") {
      controls.push(
        closedFilter(
          config,
          key,
          "Review type",
          null,
          STANDARD_REVIEW_TYPES.map((type) => ({
            value: type,
            label: `${type.charAt(0).toLocaleUpperCase("en-AU")}${type.slice(1)}`,
          })),
        ),
      );
      continue;
    }
    if (key === "uncategorised") {
      controls.push({
        id: key,
        label: "Categorised",
        value: config.filters.uncategorised ? "1" : "",
        options: [
          {
            value: "",
            label: "All transactions",
            href: href(withFilter(config, key, undefined)),
          },
          {
            value: "1",
            label: "Uncategorised only",
            href: href(withFilter(config, key, true)),
          },
        ],
      });
      continue;
    }

    const vocabulary = vocabularies.find((candidate) => candidate.key === key);
    // A filter the caller could not populate is not offered. It stays
    // expressible in the URL, so a shared link keeps working.
    if (!vocabulary || vocabulary.options.length === 0) continue;

    const required = measure.requiredFilters.includes(key);
    const options: ReportOption[] = required
      ? []
      : [
          {
            value: "",
            label: `Any ${vocabulary.label.toLocaleLowerCase("en-AU")}`,
            href: href(withFilter(config, key, undefined)),
          },
        ];
    for (const option of vocabulary.options) {
      options.push({
        value: option.id,
        label: option.title,
        href: href(withFilter(config, key, option.id)),
      });
    }
    controls.push({
      id: key,
      label: vocabulary.label,
      value: (config.filters[key] as string | undefined) ?? "",
      options,
    });
  }

  return controls;
}

function closedFilter(
  config: ReportConfig,
  key: ReportFilterKey,
  label: string,
  anyLabel: string | null,
  values: readonly { readonly value: string; readonly label: string }[],
): ReportControl {
  const options: ReportOption[] =
    anyLabel === null
      ? []
      : [
          {
            value: "",
            label: anyLabel,
            href: href(withFilter(config, key, undefined)),
          },
        ];
  for (const entry of values) {
    options.push({
      value: entry.value,
      label: entry.label,
      href: href(withFilter(config, key, entry.value)),
    });
  }
  return {
    id: key,
    label,
    value: (config.filters[key] as string | undefined) ?? "",
    options,
  };
}

function withFilter(
  config: ReportConfig,
  key: ReportFilterKey,
  value: string | true | undefined,
): ReportConfig {
  const filters: Record<string, unknown> = { ...config.filters };
  if (value === undefined) delete filters[key];
  else filters[key] = value;
  // Two answers to one question select nothing, so choosing one clears the
  // other rather than producing a definition the parser refuses.
  if (key === "categoryId" && value !== undefined) delete filters.uncategorised;
  if (key === "uncategorised" && value !== undefined) delete filters.categoryId;
  return { ...config, filters: filters as ReportConfig["filters"] };
}
