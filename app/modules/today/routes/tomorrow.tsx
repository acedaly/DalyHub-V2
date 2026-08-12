/**
 * CAL-02 — `/today/tomorrow`.
 *
 * The answer to *what does tomorrow look like?*, and deliberately not a second
 * dashboard. It is one page built from primitives Today already owns:
 *
 *   - the SAME schedule read (`loadScheduleWindow` / `scheduleForDate`), so
 *     tomorrow's chronology cannot disagree with today's;
 *   - the SAME Task date classifier (`dateBand`), so "due tomorrow" and "planned
 *     tomorrow" mean exactly what "due today" and "planned today" mean;
 *   - the SAME row components, the same day rail, the same Drawer.
 *
 * What it deliberately does NOT carry: the attention rail, Goal progress, the
 * workload trend, the stat row and overdue work. Those answer questions about
 * NOW. Overdue in particular stays on Today, which is the product's one overdue
 * attention surface — repeating it here would make slipped work something the
 * owner sees twice and acts on neither time (CAL-01 §20).
 */

import { env } from "cloudflare:workers";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import type { DaySchedule, ScheduleEntry } from "~/kernel/calendar";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { DrawerProvider, useDrawer, withDrawerPushed } from "~/shared/drawer";

import { formatTodayDate, ownerCalendarIso } from "../date";
import { dateBand, type DayTask } from "../day/day-view";
import {
  EMPTY_SCHEDULE_WINDOW,
  loadScheduleWindow,
  scheduleForDate,
} from "../day/schedule-load";
import { DayNav } from "../schedule/DayNav";
import { eventDrawerKey } from "../schedule/EventDetail";
import { ScheduleList } from "../schedule/ScheduleList";
import { createScheduleDrawerRenderer } from "../schedule/schedule-drawer";
import type { Route } from "./+types/tomorrow";

export function meta() {
  return [
    { title: "Tomorrow · DalyHub" },
    {
      name: "description",
      content: "What is on tomorrow, and the work you have planned for it.",
    },
  ];
}

/**
 * The same bound Today's planning read uses. Tomorrow's Tasks come out of the
 * SAME single query, so this page costs one Task read, one schedule read and two
 * bounded Meeting reads — the same shape as Today.
 */
const PLANNING_SCHEDULED_LIMIT = 200;
const PLANNING_BACKLOG_LIMIT = 100;

export type TomorrowData = {
  readonly dateIso: string;
  readonly dateLong: string;
  readonly schedule: DaySchedule;
  readonly due: readonly DayTask[];
  readonly planned: readonly DayTask[];
  readonly hasSources: boolean;
  readonly stale: boolean;
};

export async function loader({ context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const now = new Date();
  let timezone = DEFAULT_APP_PREFERENCES.timezone;

  const empty = (dateIso: string): TomorrowData => ({
    dateIso,
    dateLong: formatTodayDate(new Date(`${dateIso}T12:00:00Z`), "UTC"),
    schedule: { dateIso, allDay: [], timed: [], count: 0 },
    due: [],
    planned: [],
    hasSources: false,
    stale: false,
  });

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const preferences = await scope.appPreferences.get(session.user.subject);
    timezone = preferences.timezone;
    const todayIso = ownerCalendarIso(now, timezone);
    const dateIso = new Date(Date.parse(`${todayIso}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);

    const [windowData, tasks] = await Promise.all([
      loadScheduleWindow(scope, {
        fromDateIso: dateIso,
        toDateIso: dateIso,
        timeZone: timezone,
      }).catch(() => EMPTY_SCHEDULE_WINDOW),
      scope.tasks
        .listPlanningTasks({
          todayIso,
          scheduledLimit: PLANNING_SCHEDULED_LIMIT,
          backlogLimit: PLANNING_BACKLOG_LIMIT,
          completedLimit: 0,
        })
        .catch(() => ({ items: [] as never[] })),
    ]);

    const dayTasks: DayTask[] = tasks.items.map((item) => ({
      id: item.id,
      title: item.title,
      parent: item.parent,
      dueDate: item.dueDate,
      scheduledDate: item.scheduledDate,
      priority: item.priority,
      completed: item.completedAt !== null,
      completedDate: null,
    }));

    return {
      day: {
        dateIso,
        // The long date line for TOMORROW, resolved from the date itself rather
        // than from an offset clock — midday UTC is inside the day whatever the
        // owner's zone, so this cannot land on the wrong one.
        dateLong: formatTodayDate(new Date(`${dateIso}T12:00:00Z`), "UTC"),
        schedule: scheduleForDate(windowData, {
          dateIso,
          timeZone: timezone,
          now,
          // Never "today", so no row is marked Now or Next. "Now" on a page
          // showing tomorrow would be false.
          isToday: false,
        }),
        due: dayTasks.filter((task) => dateBand(task, dateIso) === "due"),
        planned: dayTasks.filter(
          (task) => dateBand(task, dateIso) === "planned",
        ),
        hasSources: windowData.hasSources,
        stale: windowData.anySourceFailing,
      } satisfies TomorrowData,
    };
  } catch {
    // Degrade, never blank — the same rule Today applies.
    const todayIso = ownerCalendarIso(now, timezone);
    return {
      day: empty(
        new Date(Date.parse(`${todayIso}T00:00:00Z`) + 86_400_000)
          .toISOString()
          .slice(0, 10),
      ),
    };
  }
}

/** One named band of tomorrow's work. The same shape Today's Focus bands take. */
function TaskBand({
  label,
  tasks,
}: {
  readonly label: string;
  readonly tasks: readonly DayTask[];
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="dh-day-section">
      <h3 className="dh-day-section__label">{label}</h3>
      <ul className="dh-day-list">
        {tasks.map((task) => (
          <li className="dh-day-row" key={task.id}>
            <span className="dh-day-row__title">{task.title}</span>
            {task.parent ? (
              <span className="dh-day-row__meta">{task.parent.title}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TomorrowRoute({ loaderData }: Route.ComponentProps) {
  const day = loaderData.day;

  const entries = useMemo<ReadonlyMap<string, ScheduleEntry>>(
    () =>
      new Map(
        [...day.schedule.allDay, ...day.schedule.timed].map(
          (entry) => [entry.id, entry] as const,
        ),
      ),
    [day.schedule],
  );

  const renderDrawer = useMemo(
    () => createScheduleDrawerRenderer(entries, day.dateLong),
    [entries, day.dateLong],
  );

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <TomorrowScreen day={day} />
    </DrawerProvider>
  );
}

/**
 * The page itself, INSIDE the provider — which is what lets a row open the
 * event detail through `useDrawer`, exactly as a Task row on Today does.
 */
function TomorrowScreen({ day }: { readonly day: TomorrowData }) {
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

  const hasWork = day.due.length > 0 || day.planned.length > 0;

  return (
    <div className="dh-today">
      <header className="dh-today__head">
        <div className="dh-today__identity">
          <h1 className="dh-today__greeting">Tomorrow</h1>
          <p className="dh-today__date">{day.dateLong}</p>
        </div>
      </header>

      <DayNav active="tomorrow" />

      <div className="dh-today__body" data-columns={2}>
        <div className="dh-today__col dh-today__col--focus">
          <section
            className="dh-today__panel"
            aria-labelledby="tomorrow-schedule-heading"
            data-testid="tomorrow-schedule"
          >
            <div className="dh-today__panel-head">
              <h2
                className="dh-today__panel-title"
                id="tomorrow-schedule-heading"
              >
                Schedule
              </h2>
            </div>
            {day.schedule.count > 0 ? (
              <ScheduleList
                schedule={day.schedule}
                onOpenEvent={onOpenEvent}
                eventHref={eventHref}
              />
            ) : (
              /* Two different empty states, because they are two different
                 facts: a clear day, and no calendar connected at all. */
              <p className="dh-today__quiet">
                {day.hasSources
                  ? "Nothing in your calendars tomorrow."
                  : "No calendars connected yet. Add one in Settings to see your schedule here."}
              </p>
            )}
            {day.stale ? (
              <p className="dh-today__panel-foot">
                A calendar did not refresh — showing the last schedule DalyHub
                loaded.
              </p>
            ) : null}
          </section>
        </div>

        <div className="dh-today__col">
          <section
            className="dh-today__panel"
            aria-labelledby="tomorrow-work-heading"
            data-testid="tomorrow-work"
          >
            <div className="dh-today__panel-head">
              <h2 className="dh-today__panel-title" id="tomorrow-work-heading">
                Planned work
              </h2>
            </div>
            {hasWork ? (
              <div className="dh-today__sections">
                <TaskBand label="Due tomorrow" tasks={day.due} />
                <TaskBand label="Planned tomorrow" tasks={day.planned} />
              </div>
            ) : (
              <p className="dh-today__quiet">Nothing planned for tomorrow.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
