/**
 * TODAY-DAY — assemble the Today screen's payload from REAL workspace reads.
 *
 * One place that turns workspace-scoped repository reads into the exact data the
 * day surface renders, and nothing more. Every section degrades independently: a
 * module failing empties its own section and never blanks the day (the same
 * "degrade, never blank" rule the surface has always applied).
 *
 * It consumes EXISTING derivations only — the shared project-health evaluator and
 * the shared goal-alignment evaluator — so Today can never disagree with a Project
 * record about whether that project is at risk. No new health logic, no new
 * aggregation table, no Today-only status vocabulary.
 */

import type { WorkspaceScope } from "~/platform/workspaces";
import {
  composeGoalAlignmentFacts,
  createOwnerAlignmentContext,
  evaluateGoalAlignment,
} from "~/shared/alignment";
import { ownerCalendarIso } from "~/shared/datetime";
import { evaluateProjectHealth } from "~/kernel/project-health";
import {
  createOwnerHealthContext,
  healthNeedsAttention,
} from "~/shared/project-health";
import { projectWorkflowStatusLabel } from "~/kernel/project-settings";

import {
  bucketDay,
  daysBetween,
  type DayBuckets,
  type DayTask,
} from "./day-view";
import {
  buildAttention,
  rankContinueProjects,
  type AttentionItem,
  type ContinueProject,
} from "./attention-view";

/* -------------------------------------------------------------------------- */
/* Bounds                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * The planning read's bands, restated at the call site so the surface knows the
 * bound it read against (mirrors the repository's own defaults). Scheduled work is
 * ordered scheduled-date ascending and the backlog due-date ascending, so the
 * day's own tasks — today's and everything already slipped — are always at the
 * FRONT of both bands and can never be the rows a bound drops.
 */
const PLANNING_SCHEDULED_LIMIT = 200;
const PLANNING_BACKLOG_LIMIT = 100;
const PLANNING_COMPLETED_LIMIT = 100;
/** How many waiting items are read to count them and age the oldest. */
const WAITING_LIMIT = 50;
/** How many meetings are read from each side of "now" before filtering to today. */
const MEETINGS_LIMIT = 12;
/**
 * How many active projects are read before ranking.
 *
 * The repository can only order by recency of UPDATE; the ranking this surface
 * needs is recency of ACTIVITY, which lives in the health facts. So a slightly
 * larger bounded page is read and re-ranked in memory — one query, no N+1, and a
 * project that was worked on but not renamed still surfaces.
 */
const PROJECTS_LIMIT = 12;

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** One meeting on today, resolved to the strings the timeline draws. */
export interface DayMeeting {
  readonly id: string;
  readonly title: string;
  /** The 24-hour start time in the MEETING's own timezone ("09:30"). */
  readonly timeLabel: string;
  /** Location or mode — the one supporting fact, or null. */
  readonly context: string | null;
}

/** Everything the Today screen renders. JSON-safe (no `Date`s). */
export interface TodayDayData {
  /** The owner's calendar date `YYYY-MM-DD`. */
  readonly todayIso: string;
  /** The long-form date line under the greeting. */
  readonly dateLong: string;
  /** The owner-local hour (0–23) the greeting is resolved from. */
  readonly hour: number;
  /** The owner's first name, or null. */
  readonly ownerName: string | null;
  readonly overdue: readonly DayTask[];
  readonly today: readonly DayTask[];
  readonly completedToday: readonly DayTask[];
  readonly meetings: readonly DayMeeting[];
  readonly attention: readonly AttentionItem[];
  readonly continueProjects: readonly ContinueProject[];
}

/** The empty day used when a workspace read fails — never a 500, never a blank. */
export function emptyDay(input: {
  readonly todayIso: string;
  readonly dateLong: string;
  readonly hour: number;
  readonly ownerName: string | null;
}): TodayDayData {
  return {
    ...input,
    overdue: [],
    today: [],
    completedToday: [],
    meetings: [],
    attention: [],
    continueProjects: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Section reads                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The day's tasks, plus the two counts derived from the same read.
 *
 * `inboxCount` is counted here rather than queried separately because the
 * planning bands already carry every open task's structural parent: DalyHub's
 * inbox is exactly "an open task with no Area or Project above it", the same rule
 * the `/tasks?system=inbox` view applies.
 */
async function loadTasks(
  scope: WorkspaceScope,
  todayIso: string,
  timezone: string,
): Promise<{ readonly buckets: DayBuckets; readonly inboxCount: number }> {
  const page = await scope.tasks.listPlanningTasks({
    todayIso,
    scheduledLimit: PLANNING_SCHEDULED_LIMIT,
    backlogLimit: PLANNING_BACKLOG_LIMIT,
    completedLimit: PLANNING_COMPLETED_LIMIT,
  });
  const tasks: DayTask[] = page.items.map((item) => ({
    id: item.id,
    title: item.title,
    parent: item.parent,
    dueDate: item.dueDate,
    scheduledDate: item.scheduledDate,
    completed: item.completedAt !== null,
    // Completion is a UTC instant; resolve its OWNER-calendar date so "completed
    // today" means the owner's day, not the runtime's.
    completedDate:
      item.completedAt !== null
        ? ownerCalendarIso(item.completedAt, timezone)
        : null,
  }));
  const inboxCount = tasks.filter(
    (task) => !task.completed && task.parent === null,
  ).length;
  return { buckets: bucketDay(tasks, todayIso), inboxCount };
}

/** Owner-facing labels for a meeting's mode — the same words its record uses. */
const MEETING_MODE_LABELS: Record<string, string> = {
  in_person: "In person",
  phone: "Phone",
  online: "Online",
};

/**
 * The meetings on the owner's day, in time order.
 *
 * Two bounded reads, because a day has a before and an after; both are filtered
 * to the OWNER's calendar day, and each time is formatted in the MEETING's own
 * timezone so it reads identically here and on the record. A meeting that has
 * already started is still on today — the timeline is the day, not a countdown.
 */
async function loadMeetings(
  scope: WorkspaceScope,
  todayIso: string,
  timezone: string,
): Promise<readonly DayMeeting[]> {
  const [started, upcoming] = await Promise.all([
    scope.meetings.list({ view: "recent", limit: MEETINGS_LIMIT }),
    scope.meetings.list({ view: "upcoming", limit: MEETINGS_LIMIT }),
  ]);
  const onToday = [...started.items, ...upcoming.items].filter(
    (meeting) => ownerCalendarIso(meeting.startsAt, timezone) === todayIso,
  );
  onToday.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return onToday.map((meeting) => ({
    id: meeting.id,
    title: meeting.title,
    timeLabel: new Intl.DateTimeFormat("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: meeting.timezone,
    }).format(meeting.startsAt),
    context:
      meeting.location?.trim() ||
      (meeting.mode ? (MEETING_MODE_LABELS[meeting.mode] ?? null) : null),
  }));
}

/** The waiting count and the age of the oldest — the fact that earns the row. */
async function loadWaiting(
  scope: WorkspaceScope,
  todayIso: string,
  timezone: string,
): Promise<{ readonly count: number; readonly oldestDays: number | null }> {
  const page = await scope.tasks.listWaitingTasks({
    limit: WAITING_LIMIT,
    todayIso,
  });
  let oldestDays: number | null = null;
  for (const item of page.items) {
    const days = daysBetween(
      ownerCalendarIso(item.waiting.since, timezone),
      todayIso,
    );
    if (oldestDays === null || days > oldestDays) {
      oldestDays = days;
    }
  }
  return { count: page.items.length, oldestDays };
}

/** Every active project, with its EXISTING derived health, in one N+1-free read. */
async function loadProjects(
  scope: WorkspaceScope,
  now: Date,
  todayIso: string,
  timezone: string,
): Promise<
  readonly {
    readonly project: ContinueProject;
    readonly needsAttention: boolean;
  }[]
> {
  // `state: "open"` excludes Completed and Archived; `workflowStatus: "active"`
  // further restricts to projects the owner has deliberately moved into active
  // work. Both are applied AT the database, never re-filtered in React.
  const page = await scope.projects.listProjects({
    state: "open",
    workflowStatus: "active",
    orderBy: "recent",
    limit: PROJECTS_LIMIT,
  });
  const context = createOwnerHealthContext(now, timezone);
  const facts = await scope.projectHealth.listProjectHealthFacts(
    page.items.map((item) => item.id),
    todayIso,
  );
  return page.items.map((item) => {
    const health = facts.get(item.id)
      ? evaluateProjectHealth(facts.get(item.id)!, context)
      : null;
    const needsAttention = health !== null && healthNeedsAttention(health);
    return {
      needsAttention,
      project: {
        id: item.id,
        title: item.title,
        openCount: Math.max(0, item.taskTotal - item.taskCompleted),
        taskTotal: item.taskTotal,
        taskCompleted: item.taskCompleted,
        statusLabel: health?.label ?? projectWorkflowStatusLabel("active"),
        needsAttention,
        lastActivityIso: health?.summary.lastActivityIso ?? null,
      },
    };
  });
}

/** Goals the EXISTING alignment evaluation flags as neglected. Nothing new. */
async function loadGoalsAtRisk(
  scope: WorkspaceScope,
  now: Date,
): Promise<
  readonly {
    readonly id: string;
    readonly title: string;
    readonly statusLabel: string;
  }[]
> {
  const { evaluation, recentWindowStartIso, recentBoundaryStartIso } =
    createOwnerAlignmentContext(now);
  const page = await scope.goals.listGoalsByAlignment({
    activeBoundaryIso: recentBoundaryStartIso,
  });
  // `listGoalsByAlignment` already ranks neglected goals first, so a small slice
  // is enough to find the ones at risk without reading the whole collection.
  const items = page.items.slice(0, 8);
  const ids = items.map((item) => item.id);
  const [contributions, activityFacts] = await Promise.all([
    scope.goals.listGoalProjectContributions(ids),
    scope.alignment.listGoalAlignmentFacts(ids, { recentWindowStartIso }),
  ]);
  const atRisk: { id: string; title: string; statusLabel: string }[] = [];
  for (const item of items) {
    const alignment = evaluateGoalAlignment(
      composeGoalAlignmentFacts({
        goalId: item.id,
        completedAt: item.completedAt,
        contribution: contributions.get(item.id) ?? {
          total: 0,
          completed: 0,
          incomplete: 0,
          active: 0,
          planned: 0,
          onHold: 0,
          archived: 0,
        },
        activity: activityFacts.get(item.id),
      }),
      evaluation,
    );
    if (alignment.state === "neglected") {
      atRisk.push({
        id: item.id,
        title: item.title,
        statusLabel: alignment.label,
      });
    }
  }
  return atRisk;
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */

/** A section read that degrades to a fallback rather than failing the day. */
async function safely<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

export async function loadTodayDay(
  scope: WorkspaceScope,
  facts: {
    readonly now: Date;
    readonly timezone: string;
    readonly todayIso: string;
    readonly dateLong: string;
    readonly hour: number;
    readonly ownerName: string | null;
  },
): Promise<TodayDayData> {
  const { now, timezone, todayIso } = facts;
  const [tasks, meetings, waiting, projects, goals] = await Promise.all([
    safely(() => loadTasks(scope, todayIso, timezone), {
      buckets: { overdue: [], today: [], completedToday: [] },
      inboxCount: 0,
    }),
    safely(() => loadMeetings(scope, todayIso, timezone), []),
    safely(() => loadWaiting(scope, todayIso, timezone), {
      count: 0,
      oldestDays: null,
    }),
    safely(() => loadProjects(scope, now, todayIso, timezone), []),
    safely(() => loadGoalsAtRisk(scope, now), []),
  ]);

  return {
    todayIso,
    dateLong: facts.dateLong,
    hour: facts.hour,
    ownerName: facts.ownerName,
    overdue: tasks.buckets.overdue,
    today: tasks.buckets.today,
    completedToday: tasks.buckets.completedToday,
    meetings,
    attention: buildAttention({
      inboxCount: tasks.inboxCount,
      waiting,
      // Overdue TASKS are deliberately absent: they are actionable rows in the
      // timeline, and the rail holds only what the timeline does not show.
      projects: projects
        .filter((entry) => entry.needsAttention)
        .map((entry) => ({
          id: entry.project.id,
          title: entry.project.title,
          statusLabel: entry.project.statusLabel,
        })),
      goals,
    }),
    continueProjects: rankContinueProjects(
      projects.map((entry) => entry.project),
    ),
  };
}
