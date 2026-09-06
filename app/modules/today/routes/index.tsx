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
import { useCallback, useMemo, useState } from "react";
import {
  useRevalidator,
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { isSameDocumentParameterChange } from "~/shared/router/revalidation";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { DrawerProvider, useDrawer, withDrawerPushed } from "~/shared/drawer";
import { GoalCheckInSheet, goalCheckInLabel } from "~/shared/goal-progress";
import { greetingNameFor } from "~/shared/shell/identity-display";
import { formatTodayDate, ownerCalendarIso } from "../date";
import { emptyDay, loadTodayDay, type TodayDayData } from "../day/load";
import type { TodayGoal } from "../day/goal-progress";
import { TodayScreen } from "../day/TodayScreen";
import { createTodayDrawerRenderer } from "../TodayDrawer";
import { eventDrawerKey } from "../schedule/EventDetail";
import { createScheduleDrawerRenderer } from "../schedule/schedule-drawer";
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

/**
 * PERF-01 / PWA-12 — this loader's data does not depend on the URL, so a
 * same-document parameter change must not re-read it.
 *
 * Opening a Task or an event from the day writes `?drawer=…`, which is a
 * NAVIGATION. Today is the most expensive loader in the product — it reads
 * thirty-eight statements across five round trips on a real workspace — and it
 * was re-running all of it to produce a byte-for-byte identical payload every
 * time the owner opened a row, and again when they closed it.
 *
 * `/tasks` and the app shell already declined this (PWA-12); Today never did,
 * which also meant opening a Task from Today while OFFLINE took the page down —
 * a loader that cannot reach the server throws into the global error boundary.
 * A request that is never needed cannot fail.
 *
 * A SUBMISSION still revalidates, and so does an EXPLICIT `revalidate()` — an
 * identical url is a deliberate re-read, not a move. That distinction is the
 * whole of `isSameDocumentParameterChange`, and it is why this rule is not
 * written as "same pathname → skip": completing a Task from the Drawer asks for
 * exactly that re-read, and silencing it would leave the day showing work
 * already done.
 */
export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return isSameDocumentParameterChange(args)
    ? false
    : args.defaultShouldRevalidate;
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
      // HABITS-01 — the owner's week start, so a Habit's "this week" is the SAME
      // seven days Weekly Planning and a weekly Review use.
      firstDayOfWeek: preferences.firstDayOfWeek,
      // STEER-05 — the owner's date format, so the week's door names its period
      // exactly as the Reviews collection does. Already read; costs nothing.
      dateFormat: preferences.dateFormat,
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
  const revalidator = useRevalidator();

  /*
   * GOAL-02 — updating a Goal without leaving Today.
   *
   * The SAME shared check-in sheet the Goal record opens, posting to the SAME
   * trusted `/goals/:id/measurements` endpoint. Today gains one action, not a
   * copy of the Goal record: everything else about the Goal is one link away.
   */
  const [checkIn, setCheckIn] = useState<{
    readonly goal: TodayGoal;
    readonly opener: HTMLElement | null;
  } | null>(null);

  const submitCheckIn = useCallback(
    async (values: {
      readonly value: string;
      readonly measuredOn: string;
      readonly note: string;
    }) => {
      if (!checkIn) return { ok: false as const };
      const body = new FormData();
      body.set("intent", "log_measurement");
      body.set("value", values.value);
      body.set("measuredOn", values.measuredOn);
      body.set("note", values.note);
      try {
        const response = await fetch(
          `/goals/${encodeURIComponent(checkIn.goal.id)}/measurements`,
          { method: "POST", body },
        );
        const result = (await response.json()) as {
          readonly ok: boolean;
          readonly formError?: string;
          readonly fieldErrors?: Record<string, string>;
        };
        if (result.ok) {
          revalidator.revalidate();
          return { ok: true as const };
        }
        return {
          ok: false as const,
          formError: result.formError,
          fieldErrors: result.fieldErrors,
        };
      } catch {
        return {
          ok: false as const,
          formError: "That couldn’t be saved. Please try again.",
        };
      }
    },
    [checkIn, revalidator],
  );

  // Every task on the day, so an opened Drawer dialog is named by its real title.
  const taskTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of [...loaderData.day.overdue, ...loaderData.day.today]) {
      map.set(task.id, task.title);
    }
    return map;
  }, [loaderData.day]);

  /*
   * CAL-01 — the imported calendar occurrences the day holds, so the SAME
   * Drawer that opens a Task record can open an event's detail.
   *
   * The detail is rendered from data the page already loaded, so opening an
   * event costs no request. The two resolvers are composed rather than merged:
   * Today's owns Tasks and the keyboard reference, the shared schedule resolver
   * owns events, and neither knows about the other's keys.
   */
  const scheduleEntries = useMemo(
    () =>
      new Map(
        [
          ...loaderData.day.schedule.allDay,
          ...loaderData.day.schedule.timed,
        ].map((entry) => [entry.id, entry] as const),
      ),
    [loaderData.day.schedule],
  );

  const renderTodayDrawer = useMemo(() => {
    const renderTask = createTodayDrawerRenderer(taskTitles);
    const renderEvent = createScheduleDrawerRenderer(
      scheduleEntries,
      loaderData.day.dateLong,
    );
    return (entry: Parameters<typeof renderTask>[0]) =>
      renderTask(entry) ?? renderEvent(entry);
  }, [taskTitles, scheduleEntries, loaderData.day.dateLong]);

  return (
    <DrawerProvider renderDrawer={renderTodayDrawer}>
      <TodayBody
        data={loaderData.day}
        onUpdateGoal={(goal, trigger) => setCheckIn({ goal, opener: trigger })}
      />
      {checkIn ? (
        <GoalCheckInSheet
          goalTitle={checkIn.goal.title}
          actionLabel={goalCheckInLabel(
            checkIn.goal.progress.type,
            checkIn.goal.progress.unit,
          )}
          unit={checkIn.goal.progress.unit}
          currentValue={checkIn.goal.progress.current}
          todayIso={loaderData.day.todayIso}
          opener={checkIn.opener}
          onClose={() => setCheckIn(null)}
          onSubmit={submitCheckIn}
        />
      ) : null}
    </DrawerProvider>
  );
}

/**
 * The screen, INSIDE the DrawerProvider — which is what lets a schedule row open
 * the event detail through `useDrawer`, exactly as a Focus row opens a Task.
 */
function TodayBody({
  data,
  onUpdateGoal,
}: {
  readonly data: TodayDayData;
  readonly onUpdateGoal: (goal: TodayGoal, trigger: HTMLElement | null) => void;
}) {
  const [searchParams] = useSearchParams();
  const { openDrawer } = useDrawer();

  const eventHref = useCallback(
    (id: string) =>
      `?${withDrawerPushed(searchParams, eventDrawerKey(id)).toString()}`,
    [searchParams],
  );
  const onOpenEvent = useCallback(
    (id: string) => openDrawer(eventDrawerKey(id)),
    [openDrawer],
  );

  return (
    <TodayScreen
      data={data}
      onUpdateGoal={onUpdateGoal}
      onOpenEvent={onOpenEvent}
      eventHref={eventHref}
    />
  );
}
