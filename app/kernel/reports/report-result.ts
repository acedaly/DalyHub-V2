/**
 * V2.13 RPT-03 — the REPORT RESULT: a small explicit family, not an infinitely
 * generic tree.
 *
 * A result carries the definition it answered, the window it actually covered,
 * the unit, whatever bound applied, the notes the reader needs to trust it, and
 * its data. The UI always knows what it is rendering, and so — later, without
 * Reports knowing AI exists — will V2.14's fact block.
 *
 * ── One BLOCK per currency ─────────────────────────────────────────────────
 * ADR-049's rule is "never sum unlike currencies". Here it is a property of the
 * TYPE rather than a rule a surface has to remember: a money result comes back
 * as one block per currency, each with its own rows, its own total and its own
 * chart, and there is no shape in which two currencies can meet. A `count` or a
 * `value` measure produces exactly one block, with `currencyCode: null`. There
 * is no FX conversion anywhere in V2.13.
 *
 * ── A row's value may be ABSENT ────────────────────────────────────────────
 * `value: number | null`. A FLOW measure never emits null — no records in a
 * month genuinely means zero. A LEVEL measure (a Goal measurement) emits null
 * for a period with no reading, because a month with no weigh-in is neither
 * 70 kg nor 0 kg, and drawing zero would be the first lie this feature tells.
 * Nothing is interpolated, carried forward or drawn through (ADR-121 d4).
 *
 * ── Boundedness travels WITH the data ──────────────────────────────────────
 * The rule `Series` established (ADR-079 d11): a surface must never present a
 * capped population as a complete one, and making that mistake must require
 * ignoring a field rather than merely forgetting a rule. A grouped result that
 * was capped carries a REMAINDER computed from the same read — never a bounded
 * page subtracted from an unbounded guess.
 *
 * Pure: no storage, no clock, no JSX.
 */

import type { Window } from "~/kernel/history";

import type {
  ReportConfig,
  ReportMeasureKey,
  ReportShape,
  ReportSourceKey,
  ReportUnit,
} from "./report-vocabulary";

/** How many rows one grouped result may hold before the remainder takes over. */
export const MAX_REPORT_GROUPS = 24;

/** The most readings one measurement report reads back. */
export const MAX_REPORT_READINGS = 500;

/* -------------------------------------------------------------------------- */
/* Notes                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Something the reader must know to trust the figure.
 *
 * A note is never decoration and never an apology: it is the qualification that
 * travels with the claim (ADR-079 d6). `tone` decides emphasis only — every
 * note is a full sentence and none of them is carried by colour.
 */
export interface ReportNote {
  /** Stable, so a test can assert a note is present without matching prose. */
  readonly code: ReportNoteCode;
  readonly text: string;
  readonly tone: "neutral" | "warning";
}

export const REPORT_NOTE_CODES = [
  /** The measure's own standing approximation, from the registry. */
  "standing",
  /** Rows beyond the cap were folded into a remainder. */
  "bounded_groups",
  /** The history kernel shortened the series. */
  "bounded_series",
  /** Records were excluded and counted (no amount, no calendar recurrence …). */
  "excluded",
  /** More than one currency is present, so the result is split. */
  "mixed_currency",
  /** The window is fixed rather than moving with the calendar. */
  "fixed_window",
  /** Nothing matched — as against "the value is zero". */
  "no_records",
] as const;

export type ReportNoteCode = (typeof REPORT_NOTE_CODES)[number];

/* -------------------------------------------------------------------------- */
/* Rows and blocks                                                             */
/* -------------------------------------------------------------------------- */

/** One row of a result: one bucket, one group, or the single scalar. */
export interface ReportRow {
  /** Stable within one block, and ordered as the result is sorted. */
  readonly key: string;
  /** The owner's words for this row — an Area's title, "September 2026". */
  readonly label: string;
  /**
   * The figure. `null` means NO READING, never zero — see the file header.
   * For a `money` unit this is integer minor units in the block's currency.
   */
  readonly value: number | null;
  /** A second, subordinate figure the row states in words (a record count). */
  readonly detail: number | null;
  /** The period this row covers, for a series. */
  readonly period: {
    readonly startIso: string;
    readonly endIso: string;
  } | null;
  /**
   * The canonical record this row is about, where there is exactly one.
   *
   * It is what lets a doubted figure be checked against the surface that owns
   * it, and it is the seam V2.14 cites a fact by. `null` for a row that is a
   * period, a bucket or an "uncategorised" line.
   */
  readonly referenceId: string | null;
}

/** What was left out of a bounded grouped result — arithmetically, not by guess. */
export interface ReportRemainder {
  /** How many groups are folded into this row. */
  readonly groups: number;
  /** Their combined value, in the block's unit. */
  readonly value: number;
  /** Their combined record count, where the read produced one. */
  readonly detail: number | null;
}

/**
 * One currency's worth of a result. See the file header for why this exists.
 */
export interface ReportBlock {
  readonly key: string;
  /** `null` for a `count` or `value` measure — the block is the whole result. */
  readonly currencyCode: string | null;
  readonly rows: readonly ReportRow[];
  /**
   * The total across this block's rows, for an ADDITIVE measure.
   *
   * `null` for a `latest`-aggregated measure, because adding twelve monthly
   * weigh-ins produces a number with no meaning. A field that is absent cannot
   * be printed by mistake.
   */
  readonly total: number | null;
  /** How many records the whole block covers, where the read produced one. */
  readonly recordCount: number | null;
  readonly remainder: ReportRemainder | null;
}

/* -------------------------------------------------------------------------- */
/* The result                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Whether the figures can be trusted at all.
 *
 * `unavailable` is what a FAILED READ produces, and it is never an empty result:
 * an empty chart reads as "nothing happened", which is a claim about the
 * workspace. A report reads ONE source, so failure is atomic at the source
 * rather than a quietly missing group.
 */
export type ReportAvailability = "ok" | "unavailable";

export interface ReportResult {
  /** The question this answered, exactly as it was validated. */
  readonly definition: ReportConfig;
  readonly source: ReportSourceKey;
  readonly measure: ReportMeasureKey;
  readonly shape: ReportShape;
  readonly unit: ReportUnit;
  /** The window the rows actually cover. */
  readonly window: Window;
  /** The grain, for a series. `null` otherwise. */
  readonly grain: string | null;
  readonly blocks: readonly ReportBlock[];
  readonly bounded: boolean;
  /** The bound that applied, or null when none did. */
  readonly bound: number | null;
  readonly boundReason: string | null;
  readonly notes: readonly ReportNote[];
  readonly availability: ReportAvailability;
  /** The instant the figures were computed — a derived result is never stale in
   * storage, but an exported copy of one is. */
  readonly computedAtIso: string;
}

/**
 * The canonical serialisation a result's IDENTITY is taken over.
 *
 * V2.13 shaped `ReportResult` so a fact block could be derived from it; V2.14
 * needs one thing more, and it is a Reports concern rather than an AI one: a
 * stable value that says *"these are the same figures"*. A surface that has an
 * explanation of a report needs to know whether the report still says what it
 * said when the explanation was written, and the only honest way to answer that
 * is to compare the figures themselves.
 *
 * It covers the definition, the window, the unit, every row of every block and
 * every note. It does NOT cover `computedAtIso`: two executions a second apart
 * over unchanged data must produce the same identity, or the check would fire
 * on every single request and mean nothing.
 *
 * PURE, and deliberately not an AI concept — no AI file is imported to produce
 * it, and Reports acquires no dependency by having one.
 */
export function reportResultSource(result: ReportResult): string {
  const lines: string[] = [
    `source=${result.source}`,
    `measure=${result.measure}`,
    `shape=${result.shape}`,
    `unit=${result.unit}`,
    `grain=${result.grain ?? "-"}`,
    `window=${result.window.periodStart}..${result.window.periodEnd}`,
    `availability=${result.availability}`,
    `bounded=${result.bounded ? "1" : "0"}:${result.bound ?? "-"}`,
  ];
  for (const block of result.blocks) {
    lines.push(
      `block=${block.key}:${block.currencyCode ?? "-"}:${block.total ?? "-"}:${
        block.recordCount ?? "-"
      }:${
        block.remainder === null
          ? "-"
          : `${block.remainder.groups}/${block.remainder.value}`
      }`,
    );
    for (const row of block.rows) {
      lines.push(
        `row=${row.key}|${row.label}|${row.value ?? "-"}|${row.detail ?? "-"}|${
          row.referenceId ?? "-"
        }`,
      );
    }
  }
  for (const note of result.notes) lines.push(`note=${note.code}|${note.text}`);
  return lines.join("\n");
}

/**
 * A hex SHA-256 of {@link reportResultSource} — the result's identity.
 *
 * Not a secret and not an authorisation: two identical results hash identically
 * by design, and nothing is granted by presenting one. It exists so a surface
 * can ask "are these still the same figures?" and get a true answer.
 */
export async function reportResultDigest(
  result: ReportResult,
): Promise<string> {
  const bytes = new TextEncoder().encode(reportResultSource(result));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** True when every block of the result holds nothing. */
export function reportIsEmpty(result: ReportResult): boolean {
  return result.blocks.every((block) => block.rows.length === 0);
}

/** True when every row of every block is zero or absent. */
export function reportIsAllZero(result: ReportResult): boolean {
  return result.blocks.every((block) =>
    block.rows.every((row) => row.value === null || row.value === 0),
  );
}

/** True when more than one currency is present. */
export function reportIsMixedCurrency(result: ReportResult): boolean {
  return (
    result.blocks.filter((block) => block.currencyCode !== null).length > 1
  );
}

/**
 * A result that could not be read, carrying its definition and window so the
 * surface still says WHICH question it cannot answer.
 *
 * "Not available" with a named question is honest; an empty chart is not.
 */
export function unavailableReport(input: {
  readonly definition: ReportConfig;
  readonly shape: ReportShape;
  readonly unit: ReportUnit;
  readonly window: Window;
  readonly grain: string | null;
  readonly computedAtIso: string;
}): ReportResult {
  return {
    definition: input.definition,
    source: input.definition.source,
    measure: input.definition.measure,
    shape: input.shape,
    unit: input.unit,
    window: input.window,
    grain: input.grain,
    blocks: [],
    bounded: false,
    bound: null,
    boundReason: null,
    notes: [],
    availability: "unavailable",
    computedAtIso: input.computedAtIso,
  };
}
