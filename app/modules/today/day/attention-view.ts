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
 * cheapest thing to fix), then waiting (it ages), then projects, then goals. The
 * whole rail is capped so it can never out-length the day beside it.
 */

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
export type AttentionKind = "inbox" | "waiting" | "project" | "goal";

/** One row in "Needs attention". Every row navigates to its subject. */
export interface AttentionItem {
  readonly id: string;
  readonly kind: AttentionKind;
  /** The row's own words — the subject, or the count when it IS the subject. */
  readonly label: string;
  /** The supporting fact that makes the row worth a row. Never a bare count. */
  readonly detail: string;
  readonly href: string;
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
    items.push({
      id: "waiting",
      kind: "waiting",
      label: "Waiting",
      detail:
        input.waiting.oldestDays === null
          ? count
          : `${count} · oldest ${ageLabel(input.waiting.oldestDays)}`,
      href: "/today/waiting",
    });
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

/** The initial drawn in a project's tinted identity chip. */
export function projectInitial(title: string): string {
  const first = title.trim().charAt(0);
  return first === "" ? "?" : first.toUpperCase();
}
