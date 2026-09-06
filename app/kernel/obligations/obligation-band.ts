/**
 * V2.10 LIFE-02 (D10) — the bands the Life Admin collection groups by.
 *
 * The owner's question at `/obligations` is "what do I need to deal with?", and
 * the answer is ordered by WHEN, not by category and not by subject:
 *
 *   Overdue · This week · This month · Later · Done
 *
 * ── Why `overdue` is its own band ───────────────────────────────────────────
 * The planned grouping was *this week / this month / later / done*. Measured
 * against {@link evaluateObligation}, that is wrong in one place and it is the
 * place that matters: the evaluator's most urgent state is `overdue`, and an
 * overdue obligation folded into "this week" is the one row an owner most needs
 * to see losing its distinction. A rego that expired in March and one due on
 * Friday are not the same news.
 *
 * ── Why a meter obligation awaiting a reading is overdue ────────────────────
 * `unknown` — a meter commitment whose subject has no reading — cannot be
 * placed on a calendar at all. The evaluator already counts it as needing
 * attention, and `dedupeAttention` already ranks it beside `overdue`, so it
 * bands there too rather than falling to "Later", which would quietly bury the
 * one row that needs the owner to go and read a number.
 *
 * ── Why the windows ROLL ────────────────────────────────────────────────────
 * "This week" is the next seven days from the owner's today, not the calendar
 * week, and "this month" the next thirty-one. A calendar week means "this week"
 * shrinks to nothing by Friday afternoon and an obligation due on Monday sits
 * under "This month" — the band would describe the calendar rather than the
 * owner's horizon. A rolling window says the same thing every day.
 *
 * ── One rule, two implementations, asserted equal ───────────────────────────
 * The collection renders bands from {@link obligationBand}; the counts under
 * the group headings are computed in SQL over the WHOLE collection before
 * pagination (D10 — a count taken over the loaded page is a lie about the set).
 * That is two implementations of one rule, which is exactly how they come to
 * disagree, so the SQL binds ITS boundaries from
 * {@link obligationBandBoundaries} rather than computing dates of its own, and
 * a repository test asserts the SQL counts equal the counts this function
 * produces over the same rows.
 */

import {
  evaluateObligation,
  type Obligation,
  type ObligationMeterEvaluation,
} from "./obligation";
import { addObligationDays, isIsoDate } from "./obligation-recurrence";

/** The five bands, in the order the collection prints them. */
export const OBLIGATION_BANDS = [
  "overdue",
  "this_week",
  "this_month",
  "later",
  "done",
] as const;

/** One band of the Life Admin collection. */
export type ObligationBand = (typeof OBLIGATION_BANDS)[number];

/** The heading an owner reads above each band. */
const BAND_LABELS: Readonly<Record<ObligationBand, string>> = {
  overdue: "Overdue",
  this_week: "This week",
  this_month: "This month",
  later: "Later",
  done: "Done",
};

/** The band's heading. Total: every band has one, forever. */
export function obligationBandLabel(band: ObligationBand): string {
  return BAND_LABELS[band];
}

/** How many days each rolling window spans, from the owner's today inclusive. */
export const OBLIGATION_WEEK_DAYS = 7;
export const OBLIGATION_MONTH_DAYS = 31;

/** The two dates that separate the date bands, in the owner's calendar. */
export interface ObligationBandBoundaries {
  /** The last day still inside "This week" (today + 6). */
  readonly weekEnd: string;
  /** The last day still inside "This month" (today + 30). */
  readonly monthEnd: string;
}

/**
 * The band boundaries for an owner-calendar day.
 *
 * The ONE place these dates are computed. The SQL that counts a whole
 * collection binds them rather than deriving its own, so a change here cannot
 * leave the headings counting one thing and the rows showing another.
 */
export function obligationBandBoundaries(
  today: string,
): ObligationBandBoundaries {
  return {
    weekEnd: addObligationDays(today, OBLIGATION_WEEK_DAYS - 1),
    monthEnd: addObligationDays(today, OBLIGATION_MONTH_DAYS - 1),
  };
}

/**
 * Which band one obligation belongs to.
 *
 * Delegates the urgent cases to {@link evaluateObligation} rather than
 * re-deciding them: `overdue` and `unknown` are the evaluator's words, and this
 * function must never be a second opinion about whether something is late.
 * Only the two calm windows are its own, because "this week" is a grouping
 * question the evaluator has no view on.
 *
 * `meter` is the already-evaluated meter side, supplied by the domain that owns
 * the units (the Assets kernel, for an Asset subject). Null where there is no
 * meter, or where the caller has no reading to evaluate one with.
 */
export function obligationBand(
  obligation: Pick<
    Obligation,
    "status" | "dueDate" | "leadDays" | "meterThreshold"
  >,
  today: string,
  meter: ObligationMeterEvaluation | null,
): ObligationBand {
  if (obligation.status === "completed") return "done";

  const due =
    obligation.dueDate !== null && isIsoDate(obligation.dueDate)
      ? obligation.dueDate
      : null;

  /*
   * A date in the past is Overdue whatever the status says, and the check comes
   * FIRST for a reason: a held obligation three months past its date would
   * otherwise fall through to the calendar windows and be printed under "This
   * week", because a past date is trivially "before the end of this week". The
   * band answers WHEN; the status is the separate filter the owner turned on to
   * see the row at all.
   */
  if (due !== null && due < today) return "overdue";

  const evaluation = evaluateObligation(obligation, today, meter);
  if (evaluation.state === "overdue" || evaluation.state === "unknown") {
    return "overdue";
  }
  /*
   * A meter commitment with no reading and no evaluated meter side is the same
   * `unknown` by another route: the caller had nothing to evaluate the meter
   * with, so the evaluator only saw the date. It still needs a reading.
   */
  if (
    obligation.status === "open" &&
    obligation.meterThreshold !== null &&
    meter === null &&
    due === null
  ) {
    return "overdue";
  }

  if (due === null) return "later";

  const { weekEnd, monthEnd } = obligationBandBoundaries(today);
  if (due <= weekEnd) return "this_week";
  if (due <= monthEnd) return "this_month";
  return "later";
}
