/**
 * CAL-02 — `/today/upcoming`, the next seven days.
 *
 * A compact forward agenda answering *what's coming up?* — and deliberately not
 * answering *can DalyHub replace Outlook Calendar?*. There is no month grid, no
 * week timetable, no drag-and-drop and no scheduling surface of any kind (CAL-01
 * §21, §45). It is seven day groups, each with the day's schedule and one
 * restrained line about the work planned for it.
 *
 * ── One read for seven days ────────────────────────────────────────────────
 * The whole window is fetched ONCE — one schedule read, one Task read, two
 * bounded Meeting reads — and grouped in memory by the same pure functions Today
 * and Tomorrow use. Not seven reads, and not one read per day per section
 * (CAL-01 §34).
 */

import { env } from "cloudflare:workers";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import type { DaySchedule, ScheduleEntry } from "~/kernel/calendar";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { DrawerProvider, useDrawer, withDrawerPushed } from "~/shared/drawer";

import { ownerCalendarIso } from "../date";
import { openTaskCountForDate, toDayTask, type DayTask } from "../day/day-view";
import {
  EMPTY_SCHEDULE_WINDOW,
  loadScheduleWindow,
  scheduleForDate,
} from "~/platform/calendar/schedule-load.server";
import { DayNav } from "../schedule/DayNav";
import { eventDrawerKey } from "../schedule/EventDetail";
import { ScheduleList } from "../schedule/ScheduleList";
import { createScheduleDrawerRenderer } from "../schedule/schedule-drawer";
import type { Route } from "./+types/upcoming";

export function meta() {
  return [
    { title: "Next 7 days · DalyHub" },
    {
      name: "description",
      content:
        "A compact forward agenda: what is on, and what you have planned.",
    },
  ];
}

/**
 * Seven days, starting today.
 *
 * Seven because it is the horizon "what's coming up?" actually means — far
 * enough to see the week take shape, near enough that every row is still
 * something the owner can act on. Longer would need paging, and paging a
 * forward agenda is the first step towards a calendar application.
 */
const UPCOMING_DAYS = 7;

const PLANNING_SCHEDULED_LIMIT = 200;
const PLANNING_BACKLOG_LIMIT = 100;

export type UpcomingDay = {
  readonly dateIso: string;
  /** "Thursday 13 August" — the group heading. */
  readonly heading: string;
  /** "Today" / "Tomorrow", when the date has a better name than its own. */
  readonly relativeLabel: string | null;
  readonly schedule: DaySchedule;
  /** Open Tasks due or planned on this date, by the canonical union rule. */
  readonly taskCount: number;
};

function shiftDate(dateIso: string, days: number): string {
  return new Date(Date.parse(`${dateIso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** "Thursday 13 August", resolved from the DATE, never from an offset clock. */
function headingFor(dateIso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T12:00:00Z`));
}

export async function loader({ context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const now = new Date();
  let timezone = DEFAULT_APP_PREFERENCES.timezone;

  let todayIso = ownerCalendarIso(now, timezone);
  let windowData = EMPTY_SCHEDULE_WINDOW;
  let dayTasks: DayTask[] = [];

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const preferences = await scope.appPreferences.get(session.user.subject);
    timezone = preferences.timezone;
    todayIso = ownerCalendarIso(now, timezone);
    const lastIso = shiftDate(todayIso, UPCOMING_DAYS - 1);

    const [schedule, tasks] = await Promise.all([
      loadScheduleWindow(scope, {
        fromDateIso: todayIso,
        toDateIso: lastIso,
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
    windowData = schedule;
    dayTasks = tasks.items.map((item) => toDayTask(item, null));
  } catch {
    // Degrade, never blank: the days still render, empty and truthful.
  }

  const days: UpcomingDay[] = [];
  for (let offset = 0; offset < UPCOMING_DAYS; offset += 1) {
    const dateIso = shiftDate(todayIso, offset);
    days.push({
      dateIso,
      heading: headingFor(dateIso),
      relativeLabel: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : null,
      schedule: scheduleForDate(windowData, {
        dateIso,
        timeZone: timezone,
        now,
        isToday: offset === 0,
      }),
      taskCount: openTaskCountForDate(dayTasks, dateIso),
    });
  }

  return {
    days,
    hasSources: windowData.hasSources,
    stale: windowData.anySourceFailing,
  };
}

export default function UpcomingRoute({ loaderData }: Route.ComponentProps) {
  const entries = useMemo<ReadonlyMap<string, ScheduleEntry>>(() => {
    const map = new Map<string, ScheduleEntry>();
    for (const day of loaderData.days) {
      for (const entry of [...day.schedule.allDay, ...day.schedule.timed]) {
        map.set(entry.id, entry);
      }
    }
    return map;
  }, [loaderData.days]);

  // The drawer's date line names the day the owner opened the event FROM, which
  // for a multi-day item is the useful answer.
  const renderDrawer = useMemo(
    () => createScheduleDrawerRenderer(entries, ""),
    [entries],
  );

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <UpcomingScreen data={loaderData} />
    </DrawerProvider>
  );
}

function UpcomingScreen({
  data,
}: {
  readonly data: {
    readonly days: readonly UpcomingDay[];
    readonly hasSources: boolean;
    readonly stale: boolean;
  };
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

  const anything = data.days.some(
    (day) => day.schedule.count > 0 || day.taskCount > 0,
  );

  return (
    <div className="dh-today">
      <header className="dh-today__head">
        <div className="dh-today__identity">
          <h1 className="dh-today__greeting">Next 7 days</h1>
          <p className="dh-today__date">What is coming up</p>
        </div>
      </header>

      <DayNav active="upcoming" />

      {data.stale ? (
        <p className="dh-today__quiet dh-today__quiet--prose">
          A calendar did not refresh — showing the last schedule DalyHub loaded.
        </p>
      ) : null}

      <div className="dh-upcoming" data-testid="upcoming-days">
        {data.days.map((day) => (
          <section
            className="dh-today__panel dh-upcoming__day"
            key={day.dateIso}
            aria-labelledby={`upcoming-${day.dateIso}`}
            data-testid="upcoming-day"
            data-date={day.dateIso}
          >
            <div className="dh-today__panel-head">
              <h2
                className="dh-today__panel-title"
                id={`upcoming-${day.dateIso}`}
              >
                {day.heading}
              </h2>
              {day.relativeLabel === null ? null : (
                <span className="dh-upcoming__relative">
                  {day.relativeLabel}
                </span>
              )}
            </div>

            {day.schedule.count > 0 ? (
              <ScheduleList
                schedule={day.schedule}
                onOpenEvent={onOpenEvent}
                eventHref={eventHref}
              />
            ) : null}

            {/*
             * The Task summary is a COUNT, not a list.
             *
             * A forward agenda that reprints every task becomes the Tasks
             * collection with worse filtering. One line per day says whether the
             * day is loaded, and the canonical view is one link away.
             */}
            {day.taskCount > 0 ? (
              <p className="dh-upcoming__tasks">
                {day.taskCount} planned {day.taskCount === 1 ? "task" : "tasks"}
              </p>
            ) : null}

            {day.schedule.count === 0 && day.taskCount === 0 ? (
              <p className="dh-today__quiet">Clear</p>
            ) : null}
          </section>
        ))}
      </div>

      {!anything ? (
        <p className="dh-today__quiet dh-today__quiet--prose">
          {data.hasSources
            ? "Nothing scheduled in the next seven days."
            : "No calendars connected yet. Add one in Settings to see what is coming up."}
        </p>
      ) : null}
    </div>
  );
}
