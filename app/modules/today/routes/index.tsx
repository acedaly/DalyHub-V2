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
 * Drawer stay consistent (a revalidation reconciles). The other sections (upcoming,
 * projects, notes, timeline) remain fixture-backed until their modules connect —
 * only the data source changed, not the composition. The current date is formatted
 * server-side in the owner's calendar timezone (see `date.ts`).
 */

import { env } from "cloudflare:workers";
import { useCallback, useMemo } from "react";
import { useFetcher } from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { DrawerProvider } from "~/shared/drawer";

import { useCompletionFailureFeedback } from "../completion-feedback";
import { formatTodayDate, ownerCalendarIso } from "../date";
import { TODAY_FIXTURE } from "../fixtures";
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
import { TodayDashboard } from "../TodayDashboard";
import { createTodayDrawerRenderer } from "../TodayDrawer";
import type { TaskActionData } from "./task-detail";
import type { Route } from "./+types/index";

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

export async function loader({ context }: Route.LoaderArgs) {
  // Authentication is guaranteed by the Worker boundary; re-check (401 propagates).
  const session = requireAuthenticatedSession(context);
  const now = new Date();
  const date = formatTodayDate(now);
  const todayIso = ownerCalendarIso(now);
  const targets = planTargets(todayIso);

  // Real, workspace-scoped tasks, bucketed into the planning sections. A scope/list
  // failure degrades to empty sections so Today still renders — never a 500.
  let buckets: PlanningBuckets;
  let waiting: WaitingSummary;
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
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
      scheduledDate: item.scheduledDate,
      dueDate: item.dueDate,
      completed: item.completedAt !== null,
      // Completion is a UTC instant; resolve its OWNER-calendar date so "completed
      // today" matches the owner's day, not the UTC runtime's (consistent with the
      // pane-header date and overdue comparisons).
      completedDate:
        item.completedAt !== null ? ownerCalendarIso(item.completedAt) : null,
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
  } catch {
    buckets = EMPTY_BUCKETS;
    waiting = EMPTY_WAITING_SUMMARY;
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

  return { date, todayIso, data: TODAY_FIXTURE, waiting, planning };
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
    () => createTodayDrawerRenderer(loaderData.data, taskTitles),
    [loaderData.data, taskTitles],
  );

  const onCompleteTask = useCallback(
    (taskId: string, complete: boolean) => {
      fetcher.submit(
        { intent: complete ? "complete" : "reopen" },
        {
          method: "post",
          action: `/today/task/${encodeURIComponent(taskId)}`,
        },
      );
    },
    [fetcher],
  );

  return (
    <DrawerProvider renderDrawer={renderTodayDrawer}>
      <TodayDashboard
        data={loaderData.data}
        date={loaderData.date}
        todayIso={loaderData.todayIso}
        waiting={loaderData.waiting}
        planning={loaderData.planning}
        onCompleteTask={onCompleteTask}
      />
    </DrawerProvider>
  );
}
