/**
 * PLAN-01 — the "Still to place" QUEUE rule (pure, React-free, storage-free).
 *
 * The planning queue is the surface's one genuinely editorial judgement, so it is
 * stated as data and code here rather than buried in a loader — and it is
 * deliberately NOT a score.
 *
 * ── Why not a score ─────────────────────────────────────────────────────────
 * A weighted "importance" number would be unarguable in exactly the wrong way:
 * the owner could see the order but never the reason, and no test could assert
 * anything except the arithmetic. So the queue is a small, ORDERED set of named
 * BANDS. Each band is a bounded, server-side query over the canonical Tasks read
 * model; each queue entry carries the band it came from; and the surface prints
 * that band as a word beside the row. "Why is this here?" always has an answer,
 * and the answer is the same one the query used.
 *
 * ── The bands, in priority order ────────────────────────────────────────────
 *   1. `overdue`       — open and past its date. A decision is overdue too.
 *   2. `slipped`       — planned for a day BEFORE this week and still open. The
 *                        owner already committed to it once; the commitment
 *                        lapsed, so it needs re-placing rather than re-deciding.
 *   3. `due_this_week` — due inside the shown week and not planned inside it.
 *                        A deadline in the week with no day chosen is the single
 *                        most useful thing a planner can surface.
 *   4. `priority`      — P1 or P2 with no planned day. High-priority work that
 *                        is nowhere in the week is a planning gap by definition.
 *   5. `inbox`         — active and unfiled (no Project or Area parent). Not
 *                        because unfiled work is urgent, but because the week is
 *                        where "this needs a home" gets decided.
 *
 * This is NOT "every open Task". Anything that is none of those five is real work
 * the owner has parked, filed and dated; putting it in a planning queue would
 * make the queue a second Tasks list with worse filtering (§B6).
 *
 * ── Membership rules that hold for every band ───────────────────────────────
 *   - A Task PLANNED INSIDE the shown week is never in the queue: it is already
 *     placed, and it is drawn on its day.
 *   - A Task appears AT MOST ONCE, in its highest-priority band. Its band is its
 *     stated reason, so two reasons for one row would be two rows.
 *   - Order inside a band is the ORDER THE QUERY RETURNED, which is itself
 *     deterministic (`due_date`, `scheduled_date` or `smart`, then id). This
 *     module never re-sorts, so the surface can never disagree with the page
 *     boundary the query drew.
 *   - The whole queue is bounded. What was dropped is REPORTED, never silently
 *     truncated, so "you have placed everything" and "there is more" are
 *     different sentences.
 */

/** The bands, in the order they are offered. The array IS the priority order. */
export const PLANNING_QUEUE_BANDS = [
  "overdue",
  "slipped",
  "due_this_week",
  "priority",
  "inbox",
] as const;
export type PlanningQueueBand = (typeof PLANNING_QUEUE_BANDS)[number];

/** The owner-facing word for each band. One vocabulary, stated once. */
export const PLANNING_QUEUE_BAND_LABELS: Readonly<
  Record<PlanningQueueBand, string>
> = {
  overdue: "Overdue",
  slipped: "Plan lapsed",
  due_this_week: "Due this week",
  priority: "High priority",
  inbox: "Unfiled",
};

/**
 * The one-line explanation of each band, for the queue's own disclosure. The
 * owner should never have to guess what DalyHub thinks warrants a decision.
 */
export const PLANNING_QUEUE_BAND_NOTES: Readonly<
  Record<PlanningQueueBand, string>
> = {
  overdue: "Past its date and still open.",
  slipped: "You planned it for an earlier day and it is still open.",
  due_this_week: "Its deadline is in this week, but no day is chosen.",
  priority: "Priority 1 or 2 with no planned day.",
  inbox: "Active work with no Project or Area yet.",
};

/** The minimum a candidate must expose to be queued. Anything else is presentation. */
export interface PlanningQueueCandidate {
  readonly id: string;
}

/** One band's bounded result, exactly as its query returned it. */
export interface PlanningQueueBandResult<T extends PlanningQueueCandidate> {
  readonly band: PlanningQueueBand;
  /** The band's items, in the query's own deterministic order. */
  readonly items: readonly T[];
  /** True when the band's query had more rows than its bound returned. */
  readonly truncated: boolean;
}

/** One queue entry: the Task, and the reason it is in the queue. */
export interface PlanningQueueEntry<T extends PlanningQueueCandidate> {
  readonly task: T;
  readonly band: PlanningQueueBand;
}

export interface PlanningQueue<T extends PlanningQueueCandidate> {
  readonly entries: readonly PlanningQueueEntry<T>[];
  /** Which bands contributed at least one entry, in band order. */
  readonly bands: readonly PlanningQueueBand[];
  /**
   * True when a band's query was truncated, or when the merged queue itself hit
   * its bound. The surface says so in words — a bounded list that claims to be
   * complete is the one failure mode a planning queue must not have.
   */
  readonly truncated: boolean;
}

/**
 * Merge the bands into ONE ordered, de-duplicated queue.
 *
 * `placedIds` is the set of Task ids already planned inside the shown week — the
 * exact ids the week's own read returned, so "already placed" is decided from the
 * same data the day columns draw and never from a second rule.
 */
export function buildPlanningQueue<T extends PlanningQueueCandidate>(input: {
  readonly bands: readonly PlanningQueueBandResult<T>[];
  readonly placedIds: ReadonlySet<string>;
  /** The maximum entries the queue returns. Bounded, and reported when hit. */
  readonly limit: number;
}): PlanningQueue<T> {
  const entries: PlanningQueueEntry<T>[] = [];
  const seen = new Set<string>(input.placedIds);
  const contributing: PlanningQueueBand[] = [];
  let truncated = input.bands.some((band) => band.truncated);
  const limit = Math.max(0, Math.trunc(input.limit));

  // Band order is the declared order, not the caller's argument order, so a
  // loader that resolves its reads concurrently cannot change the queue.
  for (const band of PLANNING_QUEUE_BANDS) {
    const result = input.bands.find((candidate) => candidate.band === band);
    if (result === undefined) continue;
    let contributed = false;
    for (const task of result.items) {
      if (seen.has(task.id)) continue;
      if (entries.length >= limit) {
        truncated = true;
        break;
      }
      seen.add(task.id);
      entries.push({ task, band });
      contributed = true;
    }
    if (contributed) contributing.push(band);
  }

  return { entries, bands: contributing, truncated };
}
