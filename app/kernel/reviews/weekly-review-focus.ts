/**
 * REVIEW-02 — the next-period focus HANDOFF, derived rather than copied.
 *
 * The roadmap asks a completed weekly Review to hand the next period its focus.
 * The conservative way to do that — the way that cannot drift, cannot go stale
 * silently and cannot overwrite anybody's writing — is a DERIVED READ:
 *
 *   - the focus lives exactly once, in the Review that recorded it, in the
 *     existing `summary.next_focus` section. No new table, no copy;
 *   - a later weekly Review, or Today, ASKS which completed weekly Review most
 *     recently preceded the period it cares about, and reads that section;
 *   - completing a newer weekly Review therefore supersedes the older one for
 *     free, and reopening one removes it from consideration the moment its
 *     status stops being `completed`.
 *
 * This module owns only the SELECTION rule, purely, so it is unit-tested without
 * a database. Fetching the candidates is the caller's bounded, workspace-scoped
 * repository read.
 */

import type { ReviewStatus, ReviewType } from "./review";

/**
 * The minimum a Review must expose to be considered as a focus source. Dates are
 * wall-calendar `YYYY-MM-DD` strings, exactly as `review_details` stores them, so
 * the comparison is a calendar comparison and never a timezone conversion — the
 * same rule that keeps weekly periods correct across DST and year boundaries.
 */
export interface PriorFocusCandidate {
  readonly id: string;
  readonly title: string;
  readonly type: ReviewType;
  readonly status: ReviewStatus;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly archivedAt: Date | null;
  readonly completedAt: Date | null;
  /** The stored `summary.next_focus` body, exactly as authored. */
  readonly focusBody: string;
}

export interface PriorPeriodFocus {
  readonly reviewId: string;
  readonly reviewTitle: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  /** The authored Markdown, trimmed of surrounding whitespace only. */
  readonly body: string;
}

/**
 * Which completed weekly Review supplies the focus for the period beginning
 * `periodStart`?
 *
 * The rule, in full:
 *
 *   - the candidate must be a **weekly** Review — a monthly or quarterly focus is
 *     a different horizon and does not stand in for a week's;
 *   - it must be **completed** (a draft or in-progress Review has not handed
 *     anything over yet, and a REOPENED Review stops being a source immediately);
 *   - it must **not be archived** — an archived Review is out of active views;
 *   - its period must end **strictly before** `periodStart`, so a Review of the
 *     same week never hands itself its own focus;
 *   - it must actually have written something: an empty `summary.next_focus` is
 *     not a focus and is skipped in favour of the next-most-recent Review that
 *     does have one;
 *   - of those, the one whose period ends **latest** wins; ties (which the
 *     duplicate-period index makes impossible for real weekly Reviews) break on
 *     the later completion instant, then on id, so the answer is deterministic.
 *
 * Returns `null` when nothing qualifies — the honest answer when no Review has
 * been completed yet, and the reason the consuming surface shows a calm empty
 * state rather than a stale focus from months ago.
 */
export function selectPriorPeriodFocus(
  candidates: readonly PriorFocusCandidate[],
  periodStart: string,
): PriorPeriodFocus | null {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.type === "weekly" &&
      candidate.status === "completed" &&
      candidate.archivedAt === null &&
      candidate.periodEnd < periodStart &&
      candidate.focusBody.trim().length > 0,
  );
  if (eligible.length === 0) return null;

  const best = eligible.reduce((winner, candidate) => {
    if (candidate.periodEnd !== winner.periodEnd) {
      return candidate.periodEnd > winner.periodEnd ? candidate : winner;
    }
    const candidateAt = candidate.completedAt?.getTime() ?? 0;
    const winnerAt = winner.completedAt?.getTime() ?? 0;
    if (candidateAt !== winnerAt)
      return candidateAt > winnerAt ? candidate : winner;
    return candidate.id > winner.id ? candidate : winner;
  });

  return {
    reviewId: best.id,
    reviewTitle: best.title,
    periodStart: best.periodStart,
    periodEnd: best.periodEnd,
    body: best.focusBody.trim(),
  };
}
