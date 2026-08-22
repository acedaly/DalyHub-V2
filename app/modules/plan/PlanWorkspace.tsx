/**
 * PLAN-01 / UX-02 — the Weekly Planning workspace.
 *
 * ── What this screen is, and what it deliberately is not ────────────────────
 * DalyHub has three surfaces over the same Tasks, and they answer three
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
 * ── The composition is a BOARD, and UX-02 changed that on the numbers ───────
 * PLAN-01 drew a vertical agenda and rejected a column board with a
 * measurement: at 1440 it read the content column as 1096px and concluded that
 * seven columns leave "roughly 100px per day — narrower than a task title".
 *
 * UX-02 (Mockup 7) draws the board, and the measurement was re-taken rather than
 * argued with. On `main` at 3d8d0d6, MEASURED in Chromium at a 1440 viewport:
 * the planning content column is **856px**, not 1096 — the 1096 figure predated
 * the shell's current gutters. Six columns (Saturday and Sunday share one, which
 * is what the mockup draws and what a week actually holds) is **133px per day**,
 * and a day column is not asked to hold a full-width row: it holds the shared
 * Task row in its CARD presentation, where the title wraps to three lines
 * instead of truncating. `docs/design/UX_02_PLAN_HABITS_2026_08.md` records every
 * figure, and [ADR-104](../../../docs/decisions/ARCHITECTURE_DECISIONS.md)
 * supersedes ADR-101's agenda decision.
 *
 * What is drawn:
 *
 *   - a **week board**: six columns, each with the day's calendar COMMITMENTS as
 *     quiet context above its PLANNED Tasks, and one control at the foot that
 *     arms that day for placement;
 *   - a **queue rail** beside it: "Still to place", its sources as chips, and the
 *     planning signals;
 *   - a **glance bar** beneath: the week in four figures, and the door to the
 *     Review focus that handed this week its intent;
 *   - on a phone, the SAME data as a horizontal day rail plus one day's column —
 *     a genuinely mobile composition, never six columns squeezed into 390px.
 *
 * ── Authority ───────────────────────────────────────────────────────────────
 * Nothing here writes. Every mutation goes through the shared canonical posters
 * to `/tasks/:id` and `/tasks/bulk` — the same routes `/tasks`, Today, a Project
 * and the Task drawer post to — hosted by the shared `useTaskSurfaceActions`.
 * There is no planning endpoint, no `PlanningTask` record and no second Task
 * authority. The Task's own `scheduled_date` IS the plan (ADR-030).
 *
 * UX-02 added no authority either. The board's "Plan a task" ARMS a day for the
 * queue's existing bulk placement; it does not create a Task, because a create
 * on this surface would be a second create path beside the shared Quick Capture.
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
import {
  PLANNING_QUEUE_BAND_NOTES,
  planningDurationAccessibleLabel,
  planningDurationLabel,
  planningEntryMinutes,
} from "~/kernel/planning";
import { DrawerProvider, useDrawer, withDrawerPushed } from "~/shared/drawer";
import { TaskGroup, TaskList } from "~/shared/task-record/TaskList";
import { TaskRow, type TaskRowProps } from "~/shared/task-record/TaskRow";
import { TaskTitleEditor } from "~/shared/task-record/TaskTitleEditor";
import { buildTaskRowActions } from "~/shared/task-record/task-row-actions";
import { postTaskBulkAction } from "~/shared/task-record/task-inline-edit";
import { useTaskSurfaceActions } from "~/shared/task-record/use-task-surface-actions";
import {
  applyTaskListItemPatch,
  toTaskRowProjection,
  type SerializedTaskListItem,
} from "~/shared/task-record/task-view";
import {
  CalendarIcon,
  ChevronRightIcon,
  FilterIcon,
  FlagIcon,
  InboxIcon,
  PlusIcon,
  ProjectIcon,
  ReviewIcon,
  TaskIcon,
} from "~/shared/icons";

import { createPlanDrawerRenderer } from "./PlanDrawer";

import type { PlanDay, PlanPageData, PlanQueueItem } from "./plan-contract";

/**
 * The board's columns.
 *
 * A week is seven days and the board draws six, because Saturday and Sunday
 * together hold about as much as one weekday does — which is what Mockup 7
 * draws, and what gives the five working days a column each that a task title
 * fits in.
 *
 * The merge is of ADJACENT weekend days, computed from the loader's own
 * `isWeekend`, so it follows the owner's `firstDayOfWeek` rather than assuming
 * Monday: a Monday-start week yields six columns (Sat+Sun paired), and a
 * Sunday-start week yields seven (Sunday leads, Saturday trails, and neither has
 * a neighbour to pair with). The stylesheet caps the row at six, so the seventh
 * wraps rather than shrinking every column to hold it.
 */
interface PlanColumn {
  readonly key: string;
  readonly days: readonly PlanDay[];
}

function toColumns(days: readonly PlanDay[]): readonly PlanColumn[] {
  const columns: { key: string; days: PlanDay[] }[] = [];
  for (const day of days) {
    const last = columns[columns.length - 1];
    const pairable =
      day.isWeekend &&
      last !== undefined &&
      last.days.every((existing) => existing.isWeekend);
    if (pairable && last !== undefined) {
      last.days.push(day);
      continue;
    }
    columns.push({ key: day.dateIso, days: [day] });
  }
  return columns;
}

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

  const columns = useMemo(() => toColumns(data.days), [data.days]);

  /**
   * The selected day. PHONE state, and phone state only: the desktop board draws
   * every day at once, and the rail simply moves the reader's place within them.
   * It starts from the loader's own answer (today when today is in the week), so
   * the server and the browser open on the same day.
   */
  const [selectedDay, setSelectedDay] = useState(data.selectedDayIso);
  useEffect(() => setSelectedDay(data.selectedDayIso), [data.selectedDayIso]);

  /** The queue's multi-selection — the keyboard-complete way to place work. */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => setSelected(new Set()), [data.week.startIso]);
  const [placing, setPlacing] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  /**
   * UX-02 — the ARMED day.
   *
   * The board's per-column "Plan a task" names a day without committing
   * anything, so the queue's primary button has a destination. It is view state
   * and nothing else: no request is made when a day is armed, and clicking a day
   * chip in the queue still commits immediately, which keeps the one-gesture path
   * PLAN-01 shipped intact.
   */
  const [armedDay, setArmedDay] = useState<string | null>(null);
  useEffect(() => setArmedDay(null), [data.week.startIso]);

  /**
   * DHDS-10 — which row (if any) is being renamed in place. Surface state, so
   * at most one title is ever in edit mode and every other row keeps its
   * ordinary open link.
   */
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);

  /*
   * Where focus GOES after a placement.
   *
   * The day buttons are disabled while nothing is selected, so placing the
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
          setArmedDay(null);
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

  /**
   * Arm a day, and send the owner where the work is.
   *
   * The queue is the only place a Task can be chosen, so naming a day moves
   * focus there — otherwise the button would change a label the owner cannot see
   * and appear to do nothing. Pressing the armed day again disarms it.
   */
  const armDay = useCallback((dateIso: string) => {
    setArmedDay((current) => (current === dateIso ? null : dateIso));
    queueHeadingRef.current?.focus();
  }, []);

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
        /*
         * DHDS-10 §11 — the project menu's escape hatch opens the shared
         * searchable picker over the row's own cell rather than the Task's
         * record, exactly as it now does on `/tasks` and Today.
         */
        overflowActions: buildTaskRowActions(row, {
          onOpenRecord: () => openDrawer(key),
          onRename: () => setEditingTitleId(task.id),
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
        /*
         * DHDS-10 — renaming in place, from the SAME shared editor `/tasks` and
         * Today use. Weekly Planning is where a week's work is read and tidied,
         * and "fix that title" was previously a record navigation out of the
         * week and back.
         */
        ...(editingTitleId === task.id
          ? {
              titleEditor: (
                <TaskTitleEditor
                  taskId={task.id}
                  title={task.title}
                  onDone={() => setEditingTitleId(null)}
                  onSaved={(id, title) =>
                    actions.reportInlineSave({
                      taskId: id,
                      intent: "rename",
                      message: `Renamed to ${title}.`,
                      patch: { title },
                    })
                  }
                />
              ),
            }
          : {}),
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
      editingTitleId,
    ],
  );

  return (
    <div className="dh-plan">
      <PlanHeader data={data} />
      <PlanFigures data={data} />

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
          <div
            className="dh-plan__rail dh-scroll-strip"
            role="tablist"
            aria-label="Days of the week"
          >
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

          <div className="dh-plan__board" data-testid="plan-board">
            {columns.map((column) => (
              <PlanBoardColumn
                key={column.key}
                column={column}
                selectedDay={selectedDay}
                armedDay={armedDay}
                onArmDay={armDay}
                rowProps={rowProps}
                density={data.density}
              />
            ))}
          </div>
        </section>

        <aside className="dh-plan__side" aria-label="Planning aids">
          <PlanQueue
            data={data}
            selected={selected}
            placing={placing}
            armedDay={armedDay}
            onToggleSelected={toggleSelected}
            onPlaceSelection={placeSelection}
            rowProps={rowProps}
            headingRef={queueHeadingRef}
          />
          <PlanRoutines data={data} />
          <PlanSignals data={data} />
        </aside>
      </div>

      <PlanGlance data={data} />

      {/*
       * The workspace's ONE announcement region.
       *
       * It carries a test id for the same reason every other landmark in this
       * file does: `role="status"` is not a unique handle. The shell mounts a
       * persistent `ConnectionStatus` live region AFTER the route's own markup,
       * so `[role="status"]` last-in-document is the connection state — empty
       * while the connection is healthy — not what the Plan just did.
       */}
      <p
        className="dh-visually-hidden"
        role="status"
        aria-live="polite"
        data-testid="plan-announcement"
      >
        {announcement ?? actions.announcement ?? ""}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The header                                                                  */
/* -------------------------------------------------------------------------- */

/** The `/plan` URL for a week offset — `?week=` absent means this week. */
function weekHref(offset: number): string {
  const params = new URLSearchParams();
  if (offset !== 0) params.set("week", String(offset));
  const query = params.toString();
  return query.length > 0 ? `/plan?${query}` : "/plan";
}

function PlanHeader({ data }: { readonly data: PlanPageData }) {
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
          <span>{data.week.rangeLabel}</span>
          <span className="dh-plan__dot" aria-hidden="true">
            ·
          </span>
          <span className="dh-plan__relative">{data.week.relativeLabel}</span>
        </p>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* The figures, and the week's navigation                                      */
/* -------------------------------------------------------------------------- */

/**
 * Mockup 7's control row: three figures, then the week's own navigation.
 *
 * The figures are the loader's, resolved once (`PlanWeekTotals`), and the glance
 * bar at the foot prints the SAME values — one set of numbers in two places
 * rather than two counts that can disagree.
 *
 * A zero is drawn as a zero rather than suppressed. "0 overdue" is genuinely
 * good news on a planning screen, and a figure that vanishes when it is zero
 * makes the owner check whether it was ever there.
 */
function PlanFigures({ data }: { readonly data: PlanPageData }) {
  const { totals } = data;
  return (
    <div className="dh-plan__controls">
      <ul className="dh-plan__figures" aria-label="This week">
        <li className="dh-plan__figure" data-testid="plan-figure-planned">
          <TaskIcon aria-hidden="true" />
          <span className="dh-plan__figure-value">{totals.plannedCount}</span>
          <span className="dh-plan__figure-label">planned</span>
        </li>
        <li className="dh-plan__figure" data-testid="plan-figure-unplaced">
          <InboxIcon aria-hidden="true" />
          <span className="dh-plan__figure-value">{totals.unplacedCount}</span>
          <span className="dh-plan__figure-label">still to place</span>
        </li>
        {/*
         * Overdue takes the product's overdue colour and NOTHING else — no
         * filled pill, no alarm. It is a count of work that is already late,
         * which the owner needs to see; it is not a reprimand.
         */}
        <li
          className="dh-plan__figure"
          data-tone={totals.overdueCount > 0 ? "overdue" : undefined}
          data-testid="plan-figure-overdue"
        >
          <FlagIcon aria-hidden="true" />
          <span className="dh-plan__figure-value">{totals.overdueCount}</span>
          <span className="dh-plan__figure-label">overdue</span>
        </li>
      </ul>

      <nav className="dh-plan__weeknav" aria-label="Week">
        {data.week.previousOffset === null ? null : (
          <Link
            className="dh-plan__weeknav-link"
            to={weekHref(data.week.previousOffset)}
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
            to={weekHref(0)}
            preventScrollReset
          >
            This week
          </Link>
        )}
        {data.week.nextOffset === null ? null : (
          <Link
            className="dh-plan__weeknav-link"
            to={weekHref(data.week.nextOffset)}
            data-testid="plan-week-next"
            preventScrollReset
          >
            Next week
            <ChevronRightIcon aria-hidden="true" />
          </Link>
        )}
      </nav>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* One board column                                                            */
/* -------------------------------------------------------------------------- */

function PlanBoardColumn({
  column,
  selectedDay,
  armedDay,
  onArmDay,
  rowProps,
  density,
}: {
  readonly column: PlanColumn;
  readonly selectedDay: string;
  readonly armedDay: string | null;
  readonly onArmDay: (dateIso: string) => void;
  readonly rowProps: (
    item: SerializedTaskListItem,
    options: { readonly inWeek: boolean; readonly headingLevel: 2 | 3 },
  ) => TaskRowProps;
  readonly density: PlanPageData["density"];
}) {
  /*
   * The phone shows ONE day, and a merged weekend column is shown when EITHER of
   * its days is the selected one — otherwise selecting Sunday on a phone would
   * show nothing at all.
   */
  const selected = column.days.some((day) => day.dateIso === selectedDay);
  return (
    <div
      className="dh-plan__column"
      data-testid="plan-column"
      data-selected={selected ? "true" : undefined}
    >
      {column.days.map((day) => (
        <PlanDaySection
          key={day.dateIso}
          day={day}
          armed={armedDay === day.dateIso}
          onArmDay={onArmDay}
          rowProps={rowProps}
          density={density}
        />
      ))}
    </div>
  );
}

function PlanDaySection({
  day,
  armed,
  onArmDay,
  rowProps,
  density,
}: {
  readonly day: PlanDay;
  readonly armed: boolean;
  readonly onArmDay: (dateIso: string) => void;
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
  const commitmentWords = planningDurationAccessibleLabel(
    day.commitmentMinutes,
  );
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
      data-armed={armed ? "true" : undefined}
    >
      <header className="dh-plan__day-head">
        <h2
          className="dh-plan__day-title"
          id={`plan-day-heading-${day.dateIso}`}
        >
          <span className="dh-plan__day-weekday">{day.weekdayShort}</span>
          <span className="dh-plan__day-date">{day.dayNumber}</span>
          <span className="dh-visually-hidden">
            {day.fullLabel}
            {commitmentWords === null
              ? ""
              : `, ${commitmentWords} of commitments`}
          </span>
        </h2>
        {/* "Today" is a WORD, never a colour, and it is only ever the real today. */}
        {day.isToday ? <span className="dh-plan__day-now">Today</span> : null}
      </header>

      {/*
       * The calendar, as CONTEXT.
       *
       * Times, titles and where each one is, quietly, so the owner can plan
       * AROUND what is already on. It is never converted into a Task, it carries
       * no checkbox and it is not writable from here — DalyHub does not write to
       * anybody's calendar (CAL-01).
       */}
      <div className="dh-plan__band">
        <p className="dh-plan__band-label">
          Commitments
          {day.schedule.count > 0 ? (
            <span className="dh-plan__band-count">{day.schedule.count}</span>
          ) : null}
        </p>
        {events.length > 0 ? (
          <ul
            className="dh-plan__events"
            aria-label={`${day.fullLabel} calendar`}
          >
            {events.map((entry) => (
              <PlanCommitment entry={entry} key={entry.id} />
            ))}
          </ul>
        ) : (
          <p className="dh-plan__band-empty">No commitments</p>
        )}
      </div>

      <div className="dh-plan__band">
        <p className="dh-plan__band-label">
          Planned
          {day.tasks.length > 0 ? (
            <span className="dh-plan__band-count">{day.tasks.length}</span>
          ) : null}
          {/* Two quiet facts about the day's own work, and only when true. */}
          {day.waitingCount > 0 ? (
            <span className="dh-plan__band-note">
              {day.waitingCount} waiting
            </span>
          ) : null}
          {day.completedCount > 0 ? (
            <span className="dh-plan__band-note">
              {day.completedCount} done
            </span>
          ) : null}
        </p>
        {day.tasks.length > 0 ? (
          /*
           * The SHARED Task row, in its CARD presentation.
           *
           * `dh-tasklist--cards` is a variant of the one row (task-list.css), not
           * a second row: the same markup, the same controls, the same canonical
           * intents — recomposed for a 133px column, where the title wraps to
           * three lines instead of truncating to two words.
           */
          <TaskList
            ariaLabel={`Tasks planned for ${day.fullLabel}`}
            density={density}
            className="dh-tasklist--cards"
          >
            {day.tasks.map((task) => (
              <TaskRow
                key={task.id}
                {...rowProps(task, { inWeek: true, headingLevel: 3 })}
              />
            ))}
          </TaskList>
        ) : null}
        {/*
         * The column's one control. It ARMS this day for the queue's placement
         * and creates nothing — the accessible name says so, because "Plan a
         * task" on its own could reasonably be read as "make one".
         */}
        <button
          type="button"
          className="dh-plan__plan-here"
          data-testid="plan-arm-day"
          data-date={day.dateIso}
          aria-pressed={armed}
          onClick={() => onArmDay(day.dateIso)}
        >
          <PlusIcon aria-hidden="true" />
          <span aria-hidden="true">Plan a task</span>
          <span className="dh-visually-hidden">
            {armed
              ? `Stop planning for ${day.fullLabel}`
              : `Plan a task for ${day.fullLabel} — choose it from Still to place`}
          </span>
        </button>
      </div>
    </section>
  );
}

/**
 * One calendar commitment: when, what, where, and how long.
 *
 * A commitment is TEXT, not a control. It is deliberately not interactive: an
 * occurrence is read on the schedule surfaces that own it, and a planner that let
 * you open, complete or edit a calendar item would be the beginning of the
 * calendar application CAL-01 refuses to build. What the planner needs from the
 * calendar is exactly this — when the day is already spoken for — so that is
 * exactly what it draws.
 */
function PlanCommitment({ entry }: { readonly entry: ScheduleEntry }) {
  const minutes = planningEntryMinutes(entry);
  const duration = planningDurationLabel(minutes);
  return (
    <li
      className="dh-plan__event"
      data-testid="plan-event"
      data-cancelled={entry.cancelled ? "true" : undefined}
    >
      <span className="dh-plan__event-time">
        {entry.timeLabel ?? "All day"}
      </span>
      <span className="dh-plan__event-title">{entry.title}</span>
      {entry.location === null ? null : (
        <span className="dh-plan__event-where">{entry.location}</span>
      )}
      {duration === null ? null : (
        <span className="dh-plan__event-duration" aria-hidden="true">
          {duration}
        </span>
      )}
      <span className="dh-visually-hidden">
        {" "}
        — calendar, {entry.timeAccessibleLabel}
        {planningDurationAccessibleLabel(minutes) === null
          ? ""
          : `, ${planningDurationAccessibleLabel(minutes)}`}
      </span>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Still to place                                                              */
/* -------------------------------------------------------------------------- */

function PlanQueue({
  data,
  selected,
  placing,
  armedDay,
  onToggleSelected,
  onPlaceSelection,
  rowProps,
  headingRef,
}: {
  readonly data: PlanPageData;
  readonly selected: ReadonlySet<string>;
  readonly placing: boolean;
  readonly armedDay: string | null;
  readonly headingRef: React.RefObject<HTMLHeadingElement | null>;
  readonly onToggleSelected: (taskId: string, on: boolean) => void;
  readonly onPlaceSelection: (day: PlanDay) => void;
  readonly rowProps: (
    item: SerializedTaskListItem,
    options: { readonly inWeek: boolean; readonly headingLevel: 2 | 3 },
  ) => TaskRowProps;
}) {
  const count = selected.size;
  const armed = data.days.find((day) => day.dateIso === armedDay) ?? null;

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
        <span className="dh-plan__queue-count">{data.queue.length}</span>
      </header>

      {/*
       * SMART-01 §D5 — the queue's SOURCE, as chips (Mockup 7).
       *
       * "Suggested" is the deterministic built-in rule; every other option is one
       * of the owner's saved Tasks views, run through the SAME canonical Tasks
       * query path with the SAME filter vocabulary. Planning duplicates no filter
       * logic, which is why these two items shipped together.
       *
       * They are LINKS rather than a select: each source is a real URL the owner
       * can bookmark and share, Back works, and no JavaScript is required to
       * change source. The strip scrolls rather than wrapping, because a rail
       * that grows a row taller for every saved view pushes the work off screen.
       */}
      <div
        className="dh-plan__sources dh-scroll-strip"
        role="group"
        aria-label="Where the queue comes from"
      >
        {data.queueSources.map((source) => {
          const current = source.id === data.activeQueueSourceId;
          return (
            <Link
              key={source.id}
              className="dh-plan__source"
              to={source.query.length > 0 ? `/plan?${source.query}` : "/plan"}
              aria-current={current ? "true" : undefined}
              data-testid="plan-queue-source"
              data-source={source.id}
              preventScrollReset
            >
              {source.name}
            </Link>
          );
        })}
        {/* The door to where a source is MADE, in the place Mockup 7 draws its
            filter glyph. A saved view is the product's filter vocabulary, so the
            honest destination is the saved views themselves. */}
        <Link
          className="dh-plan__source-manage"
          to="/views"
          title="Saved views"
        >
          <FilterIcon aria-hidden="true" />
          <span className="dh-visually-hidden">Manage saved views</span>
        </Link>
      </div>

      {data.queue.length === 0 ? (
        <p className="dh-plan__queue-empty">
          {data.activeQueueSourceId === "suggested"
            ? "Nothing is waiting on a decision. Everything overdue, due this week, high priority or unfiled already has a day."
            : "That saved view has nothing left to place this week."}
        </p>
      ) : (
        <>
          {/*
           * The queue, GROUPED BY REASON — one heading per band, not one label
           * per row.
           *
           * The reason is a property of a GROUP of tasks, and stating it once is
           * both quieter and more useful: the owner reads "Overdue: these five",
           * decides about the five, and moves on.
           */}
          <div className="dh-plan__queue-groups">
            {groups.map((group) => (
              <div
                key={group.key}
                data-testid="plan-queue-group"
                data-band={group.key}
              >
                <TaskGroup
                  className="dh-plan__queue-group"
                  title={group.label}
                  count={group.entries.length}
                  headingLevel={3}
                  tone={group.key === "overdue" ? "overdue" : "default"}
                >
                  {/* The rule, in words, for anyone who needs it read out. A
                      view-sourced group has no rule to state — its reason is its
                      name — so it gets no second sentence. */}
                  {group.band === null ? null : (
                    <p className="dh-visually-hidden">
                      {PLANNING_QUEUE_BAND_NOTES[group.band]}
                    </p>
                  )}
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
                </TaskGroup>
              </div>
            ))}
          </div>

          {data.queueTruncated ? (
            <p className="dh-plan__queue-more">
              This is the first {data.queue.length}. Place some, or narrow the
              list with a saved view.
            </p>
          ) : null}

          {/*
           * The PLACEMENT bar — the primary interaction, and it is not a drag.
           *
           * Select rows (checkbox, Space, or a touch hold), then choose a day.
           * Seven ordinary buttons, each with the day in words as its accessible
           * name, committing ONE atomic bulk mutation. A keyboard user and a
           * screen-reader user have the whole capability; there is no
           * drag-and-drop anywhere in this surface, so there is nothing for them
           * to be excluded from (PLAN-01 §C2).
           *
           * UX-02 added the filled button above it, which commits to the day the
           * BOARD armed. It is the same one mutation — a second door into it, for
           * an owner who started from the column rather than from the queue.
           */}
          <div className="dh-plan__place" data-testid="plan-place-bar">
            <button
              type="button"
              className="dh-btn dh-btn--primary dh-plan__place-go"
              disabled={count === 0 || armed === null || placing}
              data-testid="plan-place-selected"
              onClick={() => {
                if (armed !== null) onPlaceSelection(armed);
              }}
            >
              {armed === null
                ? `Plan selected (${count})`
                : `Plan ${count} on ${armed.weekdayLong}`}
            </button>
            <p className="dh-plan__place-label">
              {count === 0
                ? "Select tasks, then choose a day."
                : armed === null
                  ? `${count} selected — choose a day:`
                  : `${count} selected for ${armed.fullLabel}. Deadlines are unchanged.`}
            </p>
            <div
              className="dh-plan__place-days"
              role="group"
              aria-label="Place the selected tasks"
            >
              {data.days.map((day) => (
                <button
                  key={day.dateIso}
                  type="button"
                  className="dh-plan__place-day"
                  disabled={count === 0 || placing}
                  aria-label={`Plan ${count} selected ${count === 1 ? "task" : "tasks"} for ${day.fullLabel}`}
                  data-testid="plan-place-day"
                  data-date={day.dateIso}
                  data-armed={day.dateIso === armedDay ? "true" : undefined}
                  onClick={() => onPlaceSelection(day)}
                >
                  <span aria-hidden="true">{day.weekdayShort}</span>
                </button>
              ))}
            </div>
          </div>
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
 * HABITS-01 — "Routines this week": what the week ALREADY asks of the owner.
 *
 * Read-only, and that is the whole design. PLAN-01 owns TASK placement; a Habit
 * is not a Task, cannot be given a day and must never appear in the "Still to
 * place" queue, consume its bulk selection or write a `scheduled_date`. Nothing
 * in this section is selectable, draggable or checkable — it is a list of names
 * and cadences, sitting beside the week so the owner can see their existing
 * commitments before adding more.
 *
 * The current week shows how it is going ("2 of 3"); a future week shows only
 * what it asks for, because a future day is never described as incomplete.
 */
function PlanRoutines({ data }: { readonly data: PlanPageData }) {
  if (data.routines.length === 0) return null;
  return (
    <section
      className="dh-plan__signals"
      aria-labelledby="plan-routines-heading"
      data-testid="plan-routines"
    >
      <header className="dh-plan__queue-head">
        <h2 id="plan-routines-heading" className="dh-plan__signals-title">
          Routines this week
        </h2>
        <span className="dh-plan__queue-count">{data.routines.length}</span>
      </header>
      <ul className="dh-plan__routine-list">
        {data.routines.map((routine) => (
          <li key={routine.id} className="dh-plan__routine">
            <Link className="dh-plan__signal-name" to={`/habits/${routine.id}`}>
              {routine.title}
            </Link>
            <span className="dh-plan__routine-meta">
              {routine.scheduleLabel}
              {routine.progressLabel === null
                ? ""
                : ` · ${routine.progressLabel}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="dh-plan__signals-note">
        Habits aren’t placed on days and don’t become tasks. This is what the
        week already asks for.
      </p>
    </section>
  );
}

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
      <header className="dh-plan__queue-head">
        <h2 id="plan-signals-heading" className="dh-plan__signals-title">
          Planning signals
        </h2>
      </header>
      <ul className="dh-plan__signal-list">
        {data.projectSignals.map((signal) => (
          <li key={signal.projectId} className="dh-plan__signal">
            <Link
              className="dh-plan__signal-open"
              to={`/projects/${signal.projectId}`}
            >
              <span className="dh-plan__signal-body">
                <span className="dh-plan__signal-name">{signal.title}</span>
                <span className="dh-plan__signal-gap">
                  {GAP_WORDS[signal.gap] ?? signal.gap}
                  {signal.gap === "overdue_work" && signal.overdueCount > 0
                    ? ` · ${signal.overdueCount} overdue`
                    : ""}
                </span>
                {signal.nextAction ? (
                  <span className="dh-plan__signal-next">
                    Next: {signal.nextAction.title}
                  </span>
                ) : null}
              </span>
              <ChevronRightIcon aria-hidden="true" />
            </Link>
          </li>
        ))}
        {data.goalSignals.map((signal) => (
          <li key={signal.goalId} className="dh-plan__signal">
            <Link
              className="dh-plan__signal-open"
              to={`/goals/${signal.goalId}`}
            >
              <span className="dh-plan__signal-body">
                <span className="dh-plan__signal-name">{signal.title}</span>
                <span className="dh-plan__signal-gap">
                  No planned supporting action this week
                </span>
              </span>
              <ChevronRightIcon aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="dh-plan__signals-note">
        Nothing here is scheduled for you. Open a record and decide.
      </p>
      <p className="dh-plan__signals-foot">
        <Link className="dh-plan__signals-link" to="/projects">
          <ProjectIcon aria-hidden="true" />
          Open projects
        </Link>
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Week at a glance, and the Review hand-off                                   */
/* -------------------------------------------------------------------------- */

/**
 * Mockup 7's foot: the same four figures, and the door to the Review focus.
 *
 * ── Why the focus is behind a disclosure ────────────────────────────────────
 * PLAN-01 drew the prior Review's written focus as a permanent panel above the
 * week, because REVIEW → PLAN is the premise of the whole surface. Mockup 7
 * replaces that panel with one control at the foot, and the reason is honest:
 * the focus is prose the owner wrote, it is read ONCE at the start of a planning
 * sitting, and a paragraph above the board costs the board its first fold every
 * time afterwards.
 *
 * So it is disclosed rather than removed. The button says whether there is one to
 * read, the panel is the same read-only rendering of the owner's own words, and
 * it still creates nothing — automatically turning that prose into Tasks would be
 * exactly the magic PLAN-01 §E rules out.
 */
function PlanGlance({ data }: { readonly data: PlanPageData }) {
  const [showFocus, setShowFocus] = useState(false);
  const { totals } = data;
  return (
    <>
      <section
        className="dh-plan__glance"
        aria-labelledby="plan-glance-heading"
        data-testid="plan-glance"
      >
        <h2 id="plan-glance-heading" className="dh-plan__glance-title">
          <CalendarIcon aria-hidden="true" />
          Week at a glance
        </h2>
        <ul className="dh-plan__glance-figures">
          <li className="dh-plan__glance-figure">
            <span className="dh-plan__glance-value">
              {totals.commitmentLabel ?? "None"}
            </span>
            <span className="dh-plan__glance-label">Calendar commitments</span>
            {totals.commitmentAccessibleLabel === null ? null : (
              <span className="dh-visually-hidden">
                {totals.commitmentAccessibleLabel}
              </span>
            )}
          </li>
          <li className="dh-plan__glance-figure">
            <span className="dh-plan__glance-value">{totals.plannedCount}</span>
            <span className="dh-plan__glance-label">Tasks planned</span>
          </li>
          <li className="dh-plan__glance-figure">
            <span className="dh-plan__glance-value">
              {totals.unplacedCount}
            </span>
            <span className="dh-plan__glance-label">Still to place</span>
          </li>
          <li
            className="dh-plan__glance-figure"
            data-tone={totals.overdueCount > 0 ? "overdue" : undefined}
          >
            <span className="dh-plan__glance-value">{totals.overdueCount}</span>
            <span className="dh-plan__glance-label">Overdue</span>
          </li>
        </ul>
        {data.priorFocus === null ? null : (
          <button
            type="button"
            className="dh-plan__glance-action"
            aria-expanded={showFocus}
            aria-controls="plan-focus-panel"
            data-testid="plan-focus-toggle"
            onClick={() => setShowFocus((open) => !open)}
          >
            <ReviewIcon aria-hidden="true" />
            {showFocus ? "Hide review focus" : "Review focus"}
          </button>
        )}
      </section>

      {data.priorFocus === null ? null : (
        <PlanFocus
          focus={data.priorFocus}
          hidden={!showFocus}
          id="plan-focus-panel"
        />
      )}
    </>
  );
}

/**
 * The focus a completed weekly Review wrote for this period.
 *
 * CONTEXT, and only context. It is READ from the Review that wrote it (never
 * copied), it creates nothing, and opening the planner does not touch the Review
 * in any way.
 */
function PlanFocus({
  focus,
  hidden,
  id,
}: {
  readonly focus: NonNullable<PlanPageData["priorFocus"]>;
  readonly hidden: boolean;
  readonly id: string;
}) {
  return (
    <section
      className="dh-plan__focus"
      id={id}
      /* `hidden` rather than unmounted: `aria-controls` keeps pointing at a real
         element and the subtree leaves the accessibility tree at the same time. */
      hidden={hidden}
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
        From <Link to={`/reviews/${focus.reviewId}`}>{focus.reviewTitle}</Link>{" "}
        ({focus.periodLabel}). Read from that Review, never copied — and nothing
        here is scheduled for you.
      </p>
    </section>
  );
}
