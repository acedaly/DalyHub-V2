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
import type { FocusTask } from "../fixtures";
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

/** How many open tasks the Today focus section loads. Bounded — never unbounded. */
const FOCUS_LIMIT = 25;

/** Bounded fetch backing the Today Waiting summary (count + a small preview). */
const WAITING_SUMMARY_LIMIT = 50;

/** How many waiting items the Today summary previews (the rest live in Waiting). */
const WAITING_PREVIEW_COUNT = 3;

const EMPTY_WAITING_SUMMARY: WaitingSummary = { count: 0, preview: [] };

export async function loader({ context }: Route.LoaderArgs) {
  // Authentication is guaranteed by the Worker boundary; re-check (401 propagates).
  const session = requireAuthenticatedSession(context);
  const now = new Date();
  const date = formatTodayDate(now);
  const todayIso = ownerCalendarIso(now);

  // Real, workspace-scoped focus tasks (open work). A scope/list failure degrades
  // to an empty focus section so Today still renders — never a 500.
  let focus: readonly FocusTask[];
  let waiting: WaitingSummary;
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    // Include completed tasks so completing on Today keeps the card (Done + Reopen)
    // and Today/Drawer completion stays consistent; open work sorts first. Waiting
    // tasks are EXCLUDED from focus — blocked work surfaces in the Waiting view, not
    // as ordinary active focus (ADR-029).
    const page = await scope.tasks.listTasks({
      limit: FOCUS_LIMIT,
      includeCompleted: true,
      excludeWaiting: true,
    });
    focus = page.items.map((item) => ({
      id: item.id,
      title: item.title,
      context: item.parent?.title ?? "",
      done: item.completedAt !== null,
    }));

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
    focus = [];
    waiting = EMPTY_WAITING_SUMMARY;
  }

  return { date, data: { ...TODAY_FIXTURE, focus }, waiting };
}

export default function TodayRoute({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher<TaskActionData>();

  // A failed card completion is never silent: surface it as a calm error (the
  // optimistic override is reconciled by the ensuing revalidation).
  useCompletionFailureFeedback(fetcher.data);

  // The drawer renderer is bound to this request's data so a focus task's real
  // title names its Drawer dialog; the editable body is TaskDrawerContent.
  const renderTodayDrawer = useMemo(
    () => createTodayDrawerRenderer(loaderData.data),
    [loaderData.data],
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
        waiting={loaderData.waiting}
        onCompleteTask={onCompleteTask}
      />
    </DrawerProvider>
  );
}
