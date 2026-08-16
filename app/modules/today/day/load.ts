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

import { addDaysToIsoDate } from "~/kernel/alignment";
import type { DaySchedule } from "~/kernel/calendar";
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
  dedupeAttention,
  evaluateObligation,
  type AssetsTodayData,
} from "~/kernel/assets";
import {
  buildAttention,
  rankContinueProjects,
  type AttentionItem,
  type ContinueProject,
} from "./attention-view";
import {
  loadActivityTrend,
  loadTodayGoals,
  type TodayActivityTrend,
  type TodayGoal,
} from "./goal-progress";
import { loadScheduleWindow, scheduleForDate } from "./schedule-load";
import { reflectionExcerpt, type TodayReflection } from "./reflection";
import { buildWeekStrip, weekDatesFor, type WeekStripDay } from "./week-strip";
import { ownerLocalToUtc } from "~/shared/datetime";
import { createDiaryEntryTypeRegistry } from "~/kernel/diary";

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

/**
 * One DalyHub Meeting on today, reduced to what the day's FIGURES need.
 *
 * CAL-01 note: this is no longer the Schedule panel's model — that is the
 * unified `DaySchedule` below, which holds external calendar occurrences and
 * Meetings in one chronology. What survives here is the input to the "Meetings
 * today" figure and to `nextUp`, and it is now DERIVED from the same schedule
 * read rather than from a second pair of Meeting queries.
 */
export interface DayMeeting {
  readonly id: string;
  readonly title: string;
  /** The start time in the OWNER's timezone ("09:30"), or "All day". */
  readonly timeLabel: string;
  /** Location or mode — the one supporting fact, or null. */
  readonly context: string | null;
  /**
   * Whether the meeting has NOT started yet, decided against the request instant
   * on the SERVER — the owner's clock is not the authority on a page rendered
   * before it was read.
   */
  readonly upcoming: boolean;
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
  /**
   * The Focus bands, as `bucketDay` resolved them on the server.
   *
   * `overdue` and `today` are both carried (rather than one flat list) because
   * the screen re-runs the SAME pure bucketing over its optimistic completion
   * overrides — passing the two bands back in is what lets it do that without a
   * second definition of the day.
   */
  readonly overdue: readonly DayTask[];
  readonly today: readonly DayTask[];
  readonly completedToday: readonly DayTask[];
  readonly meetings: readonly DayMeeting[];
  /**
   * CAL-01 — the day's unified Schedule: every occurrence from every enabled
   * external calendar source, plus the DalyHub Meetings no occurrence already
   * represents, in one chronology.
   *
   * Today consumes a clean schedule read model. It knows nothing about ICS,
   * providers, recurrence or synchronisation, and no feed is fetched to produce
   * it — this is a local read of an already-synchronised projection.
   */
  readonly schedule: DaySchedule;
  /**
   * TODAY-11 — the whole calendar WEEK the day sits in, as the strip and its
   * timeline draw it.
   *
   * Seven days from ONE schedule read (`loadScheduleWindow` takes a range and
   * costs the same number of queries for seven days as for one — CAL-01 §34), so
   * selecting a different day on the strip costs no request and reaches no date
   * the loader did not fetch. `schedule` above is still TODAY's, because
   * everything else on the page that asks about the schedule is asking about
   * today.
   */
  readonly week: readonly TodayWeekDay[];
  /**
   * Whether ANY calendar source is configured and enabled. "Nothing is on today"
   * and "no calendar is connected" are different states and get different
   * sentences.
   */
  readonly scheduleHasSources: boolean;
  /** Whether at least one enabled source's last refresh failed. */
  readonly scheduleStale: boolean;
  readonly attention: readonly AttentionItem[];
  readonly continueProjects: readonly ContinueProject[];
  /** GOAL-02 — the measurable Goals worth a look today (up to four). */
  readonly goals: readonly TodayGoal[];
  /**
   * GOAL-02 — the 7-day created-vs-completed workload trend, or `null` when the
   * week is genuinely empty. `null` is a real state, not a failure: an empty
   * chart says less than no chart.
   */
  readonly activityTrend: TodayActivityTrend | null;
  /**
   * TODAY-11 — today's Diary entry, when there is one, for the reflection card.
   *
   * `null` is the ordinary morning state, not a failure: the card then draws the
   * invitation instead of an excerpt. Never a judgement about the entry, and
   * never an AI summary of it — see `reflection.ts`.
   */
  readonly reflection: TodayReflection | null;
}

/** One day of the Schedule panel's week: the strip's facts and that day's items. */
export interface TodayWeekDay extends WeekStripDay {
  readonly schedule: DaySchedule;
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
    schedule: { dateIso: input.todayIso, allDay: [], timed: [], count: 0 },
    // The strip still draws: a week with nothing in it is a real week, and a
    // Schedule panel that loses its own navigation because a read failed is a
    // worse degradation than an empty timeline.
    week: emptyWeek(input.todayIso),
    scheduleHasSources: false,
    scheduleStale: false,
    attention: [],
    continueProjects: [],
    goals: [],
    activityTrend: null,
    reflection: null,
  };
}

/** The week's seven days with no items on any of them. */
function emptyWeek(todayIso: string): readonly TodayWeekDay[] {
  const schedules = new Map<string, DaySchedule>(
    weekDatesFor(todayIso).map((dateIso) => [
      dateIso,
      { dateIso, allDay: [], timed: [], count: 0 },
    ]),
  );
  return buildWeekStrip({ todayIso, itemCountFor: () => 0 }).map((day) => ({
    ...day,
    schedule: schedules.get(day.dateIso)!,
  }));
}

/* -------------------------------------------------------------------------- */
/* Section reads                                                               */
/* -------------------------------------------------------------------------- */

/** The day's tasks. */
async function loadTasks(
  scope: WorkspaceScope,
  todayIso: string,
  timezone: string,
): Promise<DayBuckets> {
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
    // TODAY-10 — carried from the SAME planning row the rest of the day is built
    // from, so Focus can order by it without a second read or an N+1.
    priority: item.priority,
    completed: item.completedAt !== null,
    // Completion is a UTC instant; resolve its OWNER-calendar date so "completed
    // today" means the owner's day, not the runtime's.
    completedDate:
      item.completedAt !== null
        ? ownerCalendarIso(item.completedAt, timezone)
        : null,
  }));
  return bucketDay(tasks, todayIso);
}

/**
 * The authoritative Inbox count. It uses the canonical `inbox` system view rather
 * than Today's bounded planning read, so Today and `/tasks?system=inbox` cannot
 * disagree when the workspace holds more unfiled work than the planning backlog
 * limit returns.
 */
async function loadInboxCount(
  scope: WorkspaceScope,
  todayIso: string,
): Promise<number> {
  const grouped = await scope.tasks.listWorkspaceTaskGroups({
    dimension: "parent",
    view: "inbox",
    todayIso,
    bucketLimit: 1,
  });
  return grouped.groups.reduce((total, group) => total + group.count, 0);
}

/** Asset obligations that need attention and are not already represented by Tasks. */
async function loadAssetAttention(
  scope: WorkspaceScope,
  todayIso: string,
): Promise<AssetsTodayData> {
  const items = await scope.assetHistory.listAttention({ today: todayIso });
  return dedupeAttention(
    items.map((item) => {
      const evaluation = evaluateObligation(
        item.obligation,
        todayIso,
        item.reading,
      );
      return {
        obligationId: item.obligation.id,
        assetId: item.assetId,
        assetTitle: item.assetTitle,
        assetType: item.assetType,
        title: item.obligation.title,
        category: item.obligation.category,
        state: evaluation.state,
        text: evaluation.text,
        hasOpenTask: item.hasOpenTask,
      };
    }),
  );
}

/**
 * CAL-01 — the day's unified Schedule, and the Meeting figures derived from it.
 *
 * ONE read, where there used to be two Meeting queries. `loadScheduleWindow`
 * already reads today's Meetings (to merge them into the chronology), so the
 * "Meetings today" figure and `nextUp`'s input are DERIVED from the same result
 * rather than fetched again — which also means the figure and the panel can
 * never disagree about what is on.
 *
 * The figure counts DalyHub Meetings, exactly as it always has. An imported
 * calendar event is NOT a Meeting and is not counted; an imported event the
 * owner has explicitly turned into a Meeting is, because by then it is one.
 */
async function loadSchedule(
  scope: WorkspaceScope,
  now: Date,
  todayIso: string,
  timezone: string,
): Promise<{
  readonly schedule: DaySchedule;
  readonly week: readonly TodayWeekDay[];
  readonly meetings: readonly DayMeeting[];
  readonly hasSources: boolean;
  readonly stale: boolean;
}> {
  /*
   * TODAY-11 — the window is the owner's calendar WEEK, not the single day.
   *
   * The Schedule panel now carries a seven-day strip, and a strip whose dots and
   * whose selected-day timeline came from seven separate reads would be exactly
   * the per-row read this pass is told not to write. `loadScheduleWindow` takes a
   * range and issues the same four bounded statements whatever its size (one
   * occurrence projection read, one source list, two Meeting reads), so the week
   * costs what the day cost — the rows returned grow, the queries do not.
   */
  const dates = weekDatesFor(todayIso);
  const data = await loadScheduleWindow(scope, {
    fromDateIso: dates[0]!,
    toDateIso: dates[dates.length - 1]!,
    timeZone: timezone,
  });
  const schedules = new Map<string, DaySchedule>(
    dates.map((dateIso) => [
      dateIso,
      scheduleForDate(data, {
        dateIso,
        timeZone: timezone,
        now,
        // "Now" and "Next" are only true of the owner's actual today; every
        // other day of the strip is drawn without them.
        isToday: dateIso === todayIso,
      }),
    ]),
  );
  const week: readonly TodayWeekDay[] = buildWeekStrip({
    todayIso,
    itemCountFor: (dateIso) => schedules.get(dateIso)?.count ?? 0,
  }).map((day) => ({ ...day, schedule: schedules.get(day.dateIso)! }));

  const schedule = schedules.get(todayIso)!;
  const meetings: DayMeeting[] = [...schedule.allDay, ...schedule.timed]
    .filter((entry) => entry.meetingId !== null)
    .map((entry) => ({
      id: entry.meetingId!,
      title: entry.title,
      timeLabel: entry.timeLabel ?? "All day",
      context: entry.location,
      upcoming: Date.parse(entry.startsAtIso) > now.getTime(),
    }));
  return {
    schedule,
    week,
    meetings,
    hasSources: data.hasSources,
    stale: data.anySourceFailing,
  };
}

/**
 * TODAY-11 — today's Diary entry, for the reflection card.
 *
 * ONE bounded read: the newest entry whose `occurredAt` falls inside the owner's
 * calendar day, limit one. It uses the Diary module's own canonical Timeline
 * read with its existing occurred-at range filter — no new repository method, no
 * Today-only Diary query, and no second definition of "today" (the bounds are
 * the owner's midnights, resolved through the same `ownerLocalToUtc` the trend's
 * day boundaries use).
 *
 * A spring-forward midnight that does not exist yields `null` from the
 * conversion; the card then draws its invitation rather than a guess.
 */
async function loadReflection(
  scope: WorkspaceScope,
  todayIso: string,
  timezone: string,
): Promise<TodayReflection | null> {
  const from = ownerLocalToUtc(`${todayIso}T00:00`, timezone);
  const to = ownerLocalToUtc(
    `${addDaysToIsoDate(todayIso, 1)}T00:00`,
    timezone,
  );
  if (from === null || to === null) return null;
  const page = await scope.diary.list({
    limit: 1,
    order: "newest",
    occurredFrom: from,
    // The upper bound is INCLUSIVE, so it is pulled back off the next day's
    // midnight — an entry recorded at exactly tomorrow's 00:00 is tomorrow's.
    occurredTo: new Date(to.getTime() - 1),
  });
  const entry = page.items[0];
  if (entry === undefined) return null;
  const descriptor = createDiaryEntryTypeRegistry().get(entry.entryType);
  return {
    id: entry.id,
    title: entry.title,
    excerpt: reflectionExcerpt(entry.body),
    entryTypeLabel: descriptor?.label ?? null,
  };
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
        iconKey: item.iconKey,
        colourRank: item.colourRank,
        colourSlot: item.colourSlot,
      },
    };
  });
}

/** Goals the EXISTING alignment evaluation flags as neglected. Nothing new. */
async function loadGoalsAtRisk(
  scope: WorkspaceScope,
  now: Date,
  timezone: string,
): Promise<
  readonly {
    readonly id: string;
    readonly title: string;
    readonly statusLabel: string;
  }[]
> {
  const { evaluation, recentWindowStartIso, recentBoundaryStartIso } =
    createOwnerAlignmentContext(now, timezone);
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
  // GOAL-02 — the owner-calendar alignment boundary, resolved once and shared by
  // the at-risk read and the Goal Progress read, so the two cannot disagree about
  // which Goals are recent.
  const { recentBoundaryStartIso } = createOwnerAlignmentContext(now, timezone);

  const [
    tasks,
    inboxCount,
    assetAttention,
    scheduleResult,
    waiting,
    projects,
    goals,
    measurableGoals,
    activityTrend,
    reflection,
  ] = await Promise.all([
    safely(() => loadTasks(scope, todayIso, timezone), {
      overdue: [],
      dueToday: [],
      plannedToday: [],
      today: [],
      completedToday: [],
    }),
    safely(() => loadInboxCount(scope, todayIso), 0),
    safely(() => loadAssetAttention(scope, todayIso), {
      items: [],
      trackedAsTasksCount: 0,
      overdueCount: 0,
    }),
    safely(() => loadSchedule(scope, now, todayIso, timezone), {
      schedule: { dateIso: todayIso, allDay: [], timed: [], count: 0 },
      week: emptyWeek(todayIso),
      meetings: [] as readonly DayMeeting[],
      hasSources: false,
      stale: false,
    }),
    safely(() => loadWaiting(scope, todayIso, timezone), {
      count: 0,
      oldestDays: null,
    }),
    safely(() => loadProjects(scope, now, todayIso, timezone), []),
    safely(() => loadGoalsAtRisk(scope, now, timezone), []),
    safely(
      () =>
        loadTodayGoals(scope, {
          now,
          timezone,
          todayIso,
          recentBoundaryStartIso,
        }),
      [],
    ),
    safely(() => loadActivityTrend(scope, { timezone, todayIso }), null),
    safely(() => loadReflection(scope, todayIso, timezone), null),
  ]);

  return {
    todayIso,
    dateLong: facts.dateLong,
    hour: facts.hour,
    ownerName: facts.ownerName,
    overdue: tasks.overdue,
    today: tasks.today,
    completedToday: tasks.completedToday,
    meetings: scheduleResult.meetings,
    schedule: scheduleResult.schedule,
    week: scheduleResult.week,
    scheduleHasSources: scheduleResult.hasSources,
    scheduleStale: scheduleResult.stale,
    attention: buildAttention({
      inboxCount,
      waiting,
      assets: {
        visibleCount: assetAttention.items.length,
        trackedAsTasksCount: assetAttention.trackedAsTasksCount,
        first:
          assetAttention.items[0] === undefined
            ? null
            : {
                assetTitle: assetAttention.items[0].assetTitle,
                text: assetAttention.items[0].text,
                href: assetAttention.items[0].href,
              },
      },
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
    goals: measurableGoals,
    activityTrend,
    reflection,
  };
}
