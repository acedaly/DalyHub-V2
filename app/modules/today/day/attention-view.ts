/**
 * TODAY-DAY — the attention rail model (pure, React-free, testable).
 *
 * The rail holds what the DAY TIMELINE does not show. That is its whole
 * definition, and it is what stops a dashboard becoming a second copy of itself:
 * overdue tasks are actionable rows in the timeline, so they are BANNED here, no
 * matter how loudly they would read in a rail.
 *
 * Every item type is strictly conditional — it appears when its condition is true
 * and is absent otherwise. There is no "0 waiting" row, no "All projects on
 * track" row, no placeholder. When nothing at all qualifies the rail draws ONE
 * quiet line, and never that line alongside items.
 *
 * Ordering is a priority, not a ranking: the inbox first (unfiled work is the
 * cheapest thing to fix), then waiting (it ages), then asset obligations that are
 * not already represented by open Tasks, then projects, then goals. The whole rail
 * is capped so it can never out-length the day beside it.
 */

import type { SerializedNextAction } from "~/shared/task-record/NextActionLine";

import { WAITING_HREF, waitingFollowUpHref } from "../waiting-destination";

/* -------------------------------------------------------------------------- */
/* Bounds                                                                      */
/* -------------------------------------------------------------------------- */

/** At most this many rows in the rail, across every type. */
export const ATTENTION_MAX = 5;
/** At most this many projects, however many need a look. */
export const ATTENTION_PROJECTS_MAX = 2;
/** At most this many goals. */
export const ATTENTION_GOALS_MAX = 2;
/** How many projects "Continue working" shows. */
export const CONTINUE_MAX = 3;

/* -------------------------------------------------------------------------- */
/* Needs attention                                                             */
/* -------------------------------------------------------------------------- */

/** Which kind of thing a rail row is about (drives its glyph, never its text). */
export type AttentionKind = "inbox" | "waiting" | "asset" | "project" | "goal";

/** One row in "Needs attention". Every row navigates to its subject. */
export interface AttentionItem {
  readonly id: string;
  readonly kind: AttentionKind;
  /** The row's own words — the subject, or the count when it IS the subject. */
  readonly label: string;
  /** The supporting fact that makes the row worth a row. Never a bare count. */
  readonly detail: string;
  readonly href: string;
  /**
   * V2.7 RECALL-03 — one extra fact on the SAME row, with its own destination.
   *
   * The waiting row learns "1 follow-up due today" beside "3 waiting items".
   * They are two facts, so they carry two links: the row's title still opens the
   * whole waiting list, and this segment opens the waiting list FILTERED to the
   * follow-ups it counts. A count that stated a filtered number and linked to an
   * unfiltered list would be the same class of untruth as the truncated waiting
   * subtitle this item also repairs.
   *
   * Absent on every other row, and absent on the waiting row when nothing is
   * due — the rail has no "0 follow-ups" segment for the same reason it has no
   * "0 waiting" row.
   */
  readonly detailAction?: {
    readonly label: string;
    readonly href: string;
  };
}

/** The facts the rail is built from. Every one already read by the loader. */
export interface AttentionInput {
  /**
   * Open tasks with no Area or Project above them — DalyHub's inbox.
   *
   * Named "unfiled tasks" rather than "unprocessed captures" deliberately: the
   * data model has no capture-processing state, and claiming one would be the
   * product inventing a concept it does not have (see PRODUCT_DEBT DEBT-84).
   */
  readonly inboxCount: number;
  readonly waiting: {
    readonly count: number;
    /** Owner-calendar days the OLDEST waiting item has waited, or null. */
    readonly oldestDays: number | null;
    /**
     * V2.7 RECALL-03 — waiting Tasks whose follow-up date has arrived, from the
     * ONE `followUp: "due"` predicate the shared facts layer reads (DEBT-231).
     *
     * A strict SUBSET of `count`, and the same number the daily digest states.
     */
    readonly followUpDue: number;
  };
  /**
   * Asset obligations that need attention and are NOT already represented by an
   * open linked Task. The Assets kernel owns that deduplication rule.
   */
  readonly assets: {
    readonly visibleCount: number;
    readonly trackedAsTasksCount: number;
    readonly first: {
      readonly assetTitle: string;
      readonly text: string;
      readonly href: string;
    } | null;
  };
  /** Projects whose EXISTING derived health says they need a look. */
  readonly projects: readonly {
    readonly id: string;
    readonly title: string;
    /** The existing health label ("At risk", "Blocked", "Stale"). */
    readonly statusLabel: string;
  }[];
  /** Goals the EXISTING alignment evaluation flags. */
  readonly goals: readonly {
    readonly id: string;
    readonly title: string;
    /** The existing alignment label ("No recent action"). */
    readonly statusLabel: string;
  }[];
}

/** "9 days" / "1 day" — the age that makes a waiting item worth surfacing. */
function ageLabel(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

function trackedAsTasksLabel(count: number): string {
  return `${count} tracked as ${count === 1 ? "a task" : "tasks"}`;
}

/**
 * Build the rail, in priority order and within every cap.
 *
 * The waiting row states the age of the oldest item because that is the fact
 * that decides whether to chase it; a bare count is noise the owner has to open
 * something to interpret.
 */
export function buildAttention(
  input: AttentionInput,
): readonly AttentionItem[] {
  const items: AttentionItem[] = [];

  if (input.inboxCount > 0) {
    items.push({
      id: "inbox",
      kind: "inbox",
      label: "Inbox",
      detail: `${input.inboxCount} unfiled ${input.inboxCount === 1 ? "task" : "tasks"}`,
      href: "/tasks?system=inbox",
    });
  }

  if (input.waiting.count > 0) {
    const count = `${input.waiting.count} waiting ${input.waiting.count === 1 ? "item" : "items"}`;
    const due = input.waiting.followUpDue;
    items.push({
      id: "waiting",
      kind: "waiting",
      label: "Waiting",
      detail:
        input.waiting.oldestDays === null
          ? count
          : `${count} · oldest ${ageLabel(input.waiting.oldestDays)}`,
      href: WAITING_HREF,
      /*
       * V2.7 RECALL-03 — the one fact that makes waiting actionable TODAY.
       *
       * It rides the row the owner already reads rather than becoming a card or
       * a band of its own (ADR-114 decision 5: one filter dimension, one
       * attention fact, one digest line — and nothing else). The destination is
       * the waiting surface narrowed by the declarative follow-up filter, so
       * the number and the list behind it are the same population by
       * construction rather than by coincidence.
       */
      ...(due > 0
        ? {
            detailAction: {
              label: `${due} ${due === 1 ? "follow-up" : "follow-ups"} due`,
              href: waitingFollowUpHref("due"),
            },
          }
        : {}),
    });
  }

  if (input.assets.visibleCount > 0) {
    if (input.assets.visibleCount === 1 && input.assets.first !== null) {
      const tracked =
        input.assets.trackedAsTasksCount > 0
          ? ` · ${trackedAsTasksLabel(input.assets.trackedAsTasksCount)}`
          : "";
      items.push({
        id: "asset",
        kind: "asset",
        label: input.assets.first.assetTitle,
        detail: `${input.assets.first.text}${tracked}`,
        href: input.assets.first.href,
      });
    } else {
      const tracked =
        input.assets.trackedAsTasksCount > 0
          ? ` · ${trackedAsTasksLabel(input.assets.trackedAsTasksCount)}`
          : "";
      items.push({
        id: "asset",
        kind: "asset",
        label: "Assets",
        detail: `${input.assets.visibleCount} obligations need attention${tracked}`,
        href: "/assets",
      });
    }
  }

  for (const project of input.projects.slice(0, ATTENTION_PROJECTS_MAX)) {
    items.push({
      id: `project:${project.id}`,
      kind: "project",
      label: project.title,
      detail: project.statusLabel,
      href: `/projects/${encodeURIComponent(project.id)}`,
    });
  }

  for (const goal of input.goals.slice(0, ATTENTION_GOALS_MAX)) {
    items.push({
      id: `goal:${goal.id}`,
      kind: "goal",
      label: goal.title,
      detail: goal.statusLabel,
      href: `/goals/${encodeURIComponent(goal.id)}`,
    });
  }

  return items.slice(0, ATTENTION_MAX);
}

/* -------------------------------------------------------------------------- */
/* Continue working                                                            */
/* -------------------------------------------------------------------------- */

/** One project in "Continue working", ranked by REAL activity recency. */
export interface ContinueProject {
  readonly id: string;
  readonly title: string;
  readonly openCount: number;
  readonly taskTotal: number;
  readonly taskCompleted: number;
  /** The existing status word — the derived health label, or the workflow one. */
  readonly statusLabel: string;
  /** Whether that status is an attention state (drives the quiet warning tint). */
  readonly needsAttention: boolean;
  /**
   * The instant of the last MEANINGFUL activity on the project or its tasks
   * (`ProjectHealthSummary.lastActivityIso`), or null when none is recorded.
   * This is the ranking key — not `updated_at`, which a rename would move.
   */
  readonly lastActivityIso: string | null;
  /**
   * M3X-02 — the project's PERSISTED identity, carried so Today's current-focus
   * surface draws the same mark the Projects gallery does.
   *
   * Identity is recognition before reading, and a focus surface that invents its
   * own glyph would teach the owner a second appearance for one record. Both
   * values come straight off the same list item the Projects collection reads;
   * neither is derived here.
   */
  readonly iconKey: string | null;
  readonly colourRank: number;
  /** IDENTITY-01 — the Project's own chosen colour slot, which beats the rank. */
  readonly colourSlot: string | null;
  /**
   * STEER-04 (DEBT-77) — the Project's canonical NEXT ACTION, or `null`.
   *
   * DEBT-77's words: *"on a surface whose whole purpose is 'what should I do
   * now?', that is one click more than it should be."* The card carried health,
   * an open-task count and a progress meter and could not say what to actually
   * do next, because nothing in the read model held the identity of a Task.
   *
   * It is the product's ONE next-action rule (`~/kernel/tasks/next-action`),
   * evaluated by ONE bounded ranked statement over the ranked cards' ids — never
   * one query per card, and never a second notion of "next" that would let Today
   * and `/tasks` disagree.
   *
   * `null` is the honest answer for a Project whose open work is all completed,
   * cancelled, on hold, Someday, waiting or dependency-blocked. The card renders
   * LESS rather than inventing a step.
   */
  readonly nextAction: SerializedNextAction | null;
}

/**
 * Rank by what the owner actually DID, most recent first.
 *
 * "Recently updated" is not the same signal: renaming a project or flipping its
 * workflow status bumps `updated_at` without any work happening, so a project
 * touched in Settings would out-rank one whose tasks were completed this morning.
 * `lastActivityIso` comes from the shared Activity stream through the existing
 * project-health facts, so this consumes a real signal rather than inventing one.
 *
 * A project with no recorded activity sorts last (never first, which is what a
 * naive null-as-empty-string comparison would do). Only projects with open work
 * are candidates — "continue working" on a project with nothing left to do is not
 * a suggestion, and the section is absent entirely when none qualify.
 */
export function rankContinueProjects(
  projects: readonly ContinueProject[],
): readonly ContinueProject[] {
  return projects
    .filter((project) => project.openCount > 0)
    .slice()
    .sort((a, b) => {
      if (a.lastActivityIso !== b.lastActivityIso) {
        if (a.lastActivityIso === null) return 1;
        if (b.lastActivityIso === null) return -1;
        return a.lastActivityIso < b.lastActivityIso ? 1 : -1;
      }
      return a.title.localeCompare(b.title) || (a.id < b.id ? -1 : 1);
    })
    .slice(0, CONTINUE_MAX);
}
