/**
 * TODAY-01 — Today's demonstration data (fixtures).
 *
 * TODAY-01 is deliberately FIXTURE-BACKED: no repositories, D1, Workers, APIs, AI
 * or persistence (those arrive in later TODAY/NOTES/MEET items and the kernel that
 * already exists behind them). This module is the single, clearly-labelled seam
 * where that demo data lives, so the surface is "built for replacement": when Tasks,
 * Notes, Meetings and the Diary connect, only this file (and the mapping in the
 * route) is swapped for workspace-scoped repository reads — the composition in
 * `TodayDashboard` does not change.
 *
 * Every shape is plain, typed presentation data with a stable `id`. Times carry an
 * explicit numeric `sortKey` (minutes-since-midnight) so ordering is deterministic
 * and timezone-free, plus a human `when` label for display — the component sorts by
 * `sortKey`, it never trusts array order.
 */

import type { EntityType } from "~/shared/entity";

/** A pinned/focus task for today. Completion is local, optimistic UI only. */
export interface FocusTask {
  readonly id: string;
  readonly title: string;
  /** The owning Area/Project context line (e.g. "DalyHub V2"). */
  readonly context: string;
}

/** One upcoming, time-anchored item: a meeting, reminder or deadline. */
export interface UpcomingItem {
  readonly id: string;
  readonly kind: "meeting" | "reminder" | "deadline";
  readonly title: string;
  /** Minutes since midnight — the deterministic chronological sort key. */
  readonly sortKey: number;
  /** Human-readable time/label for display (e.g. "09:00", "Due 17:00"). */
  readonly when: string;
  /** Optional context line (people, project, …). */
  readonly context?: string;
}

/**
 * The display identity of each upcoming kind — its type label and identity glyph.
 * Defined once so the Card and the Drawer agree (a deadline reads "Deadline" in
 * both places, never "Reminder" after opening it).
 */
export const UPCOMING_KIND: Record<
  UpcomingItem["kind"],
  { readonly label: string; readonly entity: EntityType }
> = {
  meeting: { label: "Meeting", entity: "meeting" },
  reminder: { label: "Reminder", entity: "task" },
  deadline: { label: "Deadline", entity: "task" },
};

/** A recently-active project shown under "Continue working". */
export interface ActiveProject {
  readonly id: string;
  readonly title: string;
  readonly area: string;
  readonly status: "active" | "paused" | "blocked";
  /** Progress as a 0–1 fraction (rolled up from tasks in the real model). */
  readonly progress: number;
}

/** A recently-edited note. */
export interface RecentNote {
  readonly id: string;
  readonly title: string;
  readonly snippet: string;
  /** Human-readable relative edit time (e.g. "Edited 2h ago"). */
  readonly lastEdited: string;
}

/** One entry in the day's chronological timeline. */
export interface TimelineEntry {
  readonly id: string;
  /** Minutes since midnight — the deterministic chronological sort key. */
  readonly sortKey: number;
  /** Display time (e.g. "08:10"). */
  readonly time: string;
  readonly label: string;
}

/** All of Today's fixture data, grouped by section. Swap for repository reads. */
export interface TodayData {
  readonly focus: readonly FocusTask[];
  readonly upcoming: readonly UpcomingItem[];
  readonly projects: readonly ActiveProject[];
  readonly notes: readonly RecentNote[];
  readonly timeline: readonly TimelineEntry[];
}

/** Minutes-since-midnight helper, keeping the fixtures readable and honest. */
function at(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}

export const TODAY_FIXTURE: TodayData = {
  focus: [
    { id: "t-px02", title: "Finish PX-02", context: "DalyHub V2" },
    { id: "t-pr", title: "Review PR", context: "DalyHub V2" },
    { id: "t-gym", title: "Gym", context: "Health" },
  ],
  upcoming: [
    {
      id: "u-standup",
      kind: "meeting",
      title: "Design standup",
      sortKey: at(9, 0),
      when: "09:00",
      context: "with the product group",
    },
    {
      id: "u-water",
      kind: "reminder",
      title: "Water the plants",
      sortKey: at(11, 30),
      when: "11:30",
    },
    {
      id: "u-contract",
      kind: "deadline",
      title: "Send signed contract",
      sortKey: at(17, 0),
      when: "Due 17:00",
      context: "Acme relaunch",
    },
    {
      id: "u-review",
      kind: "meeting",
      title: "1:1 with Sam",
      sortKey: at(14, 30),
      when: "14:30",
      context: "Career",
    },
  ],
  projects: [
    {
      id: "p-dalyhub",
      title: "DalyHub V2",
      area: "Career",
      status: "active",
      progress: 0.62,
    },
    {
      id: "p-marathon",
      title: "Half-marathon plan",
      area: "Health",
      status: "active",
      progress: 0.35,
    },
    {
      id: "p-kitchen",
      title: "Kitchen renovation",
      area: "Home",
      status: "paused",
      progress: 0.2,
    },
  ],
  notes: [
    {
      id: "n-standup",
      title: "Standup notes",
      snippet:
        "Ship PX-02, then start the Today dashboard. Keep the frame calm and minimal.",
      lastEdited: "Edited 2h ago",
    },
    {
      id: "n-ideas",
      title: "Product ideas",
      snippet:
        "A single morning surface: focus, upcoming, continue working, recent notes.",
      lastEdited: "Edited yesterday",
    },
    {
      id: "n-reading",
      title: "Reading list",
      snippet:
        "Calm technology; design of everyday things; the humane interface.",
      lastEdited: "Edited 3 days ago",
    },
  ],
  timeline: [
    { id: "tl-coffee", sortKey: at(8, 10), time: "08:10", label: "Coffee" },
    { id: "tl-meeting", sortKey: at(9, 0), time: "09:00", label: "Meeting" },
    { id: "tl-diary", sortKey: at(11, 15), time: "11:15", label: "Diary" },
    { id: "tl-project", sortKey: at(13, 0), time: "13:00", label: "Project" },
  ],
};
