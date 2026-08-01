/**
 * TODAY-01 / TODAY-02 — the Today route.
 *
 * The registry-driven `/today` surface: the calm place the owner lands every
 * morning. It mounts ONE DS-03 DrawerProvider around the dashboard (so a Card opens
 * a record over the pane), and renders the TodayDashboard inside the PX-02
 * application frame it inherits from the app shell.
 *
 * TODAY-02 replaced the Today-focus fixture seam with REAL workspace-scoped task
 * data: the loader reads open tasks through the trusted authenticated composition
 * boundary (`resolveAuthenticatedWorkspaceScope` → the task repository), and a Card
 * completion writes through the `/today/task/:id` action so Today and the Task
 * Drawer stay consistent (a revalidation reconciles). The current date is formatted
 * server-side in the owner's calendar timezone (see `date.ts`).
 *
 * UX-01 — every section on this route now reads REAL workspace data. The last
 * TODAY-01 demonstration fixture (`TODAY_FIXTURE`) was still being serialised into
 * the response of the product's most-visited route although nothing rendered it; it
 * and the dead drawer branches it fed are gone.
 */

import { env } from "cloudflare:workers";
import { useCallback, useMemo } from "react";
import { useFetcher } from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { evaluateProjectHealth } from "~/kernel/project-health";
import { DrawerProvider } from "~/shared/drawer";
import {
  createOwnerHealthContext,
  healthNeedsAttention,
} from "~/shared/project-health";

import { loadTodayLanding } from "../landing/load";
import type { TodayLandingData } from "../landing/types";
import {
  briefFocusLine,
  dayPartForHour,
  deriveInsights,
  greetingFor,
} from "../landing/insights";

import { useCompletionFailureFeedback } from "../completion-feedback";
import { formatTodayDate, ownerCalendarIso } from "../date";
import {
  bucketPlanning,
  planningSummary,
  planTargets,
  type PlanningBuckets,
  type PlanningData,
  type PlanningTaskItem,
} from "../task/planning-view";
import {
  toWaitingCardData,
  toWaitingPreviewItem,
  type WaitingSummary,
} from "../task/waiting-view";
import { TodayDashboard, type RecentProjectItem } from "../TodayDashboard";
import { createTodayDrawerRenderer } from "../TodayDrawer";
import type { TaskActionData } from "~/shared/task-record/contract";
import type { Route } from "./+types/index";

/** How many recently-active projects "Continue working" shows. Bounded. */
const RECENT_PROJECTS_COUNT = 6;

export function meta() {
  return [
    { title: "Today · DalyHub" },
    {
      name: "description",
      content: "Your calm daily home — what deserves attention right now.",
    },
  ];
}

/** Bounded fetch backing the Today Waiting summary (count + a small preview). */
const WAITING_SUMMARY_LIMIT = 50;

/** How many waiting items the Today summary previews (the rest live in Waiting). */
const WAITING_PREVIEW_COUNT = 3;

const EMPTY_WAITING_SUMMARY: WaitingSummary = { count: 0, preview: [] };

const EMPTY_BUCKETS: PlanningBuckets = {
  overdue: [],
  today: [],
  upcoming: [],
  anytime: [],
  completedToday: [],
};

/** The owner-local hour (0–23) for the greeting — never the UTC runtime hour. */
function ownerLocalHour(now: Date, timeZone: string): number {
  const raw = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    hour12: false,
    timeZone,
  }).format(now);
  return Number.parseInt(raw, 10) % 24;
}

/**
 * The degraded landing payload used when a workspace read fails: the calm Morning
 * Brief (greeting + date) still renders, every data section is empty, and Insights
 * has nothing to say — so Today is never blank and never a 500.
 */
function emptyLanding(
  now: Date,
  dateLong: string,
  timeZone: string,
): TodayLandingData {
  const input = {
    overdueCount: 0,
    plannedTodayCount: 0,
    inboxCount: 0,
    waitingCount: 0,
    completedTodayCount: 0,
    activeProjectCount: 0,
    projectsNeedingAttentionCount: 0,
    areasNeedingReviewCount: 0,
    goalsAtRiskCount: 0,
    hasDiaryToday: false,
  };
  return {
    morningBrief: {
      greeting: greetingFor(dayPartForHour(ownerLocalHour(now, timeZone))),
      dateLong,
      focusLine: briefFocusLine(input),
      plannedTodayCount: 0,
      overdueCount: 0,
      inboxCount: 0,
    },
    notes: [],
    diary: { today: [], recent: [], capturedToday: false },
    areas: [],
    goals: { goals: [] },
    meetings: { meetings: [], remainingCount: 0 },
    insights: { signals: deriveInsights(input) },
    assets: { items: [], trackedAsTasksCount: 0, overdueCount: 0 },
  };
}

export async function loader({ context }: Route.LoaderArgs) {
  // Authentication is guaranteed by the Worker boundary; re-check (401 propagates).
  const session = requireAuthenticatedSession(context);
  const now = new Date();
  let timeZone = DEFAULT_APP_PREFERENCES.timezone;
  let date = formatTodayDate(now, timeZone);
  let todayIso = ownerCalendarIso(now, timeZone);
  let targets = planTargets(todayIso);

  // Real, workspace-scoped tasks, bucketed into the planning sections. A scope/list
  // failure degrades to empty sections so Today still renders — never a 500.
  let buckets: PlanningBuckets;
  let waiting: WaitingSummary;
  let recentProjects: RecentProjectItem[];
  let landing: TodayLandingData;
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const preferences = await scope.appPreferences.get(session.user.subject);
    timeZone = preferences.timezone;
    date = formatTodayDate(now, timeZone);
    todayIso = ownerCalendarIso(now, timeZone);
    targets = planTargets(todayIso);
    // The dedicated planning query bounds each band (scheduled work, backlog, recent
    // completions) INDEPENDENTLY, so a large unscheduled backlog can never crowd out
    // the owner's planned/overdue/today tasks or today's completions. Waiting tasks
    // are excluded — blocked work surfaces in the Waiting view, not the planning
    // sections (ADR-029), so a waiting task never silently becomes today's work.
    const page = await scope.tasks.listPlanningTasks({ todayIso });
    const items: PlanningTaskItem[] = page.items.map((item) => ({
      id: item.id,
      title: item.title,
      parent: item.parent,
      priority: item.priority,
      scheduledDate: item.scheduledDate,
      dueDate: item.dueDate,
      completed: item.completedAt !== null,
      // Completion is a UTC instant; resolve its OWNER-calendar date so "completed
      // today" matches the owner's day, not the UTC runtime's (consistent with the
      // pane-header date and overdue comparisons).
      completedDate:
        item.completedAt !== null
          ? ownerCalendarIso(item.completedAt, timeZone)
          : null,
    }));
    buckets = bucketPlanning(items, todayIso);

    const waitingPage = await scope.tasks.listWaitingTasks({
      limit: WAITING_SUMMARY_LIMIT,
      todayIso,
    });
    waiting = {
      count: waitingPage.items.length,
      preview: waitingPage.items.slice(0, WAITING_PREVIEW_COUNT).map((item) =>
        toWaitingPreviewItem(
          toWaitingCardData(
            {
              ...item,
              waiting: {
                since: item.waiting.since.toISOString(),
                subject: item.waiting.subject,
              },
            },
            now.getTime(),
            todayIso,
          ),
        ),
      ),
    };

    // "Continue working" (PROJ-05 Slice 4): the REAL Active-workflow-status open
    // projects, most-recently-updated first. `state: "open"` keeps Completed and
    // Archived projects excluded independently of workflow status; `workflowStatus:
    // "active"` further restricts to Projects the owner has deliberately moved into
    // active work via the Project Settings tab (Planned and On hold are absent). Both
    // the filter and the `orderBy: "recent"` ordering + bound are applied AT the
    // database — never a larger page re-filtered or re-sorted in React. No new store,
    // no separate Today project model, no duplicated status logic.
    const projectPage = await scope.projects.listProjects({
      state: "open",
      workflowStatus: "active",
      orderBy: "recent",
      limit: RECENT_PROJECTS_COUNT,
    });
    // The SAME shared derived health model Projects uses — never a Today-only
    // calculation. Facts for the whole bounded set are gathered in one N+1-free read.
    const healthContext = createOwnerHealthContext(now, timeZone);
    const healthFacts = await scope.projectHealth.listProjectHealthFacts(
      projectPage.items.map((project) => project.id),
      todayIso,
    );
    recentProjects = projectPage.items.map((project) => {
      const facts = healthFacts.get(project.id);
      return {
        id: project.id,
        title: project.title,
        areaLabel: project.area?.title ?? null,
        taskTotal: project.taskTotal,
        taskCompleted: project.taskCompleted,
        health: facts ? evaluateProjectHealth(facts, healthContext) : null,
      };
    });

    // The command-centre widgets over REAL cross-module data (notes, diary, areas,
    // goals-with-alignment) plus the Morning Brief and Insights derived from the
    // planning facts above. Each section degrades independently inside this reader,
    // so one module failing never blanks the rest.
    landing = await loadTodayLanding(scope, {
      now,
      timezone: timeZone,
      todayIso,
      dateLong: date,
      plannedTodayCount: buckets.today.length,
      overdueCount: buckets.overdue.length,
      inboxCount: buckets.anytime.length,
      waitingCount: waiting.count,
      completedTodayCount: buckets.completedToday.length,
      activeProjectCount: recentProjects.length,
      projectsNeedingAttentionCount: recentProjects.filter(
        (project) =>
          project.health !== null && healthNeedsAttention(project.health),
      ).length,
    });
  } catch {
    buckets = EMPTY_BUCKETS;
    waiting = EMPTY_WAITING_SUMMARY;
    recentProjects = [];
    landing = emptyLanding(now, date, timeZone);
  }

  const planning: PlanningData = {
    summary: planningSummary(buckets, waiting.count),
    targets,
    overdue: buckets.overdue,
    today: buckets.today,
    upcoming: buckets.upcoming,
    anytime: buckets.anytime,
    completedToday: buckets.completedToday,
  };

  return {
    date,
    todayIso,
    nowIso: now.toISOString(),
    waiting,
    planning,
    recentProjects,
    landing,
  };
}

export default function TodayRoute({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher<TaskActionData>();

  // A failed card completion is never silent: surface it as a calm error (the
  // optimistic override is reconciled by the ensuing revalidation).
  useCompletionFailureFeedback(fetcher.data);

  // Every real task title (across the planning sections) so a card's Drawer dialog
  // is named by its real title; the editable body is TaskDrawerContent.
  const taskTitles = useMemo(() => {
    const map = new Map<string, string>();
    const p = loaderData.planning;
    for (const bucket of [
      p.overdue,
      p.today,
      p.upcoming,
      p.anytime,
      p.completedToday,
    ]) {
      for (const item of bucket) {
        map.set(item.id, item.title);
      }
    }
    return map;
  }, [loaderData.planning]);

  const renderTodayDrawer = useMemo(
    () => createTodayDrawerRenderer(taskTitles),
    [taskTitles],
  );

  const onCompleteTask = useCallback(
    (taskId: string, complete: boolean) => {
      fetcher.submit(
        { intent: complete ? "complete" : "reopen" },
        {
          method: "post",
          action: `/tasks/${encodeURIComponent(taskId)}`,
        },
      );
    },
    [fetcher],
  );

  return (
    <DrawerProvider renderDrawer={renderTodayDrawer}>
      <TodayDashboard
        date={loaderData.date}
        todayIso={loaderData.todayIso}
        nowIso={loaderData.nowIso}
        waiting={loaderData.waiting}
        planning={loaderData.planning}
        recentProjects={loaderData.recentProjects}
        landing={loaderData.landing}
        onCompleteTask={onCompleteTask}
      />
    </DrawerProvider>
  );
}
