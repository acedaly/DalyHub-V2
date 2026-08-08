/**
 * TODAY-DAY — the Today route (`/today`).
 *
 * The registry-driven surface the owner lands on every morning. The loader reads
 * REAL workspace data through the trusted authenticated composition boundary
 * (`resolveAuthenticatedWorkspaceScope` → the repositories) and hands the screen a
 * finished, JSON-safe day; the route mounts ONE DS-03 DrawerProvider around it, so
 * opening a task from the timeline slides its record in over the page.
 *
 * The whole day payload is assembled in `day/load.ts`. Everything time-shaped —
 * the owner's calendar date, the long date line, the owner-local hour behind the
 * greeting — is resolved SERVER-side in the owner's timezone (ADR-022), so the
 * first byte is already correct and there is no client/server drift to hydrate
 * around.
 *
 * Completion writes through the SAME `/tasks/:id` action the Tasks collection and
 * the Task Drawer use, and the ensuing revalidation reconciles the screen's
 * optimistic state. Today owns no completion path of its own.
 */

import { env } from "cloudflare:workers";
import { useCallback, useMemo } from "react";
import { useFetcher } from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { DrawerProvider } from "~/shared/drawer";
import { greetingNameFor } from "~/shared/shell/identity-display";
import type { TaskActionData } from "~/shared/task-record/contract";

import { useCompletionFailureFeedback } from "../completion-feedback";
import { formatTodayDate, ownerCalendarIso } from "../date";
import { emptyDay, loadTodayDay, type TodayDayData } from "../day/load";
import { TodayScreen } from "../day/TodayScreen";
import { createTodayDrawerRenderer } from "../TodayDrawer";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Today · DalyHub" },
    {
      name: "description",
      content: "Your day — what is on, what has slipped, what needs a look.",
    },
  ];
}

/** The owner-local hour (0–23) behind the greeting — never the UTC runtime hour. */
function ownerLocalHour(now: Date, timeZone: string): number {
  const raw = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    hour12: false,
    timeZone,
  }).format(now);
  return Number.parseInt(raw, 10) % 24;
}

export async function loader({ context }: Route.LoaderArgs) {
  // Authentication is guaranteed by the Worker boundary; re-check (401 propagates).
  const session = requireAuthenticatedSession(context);
  const now = new Date();
  // The greeting names the owner from the SAME shared display-identity helper the
  // shell's User menu uses — never a second rule.
  const ownerName = greetingNameFor(
    session.user.displayName,
    session.user.email,
  );

  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  let day: TodayDayData;
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const preferences = await scope.appPreferences.get(session.user.subject);
    timezone = preferences.timezone;
    day = await loadTodayDay(scope, {
      now,
      timezone,
      todayIso: ownerCalendarIso(now, timezone),
      dateLong: formatTodayDate(now, timezone),
      hour: ownerLocalHour(now, timezone),
      ownerName,
    });
  } catch {
    // A scope/preferences failure degrades to a quiet, correct day — the greeting
    // and the date still render. Today is never blank and never a 500.
    day = emptyDay({
      todayIso: ownerCalendarIso(now, timezone),
      dateLong: formatTodayDate(now, timezone),
      hour: ownerLocalHour(now, timezone),
      ownerName,
    });
  }

  return { day };
}

export default function TodayRoute({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher<TaskActionData>();

  // A failed completion is never silent: it surfaces as a calm error, and the
  // ensuing revalidation reconciles the optimistic row.
  useCompletionFailureFeedback(fetcher.data);

  // Every task on the day, so an opened Drawer dialog is named by its real title.
  const taskTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of [...loaderData.day.overdue, ...loaderData.day.today]) {
      map.set(task.id, task.title);
    }
    return map;
  }, [loaderData.day]);

  const renderTodayDrawer = useMemo(
    () => createTodayDrawerRenderer(taskTitles),
    [taskTitles],
  );

  const onCompleteTask = useCallback(
    (taskId: string, complete: boolean) => {
      fetcher.submit(
        { intent: complete ? "complete" : "reopen" },
        { method: "post", action: `/tasks/${encodeURIComponent(taskId)}` },
      );
    },
    [fetcher],
  );

  return (
    <DrawerProvider renderDrawer={renderTodayDrawer}>
      <TodayScreen data={loaderData.day} onCompleteTask={onCompleteTask} />
    </DrawerProvider>
  );
}
