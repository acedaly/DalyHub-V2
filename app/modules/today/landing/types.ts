/**
 * TODAY-08 — the serialised loader payloads for the Today command-centre widgets.
 *
 * Plain, typed presentation shapes (no `Date`, no branded kernel types) so they
 * cross the loader → component boundary cleanly and are trivial to fixture in tests.
 * Every field is DERIVED by the loader from a real workspace-scoped read; the
 * component composes shared cards/lists over them and never re-queries.
 */

import type { EntityType } from "~/shared/entity";
import type { InsightSignal } from "./insights";

/** The Morning Brief header payload — orientation, computed server-side. */
export interface MorningBriefData {
  /** A calm greeting resolved from the owner-local hour ("Good morning"). */
  readonly greeting: string;
  /**
   * The owner's first name, so the hero greets a person rather than a session
   * ("Good morning, Aidan"). Null when the session carries no usable name — the
   * greeting then stands on its own rather than falling back to an email.
   */
  readonly ownerName: string | null;
  /** The owner's calendar date, long form ("Sunday 19 July 2026"). */
  readonly dateLong: string;
  /** One calm line describing the shape of the day. */
  readonly focusLine: string;
  /** How many tasks are committed to today. */
  readonly plannedTodayCount: number;
  /** How many task plans have slipped. */
  readonly overdueCount: number;
  /** How many unscheduled backlog tasks await triage. */
  readonly inboxCount: number;
}

/** A recently-created note for the Notes widget ("continue writing"). */
export interface RecentNoteItem {
  readonly id: string;
  readonly title: string;
  /** Human relative label ("Created 2 days ago") — resolved server-side. */
  readonly createdLabel: string;
}

/** One diary moment for the Diary widget. */
export interface DiaryMomentItem {
  readonly id: string;
  readonly title: string;
  /** A calm humanised entry-type label ("Meeting", "Journal"). */
  readonly typeLabel: string;
  /** The moment's occurred time, owner-local ("11:15"). */
  readonly timeLabel: string;
  /** Whether the moment occurred on the owner's today (drives "Today" grouping). */
  readonly isToday: boolean;
}

/** The Diary widget payload: today's moments and recent ones. */
export interface DiaryWidgetData {
  readonly today: readonly DiaryMomentItem[];
  readonly recent: readonly DiaryMomentItem[];
  /** Whether a streak nudge should be shown (no entry captured today). */
  readonly capturedToday: boolean;
}

/** One area's calm health line for the Areas widget. */
export interface AreaHealthItem {
  readonly id: string;
  readonly title: string;
  readonly goalTotal: number;
  readonly activeProjectCount: number;
  readonly openProjectCount: number;
  /** True when the area has no active project — a quiet "review" cue, never red. */
  readonly needsReview: boolean;
}

/** One goal for the Goals widget, with its derived alignment state. */
export interface GoalProgressItem {
  readonly id: string;
  readonly title: string;
  readonly areaLabel: string | null;
  /** The derived alignment label ("Recent action", "No recent action"). */
  readonly alignmentLabel: string;
  /** Whether recent action does NOT match the goal (a calm "at risk" cue). */
  readonly atRisk: boolean;
  /**
   * Contributing Projects, total and completed — the goal's completion, stated as
   * the same roll-up the Goal record shows. It comes from the contribution read the
   * alignment evaluation ALREADY performs, so surfacing it costs no extra query.
   * `projectTotal === 0` is a goal with nothing contributing yet, which is not the
   * same as 0% done and is rendered as an absence, never as an empty bar.
   */
  readonly projectTotal: number;
  readonly projectCompleted: number;
}

/** Everything the Goals widget needs. */
export interface GoalsWidgetData {
  readonly goals: readonly GoalProgressItem[];
}

/**
 * UX-01 — one of today's meetings, for the Meetings widget.
 *
 * "What is on today?" is one of the four questions Today exists to answer, and it
 * was the only one with no surface at all: Meetings had shipped for weeks with no
 * presence on the landing page. Times are resolved server-side in the meeting's own
 * timezone, so an owner travelling never reads a wrong start time.
 */
export interface TodayMeetingItem {
  readonly id: string;
  readonly title: string;
  /** The start time, owner-readable ("09:30"). */
  readonly timeLabel: string;
  /** An optional location/mode line ("Zoom", "Kitchen table"). */
  readonly context: string | null;
  /** Whether the meeting's start time has already passed. */
  readonly started: boolean;
}

/** The Meetings widget payload: today's meetings in chronological order. */
export interface MeetingsWidgetData {
  readonly meetings: readonly TodayMeetingItem[];
  /** How many of them are still to come (drives the calm summary line). */
  readonly remainingCount: number;
}

/** The Insights widget payload — calm operational signals. */
export interface InsightsWidgetData {
  readonly signals: readonly InsightSignal[];
}

/**
 * ASSET-02 — the Assets section payload. Already deduplicated against linked
 * Tasks by `dedupeAttention`, so Today never states the same job twice.
 */
export type { AssetsTodayData } from "~/kernel/assets";

/** The full landing payload the loader adds alongside the existing planning data. */
export interface TodayLandingData {
  readonly morningBrief: MorningBriefData;
  readonly notes: readonly RecentNoteItem[];
  readonly diary: DiaryWidgetData;
  readonly areas: readonly AreaHealthItem[];
  readonly goals: GoalsWidgetData;
  readonly meetings: MeetingsWidgetData;
  readonly insights: InsightsWidgetData;
  readonly assets: import("~/kernel/assets").AssetsTodayData;
}

/** The upcoming-item entity mapping is preserved for the Morning Brief calendar. */
export type { EntityType };
