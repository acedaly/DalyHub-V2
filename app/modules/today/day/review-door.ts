/**
 * STEER-05 — the week's door.
 *
 * DEBT-34's remaining half, in its own words: *"the weekly Review has no entry
 * point on the screen the owner opens every day, so starting one is something
 * they must remember rather than something the product offers."* This file is
 * the read behind that offer, and it is deliberately small.
 *
 * ── One period authority, reached by one import path ────────────────────────
 * Which week it is comes from `currentReviewPeriod` in `~/kernel/reviews` — the
 * SAME function `NewReviewForm` calls to fill its own period fields. Today does
 * not re-derive the owner's week from `planningWeekStart`, from the Today week
 * strip, or from anything else that also happens to know about weeks. It asks
 * the Reviews kernel, with the owner's `firstDayOfWeek`, and it labels the
 * answer with `reviewPeriodLabel` — the same label the Reviews collection and
 * the Review record print. There is no second rule here to keep in step.
 *
 * ── Today LINKS; it does not mutate ─────────────────────────────────────────
 * Review creation and resumption stay the Reviews module's. The door is three
 * `<a>`s and no more:
 *
 *   - no Review for the period → `/reviews/new`, whose form already opens on
 *     THIS week (same authority, same preference), one confirm away;
 *   - one underway → `/reviews/:id/guide`, which resolves the owner's own
 *     resume position and redirects to it (REVIEW-02's semantics, untouched);
 *   - one completed → `/reviews/:id`, the canonical record, to re-read.
 *
 * ── The calm rules ──────────────────────────────────────────────────────────
 * No count, no badge, no urgency colour, no "overdue", no "missed", and no
 * streak of completed Reviews. A week the owner never reviews is an absence,
 * not a failure (ADR-110 decision 5's spirit). The completed state is a
 * statement that the loop is closed and a way back in — never a reward.
 */

import {
  currentReviewPeriod,
  reviewPeriodLabel,
  type ReviewPeriodEntry,
} from "~/kernel/reviews";
import type { DateFormat, FirstDayOfWeek } from "~/kernel/preferences";
import type { WorkspaceScope } from "~/platform/workspaces";

/**
 * What the door is offering.
 *
 * `start` — no Review covers the owner's current week (or the only one is
 * archived, which is read-only until restored; `/reviews/new` restores it).
 * `continue` — one exists and is not finished.
 * `completed` — one exists and is finished. See {@link TodayReviewDoor}.
 */
export type TodayReviewDoorState = "start" | "continue" | "completed";

export interface TodayReviewDoor {
  readonly state: TodayReviewDoorState;
  /** The owner's current weekly period, from `currentReviewPeriod`. */
  readonly periodStart: string;
  readonly periodEnd: string;
  /** The period in the owner's own date format — "24 Aug 2026–30 Aug 2026". */
  readonly periodLabel: string;
  /** The Review the door leads to, or null when there is none yet. */
  readonly reviewId: string | null;
  /** Where the door goes. Always a Reviews-module URL; never a Today action. */
  readonly href: string;
}

/** The weekly cadence is the ONE the door offers — see the module note. */
const DOOR_TYPE = "weekly" as const;

/**
 * The door's view model, from the period and whatever Review covers it.
 *
 * Pure, so the state rule is testable without a database and cannot quietly
 * become "whatever the loader happened to return".
 */
export function buildReviewDoor(input: {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dateFormat: DateFormat;
  readonly entry: ReviewPeriodEntry | null;
}): TodayReviewDoor {
  const periodLabel = reviewPeriodLabel(
    DOOR_TYPE,
    input.periodStart,
    input.periodEnd,
    input.dateFormat,
  );
  const base = {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    periodLabel,
  };
  /*
   * An ARCHIVED Review reads as absence on purpose. The guided flow refuses an
   * archived Review (it redirects to the record's Settings tab, where restore
   * lives), so "Continue" would be a door onto a dead end. `/reviews/new` is
   * not one: creation finds the archived Review for the period and RESTORES it
   * rather than making a second, so following "Start" lands the owner on the
   * Review they already have.
   */
  if (input.entry === null || input.entry.archived) {
    return { ...base, state: "start", reviewId: null, href: "/reviews/new" };
  }
  const id = encodeURIComponent(input.entry.id);
  if (input.entry.status === "completed") {
    return {
      ...base,
      state: "completed",
      reviewId: input.entry.id,
      href: `/reviews/${id}`,
    };
  }
  return {
    ...base,
    state: "continue",
    reviewId: input.entry.id,
    href: `/reviews/${id}/guide`,
  };
}

/**
 * Read the door: ONE bounded statement, whatever the workspace holds.
 *
 * `findPeriodEntry` is the same lookup `ReviewRepository.create` performs to
 * stay idempotent, so Today's "there isn't one yet" and the creation path's
 * "there already is" are the same answer to the same question.
 */
export async function readTodayReviewDoor(
  scope: WorkspaceScope,
  input: {
    readonly todayIso: string;
    readonly firstDayOfWeek: FirstDayOfWeek;
    readonly dateFormat: DateFormat;
  },
): Promise<TodayReviewDoor> {
  const period = currentReviewPeriod(
    DOOR_TYPE,
    input.todayIso,
    input.firstDayOfWeek,
  );
  const entry = await scope.reviews.findPeriodEntry(
    DOOR_TYPE,
    period.start,
    period.end,
  );
  return buildReviewDoor({
    periodStart: period.start,
    periodEnd: period.end,
    dateFormat: input.dateFormat,
    entry,
  });
}

/**
 * The door with no Review behind it — the degraded and empty-day answer.
 *
 * A Reviews read that fails must not blank the day and must not invent a
 * Review, so it degrades to the offer that is true of an unknown workspace:
 * start one. The period is still the owner's real week, because it is
 * arithmetic over a preference rather than a read.
 */
export function emptyReviewDoor(input: {
  readonly todayIso: string;
  readonly firstDayOfWeek: FirstDayOfWeek;
  readonly dateFormat: DateFormat;
}): TodayReviewDoor {
  const period = currentReviewPeriod(
    DOOR_TYPE,
    input.todayIso,
    input.firstDayOfWeek,
  );
  return buildReviewDoor({
    periodStart: period.start,
    periodEnd: period.end,
    dateFormat: input.dateFormat,
    entry: null,
  });
}
