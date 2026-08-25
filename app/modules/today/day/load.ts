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
import {
  DEFAULT_APP_PREFERENCES,
  type FirstDayOfWeek,
} from "~/kernel/preferences";
import type {
  TaskBlockedSummary,
  TaskChecklistProgress,
  TaskParentCandidate,
} from "~/kernel/tasks";
import type { DaySchedule } from "~/kernel/calendar";
import type { WorkspaceScope } from "~/platform/workspaces";
import { createOwnerAlignmentContext } from "~/shared/alignment";
import { readHabitPage } from "~/platform/habits/habit-facts.server";
import type { SerializedHabit } from "~/shared/habits";
import { ownerCalendarIso } from "~/shared/datetime";
import type { TaskParentOption } from "~/shared/task-record/TaskRowFields";

import {
  bucketDay,
  toDayTask,
  type DayBuckets,
  type DayTask,
} from "./day-view";
/**
 * NOTIFY-01 — the attention facts moved OUT of this file.
 *
 * The Inbox count, the waiting age, the Asset obligations, the active projects'
 * health and the neglected goals are now read by the shared facts layer, because
 * the morning digest is built from exactly the same facts and two readers is how
 * a page and a notification come to state two different numbers for one thing.
 * Nothing about what they read or how they degrade changed in the move; only
 * where they live did.
 */
import {
  readActiveProjects,
  readAssetAttention,
  readGoalsAtRisk,
  readInboxCount,
  readWaiting,
  type AttentionProjectFacts,
} from "~/platform/attention/attention-facts.server";
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
import {
  loadScheduleWindow,
  scheduleForDate,
} from "~/platform/calendar/schedule-load.server";
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

/**
 * TODAY-TASK-01 — how many candidate parents the plan's inline project editor
 * offers, before the searchable escape hatch takes over.
 *
 * Fifty, which is `/tasks`'s own `PARENT_OPTION_LIMIT` restated at this call site
 * rather than a second number: the two surfaces open the SAME menu over the SAME
 * bounded set, and a workspace whose Areas and Projects outrun it reaches the
 * rest through the SAME searchable picker (`task-move:`), never through an
 * unbounded read and never through a query per row.
 */
const PARENT_OPTION_LIMIT = 50;

/**
 * HABITS-01 — how many active Habits Today's routine section reads.
 *
 * Twenty, and the bound is about the SURFACE rather than about the data: Today's
 * first job is the day's work, so the routine section is a short band under it,
 * not a second collection. A workspace with more than twenty active habits has
 * `/habits` one tap away, and the section says so rather than growing. The read
 * itself is two bounded statements whatever this number is.
 */
const HABIT_LIMIT = 20;

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
  /**
   * TODAY-TASK-01 — the bounded parent CANDIDATES the shared row's inline
   * project editor offers.
   *
   * The shared `TaskRow` requires them, and supplying them is most of what
   * DEBT-143 was open for: without a bounded set the alternatives were a query
   * per row or a read of the whole workspace, and both were refused. This is ONE
   * bounded, workspace-scoped, indexed search (`searchTaskParents`) — the exact
   * call `/tasks`'s loader makes, not a Today-only repository — so the two
   * surfaces offer the same menu over the same set.
   */
  readonly parents: readonly TaskParentOption[];
  /**
   * HABITS-01 — the active Habits relevant to today, already serialised.
   *
   * "Relevant" is decided by the SCHEDULE, not by a flag: a day-based Habit
   * appears on the days it asks for, and a count-based one appears while its
   * week is unmet (or once it has been done today, so the tick can be undone).
   * A Habit that is not relevant today is simply absent — Today never lists a
   * behaviour it is not asking about, and never describes an unscheduled day as
   * a miss.
   *
   * A Habit is NOT a Task. Nothing in this array reaches the day's task bands,
   * the overdue count, the attention rail or any Project's progress.
   */
  readonly habits: readonly SerializedHabit[];
  /** Whether more active Habits exist than this section shows. */
  readonly habitsTruncated: boolean;
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
  /**
   * The owner's week start (DEBT-152 / DEBT-154). Optional here and ONLY here:
   * this path exists because reading the preferences themselves failed, so the
   * product default is the only honest answer — and it is the same default the
   * preference itself carries, so a Monday-start owner sees no difference.
   */
  readonly firstDayOfWeek?: FirstDayOfWeek;
}): TodayDayData {
  const { firstDayOfWeek = DEFAULT_APP_PREFERENCES.firstDayOfWeek, ...rest } =
    input;
  return {
    ...rest,
    overdue: [],
    today: [],
    completedToday: [],
    meetings: [],
    schedule: { dateIso: input.todayIso, allDay: [], timed: [], count: 0 },
    // The strip still draws: a week with nothing in it is a real week, and a
    // Schedule panel that loses its own navigation because a read failed is a
    // worse degradation than an empty timeline.
    week: emptyWeek(input.todayIso, firstDayOfWeek),
    scheduleHasSources: false,
    scheduleStale: false,
    attention: [],
    continueProjects: [],
    goals: [],
    activityTrend: null,
    reflection: null,
    parents: [],
    habits: [],
    habitsTruncated: false,
  };
}

/** The week's seven days with no items on any of them. */
function emptyWeek(
  todayIso: string,
  firstDayOfWeek: FirstDayOfWeek,
): readonly TodayWeekDay[] {
  const schedules = new Map<string, DaySchedule>(
    weekDatesFor(todayIso, firstDayOfWeek).map((dateIso) => [
      dateIso,
      { dateIso, allDay: [], timed: [], count: 0 },
    ]),
  );
  return buildWeekStrip({
    todayIso,
    firstDayOfWeek,
    itemCountFor: () => 0,
  }).map((day) => ({
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
  /*
   * TASKS-13 — ONE bounded aggregate for the whole day, never one per row. Today
   * draws the shared `TaskRow`, so it shows the same "2 of 4" the Tasks
   * collection does: the row gained a capability, not a per-surface variant.
   *
   * Guarded on its OWN, inside a section that is already guarded, because the two
   * failures are not the same size. The day's work is the reason this surface
   * exists; a step count beside it is decoration. A progress read that fails must
   * cost the decoration, never the day — which is exactly what it did cost before
   * this guard existed.
   */
  const ids = page.items.map((item) => item.id);
  const progress = await safely(
    () => scope.tasks.listChecklistProgress(ids),
    new Map() as ReadonlyMap<string, TaskChecklistProgress>,
  );
  /*
   * TASKS-12 — ONE bounded aggregate for the whole day's blocked state, guarded
   * on its own for the same reason the progress read is: the day's work is why
   * this surface exists, and a dependency read that fails must cost the "Blocked
   * by …" line rather than the day. A blocked Task then simply reads as it did
   * before TASKS-12, which is a truthful degradation rather than a wrong one.
   */
  const blocked = await safely(
    () => scope.tasks.listBlockedSummaries(ids),
    new Map() as ReadonlyMap<string, TaskBlockedSummary>,
  );
  const tasks: DayTask[] = page.items.map((item) =>
    // Completion is a UTC instant; resolve its OWNER-calendar date so "completed
    // today" means the owner's day, not the runtime's.
    toDayTask(
      item,
      item.completedAt !== null
        ? ownerCalendarIso(item.completedAt, timezone)
        : null,
      progress.get(item.id),
      blocked.get(item.id),
    ),
  );
  return bucketDay(tasks, todayIso);
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
  firstDayOfWeek: FirstDayOfWeek,
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
  const dates = weekDatesFor(todayIso, firstDayOfWeek);
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
    firstDayOfWeek,
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
    readonly firstDayOfWeek: FirstDayOfWeek;
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
    parentOptions,
    habitPage,
  ] = await Promise.all([
    safely(() => loadTasks(scope, todayIso, timezone), {
      overdue: [],
      dueToday: [],
      plannedToday: [],
      today: [],
      completedToday: [],
    }),
    safely(() => readInboxCount(scope, todayIso, timezone), 0),
    safely(() => readAssetAttention(scope, todayIso), {
      items: [],
      trackedAsTasksCount: 0,
      overdueCount: 0,
    }),
    safely(
      () => loadSchedule(scope, now, todayIso, timezone, facts.firstDayOfWeek),
      {
        schedule: { dateIso: todayIso, allDay: [], timed: [], count: 0 },
        week: emptyWeek(todayIso, facts.firstDayOfWeek),
        meetings: [] as readonly DayMeeting[],
        hasSources: false,
        stale: false,
      },
    ),
    safely(() => readWaiting(scope, todayIso, timezone), {
      count: 0,
      oldestDays: null,
    }),
    safely(
      () => readActiveProjects(scope, now, todayIso, timezone),
      [] as readonly AttentionProjectFacts[],
    ),
    safely(() => readGoalsAtRisk(scope, now, timezone), []),
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
    // The inline project editor's bounded option set. It degrades to an empty
    // list rather than failing the day: with no candidates the menu offers only
    // "Move to Inbox" and the searchable picker, which is a narrower control —
    // never a broken one.
    safely(
      () => scope.tasks.searchTaskParents({ limit: PARENT_OPTION_LIMIT }),
      [] as readonly TaskParentCandidate[],
    ),
    /*
     * HABITS-01 — the routine band. TWO bounded statements (the Habit page, then
     * every completion in the owner's calendar week for that whole page), which
     * is the same cost whether the workspace holds one Habit or twenty. It
     * degrades to an empty band rather than failing the day, exactly as every
     * other section here does.
     */
    safely(
      () =>
        readHabitPage(
          scope,
          { todayIso, firstDayOfWeek: facts.firstDayOfWeek },
          { status: "active", limit: HABIT_LIMIT },
        ),
      {
        items: [] as readonly SerializedHabit[],
        nextCursor: null,
        hasMore: false,
      },
    ),
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
        .filter((project) => project.needsAttention)
        .map((project) => ({
          id: project.id,
          title: project.title,
          statusLabel: project.statusLabel,
        })),
      goals,
    }),
    continueProjects: rankContinueProjects(projects),
    goals: measurableGoals,
    activityTrend,
    reflection,
    /*
     * Only the Habits today is actually asking about. `today.checkable` is the
     * kernel's own answer — a scheduled day, a count-based Habit whose week is
     * not yet met, or a day already done (so the tick can be undone) — so this
     * filter states the rule once and Today never re-derives it.
     */
    habits: habitPage.items.filter((habit) => habit.today.checkable),
    habitsTruncated: habitPage.hasMore,
    parents: parentOptions.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      title: candidate.title,
      iconKey: candidate.iconKey ?? null,
      colourSlot: candidate.colourSlot ?? null,
      colourRank: candidate.colourRank ?? null,
    })),
  };
}
