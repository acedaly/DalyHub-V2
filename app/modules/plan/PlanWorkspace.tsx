/**
 * PLAN-01 — the Weekly Planning workspace.
 *
 * ── What this screen is, and what it deliberately is not ────────────────────
 * DalyHub now has three surfaces over the same Tasks, and they answer three
 * different questions. Keeping them separate is the whole design:
 *
 *   - a **Review** asks *what happened, and what needs attention?* It changes
 *     nothing (its own words: "Nothing is scheduled or changed for you").
 *   - **Weekly Planning** — this screen — asks *what am I committing to this
 *     week, and on which days?* It changes the owner's PLAN, and nothing else.
 *   - **Today** asks *what do I do now?*
 *
 * So this is not a Review template, not a second Today, and not a calendar
 * application: there is no month grid, no time-of-day timetable, no time
 * blocking and no calendar write-back (CAL-01 §21, §45).
 *
 * ── The composition, and why it is an AGENDA rather than seven columns ───────
 * The obvious planner is a seven-column board. It was measured and rejected:
 * at 1440 the content column is 1096px, which after the queue rail leaves
 * roughly 100px of usable width per day — narrower than a task title, so every
 * row truncates to two or three words and the day a task is on becomes the only
 * thing the screen can tell you. The references DalyHub follows (Things, Todoist,
 * Linear) all draw a week as a vertical agenda for the same reason, and
 * `docs/design/PLAN_01_SMART_01_WEEKLY_PLANNING_2026_08.md` records the
 * measurement.
 *
 * What is drawn instead:
 *
 *   - a **week agenda**: seven day sections stacked down the main column, each
 *     with its calendar commitments as quiet context and its planned Tasks as
 *     full-width shared rows. A title gets the whole column, a date is a column
 *     because every date starts at the same x, and nothing truncates;
 *   - a **queue rail** beside it: "Still to place", plus the planning signals;
 *   - on a phone, the SAME data as a horizontal day rail plus one day's agenda —
 *     a genuinely mobile composition, never seven columns squeezed into 390px.
 *
 * ── Authority ───────────────────────────────────────────────────────────────
 * Nothing here writes. Every mutation goes through the shared canonical posters
 * to `/tasks/:id` and `/tasks/bulk` — the same routes `/tasks`, Today, a Project
 * and the Task drawer post to — hosted by the shared `useTaskSurfaceActions`.
 * There is no planning endpoint, no `PlanningTask` record and no second Task
 * authority. The Task's own `scheduled_date` IS the plan (ADR-030).
 *
 * ── Due date vs planned date ────────────────────────────────────────────────
 * The planner moves the PLANNED date and never the due date. Placing a task on
 * Wednesday says "I intend to work on this on Wednesday"; it does not move a
 * deadline, and the row keeps drawing both so the distinction stays visible. The
 * menu item that clears a plan says so in as many words.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";

import type { ScheduleEntry } from "~/kernel/calendar";
import { PLANNING_QUEUE_BAND_NOTES } from "~/kernel/planning";
import { DrawerProvider, useDrawer, withDrawerPushed } from "~/shared/drawer";
import { TaskList } from "~/shared/task-record/TaskList";
import { TaskRow, type TaskRowProps } from "~/shared/task-record/TaskRow";
import { buildTaskRowActions } from "~/shared/task-record/task-row-actions";
import { postTaskBulkAction } from "~/shared/task-record/task-inline-edit";
import { useTaskSurfaceActions } from "~/shared/task-record/use-task-surface-actions";
import {
  applyTaskListItemPatch,
  toTaskRowProjection,
  type SerializedTaskListItem,
} from "~/shared/task-record/task-view";
import { Select } from "~/shared/ui";
import { ChevronRightIcon } from "~/shared/icons";

import { createPlanDrawerRenderer } from "./PlanDrawer";

import type { PlanDay, PlanPageData, PlanQueueItem } from "./plan-contract";

export function PlanWorkspace({ data }: { readonly data: PlanPageData }) {
  return (
    <DrawerProvider renderDrawer={createPlanDrawerRenderer()}>
      <PlanScreen data={data} />
    </DrawerProvider>
  );
}

function PlanScreen({ data }: { readonly data: PlanPageData }) {
  const [searchParams] = useSearchParams();
  const { openDrawer } = useDrawer();
  const actions = useTaskSurfaceActions();

  /*
   * ADR-086 — the loader is the truth; a patch is this client's guess, and it
   * lives only until the answer arrives. Dropping every patch when fresh data
   * lands is what keeps a refused write from being invisible.
   */
  useEffect(() => {
    actions.clearPatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the data.
  }, [data]);

  const paint = useCallback(
    (task: SerializedTaskListItem): SerializedTaskListItem => {
      const patch = actions.patches.get(task.id);
      return patch ? applyTaskListItemPatch(task, patch) : task;
    },
    [actions.patches],
  );

  /**
   * The selected day. PHONE state, and phone state only: the desktop agenda
   * draws all seven days at once, and the rail simply moves the reader's place
   * within them. It starts from the loader's own answer (today when today is in
   * the week), so the server and the browser open on the same day.
   */
  const [selectedDay, setSelectedDay] = useState(data.selectedDayIso);
  useEffect(() => setSelectedDay(data.selectedDayIso), [data.selectedDayIso]);

  /** The queue's multi-selection — the keyboard-complete way to place work. */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => setSelected(new Set()), [data.week.startIso]);
  const [placing, setPlacing] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  /*
   * Where focus GOES after a placement.
   *
   * The seven day buttons are disabled while nothing is selected, so placing the
   * selection disables the very control the owner just activated — and a browser
   * moves focus from a disabled element to the document body, which for a
   * keyboard user means their place is gone and the next Tab starts from the top
   * of the page. "Never lose the user's place" (AGENTS.md §6) is exactly this
   * case, and the fix is the standard one: move focus deliberately to the
   * heading of the region that changed, which is also where the live region's
   * sentence is about.
   */
  const queueHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const toggleSelected = useCallback((taskId: string, on: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (on) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  }, []);

  /**
   * Place the selection on a day, as ONE atomic bulk mutation.
   *
   * `/tasks/bulk` with the canonical `plan` intent — the exact route and the
   * exact intent the Tasks bulk bar and Today's plan actions post. Atomic
   * server-side: either every selected Task moves or none does, so a week is
   * never left half-planned. The due date is untouched.
   */
  const placeSelection = useCallback(
    (day: PlanDay) => {
      const ids = [...selected];
      if (ids.length === 0) return;
      setPlacing(true);
      void postTaskBulkAction(ids, {
        intent: "plan",
        scheduledDate: day.dateIso,
      })
        .then((outcome) => {
          setPlacing(false);
          if (!outcome.ok) {
            setAnnouncement(outcome.message);
            return;
          }
          setSelected(new Set());
          setAnnouncement(
            `${outcome.changed} ${outcome.changed === 1 ? "task" : "tasks"} planned for ${day.fullLabel}. Deadlines are unchanged.`,
          );
          queueHeadingRef.current?.focus();
          actions.reportInlineSave({
            taskId: ids[0]!,
            intent: "plan",
            message: "",
            patch: {},
          });
        })
        .catch(() => {
          setPlacing(false);
          setAnnouncement("That couldn’t be saved. Nothing was changed.");
        });
    },
    [selected, actions],
  );

  /** Plan ONE task for one day, through the same canonical bulk intent. */
  const planOne = useCallback(
    (task: SerializedTaskListItem, day: PlanDay) => {
      actions.setField(
        task.id,
        { intent: "plan", scheduledDate: day.dateIso },
        `${task.title} planned for ${day.fullLabel}. Its deadline is unchanged.`,
        { scheduledDate: day.dateIso },
      );
    },
    [actions],
  );

  const clearPlan = useCallback(
    (task: SerializedTaskListItem) => {
      actions.setField(
        task.id,
        { intent: "clear_plan" },
        `${task.title} taken out of the week. Its deadline is unchanged.`,
        { scheduledDate: null },
      );
    },
    [actions],
  );

  /** The shared row's props. Data and callbacks only — no authority here. */
  const rowProps = useCallback(
    (
      item: SerializedTaskListItem,
      options: { readonly inWeek: boolean; readonly headingLevel: 2 | 3 },
    ): TaskRowProps => {
      const task = paint(item);
      const key = `task:${task.id}`;
      const row = toTaskRowProjection(task);
      return {
        task: row,
        todayIso: data.todayIso,
        parents: data.parents,
        headingLevel: options.headingLevel,
        href: `?${withDrawerPushed(searchParams, key).toString()}`,
        onOpen: () => openDrawer(key),
        onCompletedChange: (complete: boolean) =>
          actions.setCompleted(task.id, complete, task.title),
        onInlineSave: actions.reportInlineSave,
        onSearchParents: () => openDrawer(`task-move:${task.id}`),
        overflowActions: buildTaskRowActions(row, {
          onOpenRecord: () => openDrawer(key),
          onMoveToParent: () => openDrawer(`task-move:${task.id}`),
          // Every day of the week the owner is looking at, EXCEPT the day this
          // task already sits on — an item that changes nothing is not a choice.
          planDays: data.days
            .filter((day) => day.dateIso !== task.scheduledDate)
            .map((day) => ({
              dateIso: day.dateIso,
              label: day.fullLabel,
              onSelect: () => planOne(task, day),
            })),
          ...(options.inWeek ? { onClearPlan: () => clearPlan(task) } : {}),
          onSomeday: () =>
            actions.setField(
              task.id,
              { intent: "set_commitment", commitment: "someday" },
              `${task.title} moved to Someday / Maybe.`,
              { commitmentState: "someday" },
            ),
        }),
      };
    },
    [
      paint,
      data.todayIso,
      data.parents,
      data.days,
      searchParams,
      openDrawer,
      actions,
      planOne,
      clearPlan,
    ],
  );

  const totalPlanned = useMemo(
    () => data.days.reduce((sum, day) => sum + day.tasks.length, 0),
    [data.days],
  );

  return (
    <div className="dh-plan">
      <PlanHeader data={data} totalPlanned={totalPlanned} />

      {data.priorFocus ? <PlanFocus focus={data.priorFocus} /> : null}

      {data.failed ? (
        <p className="dh-plan__notice" role="status">
          Some of this week couldn’t be read. What is shown is real — refresh to
          try again.
        </p>
      ) : null}
      {data.calendarStale ? (
        <p className="dh-plan__notice">
          A calendar did not refresh — showing the last schedule DalyHub loaded.
        </p>
      ) : null}

      <div className="dh-plan__body">
        {/*
          * A named SECTION, not a `main`.
          *
          * The application shell already owns the document's one `main`
          * (`#main-content`), and a second one nested inside it is two WCAG
          * failures at once — "more than one main landmark" and "main contained
          * in another landmark". A labelled `section` is a region a screen-reader
          * user can still jump to, which is the whole benefit this was reaching
          * for.
          */}
        <section className="dh-plan__week" aria-label="The week">
          {/*
           * The PHONE day rail.
           *
           * Rendered at every width and hidden by the stylesheet above the phone
           * tier, because it is a navigation aid for a composition that only
           * exists there. It is a real tablist over days the loader already
           * fetched, so moving day costs no request and reaches no date the page
           * does not hold.
           */}
          <div className="dh-plan__rail dh-scroll-strip" role="tablist" aria-label="Days of the week">
            {data.days.map((day) => {
              const current = day.dateIso === selectedDay;
              return (
                <button
                  key={day.dateIso}
                  type="button"
                  role="tab"
                  aria-selected={current}
                  aria-controls={`plan-day-${day.dateIso}`}
                  className="dh-plan__rail-day"
                  data-today={day.isToday ? "true" : undefined}
                  data-weekend={day.isWeekend ? "true" : undefined}
                  data-testid="plan-rail-day"
                  onClick={() => setSelectedDay(day.dateIso)}
                >
                  <span className="dh-plan__rail-weekday">
                    {day.weekdayShort}
                  </span>
                  <span className="dh-plan__rail-number">{day.dayNumber}</span>
                  {/* The count is TEXT, so a loaded day is legible without colour. */}
                  <span className="dh-visually-hidden">
                    {day.fullLabel}
                    {day.isToday ? ", today" : ""},{" "}
                    {day.tasks.length === 1
                      ? "1 task planned"
                      : `${day.tasks.length} tasks planned`}
                    ,{" "}
                    {day.schedule.count === 1
                      ? "1 calendar item"
                      : `${day.schedule.count} calendar items`}
                  </span>
                  <span className="dh-plan__rail-dot" aria-hidden="true">
                    {day.tasks.length > 0 || day.schedule.count > 0 ? "•" : ""}
                  </span>
                </button>
              );
            })}
          </div>

          {data.days.map((day) => (
            <PlanDaySection
              key={day.dateIso}
              day={day}
              selectedDay={selectedDay}
              rowProps={rowProps}
              density={data.density}
            />
          ))}
        </section>

        <aside className="dh-plan__side" aria-label="Planning aids">
          <PlanQueue
            data={data}
            selected={selected}
            placing={placing}
            onToggleSelected={toggleSelected}
            onPlaceSelection={placeSelection}
            rowProps={rowProps}
            headingRef={queueHeadingRef}
          />
          <PlanSignals data={data} />
        </aside>
      </div>

      <p className="dh-visually-hidden" role="status" aria-live="polite">
        {announcement ?? actions.announcement ?? ""}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The header                                                                  */
/* -------------------------------------------------------------------------- */

function PlanHeader({
  data,
  totalPlanned,
}: {
  readonly data: PlanPageData;
  readonly totalPlanned: number;
}) {
  const href = (offset: number): string => {
    const params = new URLSearchParams();
    if (offset !== 0) params.set("week", String(offset));
    const query = params.toString();
    return query.length > 0 ? `/plan?${query}` : "/plan";
  };
  return (
    <header className="dh-plan__head">
      <div className="dh-plan__identity">
        <h1 className="dh-plan__title">Weekly planning</h1>
        {/*
         * The week is stated RELATIVELY and EXPLICITLY, always both. "Next week"
         * alone cannot be checked and a bare date range cannot be recognised at
         * a glance; a planner has to be right about which week it is showing.
         */}
        <p className="dh-plan__range" data-testid="plan-week-range">
          <span className="dh-plan__relative">{data.week.relativeLabel}</span>
          <span className="dh-plan__dot" aria-hidden="true">
            ·
          </span>
          <span>{data.week.rangeLabel}</span>
        </p>
      </div>
      <nav className="dh-plan__weeknav" aria-label="Week">
        {data.week.previousOffset === null ? null : (
          <Link
            className="dh-plan__weeknav-link"
            to={href(data.week.previousOffset)}
            data-testid="plan-week-previous"
            preventScrollReset
          >
            {/* The same glyph, mirrored by the stylesheet: DalyHub's icon set has
                one chevron and a second asset for one direction would be a
                second definition of the same mark. */}
            <span className="dh-plan__weeknav-back" aria-hidden="true">
              <ChevronRightIcon />
            </span>
            Previous week
          </Link>
        )}
        {data.week.offset === 0 ? null : (
          <Link
            className="dh-plan__weeknav-link"
            to={href(0)}
            preventScrollReset
          >
            This week
          </Link>
        )}
        {data.week.nextOffset === null ? null : (
          <Link
            className="dh-plan__weeknav-link"
            to={href(data.week.nextOffset)}
            data-testid="plan-week-next"
            preventScrollReset
          >
            Next week
            <ChevronRightIcon aria-hidden="true" />
          </Link>
        )}
      </nav>
      <p className="dh-plan__count">
        {totalPlanned === 0
          ? "Nothing planned yet"
          : `${totalPlanned} ${totalPlanned === 1 ? "task" : "tasks"} planned`}
      </p>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* The Review handoff                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The focus a completed weekly Review wrote for this period.
 *
 * CONTEXT, and only context. It is READ from the Review that wrote it (never
 * copied), it creates nothing, and opening the planner does not touch the Review
 * in any way. Automatically turning this prose into Tasks would be exactly the
 * magic PLAN-01 §E rules out — the owner reads their own words and decides.
 */
function PlanFocus({
  focus,
}: {
  readonly focus: NonNullable<PlanPageData["priorFocus"]>;
}) {
  return (
    <section
      className="dh-plan__focus"
      aria-labelledby="plan-focus-heading"
      data-testid="plan-prior-focus"
    >
      <h2 id="plan-focus-heading" className="dh-plan__focus-heading">
        Your focus for this week
      </h2>
      {/*
        * The owner's own words, verbatim, in the SAME read-only treatment the
        * Review's focus step draws them in. Not re-rendered as Markdown here: the
        * planner is not a second reader of a Review, and a `pre` preserves the
        * list the owner actually typed without this surface acquiring a
        * Markdown pipeline of its own.
        */}
      <div className="dh-review-section-readonly dh-plan__focus-body">
        <pre>{focus.body}</pre>
      </div>
      <p className="dh-plan__focus-note">
        From <Link to={`/reviews/${focus.reviewId}`}>{focus.reviewTitle}</Link> (
        {focus.periodLabel}). Read from that Review, never copied — and nothing
        here is scheduled for you.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* One day                                                                     */
/* -------------------------------------------------------------------------- */

function PlanDaySection({
  day,
  selectedDay,
  rowProps,
  density,
}: {
  readonly day: PlanDay;
  readonly selectedDay: string;
  readonly rowProps: (
    item: SerializedTaskListItem,
    options: { readonly inWeek: boolean; readonly headingLevel: 2 | 3 },
  ) => TaskRowProps;
  readonly density: PlanPageData["density"];
}) {
  const events: readonly ScheduleEntry[] = [
    ...day.schedule.allDay,
    ...day.schedule.timed,
  ];
  return (
    <section
      className="dh-plan__day"
      id={`plan-day-${day.dateIso}`}
      aria-labelledby={`plan-day-heading-${day.dateIso}`}
      data-testid="plan-day"
      data-date={day.dateIso}
      data-today={day.isToday ? "true" : undefined}
      data-past={day.isPast ? "true" : undefined}
      data-weekend={day.isWeekend ? "true" : undefined}
      /*
       * The phone shows ONE day. `data-selected` is what the stylesheet reads to
       * hide the other six at that tier; above it every day is drawn and the
       * attribute is inert. Hiding is `display:none` in CSS on a container the
       * rail's `aria-controls` points at, so what is off-screen is also out of
       * the accessibility tree rather than silently readable-but-invisible.
       */
      data-selected={day.dateIso === selectedDay ? "true" : undefined}
    >
      <header className="dh-plan__day-head">
        <h2
          className="dh-plan__day-title"
          id={`plan-day-heading-${day.dateIso}`}
        >
          {day.weekdayLong}
          <span className="dh-plan__day-date"> {day.dayNumber}</span>
        </h2>
        {/* "Today" is a WORD, never a colour, and it is only ever the real today. */}
        {day.isToday ? <span className="dh-plan__day-now">Today</span> : null}
        <p className="dh-plan__day-meta">
          {day.tasks.length === 0
            ? "No tasks"
            : `${day.tasks.length} ${day.tasks.length === 1 ? "task" : "tasks"}`}
          {day.waitingCount > 0 ? ` · ${day.waitingCount} waiting` : ""}
          {day.completedCount > 0 ? ` · ${day.completedCount} done` : ""}
        </p>
      </header>

      {/*
       * The calendar, as CONTEXT.
       *
       * Times and titles, quietly, so the owner can plan AROUND what is already
       * on. It is never converted into a Task, it carries no checkbox and it is
       * not writable from here — DalyHub does not write to anybody's calendar
       * (CAL-01). Each row opens the existing event drawer, which is the one
       * place an occurrence is read.
       */}
      {events.length > 0 ? (
        <ul className="dh-plan__events" aria-label={`${day.fullLabel} calendar`}>
          {events.map((entry) => (
            <li
              className="dh-plan__event"
              key={entry.id}
              data-testid="plan-event"
              data-cancelled={entry.cancelled ? "true" : undefined}
            >
              {/*
               * A commitment is TEXT, not a control.
               *
               * It is deliberately not interactive: an occurrence is read on the
               * schedule surfaces that own it, and a planner that let you open,
               * complete or edit a calendar item would be the beginning of the
               * calendar application CAL-01 refuses to build. What the planner
               * needs from the calendar is exactly this — when the day is
               * already spoken for — so that is exactly what it draws.
               */}
              <span className="dh-plan__event-time">
                {entry.timeLabel ?? "All day"}
              </span>
              <span className="dh-plan__event-title">{entry.title}</span>
              <span className="dh-visually-hidden">
                {" "}
                — calendar, {entry.timeAccessibleLabel}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {day.tasks.length > 0 ? (
        <TaskList
          ariaLabel={`Tasks planned for ${day.fullLabel}`}
          density={density}
        >
          {day.tasks.map((task) => (
            <TaskRow
              key={task.id}
              {...rowProps(task, { inWeek: true, headingLevel: 3 })}
            />
          ))}
        </TaskList>
      ) : (
        <p className="dh-plan__day-empty">
          {events.length > 0
            ? "Nothing planned around it."
            : "Nothing planned."}
        </p>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Still to place                                                              */
/* -------------------------------------------------------------------------- */

function PlanQueue({
  data,
  selected,
  placing,
  onToggleSelected,
  onPlaceSelection,
  rowProps,
  headingRef,
}: {
  readonly data: PlanPageData;
  readonly selected: ReadonlySet<string>;
  readonly placing: boolean;
  readonly headingRef: React.RefObject<HTMLHeadingElement | null>;
  readonly onToggleSelected: (taskId: string, on: boolean) => void;
  readonly onPlaceSelection: (day: PlanDay) => void;
  readonly rowProps: (
    item: SerializedTaskListItem,
    options: { readonly inWeek: boolean; readonly headingLevel: 2 | 3 },
  ) => TaskRowProps;
}) {
  const [, setSearchParams] = useSearchParams();
  const count = selected.size;

  /*
   * Group the queue by band, PRESERVING the loader's order.
   *
   * The loader already emitted the entries in band order (the kernel's declared
   * priority order, then each band's own query order), so this walks the list
   * once and starts a new group whenever the band changes. It never sorts: a
   * second ordering here is exactly how a surface comes to disagree with the
   * bound the query drew. A view-sourced queue has no band, and falls into one
   * unlabelled group — its reason is the view the owner chose.
   */
  const sourceName =
    data.queueSources.find((source) => source.id === data.activeQueueSourceId)
      ?.name ?? "Your saved view";
  const groups = useMemo(() => {
    const out: {
      key: string;
      band: PlanQueueItem["band"];
      label: string;
      entries: readonly PlanQueueItem[];
    }[] = [];
    for (const entry of data.queue) {
      const last = out[out.length - 1];
      if (last !== undefined && last.band === entry.band) {
        last.entries = [...last.entries, entry];
        continue;
      }
      out.push({
        // A view-sourced queue has no band, and its ONE group is named by the
        // view the owner chose — which is the honest answer to "why are these
        // here?" for that source.
        key: entry.band ?? "view",
        band: entry.band,
        label: entry.bandLabel ?? sourceName,
        entries: [entry],
      });
    }
    return out;
  }, [data.queue, sourceName]);

  return (
    <section
      className="dh-plan__queue"
      aria-labelledby="plan-queue-heading"
      data-testid="plan-queue"
    >
      <header className="dh-plan__queue-head">
        {/* `tabIndex={-1}` so focus can be MOVED here after a placement without
            the heading becoming a tab stop of its own. */}
        <h2
          id="plan-queue-heading"
          className="dh-plan__queue-title"
          ref={headingRef}
          tabIndex={-1}
        >
          Still to place
        </h2>
        {/*
         * SMART-01 §D5 — the queue's SOURCE.
         *
         * "Suggested" is the deterministic built-in rule; every other option is
         * one of the owner's saved Tasks views, run through the SAME canonical
         * Tasks query path with the SAME filter vocabulary. Planning duplicates
         * no filter logic, which is why these two items shipped together.
         */}
        <label className="dh-plan__queue-source">
          <span className="dh-plan__queue-source-label">From</span>
          <Select
            value={data.activeQueueSourceId}
            data-testid="plan-queue-source"
            onChange={(event) => {
              setSearchParams(
                (previous) => {
                  const next = new URLSearchParams(previous);
                  if (event.target.value === "suggested") next.delete("queue");
                  else next.set("queue", event.target.value);
                  return next;
                },
                { preventScrollReset: true },
              );
            }}
          >
            {data.queueSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </Select>
        </label>
      </header>

      {data.queue.length === 0 ? (
        <p className="dh-plan__queue-empty">
          {data.activeQueueSourceId === "suggested"
            ? "Nothing is waiting on a decision. Everything overdue, due this week, high priority or unfiled already has a day."
            : "That saved view has nothing left to place this week."}
        </p>
      ) : (
        <>
          {/*
           * The PLACEMENT bar — the primary interaction, and it is not a drag.
           *
           * Select rows (checkbox, Space, or a touch hold), then choose a day.
           * Seven ordinary buttons, each with the day in words as its accessible
           * name, committing ONE atomic bulk mutation. A keyboard user and a
           * screen-reader user have the whole capability; there is no
           * drag-and-drop anywhere in this surface, so there is nothing for them
           * to be excluded from (PLAN-01 §C2).
           */}
          <div
            className="dh-plan__place"
            role="group"
            aria-label="Place the selected tasks"
            data-testid="plan-place-bar"
          >
            <p className="dh-plan__place-label">
              {count === 0
                ? "Select tasks, then choose a day."
                : `${count} selected — choose a day:`}
            </p>
            <div className="dh-plan__place-days">
              {data.days.map((day) => (
                <button
                  key={day.dateIso}
                  type="button"
                  className="dh-plan__place-day"
                  disabled={count === 0 || placing}
                  aria-label={`Plan ${count} selected ${count === 1 ? "task" : "tasks"} for ${day.fullLabel}`}
                  data-testid="plan-place-day"
                  data-date={day.dateIso}
                  onClick={() => onPlaceSelection(day)}
                >
                  <span aria-hidden="true">{day.weekdayShort}</span>
                </button>
              ))}
            </div>
          </div>

          {/*
           * The queue, GROUPED BY REASON — one heading per band, not one label
           * per row.
           *
           * The first form printed the band above every entry, which drew the
           * word "Overdue" six times down a 21rem rail. The reason is a property
           * of a GROUP of tasks, and stating it once is both quieter and more
           * useful: the owner reads "Overdue: these five", decides about the
           * five, and moves on. The bands are still the same deterministic rule,
           * in the same declared order — this is only where the word is drawn.
           */}
          <div className="dh-plan__queue-groups">
            {groups.map((group) => (
              <section
                key={group.key}
                className="dh-plan__queue-group"
                aria-labelledby={`plan-queue-band-${group.key}`}
                data-testid="plan-queue-group"
                data-band={group.key}
              >
                <h3
                  className="dh-plan__queue-band"
                  id={`plan-queue-band-${group.key}`}
                >
                  {group.label}
                  <span className="dh-plan__queue-band-count">
                    {" "}
                    {group.entries.length}
                  </span>
                  {/* The rule, in words, for anyone who needs it read out. A
                      view-sourced group has no rule to state — its reason is its
                      name — so it gets no second sentence. */}
                  {group.band === null ? null : (
                    <span className="dh-visually-hidden">
                      {" "}
                      — {PLANNING_QUEUE_BAND_NOTES[group.band]}
                    </span>
                  )}
                </h3>
                <TaskList
                  ariaLabel={group.label}
                  density={data.density}
                  className="dh-plan__queue-rows"
                >
                  {group.entries.map((entry) => (
                    <TaskRow
                      key={entry.task.id}
                      {...rowProps(entry.task, {
                        inWeek: false,
                        // The shared row offers h2 or h3. The band heading above
                        // is the h3, so a row inside it would ideally be h4 — the
                        // row does not offer one, and inventing a level here
                        // would mean forking the shared component over a
                        // heading. h3 keeps the outline flat inside the group
                        // rather than wrong.
                        headingLevel: 3,
                      })}
                      selection={{
                        selected: selected.has(entry.task.id),
                        onSelectedChange: (on) =>
                          onToggleSelected(entry.task.id, on),
                        label: `Select ${entry.task.title} to place on a day`,
                      }}
                    />
                  ))}
                </TaskList>
              </section>
            ))}
          </div>

          {data.queueTruncated ? (
            <p className="dh-plan__queue-more">
              This is the first {data.queue.length}. Place some, or narrow the
              list with a saved view.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Planning signals                                                            */
/* -------------------------------------------------------------------------- */

const GAP_WORDS: Readonly<Record<string, string>> = {
  no_next_action: "No next action",
  nothing_planned: "Nothing planned this week",
  overdue_work: "Has overdue work",
};

/**
 * The planning gaps — restrained on purpose.
 *
 * At most five Projects and three Goals, each with one stated gap and a door to
 * the record that can close it. It is a planning aid, not a Project dashboard
 * (§B8) and not a Goal scoreboard (§B9): the health state is PROJ-02's own, the
 * next action is the Tasks query's own, and nothing here scores anything.
 */
function PlanSignals({ data }: { readonly data: PlanPageData }) {
  if (data.projectSignals.length === 0 && data.goalSignals.length === 0) {
    return null;
  }
  return (
    <section
      className="dh-plan__signals"
      aria-labelledby="plan-signals-heading"
      data-testid="plan-signals"
    >
      <h2 id="plan-signals-heading" className="dh-plan__signals-title">
        Worth a look
      </h2>
      <ul className="dh-plan__signal-list">
        {data.projectSignals.map((signal) => (
          <li key={signal.projectId} className="dh-plan__signal">
            <Link
              className="dh-plan__signal-name"
              to={`/projects/${signal.projectId}`}
            >
              {signal.title}
            </Link>
            <p className="dh-plan__signal-gap">
              {GAP_WORDS[signal.gap] ?? signal.gap}
              {signal.gap === "overdue_work" && signal.overdueCount > 0
                ? ` · ${signal.overdueCount} overdue`
                : ""}
            </p>
            {signal.nextAction ? (
              <p className="dh-plan__signal-next">
                Next: {signal.nextAction.title}
              </p>
            ) : null}
          </li>
        ))}
        {data.goalSignals.map((signal) => (
          <li key={signal.goalId} className="dh-plan__signal">
            <Link
              className="dh-plan__signal-name"
              to={`/goals/${signal.goalId}`}
            >
              {signal.title}
            </Link>
            <p className="dh-plan__signal-gap">
              No planned supporting action this week
            </p>
          </li>
        ))}
      </ul>
      <p className="dh-plan__signals-note">
        Nothing here is scheduled for you. Open a record and decide.
      </p>
    </section>
  );
}
