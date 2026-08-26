/**
 * PLAN-01 — the ONE Weekly Planning read.
 *
 * Everything the planner draws, resolved in a FIXED, bounded number of queries
 * whatever the week holds. Nothing here is stored: the week is a projection over
 * Tasks (whose canonical `scheduled_date` IS the plan, ADR-030), the existing
 * external-schedule projection, the existing PROJ-02 Project health and one
 * completed Review's own written focus.
 *
 * ── The query budget, stated so it can be checked ───────────────────────────
 * A planning surface is the easiest place in a product to write an N+1, because
 * every part of it is "per day" or "per project". None of it is:
 *
 *   1. ONE preference read (timezone + first day of week + Tasks density).
 *   2. ONE schedule window read for the WHOLE week (`loadScheduleWindow` — one
 *      projection read plus two bounded Meeting reads, the same cost Today pays
 *      for one day, CAL-01 §34). Never one per day.
 *   3. ONE bounded Task read for the week's PLANNED work, over the explicit
 *      `plannedFrom`/`plannedTo` window. Never one per day — the caller buckets
 *      the single page by `scheduledDate`.
 *   4. UP TO FIVE bounded Task reads for the queue — one per band, run
 *      concurrently — OR exactly ONE when a saved view is the queue's source.
 *      Never one per candidate.
 *   5. ONE bounded Project page + ONE grouped health-facts read for that page +
 *      ONE bounded "most actionable open work" scan that yields every Project's
 *      next action. Never one per Project (the same three reads the Review's
 *      Projects step makes, for the same reason).
 *   6. ONE bounded completed-weekly-Review read for the prior focus.
 *   7. ONE bounded parent-candidate read for the row's inline Project editor.
 *   8. ONE saved-view list for the queue-source picker.
 *
 * That is a constant. Adding a day, a Task or a Project to the workspace adds no
 * query, and `test/unit/plan/plan-query-bounds.test.ts` asserts the budget.
 *
 * ── Failing soft, never blank ───────────────────────────────────────────────
 * Each supporting read fails on its own: a calendar outage, a health read or a
 * Review read that throws narrows what the page SAYS, it never takes the week
 * down. A failure is reported (`failed`) rather than drawn as an empty week,
 * because "nothing is planned" and "DalyHub could not read your plan" are
 * different sentences.
 */

import {
  entryReason,
  planAccountStatement,
  type PeriodPlanAccount,
} from "~/kernel/activity-window";
import {
  DEFAULT_APP_PREFERENCES,
  type FirstDayOfWeek,
} from "~/kernel/preferences";
import {
  PLANNING_QUEUE_BAND_LABELS,
  addPlanningDays,
  buildPlanningQueue,
  planningTotalMinutes,
  planningWeek,
  planningWeekTotals,
  resolvePlanningDay,
  type PlanningQueueBand,
  type PlanningQueueBandResult,
} from "~/kernel/planning";
import { evaluateProjectHealth } from "~/kernel/project-health";
import {
  selectPriorPeriodFocus,
  type PriorFocusCandidate,
} from "~/kernel/reviews";
import type {
  TaskBlockedSummary,
  TaskChecklistProgress,
  TaskListItem,
} from "~/kernel/tasks";
import {
  findTaskSystemView,
  toWorkspaceFilters,
  type TaskDensity,
  type TaskSavedView,
  type TaskViewConfig,
} from "~/kernel/task-views";
import {
  EMPTY_SCHEDULE_WINDOW,
  loadScheduleWindow,
  scheduleForDate,
} from "~/platform/calendar/schedule-load.server";
import { readPeriodPlanAccount } from "~/platform/activity-window/plan-account.server";
import {
  readHabitWeekSummary,
  type HabitWeekSummaryItem,
} from "~/platform/habits/habit-facts.server";
import type { WorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";
import { createOwnerHealthContext } from "~/shared/project-health";
import {
  serializeTaskListItem,
  withBlockedSummary,
  withChecklistProgress,
} from "~/shared/task-record/task-view";
import { formatPreferenceDate } from "~/kernel/preferences";

import type {
  PlanAccount,
  PlanDay,
  PlanGoalSignal,
  PlanPageData,
  PlanPriorFocus,
  PlanProjectSignal,
  PlanQueueItem,
  PlanQueueSource,
  PlanWeekTotals,
} from "./plan-contract";

/**
 * Every bound this surface applies, in one place, so "what does a heavy week
 * cost?" is answerable by reading nine numbers rather than the file.
 *
 * They are generous where losing a row would be a lie (the week's own planned
 * work, which IS the owner's commitments) and tight where truncation is calm and
 * reported (the queue, which is a suggestion).
 */
export const PLAN_LIMITS = {
  /** The week's planned Tasks. Seven days of one person's plan. */
  plannedTasks: 250,
  /** Per queue BAND, before de-duplication. */
  queueBand: 40,
  /**
   * The merged queue.
   *
   * Fifteen, and the number is a product decision rather than a technical one: a
   * rail of forty rows was measured at 6,878px against an agenda of 748px, which
   * makes the page a queue with a week attached to it. Fifteen is about as many
   * placement decisions as one sitting produces, it keeps the rail shorter than
   * the agenda beside it, and everything beyond it is REPORTED with the way to
   * reach it — narrow the queue with a saved view, which is exactly why PLAN-01
   * and SMART-01 shipped together.
   */
  queue: 15,
  /** A saved view used as the queue source reads one page of this size. */
  queueFromView: 40,
  /** Projects considered for a planning signal. */
  projects: 40,
  /** Project signals actually shown — this is a planning aid, not an audit. */
  projectSignals: 5,
  /** Goal signals shown. Quieter still. */
  goalSignals: 3,
  /** The ONE scan every Project's next action is taken from. */
  nextActionScan: 100,
  /** Completed weekly Reviews considered as the prior focus source. */
  focusCandidates: 12,
  /** Parent candidates offered by the row's inline Project editor. */
  parents: 50,
  /**
   * FOLLOW-01 — Tasks the week's ACCOUNT describes.
   *
   * A hundred is the kernel's own ceiling and it is a CEILING rather than an
   * expectation: past it the account reports `bounded` and the surface says so,
   * instead of presenting a partial week as a whole one. It is deliberately
   * lower than `plannedTasks` (250), because the account covers a week that has
   * happened rather than every row the board may draw.
   */
  accountTasks: 100,
} as const;

/* -------------------------------------------------------------------------- */
/* UX-02 — the week's four figures                                            */
/* -------------------------------------------------------------------------- */

/** The figures a week with nothing in it has. Every one of them is really zero. */
const EMPTY_TOTALS: PlanWeekTotals = {
  plannedCount: 0,
  unplacedCount: 0,
  overdueCount: 0,
  commitmentMinutes: 0,
  commitmentLabel: null,
  commitmentAccessibleLabel: null,
};

/**
 * The account a page with no scope has. `available: false` is the load-bearing
 * field: the surface then says the history could not be read rather than
 * printing a confident "nothing was planned".
 */
const EMPTY_ACCOUNT: PlanAccount = {
  headline: "The history behind this week's plan could not be read just now.",
  movement: null,
  facts: [],
  entries: [],
  empty: false,
  available: false,
  bounded: false,
};

/** The built-in queue source's id. Not a saved view — the deterministic rule. */
export const SUGGESTED_QUEUE_SOURCE_ID = "suggested";

export interface PlanLoadInput {
  readonly scope: WorkspaceScope | null;
  readonly ownerId: string;
  readonly now: Date;
  /** The requested week offset, already parsed from `?week=`. */
  readonly weekOffset: number;
  /** The requested day, from `?day=`, or null. */
  readonly requestedDay: string | null;
  /** The requested queue source, from `?queue=`, or null for the built-in rule. */
  readonly requestedQueueSource: string | null;
}

/** Run `work`, and fall back rather than fail the page. */
async function soft<T>(work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch {
    return fallback;
  }
}

export async function loadPlanPage(
  input: PlanLoadInput,
): Promise<PlanPageData> {
  const { scope, now } = input;
  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  let firstDayOfWeek: FirstDayOfWeek = DEFAULT_APP_PREFERENCES.firstDayOfWeek;
  let dateFormat = DEFAULT_APP_PREFERENCES.dateFormat;
  /*
   * The row density. `compact` is DS-04's own default for a dense task list and
   * there is no owner preference for it outside `/tasks`'s `?density=`, so the
   * planner states the default rather than inventing a second preference.
   */
  const density: TaskDensity = "compact";

  if (scope) {
    const preferences = await soft(
      scope.appPreferences.get(input.ownerId),
      DEFAULT_APP_PREFERENCES,
    );
    timezone = preferences.timezone;
    firstDayOfWeek = preferences.firstDayOfWeek;
    dateFormat = preferences.dateFormat;
  }

  const todayIso = ownerCalendarIso(now, timezone);
  const week = planningWeek({
    todayIso,
    firstDayOfWeek,
    offset: input.weekOffset,
  });
  const selectedDayIso = resolvePlanningDay(week, todayIso, input.requestedDay);

  const empty: PlanPageData = {
    week,
    days: week.days.map((day) => ({
      ...day,
      schedule: scheduleForDate(EMPTY_SCHEDULE_WINDOW, {
        dateIso: day.dateIso,
        timeZone: timezone,
        now,
        isToday: day.isToday,
      }),
      tasks: [],
      waitingCount: 0,
      completedCount: 0,
      commitmentMinutes: 0,
    })),
    todayIso,
    selectedDayIso,
    totals: EMPTY_TOTALS,
    account: EMPTY_ACCOUNT,
    queue: [],
    queueTruncated: false,
    queueSources: [suggestedSource(week.offset)],
    activeQueueSourceId: SUGGESTED_QUEUE_SOURCE_ID,
    routines: [],
    projectSignals: [],
    goalSignals: [],
    priorFocus: null,
    parents: [],
    density,
    hasCalendarSources: false,
    calendarStale: false,
    failed: scope === null,
  };
  if (scope === null) return empty;

  /*
   * The six independent reads, concurrently. Each is bounded and each fails on
   * its own — a calendar outage must not cost the owner their plan.
   */
  const [
    scheduleWindow,
    plannedPage,
    savedViews,
    parentOptions,
    focus,
    routines,
    accountRead,
  ] = await Promise.all([
    soft(
      loadScheduleWindow(scope, {
        fromDateIso: week.startIso,
        toDateIso: week.endIso,
        timeZone: timezone,
      }),
      EMPTY_SCHEDULE_WINDOW,
    ),
    soft(
      scope.tasks.listWorkspaceTasks({
        // The OPEN scope, so a Task the owner planned for Wednesday and is
        // waiting on someone for still appears on Wednesday — surfaced as
        // blocked, never hidden (PLAN-01 §B7).
        view: "open",
        filters: { plannedFrom: week.startIso, plannedTo: week.endIso },
        sort: "scheduled_date",
        limit: PLAN_LIMITS.plannedTasks,
        todayIso,
        timezone,
      }),
      { items: [] as readonly TaskListItem[], nextCursor: null },
    ),
    soft(scope.taskViews.list(input.ownerId), [] as readonly TaskSavedView[]),
    soft(
      scope.tasks.searchTaskParents({ limit: PLAN_LIMITS.parents }),
      [] as readonly Awaited<
        ReturnType<WorkspaceScope["tasks"]["searchTaskParents"]>
      >[number][],
    ),
    readPriorFocus(scope, week.startIso, (iso) =>
      formatPreferenceDate(iso, dateFormat),
    ),
    /*
     * HABITS-01 — the week's routines, as read-only CONTEXT (two bounded
     * statements). It fails soft to an empty list: a planner with no habits
     * is the ordinary case, and a habits read that throws must narrow what the
     * page says rather than cost the owner their week.
     */
    soft(
      readHabitWeekSummary(
        scope,
        { todayIso, firstDayOfWeek },
        { weekStartIso: week.startIso, weekEndIso: week.endIso },
      ),
      [] as readonly HabitWeekSummaryItem[],
    ),
    /*
     * FOLLOW-01 — the shown week's own account, in TWO bounded statements over
     * the append-only Activity stream. It is the same read the weekly Review
     * makes of the same period, through the same shared authority, so the two
     * surfaces cannot describe one week differently. It fails soft: a history
     * read that throws narrows what the page SAYS and never costs the owner
     * their plan.
     */
    readPeriodPlanAccount(scope, {
      periodStart: week.startIso,
      periodEnd: week.endIso,
      timezone,
      todayIso,
      limits: { tasks: PLAN_LIMITS.accountTasks },
    }),
  ]);

  /*
   * The week's COMPLETED work is read separately and deliberately.
   *
   * The `open` view excludes it, which is correct for "what am I committing to"
   * — but a Monday that shows three tasks when the owner finished five reads as
   * a day they under-planned. One extra bounded read, over the same window.
   */
  const completedPage = await soft(
    scope.tasks.listWorkspaceTasks({
      view: "completed",
      filters: { plannedFrom: week.startIso, plannedTo: week.endIso },
      sort: "scheduled_date",
      limit: PLAN_LIMITS.plannedTasks,
      todayIso,
      timezone,
    }),
    { items: [] as readonly TaskListItem[], nextCursor: null },
  );

  const plannedItems = [...plannedPage.items, ...completedPage.items];
  const placedIds = new Set(plannedItems.map((task) => task.id));

  const activeSource = resolveQueueSource(
    input.requestedQueueSource,
    savedViews,
  );
  const queueResult = await buildQueue({
    scope,
    week,
    todayIso,
    timezone,
    placedIds,
    source: activeSource,
  });

  const signals = await buildSignals({
    scope,
    now,
    timezone,
    todayIso,
    plannedItems,
  });

  /*
   * TASKS-13 — checklist progress for the whole page, in ONE bounded aggregate.
   *
   * Read here, at the top level, over the union of every Task the page ended up
   * with (the week's placed work AND the queue), and stamped onto the already
   * built projections. `/plan` composes its answer through several nested
   * builders, so reading progress inside any of them would mean one statement per
   * section at best and one per row at worst; one read over the union is one more
   * statement than `/plan` made before, whatever the week holds.
   *
   * The figure appears because `/plan` draws the SHARED `TaskRow`: giving the row
   * a capability and then withholding its data on one surface would make the same
   * Task read differently depending on where the owner opened it.
   */
  const pageTaskIds = [
    ...plannedItems.map((task) => task.id),
    ...queueResult.items.map((entry) => entry.task.id),
  ];
  const checklistProgress = await soft(
    scope.tasks.listChecklistProgress(pageTaskIds),
    new Map() as ReadonlyMap<string, TaskChecklistProgress>,
  );
  /*
   * TASKS-12 — blocked state for the whole page, read the same way and for the
   * same reason.
   *
   * A blocked Task may still be PLANNED: planning is intent, not proof that the
   * work can start, so `/plan` never removes or reschedules one. It shows the
   * state and leaves the owner's week exactly where they put it.
   */
  const blockedSummaries = await soft(
    scope.tasks.listBlockedSummaries(pageTaskIds),
    new Map() as ReadonlyMap<string, TaskBlockedSummary>,
  );

  const days: PlanDay[] = week.days.map((day) => {
    const tasks = plannedItems
      .filter((task) => task.scheduledDate === day.dateIso)
      .map((task) =>
        withBlockedSummary(
          withChecklistProgress(serializeTaskListItem(task), checklistProgress),
          blockedSummaries,
        ),
      );
    const schedule = scheduleForDate(scheduleWindow, {
      dateIso: day.dateIso,
      timeZone: timezone,
      now,
      isToday: day.isToday,
    });
    return {
      ...day,
      schedule,
      tasks,
      waitingCount: tasks.filter(
        (task) => task.waiting !== null && task.completedAt === null,
      ).length,
      completedCount: tasks.filter((task) => task.completedAt !== null).length,
      /*
       * Timed commitments only. An all-day item returns zero minutes from the
       * kernel helper, so it is counted in the day's `schedule.count` (it IS a
       * commitment) and contributes nothing to a figure the owner reads as "how
       * much of this day is already spoken for".
       */
      commitmentMinutes: planningTotalMinutes(schedule.timed),
    };
  });

  const totals = planningWeekTotals({
    days,
    queue: queueResult.items,
    todayIso,
  });

  return {
    week,
    days,
    todayIso,
    selectedDayIso,
    totals,
    account: serializeAccount(accountRead.account, (iso) =>
      formatPreferenceDate(iso, dateFormat),
    ),
    queue: queueResult.items.map((entry) => ({
      ...entry,
      task: withBlockedSummary(
        withChecklistProgress(entry.task, checklistProgress),
        blockedSummaries,
      ),
    })),
    queueTruncated: queueResult.truncated,
    queueSources: [
      suggestedSource(week.offset),
      ...savedViews.map((view) => savedSource(view, week.offset)),
    ],
    activeQueueSourceId: activeSource?.id ?? SUGGESTED_QUEUE_SOURCE_ID,
    routines,
    projectSignals: signals.projects,
    goalSignals: signals.goals,
    priorFocus: focus,
    parents: parentOptions.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      title: candidate.title,
      iconKey: candidate.iconKey ?? null,
      colourSlot: candidate.colourSlot ?? null,
      colourRank: candidate.colourRank ?? null,
    })),
    density,
    hasCalendarSources: scheduleWindow.hasSources,
    calendarStale: scheduleWindow.anySourceFailing,
    failed: false,
  };
}

/* -------------------------------------------------------------------------- */
/* The account (FOLLOW-01)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Turn the kernel's account into the JSON-safe shape the screen renders.
 *
 * Every word is the KERNEL's — the headline, the movement sentence, the fact
 * labels and each entry's reason — because the weekly Review renders the same
 * words from the same functions. What happens here is formatting a date with the
 * owner's own preference and dropping the fields the screen has no use for.
 */
function serializeAccount(
  account: PeriodPlanAccount,
  formatDay: (iso: string) => string,
): PlanAccount {
  const statement = planAccountStatement(account, { periodNoun: "week" });
  return {
    headline: statement.headline,
    movement: statement.movement,
    facts: statement.facts,
    entries: account.entries.map((entry) => ({
      taskId: entry.taskId,
      title: entry.title,
      outcome: entry.outcome,
      reason: entryReason(entry, formatDay, "week"),
      reschedules: entry.reschedules,
    })),
    empty: statement.empty,
    available: account.available,
    bounded: account.bounded,
  };
}

/* -------------------------------------------------------------------------- */
/* The queue                                                                   */
/* -------------------------------------------------------------------------- */

/** The queue's source: the built-in rule, or one of the owner's saved views. */
type ResolvedQueueSource =
  | { readonly id: typeof SUGGESTED_QUEUE_SOURCE_ID; readonly view: null }
  | { readonly id: string; readonly view: TaskSavedView };

function resolveQueueSource(
  requested: string | null,
  savedViews: readonly TaskSavedView[],
): ResolvedQueueSource | null {
  if (requested === null || requested === SUGGESTED_QUEUE_SOURCE_ID) {
    return { id: SUGGESTED_QUEUE_SOURCE_ID, view: null };
  }
  const own = savedViews.find((view) => view.id === requested);
  // A `?queue=` naming a view that no longer exists degrades to the built-in
  // rule rather than to an error — a deleted saved view must not break a page.
  return own
    ? { id: own.id, view: own }
    : { id: SUGGESTED_QUEUE_SOURCE_ID, view: null };
}

function suggestedSource(offset: number): PlanQueueSource {
  return {
    id: SUGGESTED_QUEUE_SOURCE_ID,
    name: "Suggested",
    description: "Overdue, lapsed, due this week, high priority and unfiled.",
    query: queryFor(offset, SUGGESTED_QUEUE_SOURCE_ID),
  };
}

function savedSource(view: TaskSavedView, offset: number): PlanQueueSource {
  return {
    id: view.id,
    name: view.name,
    description: null,
    query: queryFor(offset, view.id),
  };
}

function queryFor(offset: number, queueId: string): string {
  const params = new URLSearchParams();
  if (offset !== 0) params.set("week", String(offset));
  if (queueId !== SUGGESTED_QUEUE_SOURCE_ID) params.set("queue", queueId);
  return params.toString();
}

/**
 * The queue, from whichever source is active.
 *
 * A SAVED VIEW is run through the SAME canonical Tasks query path `/tasks` uses —
 * its stored declarative configuration, translated by the SAME
 * `toWorkspaceFilters`, passed to the SAME `listWorkspaceTasks`. That is the whole
 * point of building PLAN-01 and SMART-01 together: one filter vocabulary, two
 * consumers, and a saved view that provably returns the same Task set in both
 * (`e2e/plan-smart-lists.spec.ts`). Planning duplicates no filter logic.
 */
async function buildQueue(input: {
  readonly scope: WorkspaceScope;
  readonly week: { readonly startIso: string; readonly endIso: string };
  readonly todayIso: string;
  /** HARDEN-06C (F-05) — the zone `todayIso` was derived in travels with it. */
  readonly timezone: string;
  readonly placedIds: ReadonlySet<string>;
  readonly source: ResolvedQueueSource | null;
}): Promise<{
  readonly items: readonly PlanQueueItem[];
  readonly truncated: boolean;
}> {
  const { scope, week, todayIso, timezone, placedIds, source } = input;

  if (source !== null && source.view !== null) {
    const config: TaskViewConfig = source.view.config;
    const page = await soft(
      scope.tasks.listWorkspaceTasks({
        view: config.systemView,
        filters: toWorkspaceFilters(config),
        sort: config.sort,
        direction: config.direction,
        limit: PLAN_LIMITS.queueFromView,
        todayIso,
        timezone,
      }),
      { items: [] as readonly TaskListItem[], nextCursor: null },
    );
    // A saved view's own order is its answer; the only rule applied on top is the
    // one the queue always applies — work already placed in the week is placed.
    const items = page.items
      .filter((task) => !placedIds.has(task.id))
      .slice(0, PLAN_LIMITS.queue)
      .map((task) => ({
        task: serializeTaskListItem(task),
        // A view-sourced entry has NO band: its reason is the view the owner
        // chose. Naming one would state a rule that never ran.
        band: null,
        bandLabel: null,
      }));
    return {
      items,
      truncated:
        page.nextCursor !== null ||
        page.items.filter((task) => !placedIds.has(task.id)).length >
          PLAN_LIMITS.queue,
    };
  }

  /*
   * The five bands, concurrently. Each is ONE bounded query over the canonical
   * read model, and each is expressed in the EXISTING filter vocabulary — the
   * queue rule is a composition of the product's own scopes, not a new one.
   */
  const dayBeforeWeek = addPlanningDays(week.startIso, -1);
  const [overdue, slipped, dueInWeek, priority, inbox] = await Promise.all([
    soft(
      scope.tasks.listWorkspaceTasks({
        view: "overdue",
        sort: "due_date",
        limit: PLAN_LIMITS.queueBand,
        todayIso,
        timezone,
      }),
      { items: [] as readonly TaskListItem[], nextCursor: null },
    ),
    soft(
      scope.tasks.listWorkspaceTasks({
        view: "open",
        filters: { plannedTo: dayBeforeWeek },
        sort: "scheduled_date",
        limit: PLAN_LIMITS.queueBand,
        todayIso,
        timezone,
      }),
      { items: [] as readonly TaskListItem[], nextCursor: null },
    ),
    soft(
      scope.tasks.listWorkspaceTasks({
        view: "open",
        filters: {
          dueFrom: week.startIso,
          dueTo: week.endIso,
          plannedState: "unplanned",
        },
        sort: "due_date",
        limit: PLAN_LIMITS.queueBand,
        todayIso,
        timezone,
      }),
      { items: [] as readonly TaskListItem[], nextCursor: null },
    ),
    soft(
      scope.tasks.listWorkspaceTasks({
        view: "open",
        filters: { priorities: ["p1", "p2"], plannedState: "unplanned" },
        sort: "smart",
        limit: PLAN_LIMITS.queueBand,
        todayIso,
        timezone,
      }),
      { items: [] as readonly TaskListItem[], nextCursor: null },
    ),
    soft(
      scope.tasks.listWorkspaceTasks({
        view: "inbox",
        filters: { plannedState: "unplanned" },
        sort: "smart",
        limit: PLAN_LIMITS.queueBand,
        todayIso,
        timezone,
      }),
      { items: [] as readonly TaskListItem[], nextCursor: null },
    ),
  ]);

  const band = (
    name: PlanningQueueBand,
    page: {
      readonly items: readonly TaskListItem[];
      readonly nextCursor: string | null;
    },
  ): PlanningQueueBandResult<TaskListItem> => ({
    band: name,
    items: page.items,
    truncated: page.nextCursor !== null,
  });

  const queue = buildPlanningQueue({
    bands: [
      band("overdue", overdue),
      band("slipped", slipped),
      band("due_this_week", dueInWeek),
      band("priority", priority),
      band("inbox", inbox),
    ],
    placedIds,
    limit: PLAN_LIMITS.queue,
  });

  return {
    items: queue.entries.map((entry) => ({
      task: serializeTaskListItem(entry.task),
      band: entry.band,
      bandLabel: PLANNING_QUEUE_BAND_LABELS[entry.band],
    })),
    truncated: queue.truncated,
  };
}

/* -------------------------------------------------------------------------- */
/* Project and Goal signals                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The planning gaps, from EXISTING semantics only.
 *
 * Three reads for the whole set — a bounded Project page, one grouped health-facts
 * read for that page, and ONE scan of the most actionable open work that yields
 * every Project's next action — which is exactly what the Review's Projects step
 * does. No health formula is restated, no next action is invented, and no Project
 * costs a query of its own.
 */
async function buildSignals(input: {
  readonly scope: WorkspaceScope;
  readonly now: Date;
  readonly timezone: string;
  readonly todayIso: string;
  readonly plannedItems: readonly TaskListItem[];
}): Promise<{
  readonly projects: readonly PlanProjectSignal[];
  readonly goals: readonly PlanGoalSignal[];
}> {
  const { scope, now, timezone, todayIso, plannedItems } = input;

  const projectPage = await soft(
    scope.projects.listProjects({
      state: "open",
      // PROJ-05's ACTIVELY-WORKED status. A Planned or On-hold Project has not
      // been started or has been deliberately paused, so "nothing planned this
      // week" is not a gap in it — it is the owner's decision, already recorded.
      workflowStatus: "active",
      orderBy: "recent",
      limit: PLAN_LIMITS.projects,
    }),
    { items: [], nextCursor: null } as Awaited<
      ReturnType<WorkspaceScope["projects"]["listProjects"]>
    >,
  );
  const projects = projectPage.items;
  if (projects.length === 0) return { projects: [], goals: [] };

  const ids = projects.map((project) => project.id);
  const [healthFacts, actionable] = await Promise.all([
    soft(
      scope.projectHealth.listProjectHealthFacts(ids, todayIso),
      new Map() as Awaited<
        ReturnType<WorkspaceScope["projectHealth"]["listProjectHealthFacts"]>
      >,
    ),
    soft(
      scope.tasks.listWorkspaceTasks({
        view: "active",
        sort: "smart",
        limit: PLAN_LIMITS.nextActionScan,
        todayIso,
        timezone,
      }),
      { items: [] as readonly TaskListItem[], nextCursor: null },
    ),
  ]);

  /** The first actionable open Task per Project — the same rule the Review uses. */
  const nextActionByProject = new Map<
    string,
    { readonly id: string; readonly title: string }
  >();
  for (const task of actionable.items) {
    if (task.parent?.kind !== "project") continue;
    if (task.waiting !== null) continue;
    if (nextActionByProject.has(task.parent.id)) continue;
    nextActionByProject.set(task.parent.id, {
      id: task.id,
      title: task.title,
    });
  }

  /** Which Projects have ANY work planned inside the shown week. */
  const plannedProjectIds = new Set(
    plannedItems
      .filter((task) => task.parent?.kind === "project")
      .map((task) => task.parent!.id),
  );

  const healthContext = createOwnerHealthContext(now, timezone);
  const signals: PlanProjectSignal[] = [];
  for (const project of projects) {
    const facts = healthFacts.get(project.id);
    const health = facts ? evaluateProjectHealth(facts, healthContext) : null;
    const nextAction = nextActionByProject.get(project.id) ?? null;
    const overdueCount = health?.summary.overdueOpen ?? 0;
    const openTotal = health?.summary.openTotal ?? 0;

    /*
     * The gap, in priority order, and AT MOST ONE per Project.
     *
     * Three states, each a real planning decision rather than an observation:
     *   - no next action at all, so the Project cannot be worked on;
     *   - a next action exists and nothing from the Project is in the week;
     *   - the Project has overdue work, which is a decision either way.
     * A Project with none of those is fine, and a planning aid that listed it
     * anyway would be the audit dashboard §B8 rules out.
     */
    const gap: PlanProjectSignal["gap"] | null =
      openTotal > 0 && nextAction === null
        ? "no_next_action"
        : !plannedProjectIds.has(project.id) && nextAction !== null
          ? "nothing_planned"
          : overdueCount > 0
            ? "overdue_work"
            : null;
    if (gap === null) continue;

    signals.push({
      projectId: project.id,
      title: project.title,
      health: health?.state ?? "unknown",
      gap,
      nextAction,
      overdueCount,
    });
    if (signals.length >= PLAN_LIMITS.projectSignals) break;
  }

  /*
   * Goal context, and ONLY what the relationship model can say truthfully.
   *
   * A Goal is "supported this week" when a Task planned inside the week belongs
   * to a Project that advances it — which the Task projection already resolves,
   * so this costs no query. Goals with no planned support are listed quietly, and
   * the absence of a Goal on a Task is never treated as a fault: nothing here
   * scores a Goal, and no Task is pushed into one (§B9).
   */
  const supportedGoalIds = new Set(
    plannedItems
      .map((task) => task.parent)
      .filter((parent) => parent?.kind === "project")
      .map((parent) => parent!.id),
  );
  const goals: PlanGoalSignal[] = [];
  const seenGoals = new Set<string>();
  for (const project of projects) {
    const goal = project.goal;
    if (goal === null || seenGoals.has(goal.id)) continue;
    seenGoals.add(goal.id);
    // Supported when ANY Project advancing this Goal has planned work this week.
    const supported = projects.some(
      (candidate) =>
        candidate.goal?.id === goal.id && supportedGoalIds.has(candidate.id),
    );
    if (supported) continue;
    goals.push({ goalId: goal.id, title: goal.title });
    if (goals.length >= PLAN_LIMITS.goalSignals) break;
  }

  return { projects: signals, goals };
}

/* -------------------------------------------------------------------------- */
/* The Review handoff                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The written focus a completed weekly Review handed to the period beginning
 * `periodStart` — READ from that Review, never copied into anything.
 *
 * The same bounded read and the same pure selection rule the guided Review's own
 * focus step uses (`selectPriorPeriodFocus`), so the planner and the Review can
 * never disagree about which Review is current. Planning does not write to a
 * Review, and opening the planner changes no Review state whatsoever.
 */
async function readPriorFocus(
  scope: WorkspaceScope,
  periodStart: string,
  formatDate: (iso: string) => string,
): Promise<PlanPriorFocus | null> {
  try {
    const page = await scope.reviews.list({
      view: "completed",
      type: "weekly",
      sort: "period",
      limit: PLAN_LIMITS.focusCandidates,
    });
    const candidates: PriorFocusCandidate[] = page.items.map((review) => ({
      id: review.id,
      title: review.title,
      type: review.type,
      status: review.status,
      periodStart: review.periodStart,
      periodEnd: review.periodEnd,
      archivedAt: review.archivedAt,
      completedAt: review.completedAt,
      focusBody:
        review.sections.find(
          (section) => section.sectionId === "summary.next_focus",
        )?.body ?? "",
    }));
    const focus = selectPriorPeriodFocus(candidates, periodStart);
    if (focus === null) return null;
    return {
      reviewId: focus.reviewId,
      reviewTitle: focus.reviewTitle,
      periodLabel: `${formatDate(focus.periodStart)}–${formatDate(focus.periodEnd)}`,
      body: focus.body,
    };
  } catch {
    return null;
  }
}

/** Re-exported so the route's meta and tests need no second import path. */
export { findTaskSystemView };
