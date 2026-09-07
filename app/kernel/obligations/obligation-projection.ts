/**
 * V2.13 RPT-02 — projecting a recurring commitment's next occurrences.
 *
 * ── Why this is arithmetic and not a store ─────────────────────────────────
 * An obligation has exactly ONE open occurrence. Its successor is written by
 * `complete`, in the same batch, with the completion's own date as the anchor —
 * so future occurrences beyond the next do not exist as rows, and V2.13 creates
 * no schedule store to make them exist (ADR-118, ADR-116 decision 1: the
 * product's recurrence engines stay at three).
 *
 * So "what known commitments are expected each month" is computed HERE, from
 * the open recurring obligations and {@link nextObligationDate} — the SAME
 * function `complete` uses to write a successor. It is not a second recurrence
 * engine, and there is no expression language: a rule is still a (kind,
 * interval) pair.
 *
 * ── What this is NOT ───────────────────────────────────────────────────────
 * It is not a forecast of future spending. It projects only what DalyHub has
 * been TOLD repeats, at the amount it has been told, and:
 *
 *   - a METER rule has no calendar and is never projected (its count reaches
 *     the surface as an exclusion, never as an estimate);
 *   - an obligation with no recorded amount projects its OCCURRENCES and
 *     contributes nothing to any total;
 *   - the horizon is bounded, and the bound is stated;
 *   - the per-obligation occurrence count is bounded too, so a daily commitment
 *     cannot produce 365 rows and drown the answer.
 *
 * Pure: no storage, no clock. The horizon arrives as two owner-calendar days.
 */

import { nextObligationDate } from "./obligation-recurrence";
import type { ObligationRecurrenceKind } from "./obligation-recurrence";

/** The most occurrences ONE commitment contributes to a projection. */
export const MAX_PROJECTED_OCCURRENCES = 60;

/** What a projection needs to know about one commitment. */
export interface ProjectableObligation {
  readonly obligationId: string;
  readonly title: string;
  readonly category: string;
  /** The NEXT occurrence's own due date — the one that exists as a row. */
  readonly dueDate: string;
  readonly recurrenceKind: string;
  readonly recurrenceInterval: number | null;
  readonly expectedAmountMinor: number | null;
  readonly currencyCode: string | null;
}

/** One projected occurrence. */
export interface ProjectedOccurrence {
  readonly obligationId: string;
  readonly title: string;
  readonly category: string;
  readonly dueDate: string;
  /** `YYYY-MM`, the axis a commitments report groups by. */
  readonly month: string;
  /** `null` when no amount has been recorded. NEVER zero and never estimated. */
  readonly expectedAmountMinor: number | null;
  readonly currencyCode: string | null;
  /** True for the occurrence that EXISTS as a row rather than being projected. */
  readonly stored: boolean;
}

/** A bounded projection, with everything it left out counted. */
export interface ObligationProjection {
  readonly occurrences: readonly ProjectedOccurrence[];
  /** Commitments whose per-obligation occurrence bound was reached. */
  readonly boundedCommitments: number;
  /** Commitments with no recorded amount, whose occurrences carry none. */
  readonly withoutAmount: number;
}

/**
 * Project every open recurring commitment forward across an inclusive window.
 *
 * The first occurrence is the STORED one, when its due date falls inside the
 * window; every later one is derived by stepping the commitment's own rule.
 * Stepping from the DUE DATE (rather than from a completion) is right here and
 * is not the same anchor `complete` uses: `complete` anchors on the day the work
 * was actually done, because a service done two months late schedules the next
 * one a full interval after the work. A projection has no completion to anchor
 * on — nothing has happened yet — so it steps the schedule as it currently
 * stands, which is exactly what "expected" means.
 */
export function projectObligations(input: {
  readonly commitments: readonly ProjectableObligation[];
  readonly fromIso: string;
  readonly toIso: string;
}): ObligationProjection {
  const occurrences: ProjectedOccurrence[] = [];
  let boundedCommitments = 0;
  let withoutAmount = 0;

  for (const commitment of input.commitments) {
    const kind = commitment.recurrenceKind as ObligationRecurrenceKind;
    // A meter rule advances a threshold, not a date. It never reaches here —
    // the read excludes it — and this is the second guard rather than the first.
    if (kind === "none" || kind === "meter") continue;
    if (commitment.expectedAmountMinor === null) withoutAmount += 1;

    let due: string | null = commitment.dueDate;
    let produced = 0;
    let stored = true;
    while (due !== null && due <= input.toIso) {
      if (due >= input.fromIso) {
        occurrences.push({
          obligationId: commitment.obligationId,
          title: commitment.title,
          category: commitment.category,
          dueDate: due,
          month: due.slice(0, 7),
          expectedAmountMinor: commitment.expectedAmountMinor,
          currencyCode: commitment.currencyCode,
          stored,
        });
        produced += 1;
        if (produced >= MAX_PROJECTED_OCCURRENCES) {
          boundedCommitments += 1;
          break;
        }
      }
      stored = false;
      const next: string | null = nextObligationDate(
        due,
        kind,
        commitment.recurrenceInterval,
      );
      // A rule that does not advance would loop forever. It cannot happen — an
      // interval is at least 1 — and the guard costs nothing.
      due = next !== null && next > due ? next : null;
    }
  }

  occurrences.sort((left, right) =>
    left.dueDate < right.dueDate
      ? -1
      : left.dueDate > right.dueDate
        ? 1
        : left.obligationId < right.obligationId
          ? -1
          : left.obligationId > right.obligationId
            ? 1
            : 0,
  );

  return { occurrences, boundedCommitments, withoutAmount };
}
