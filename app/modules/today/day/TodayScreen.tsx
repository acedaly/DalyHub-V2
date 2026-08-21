/**
 * TODAY-11 / CONVERGE-01 §1 — the Today screen, on ONE grid.
 *
 * The surface the owner lands on every morning, built ENTIRELY from what DalyHub
 * really knows. Every figure on it is a real reading, and the things the mockup
 * drew that this product cannot honestly back are omitted by recorded decision
 * rather than faked.
 *
 * ── WHAT IT IS ───────────────────────────────────────────────────────────────
 * Twelve columns, one gutter, four rows. Every band shares the same tracks.
 *
 *   Good afternoon, Aidan
 *   Saturday 16 August 2026
 *   Today · Tomorrow · Next 7 days
 *   ┌── 4 ───────────┐┌── 4 ───────────┐┌── 4 ───────────┐
 *   │ Tasks completed││ Tasks captured ││ Goals on track │   the week's
 *   │ 24  ╱‾╲╱‾      ││ 30  ▁▃▂▅▁▇▃    ││ 3  ▓▓▓▓░░      │   three measures
 *   └────────────────┘└────────────────┘└────────────────┘
 *   ┌── 7 ─────────────────────────┐┌── 5 ──────────────────┐
 *   │ Today's plan        8 tasks  ││ Schedule    View full │
 *   │  OVERDUE                     ││ August 2026           │
 *   │   ☐ Send the summary  2d ago ││ M T W T F S S         │
 *   │  DUE TODAY                   ││ · · ● · · · ·         │
 *   │   ☐ Draft the notes  Proj P1 ││ 09:00 ● Standup       │
 *   │  + Add task                  ││ 12:00 ● Lunch         │
 *   └──────────────────────────────┘└───────────────────────┘
 *   ┌── 7 ─────────────────────────┐┌── 5 ──────────────────┐
 *   │ Needs attention              ││ Continue working      │
 *   └──────────────────────────────┘└───────────────────────┘
 *   ┌── 7 ─────────────────────────┐┌── 5 ──────────────────┐
 *   │ Goal progress                ││ Quick capture         │
 *   │  ▢ ▢  two-up rail            ││ Daily reflection      │
 *   └──────────────────────────────┘└───────────────────────┘
 *
 * ── WHAT WENT, AND WHY ───────────────────────────────────────────────────────
 *   - **Insights.** A ring reading "24 of 30 captured" over the same window the
 *     two stat cards beside it already report, from the same single read. It was
 *     a third presentation of one fact, and the audit asks for it to be deleted
 *     rather than replaced — its information is above it. `todayInsight` went
 *     with it rather than being left as an unrendered model.
 *   - **The header's "+ Add task".** See the note at the header below.
 *
 * ── WHAT MOVED ───────────────────────────────────────────────────────────────
 * **Needs attention** and **Continue working** were the LAST band on the page,
 * under the Goal rail. They are now the second working row, above it: they
 * answer "what should I do now?", and a rail of Goal meters answers a question
 * measured in months.
 *
 * ── WHAT THE MOCKUP DRAWS AND THIS SCREEN DOES NOT ───────────────────────────
 * Three omissions, each because the capability genuinely does not exist. They
 * are recorded in full — with what was checked — in
 * `docs/design/TODAY_11_COMMAND_CENTRE_2026_08.md`.
 *
 *   - **Focus time ("6h 45m")**. DalyHub captures no focus time — no timer, no
 *     session record and no field it could be derived from. Building one would
 *     be a new feature wearing a visual pass's clothes, so the slot goes to the
 *     honest sibling of the first figure, from the same bounded query: what was
 *     CAPTURED this week beside what was completed.
 *   - **Productivity score ("78 · Great")**. A composite score is a judgement
 *     this product has refused everywhere it has been asked for: Analytics
 *     refuses it by name, Areas have no health percentage and Goals state an
 *     honest status. Inventing a formula on Today would break that line on the
 *     one screen that opens every day.
 *   - **Task times on the plan's rows ("9:00 AM")**. Verified at the schema:
 *     `task_details.due_date`/`scheduled_date` are `CHECK (… GLOB '????-??-??')`
 *     — a task is a DATE. A meeting is an instant, and those have times, in the
 *     Schedule panel beside the plan. Printing an invented time on a task row
 *     would be the plainest possible fabrication.
 *
 * Two smaller ones, for the same reason: the capture card's **Reminder** chip
 * (tasks have no reminder field and nothing reaches the owner outside the app —
 * DEBT-57) and its **Upload** chip (attachments are deferred — DEBT-35).
 *
 * ── WHAT THE MOCKUP DOES NOT DRAW AND THIS SCREEN KEEPS ──────────────────────
 * **Needs attention** and **Continue working**. The mockup is a composition for
 * what it shows; it is not an instruction to delete capability it never
 * depicted. Removing the attention rail would silently drop the ONLY surface
 * where an Asset obligation with no open Task reaches the owner (ADR-063
 * decision 10, and DEBT-57 is about that reach). **DayNav** stays
 * for the same class of reason: the week strip navigates the SCHEDULE's day,
 * while Tomorrow and Next 7 days show tomorrow's TASKS and seven days of task
 * counts, which the strip cannot.
 *
 * ── THE RULES THAT KEEP IT HONEST (unchanged since REDESIGN-03) ──────────────
 *   - **Zeros never render.** Every measure, every band, every panel is
 *     conditional on its own count. A quiet day is a short page.
 *   - **One fact, one derivation.** The week's completed and captured counts are
 *     read once and presented once each; no figure on this page is computed
 *     twice, and — since CONVERGE-01 §1 removed the Insights ring — none is
 *     PRESENTED twice either.
 *   - **Tasks have no times**, and the day's list says so by not having a time
 *     column at all.
 *   - **Every "View …" goes somewhere real.** There is no "View full calendar",
 *     because there is no calendar view distinct from the forward agenda.
 *
 * Capture now has a surface here as well as the global `+`: MOCKUP 5 draws one,
 * and it is the SHARED capture sheet behind every control on it — a field-shaped
 * button and four chips, exactly the pattern `DesktopTopBar` uses for search, so
 * Today gains no second capture implementation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";

// Imported from the specific module rather than the `~/shared/commands` barrel,
// so the Today route chunk does not eagerly pull the palette controller.
import { useRegisterContextualActions } from "~/shared/commands/CommandContextProvider";
import type { AppAction } from "~/shared/commands/action";
import {
  AccentIcon,
  identityAttribute,
  resolveIdentity,
} from "~/shared/entity";
import { withDrawerPushed, useDrawer } from "~/shared/drawer";
import { useCapture, type CaptureType } from "~/shared/capture";
import { Sparkline } from "~/shared/charts";
import { HabitRow, useHabitCheckIn } from "~/shared/habits";
import type { SerializedHabit } from "~/shared/habits";
import { ProgressTrack } from "~/shared/progress";
import {
  AssetIcon,
  CheckCircleIcon,
  GoalIcon,
  PlusIcon,
  ProjectIcon,
  ReflectionIcon,
  ScheduleIcon,
  TaskIcon,
  ToneIcon,
  type ToneName,
} from "~/shared/icons";
import {
  GoalProgressReadout,
  formatMeasurementChange,
  goalCheckInLabel,
} from "~/shared/goal-progress";

import { TaskList } from "~/shared/task-record/TaskList";
import { TaskRow, type TaskRowProps } from "~/shared/task-record/TaskRow";
import { TaskTitleEditor } from "~/shared/task-record/TaskTitleEditor";
import { buildTaskRowActions } from "~/shared/task-record/task-row-actions";
import {
  applyTaskListItemPatch,
  toTaskRowProjection,
} from "~/shared/task-record/task-view";

import { DayNav } from "../schedule/DayNav";
import { ScheduleList } from "../schedule/ScheduleList";

import {
  bucketDay,
  focusTodaySlice,
  greetingFor,
  dayPartForHour,
  nextUp,
  overdueSlice,
  tasksForTodayCount,
  type DayTask,
} from "./day-view";
import { useTaskSurfaceActions } from "~/shared/task-record/use-task-surface-actions";
import {
  type AttentionItem,
  type AttentionKind,
  type ContinueProject,
} from "./attention-view";
import { HELP_DRAWER_KEY } from "../keyboard/KeyboardHelp";
import { goalIsOnTrack } from "~/shared/goal-progress";

import { todayMeasures, type TodayMeasure } from "./measures";
import { weekStripDayHeading, weekStripMonthLabel } from "./week-strip";
import type { TodayActivityTrend, TodayGoal } from "./goal-progress";
import type { TodayDayData, TodayWeekDay } from "./load";

export type TodayScreenProps = {
  readonly data: TodayDayData;
  /**
   * GOAL-02 — open the check-in for a Goal, from Today.
   *
   * The route owns the sheet and the write, exactly as the Goal record does;
   * this screen only says which Goal was pressed. Today never duplicates the
   * Goal record — it offers the one action a Goal needs most often.
   */
  readonly onUpdateGoal?: (
    goal: TodayGoal,
    trigger: HTMLElement | null,
  ) => void;
  /**
   * CAL-01 — open an imported calendar occurrence's detail in Today's own
   * Drawer. Supplied by the route, which owns the Drawer, exactly as the Task
   * record already is.
   */
  readonly onOpenEvent?: (entryId: string) => void;
  readonly eventHref?: (entryId: string) => string;
};

/* -------------------------------------------------------------------------- */
/* Capture                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Any control on this page that creates something, wired to the ONE shared
 * capture surface.
 *
 * `useCapture()` returns null outside a provider (a unit test, a `/design`
 * fixture), and the control then renders nothing rather than shipping a button
 * that cannot complete — the same rule §9 deviation 2 applies to "+ New goal".
 */
function useCaptureOpener(type?: CaptureType) {
  const capture = useCapture();
  const open = useCallback(
    (opener: HTMLElement | null) => {
      capture?.openCapture(type, opener);
    },
    [capture, type],
  );
  return { available: capture !== null, open };
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

/** The glyph for a rail row's subject. Decorative — the words carry the meaning. */
function AttentionGlyph({ kind }: { readonly kind: AttentionKind }) {
  switch (kind) {
    case "project":
      return <ProjectIcon />;
    case "goal":
      return <GoalIcon />;
    case "waiting":
      return <ScheduleIcon />;
    case "asset":
      return <AssetIcon />;
    case "inbox":
      return <TaskIcon />;
  }
}

/**
 * UIX-01 — the tonal identity of a rail row's SUBJECT KIND.
 *
 * A fixed map, not a hash: these five kinds are a closed set the product
 * defines, so the same kind is the same colour on every visit and on every
 * device. It is identity, never status — an amber Asset row does not mean the
 * Asset is in trouble, and the row's own words say what needs doing.
 */
const ATTENTION_TONES: Readonly<Record<AttentionKind, ToneName>> = {
  project: "blue",
  goal: "green",
  waiting: "amber",
  asset: "teal",
  inbox: "violet",
};

/**
 * TODAY-TASK-01 / DEBT-143 — one named band of the plan, drawn with the SHARED
 * task row.
 *
 * ── What was here ───────────────────────────────────────────────────────────
 * A module-private `TaskRow` (a checkbox, a title link, a neutral parent pill
 * and a priority flag) and a `ParentPill` beside it. They were a second anatomy
 * for an object the product already had one of, and — the part that actually
 * cost the owner something — a READ-ONLY one: a task's project, its dates and
 * its priority were editable in place on `/tasks` and merely printed on the
 * surface opened first every morning. Both are deleted.
 *
 * ── What draws the row now ──────────────────────────────────────────────────
 * `~/shared/task-record/TaskRow`, inside the shared `TaskList` that owns the
 * column grid. Every capability comes with it and none of it is re-implemented
 * here: completion, the inline project/date/priority editors, the row overflow,
 * the touch long-press, the swipe, the pending/offline note and the
 * accessibility behaviour. The plan's own facts did not need a new slot to
 * survive, which is the strongest evidence the two rows were the same row:
 *
 *   - the mockup's context PILL is the row's project cell, and it is now an
 *     identity-carrying editor rather than a neutral link (DEBT-144);
 *   - the overdue AGE ("Due 2 days ago") is the row's date cell, which already
 *     renders a passed date as "2 days ago" in the overdue colour, in words;
 *   - the priority FLAG is the row's priority cell.
 *
 * A band is still a heading and its rows: no card, no surface, no count beside
 * the label, and it renders only when it holds work. The label is an `h3` under
 * the panel's `h2`, which is what makes the headings a real outline — Today's
 * plan → Overdue / Due today / Planned today.
 */
function PlanBand({
  label,
  tone,
  tasks,
  rowProps,
  children,
}: {
  readonly label: string;
  readonly tone?: "overdue";
  readonly tasks: readonly DayTask[];
  readonly rowProps: (task: DayTask) => TaskRowProps;
  /** The band's own trailing row, when it has one (the overdue remainder). */
  readonly children?: React.ReactNode;
}) {
  if (tasks.length === 0) {
    return null;
  }
  return (
    <div className="dh-day-section" data-tone={tone}>
      <h3 className="dh-day-section__label">{label}</h3>
      {/*
       * The band's own `TaskList`.
       *
       * The list — not the row — owns the column template, and it is a container
       * query on the LIST's width, so the same rows that run five columns across
       * `/tasks` run three inside the plan's narrower card and become the phone's
       * two-line composition at 393. That is why Today needed no Today-specific
       * column rules: the responsive ladder is a property of the shared list and
       * Today simply gives it less room.
       *
       * One list per band rather than one for the panel, because the bands are
       * three separately-bounded slices with their own headings; they are the
       * same width, so the columns line up across all three.
       */}
      <TaskList ariaLabel={`${label} tasks`}>
        {tasks.map((task) => (
          <TaskRow key={task.id} {...rowProps(task)} />
        ))}
        {children}
      </TaskList>
    </div>
  );
}

function NowTaskPanel({
  task,
  rowProps,
  overdue,
}: {
  readonly task: DayTask;
  readonly rowProps: (task: DayTask) => TaskRowProps;
  readonly overdue: boolean;
}) {
  return (
    <section
      className="dh-today__panel dh-today__panel--card dh-today__now"
      aria-labelledby="today-now-heading"
      data-testid="today-now"
      data-overdue={overdue ? "true" : undefined}
    >
      <div className="dh-today__panel-head">
        <h2 className="dh-today__now-label" id="today-now-heading">
          Now
        </h2>
      </div>
      {/*
       * DHDS-08 §8 — Today CONTINUITY.
       *
       * When the Now task is completed and another becomes the next recommended
       * action, the replacement crossfades INTO THE SAME POSITION rather than
       * the composition re-rendering under the owner. The panel, its heading and
       * everything around it hold still; only the task inside changes. The
       * reading is "I finished that — this is what comes next", which is the one
       * thing this position is for.
       *
       * `key` on the task's id is what makes that honest: React remounts this
       * subtree only when the Now task ACTUALLY changed, so the crossfade can
       * never replay on an incidental re-render (§13). A revalidation that
       * returns the same task re-renders it in place with no motion at all.
       *
       * It is a fade and deliberately not a slide: the POSITION carries the
       * meaning, so the position must not move. §8 rules out the carousel.
       */}
      <div key={task.id} className="dh-motion-succeed">
        <TaskList ariaLabel="Now task">
          <TaskRow {...rowProps(task)} />
        </TaskList>
      </div>
    </section>
  );
}

function NextUpPanel({
  meeting,
}: {
  readonly meeting: Extract<ReturnType<typeof nextUp>, { kind: "meeting" }>;
}) {
  return (
    <section
      className="dh-today__panel dh-today__next"
      aria-labelledby="today-next-heading"
      data-testid="today-next"
    >
      <div className="dh-today__panel-head">
        <h2 className="dh-today__panel-title" id="today-next-heading">
          Next up
        </h2>
      </div>
      <Link
        className="dh-today__next-link"
        to={`/meeting/${encodeURIComponent(meeting.id)}`}
      >
        <span className="dh-today__next-time">{meeting.timeLabel}</span>
        <span className="dh-today__next-copy">
          <strong>{meeting.title}</strong>
          {meeting.context === null ? null : <span>{meeting.context}</span>}
        </span>
        <span className="dh-today__next-arrow" aria-hidden="true">
          ›
        </span>
      </Link>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The stat rank                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The visualisation a stat card carries, inside its own PLOT REGION.
 *
 * ── The bleed this wrapper exists to make impossible ────────────────────────
 * Both plots are `inline-size: 100%` primitives — `.dh-spark` and
 * `.dh-progress__track` each set it, because an SVG with a viewBox and a bare
 * `<div>` bar have no intrinsic width to stretch from. The card then inset them
 * with `margin-inline`, and a percentage width resolves against the CONTAINING
 * BLOCK while margins are added OUTSIDE it: the plot was laid out 16px in from
 * the card's content edge at its full content width, so its right edge landed
 * exactly 16px PAST the card. Measured on `/today` before this change, identical
 * at every width because it is a constant, not a wide-screen artefact:
 *
 *   3440: card content [265, 647] · sparkline ink [278.8, 665.3] → 18.3px out
 *   1440: card content [265, 634] · sparkline ink [278.8, 651.9] → 18.3px out
 *   3440: card content [1057, 1439] · goals meter [1073, 1455]   → 16px out
 *
 * (The sparkline's extra 2.3px is the end marker's 4.5px stroke radius, which
 * `.dh-spark`'s own `overflow-clip-margin` correctly allows — that clip was
 * doing its job; the box it was clipping was in the wrong place.)
 *
 * The inset now lives on a wrapper that owns it as PADDING, and the plot fills
 * that wrapper's content box at the 100% it asks for. A percentage width can no
 * longer be added to a margin because there is no margin left to add it to. The
 * wrapper also clips, so the GRAPH REGION is bounded without putting `overflow`
 * on the card — which would clip focus rings and any popover a card ever grows.
 */
function MeasurePlot({ measure }: { readonly measure: TodayMeasure }) {
  const chart = measure.chart;
  if (chart === null) return null;
  return (
    <div className="dh-today__measure-plot" data-testid="today-measure-plot">
      {chart.kind === "spark" ? (
        <Sparkline
          points={chart.points.map((point) => ({
            key: point.dateIso,
            date: point.dateIso,
            value: point.value,
          }))}
          direction="increase"
          /*
           * TODAY-TASK-01 §B2 — 24px, down from 32.
           *
           * The plot now sits BESIDE the figure rather than under it, so its
           * height is bounded by the line it shares. Evidence for a number, at
           * the size evidence should be; a chart is Analytics' subject, not
           * Today's.
           */
          height={24}
        />
      ) : (
        <ProgressTrack
          label={`${measure.label} progress`}
          percent={chart.percent}
          valueText={chart.valueText}
        />
      )}
    </div>
  );
}

/**
 * The stat rank: the week's measures, directly under the greeting.
 *
 * ── §3.1 — this REVERSES FINAL-UI §45, deliberately ─────────────────────────
 * FINAL-UI moved Today's figures BELOW the day's work, citing its own §45 ("do
 * not put decorative stats before actionable content"). MOCKUP 5 puts them back
 * at the top, and the mockup is the owner's newer intent, so it wins — recorded
 * here and in `TODAY_11_COMMAND_CENTRE_2026_08.md` rather than silently swapped.
 *
 * §45's SPIRIT is kept by making the rank shallow: one compact card rank, ~92px,
 * a label, a figure and one small chart. The greeting above it is a page title
 * at the page-title role rather than a banner, and real work is still visible
 * above the fold at 1280 and at 390 — which is the thing §45 was protecting and
 * the thing D11 ("Today has no hero") means.
 *
 * `auto-fit` rather than a fixed count: with two measures they share the width,
 * with one it does not stretch, and the rank disappears entirely when there is
 * nothing real to put in it.
 */
function TodayStatRank({
  trend,
  goals,
}: {
  readonly trend: TodayActivityTrend | null;
  readonly goals: readonly TodayGoal[];
}) {
  const measures = todayMeasures({ trend, goals });
  if (measures.length === 0) return null;
  return (
    <div className="dh-today__summary" data-testid="today-summary">
      <details className="dh-today__weekly">
        <summary>Last 7 days</summary>
        <ul className="dh-today__weekly-list">
          {measures.map((measure) => {
            /*
             * The LABEL leads and the figure follows, because that is the reading
             * order the mockup sets and the only one that works when three cards sit
             * side by side: the eye lands on the number, and the words above it are
             * what the number is OF.
             *
             * The parts are the same markup whether or not the measure links, so a
             * linked and an unlinked card are the same object at a glance — the link
             * is an affordance on the card, not a different card.
             */
            const body = (
              <>
                <span className="dh-today__measure-label">{measure.label}</span>
                {/* The figure and its evidence share ONE line, which is what makes
                the rank a strip rather than three tiles. */}
                <span className="dh-today__measure-figure">
                  <span className="dh-today__measure-value">
                    {measure.value}
                  </span>
                  <MeasurePlot measure={measure} />
                </span>
                <span className="dh-today__measure-note">{measure.note}</span>
              </>
            );
            return (
              <li className="dh-today__measure" key={measure.id}>
                {/*
                 * The body is ALWAYS one element — a link when there is somewhere to
                 * go, a plain box when there is not — so a linked and an unlinked
                 * measure are the same object at a glance and the plot sits inside
                 * the same box as the figure either way. The link is an affordance on
                 * the measure, not a different measure.
                 */}
                {measure.href === null ? (
                  <span className="dh-today__measure-body">{body}</span>
                ) : (
                  <Link
                    className="dh-today__measure-body dh-today__measure-link"
                    to={measure.href}
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Schedule                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * TODAY-11 — the week strip.
 *
 * Seven day buttons over the schedule's timeline, from the ONE window the loader
 * already read. Selecting a day changes which day the timeline below shows; it
 * changes NOTHING else on the page, and it never claims the selected day is
 * today.
 *
 * ── Keyboard ────────────────────────────────────────────────────────────────
 * A `tablist`, because that is exactly what it is: seven controls selecting one
 * of seven panels rendered in the same place. So it gets the tablist keyboard
 * contract for free from the pattern the product already uses — arrow keys move
 * between days, Home and End jump to the ends, and only the selected day is in
 * the tab order, so tabbing past the strip costs one stop rather than seven.
 * The implementation is explicit rather than borrowed from `ViewTabs`, which
 * navigates to ROUTES; these are not links, and making them links would put six
 * dead history entries in the owner's Back button.
 */
function WeekStrip({
  days,
  selectedIso,
  onSelect,
}: {
  readonly days: readonly TodayWeekDay[];
  readonly selectedIso: string;
  readonly onSelect: (dateIso: string) => void;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const month = weekStripMonthLabel(days);

  const move = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      const last = days.length - 1;
      let next: number | null = null;
      if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
      else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = last;
      if (next === null) return;
      event.preventDefault();
      const target = days[next];
      if (target === undefined) return;
      onSelect(target.dateIso);
      refs.current.get(target.dateIso)?.focus();
    },
    [days, onSelect],
  );

  return (
    <div className="dh-weekstrip">
      {month === null ? null : <p className="dh-weekstrip__month">{month}</p>}
      <div
        className="dh-weekstrip__days"
        role="tablist"
        aria-label="Day of the week"
        data-testid="today-week-strip"
      >
        {days.map((day, index) => {
          const selected = day.dateIso === selectedIso;
          return (
            <button
              key={day.dateIso}
              type="button"
              role="tab"
              id={`today-week-${day.dateIso}`}
              aria-selected={selected}
              aria-controls="today-schedule-panel"
              tabIndex={selected ? 0 : -1}
              className="dh-weekstrip__day"
              data-today={day.isToday ? "true" : undefined}
              data-date={day.dateIso}
              ref={(node) => {
                if (node === null) refs.current.delete(day.dateIso);
                else refs.current.set(day.dateIso, node);
              }}
              onClick={() => onSelect(day.dateIso)}
              onKeyDown={(event) => move(event, index)}
            >
              {/*
               * The whole fact, in words, once. The weekday letters and the date
               * are two `aria-hidden` display parts, and the button's own name
               * states the day, whether it is today, and how much is on it —
               * because the dot underneath is a MARK, and a mark that carries
               * meaning on its own is the colour-alone signal §15 forbids.
               */}
              <span className="dh-visually-hidden">
                {weekStripDayHeading(day)}
                {day.itemCount === 0
                  ? " — nothing scheduled"
                  : `, ${day.itemCount} scheduled`}
              </span>
              <span className="dh-weekstrip__weekday" aria-hidden="true">
                {day.weekdayLabel}
              </span>
              <span className="dh-weekstrip__date" aria-hidden="true">
                {day.dayNumber}
              </span>
              <span
                className="dh-weekstrip__mark"
                data-has-items={day.itemCount > 0 ? "true" : undefined}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * CAL-01 — the day's unified SCHEDULE, under the week it belongs to.
 *
 * Every occurrence from every enabled external calendar source, plus the DalyHub
 * Meetings no occurrence already represents, in one chronology. TODAY-11 gave it
 * the mockup's week strip; the ROWS are unchanged, because a schedule row is the
 * same row on Today, Tomorrow and Next 7 days and a surface-specific variant is
 * how two pages come to look like two products.
 *
 * ── ONE trailing link, and it goes somewhere real ───────────────────────────
 * The mockup draws two — "View full calendar" at the top and "View full
 * schedule" at the foot — and DalyHub has one destination for both:
 * `/today/upcoming`, the forward agenda. `/today/schedule` is NOT a page; it is
 * CAL-03's POST-only resource route (`/today/schedule/:eventId/:action`) with no
 * `GET` at all, so linking to it would 405. There is no month grid and none is
 * being built (CAL-01 §21, §45), so "View full calendar" is omitted rather than
 * pointed at the same route under a second name.
 */
function SchedulePanel({
  week,
  todayIso,
  stale,
  hasSources,
  onOpenEvent,
  eventHref,
}: {
  readonly week: readonly TodayWeekDay[];
  readonly todayIso: string;
  readonly stale: boolean;
  readonly hasSources: boolean;
  readonly onOpenEvent?: (entryId: string) => void;
  readonly eventHref?: (entryId: string) => string;
}) {
  const [selectedIso, setSelectedIso] = useState(todayIso);
  // The loader's day is the authority: a revalidation that crosses midnight, or
  // a week that no longer contains the selection, resets to the owner's today
  // rather than showing a day the page no longer holds.
  useEffect(() => {
    setSelectedIso((current) =>
      week.some((day) => day.dateIso === current) ? current : todayIso,
    );
  }, [week, todayIso]);

  const selected =
    week.find((day) => day.dateIso === selectedIso) ??
    week.find((day) => day.dateIso === todayIso) ??
    week[0];
  if (selected === undefined) return null;

  return (
    <section
      className="dh-today__panel dh-today__schedule"
      aria-labelledby="today-schedule-heading"
      data-testid="today-schedule"
    >
      <div className="dh-today__panel-head">
        <h2 className="dh-today__panel-title" id="today-schedule-heading">
          Schedule
        </h2>
        <Link className="dh-today__panel-action" to="/today/upcoming">
          View full schedule
        </Link>
      </div>

      <WeekStrip
        days={week}
        selectedIso={selected.dateIso}
        onSelect={setSelectedIso}
      />

      <div
        id="today-schedule-panel"
        role="tabpanel"
        aria-labelledby={`today-week-${selected.dateIso}`}
        tabIndex={-1}
        className="dh-today__schedule-day"
      >
        {/*
         * The selected day is NAMED above its rows. Without it the timeline is
         * seven identical-looking lists and the only clue about which one is
         * showing is a filled circle in the strip — which is exactly the
         * colour-alone signal the strip's own accessible names avoid.
         */}
        <p className="dh-today__schedule-date">
          {weekStripDayHeading(selected)}
        </p>
        {selected.schedule.count > 0 ? (
          <ScheduleList
            schedule={selected.schedule}
            onOpenEvent={onOpenEvent}
            eventHref={eventHref}
          />
        ) : (
          /*
           * Two different absences, two different sentences. "Nothing is on"
           * and "no calendar is connected" are not the same fact, and giving
           * them one line would make a working empty day look like a broken
           * integration.
           */
          <p className="dh-today__quiet">
            {hasSources
              ? "Nothing scheduled."
              : "Nothing scheduled. Connect a calendar in Settings to see your day here."}
          </p>
        )}
      </div>

      {/*
       * Freshness, stated only when it is NOT fine.
       *
       * A line saying "everything synced" on every visit is noise; a day built
       * from a failed refresh that says nothing is a lie. So the panel is silent
       * when the projection is current and says so plainly when it is not — and
       * points at the place that can fix it.
       */}
      {stale ? (
        <p className="dh-today__panel-foot">
          <Link
            className="dh-btn dh-btn--ghost"
            to="/settings?section=calendars"
          >
            A calendar did not refresh — showing the last schedule DalyHub
            loaded
          </Link>
        </p>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Daily reflection                                                            */
/* -------------------------------------------------------------------------- */

/**
 * TODAY-11 — the Daily reflection card: a doorway, never a judge.
 *
 * If today already holds a Diary entry, the card shows its opening. If it does
 * not, the card asks the question the mockup asks and opens the Diary capture
 * panel. There is no sentiment analysis, no AI and no streak — the product's AI
 * proposes and never characterises, and nothing here reads the owner's writing
 * for anything except its first hundred and eighty characters.
 */
function ReflectionCard({
  reflection,
}: {
  readonly reflection: TodayDayData["reflection"];
}) {
  const diary = useCaptureOpener("diary");
  return (
    <section
      className="dh-today__panel dh-today__reflection"
      aria-labelledby="today-reflection-heading"
      data-testid="today-reflection"
    >
      <div className="dh-today__panel-head">
        <h2 className="dh-today__panel-title" id="today-reflection-heading">
          Daily reflection
        </h2>
      </div>
      {reflection === null ? (
        <>
          <p className="dh-today__reflection-prompt">What went well today?</p>
          {diary.available ? (
            <p>
              <button
                type="button"
                className="dh-btn dh-btn--ghost dh-today__reflection-write"
                data-testid="today-reflection-write"
                onClick={(event) => diary.open(event.currentTarget)}
              >
                <span className="dh-btn__icon" aria-hidden="true">
                  <ReflectionIcon />
                </span>
                Write today’s entry
              </button>
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="dh-today__reflection-prompt">
            {reflection.entryTypeLabel ?? "Today’s entry"}
          </p>
          <p className="dh-today__reflection-title">
            <Link to={`/diary/${encodeURIComponent(reflection.id)}`}>
              {reflection.title}
            </Link>
          </p>
          {reflection.excerpt === null ? null : (
            <p className="dh-today__reflection-excerpt">{reflection.excerpt}</p>
          )}
        </>
      )}
      <p className="dh-today__panel-foot">
        <Link className="dh-today__panel-action" to="/diary">
          View all reflections
        </Link>
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                  */
/* -------------------------------------------------------------------------- */

export function TodayScreen({
  data,
  onUpdateGoal,
  onOpenEvent,
  eventHref,
}: TodayScreenProps) {
  const [searchParams] = useSearchParams();
  const { openDrawer } = useDrawer();

  /*
   * TODAY-TASK-01 — the day's mutations, through the CANONICAL routes.
   *
   * `useTaskSurfaceActions` holds the in-flight patch map, posts to `/tasks/:id` and
   * `/tasks/bulk`, revalidates on success and rolls back exactly what a refused
   * write painted. It is a HOST, not an authority — see its own file.
   */
  const actions = useTaskSurfaceActions();
  const { clearPatches } = actions;
  /**
   * DHDS-10 — which row (if any) is being renamed in place.
   *
   * Held by the SURFACE, exactly as `/tasks` holds it, so at most one title is
   * ever in edit mode and every other row keeps its ordinary open link. Inline
   * renaming must never cost the way into the record.
   */
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  // Fresh loader data is the truth; every client guess is dropped the moment it
  // arrives, which is what keeps a patch a guess rather than a second state.
  useEffect(() => {
    clearPatches();
  }, [data, clearPatches]);

  /*
   * The day, re-bucketed against the OPTIMISTIC state.
   *
   * Every patch is applied to the SOURCE record and the pure bucketing is then
   * re-run over the result, so a ticked task stays in place, dimmed at the end of
   * the band it was already in, and the count stays stable while the row moves.
   * Re-deriving rather than patching the rendered row is what stops an optimistic
   * row having a display value the server's own answer could not produce.
   *
   * It also means a change made from a row — a new project, a new due date —
   * re-buckets the day immediately: re-projecting a task to tomorrow moves it out
   * of "Due today" without waiting for the round trip, and the revalidation
   * confirms it.
   */
  const buckets = useMemo(() => {
    const applied = [...data.overdue, ...data.today].map((task) => {
      const patched = applyTaskListItemPatch(
        task,
        actions.patches.get(task.id),
      );
      if (patched === task) return task;
      const completed = patched.completedAt !== null;
      return {
        ...patched,
        completed,
        completedDate: completed ? (task.completedDate ?? data.todayIso) : null,
      };
    });
    return bucketDay(applied, data.todayIso);
  }, [data, actions.patches]);

  /*
   * TODAY-10 — the figure is the CANONICAL count, not the row count.
   *
   * "View all N tasks for today" links straight to `/tasks?system=today`, so it
   * has to be that view's number. A Task due today that has also slipped its
   * plan is filed under Overdue here and counted by that view there; deriving
   * the figure from the membership rule rather than from the "for today" run is
   * what stops the link and its own destination disagreeing.
   */
  const todayCount = tasksForTodayCount(buckets, data.todayIso);
  const overdue = overdueSlice(buckets.overdue);
  const plan = focusTodaySlice(buckets);
  const nowTask =
    buckets.overdue.find((task) => !task.completed) ??
    buckets.today.find((task) => !task.completed) ??
    null;
  const next = nextUp({ meetings: data.meetings, buckets });
  const nextMeeting = next?.kind === "meeting" ? next : null;
  const remainingOverdue = overdue.shown.filter(
    (task) => !task.completed && task.id !== nowTask?.id,
  );
  const remainingDueToday = plan.dueToday.filter(
    (task) => !task.completed && task.id !== nowTask?.id,
  );
  const remainingPlannedToday = plan.plannedToday.filter(
    (task) => !task.completed && task.id !== nowTask?.id,
  );
  const completedTasks = [...buckets.overdue, ...buckets.today].filter(
    (task) => task.completed,
  );
  const greeting = greetingFor(dayPartForHour(data.hour), data.ownerName);
  const openTodayCount =
    buckets.overdue.filter((task) => !task.completed).length +
    buckets.today.filter((task) => !task.completed).length;
  const attentionSummary =
    openTodayCount === 0
      ? "Your day is clear."
      : openTodayCount === 1
        ? "One task needs your attention today."
        : `${openTodayCount} tasks need your attention today.`;

  /*
   * The ONE contextual command Today registers: `?` opens the keyboard
   * reference in Today's own DRAWER rather than the shell's sheet.
   *
   * This is not a preference about where help looks nicer. Hosting it in the
   * drawer STACK is what makes an open task record stop being the top drawer
   * while help is above it — which is what stops `C`/`P`/`Shift+P` reaching a
   * task the owner can no longer see. A sheet sits outside the stack, so the
   * record stays top and the shortcuts keep firing behind it. Converging the
   * two hosts (and fixing that at the shell instead) remains DEBT-18.
   */
  const helpCommand = useMemo<readonly AppAction[]>(
    () => [
      {
        id: "today.cmd.keyboard_help",
        title: "Keyboard shortcuts",
        subtitle: "Show the keyboard reference",
        keywords: ["keyboard", "shortcuts", "help", "keys", "reference"],
        shortcut: { key: "?", modifiers: ["shift"] },
        kind: "run",
        run: () => {
          openDrawer(HELP_DRAWER_KEY);
          return { ok: true };
        },
      },
    ],
    [openDrawer],
  );
  useRegisterContextualActions(helpCommand);

  /**
   * TODAY-TASK-01 — one day task, as SHARED `TaskRow` props.
   *
   * Everything about authority is the Tasks collection's: the completion control,
   * the three inline editors and the overflow all post the same canonical intents
   * to the same canonical routes. What this function supplies is only the data
   * and the callbacks — which is the whole contract the shared row asks for.
   *
   * One deliberate difference from `/tasks`, which the caller states as an
   * omission rather than as a second menu it assembles: **no "Plan for today"**.
   * Every row on this panel is already today's work — it is the membership rule
   * the panel is built from — so the item would be an act with no effect on
   * every row it appeared on.
   *
   * ── DHDS-10 — "Rename" is no longer the second one ──────────────────────────
   * It was, on the reading that "Today's plan is a bounded view of the day, not
   * the collection you file and tidy from". The reading does not survive §37 and
   * §49: Today is where the working day is actually run, correcting a title is
   * one of the small changes an owner makes while running it, and the previous
   * answer was to open the record and lose the surface. It is the SAME shared
   * editor `/tasks` uses, posting the same `rename` intent — a convergence, not
   * a second path.
   */
  const rowProps = useCallback(
    (task: DayTask): TaskRowProps => {
      const key = `task:${task.id}`;
      const row = toTaskRowProjection(task);
      return {
        task: row,
        todayIso: data.todayIso,
        parents: data.parents,
        // `h3` under the band's own `h3`? No — the band label is the `h3`, so the
        // row's title is one level deeper and the outline stays: page → panel →
        // band → task.
        headingLevel: 3,
        href: `?${withDrawerPushed(searchParams, key).toString()}`,
        onOpen: () => openDrawer(key),
        onCompletedChange: (complete: boolean) =>
          actions.setCompleted(task.id, complete, task.title),
        onInlineSave: actions.reportInlineSave,
        /*
         * DHDS-10 §11 — the project menu's escape hatch opens the shared
         * searchable picker over the row's own cell, exactly as it now does on
         * `/tasks`. It used to open the Task's record through `task-move:`,
         * which is a record navigation for a one-value choice.
         */
        overflowActions: buildTaskRowActions(row, {
          onOpenRecord: () => openDrawer(key),
          onRename: () => setEditingTitleId(task.id),
          onMoveToParent: () => openDrawer(`task-move:${task.id}`),
          onSomeday: () =>
            actions.setField(
              task.id,
              { intent: "set_commitment", commitment: "someday" },
              `${task.title} moved to Someday / Maybe.`,
              { commitmentState: "someday" },
            ),
          onSkipOccurrence: () =>
            actions.setRecord(
              task.id,
              { intent: "skip_occurrence" },
              `Skipped this occurrence of ${task.title}.`,
            ),
          onStopRepeating: () =>
            actions.setRecord(
              task.id,
              { intent: "set_recurrence" },
              `${task.title} no longer repeats.`,
            ),
        }),
        // The editor replaces the title ONLY while this row is being renamed;
        // every other row keeps its ordinary open link.
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
      data.todayIso,
      data.parents,
      searchParams,
      openDrawer,
      actions,
      editingTitleId,
    ],
  );

  const hasDay = buckets.overdue.length > 0 || buckets.today.length > 0;

  return (
    <div className="dh-today">
      {/*
       * The header block is PAGE CONTENT on the canvas — the greeting is the
       * screen's heading, not a widget with a label above it. It states who and
       * when and then gets out of the way.
       *
       * ── The mockup's SEARCH icon is deliberately not here ──────────────────
       * The shell already carries search, as a real labelled control on the same
       * gutter line one rank above this heading (`DesktopTopBar`) and in the
       * phone bar (`MobileTopBar`), both bound to `/`. A second search
       * affordance on one page is the "second search implementation to keep in
       * step with the first" DS-03 refused when it settled the control's fourth
       * and final home.
       *
       * ── The header's "+ Add task" is deliberately GONE ─────────────────────
       * Today carried several doors onto the same capture sheet. This one was
       * the only one that opened `capture.openCapture("task")`
       * with no context the foot's control does not also have — the same sheet,
       * on the same panel, from a spot the eye passes on the way to the day —
       * and on a phone it was a full-width primary button sitting between the
       * greeting and the first task, which is a large part of the 55.7% of the
       * first viewport measured before this pass.
       *
       * Global Capture stays (shell `+`, `C`, the FAB), and the contextual one
       * stays at the foot of the plan where the list ends. TODAY-12 also removes
       * the duplicate page-level multi-type Capture panel.
       */}
      {/*
       * TODAY-TASK-01 §B3 — ONE heading AREA, not three vertical beats.
       *
       * The greeting, the date and the day navigation were three siblings of the
       * page's flex column, each paying the column's own 20px gap: measured at
       * 1440 the block ran from the first baseline to the foot of the rail in
       * 107px, and read as "heading, gap, navigation, gap, dashboard". They are
       * one thing — *who and when, and which day am I looking at* — so they are
       * now one element with its own internal rhythm, and the rail sits directly
       * under the date rather than a page-gap below it.
       *
       * ── The mockup's SEARCH icon is deliberately not here ──────────────────
       * The shell already carries search, as a real labelled control on the same
       * gutter line one rank above this heading (`DesktopTopBar`) and in the
       * phone bar (`MobileTopBar`), both bound to `/`. A second search
       * affordance on one page is the "second search implementation to keep in
       * step with the first" DS-03 refused when it settled the control's fourth
       * and final home.
       *
       * ── The header's "+ Add task" is deliberately GONE ─────────────────────
       * Today carried several doors onto the same capture sheet. This one was
       * the only one that opened `capture.openCapture("task")`
       * with no context the foot's control does not also have, and on a phone it
       * was a full-width primary button sitting between the greeting and the
       * first task.
       */}
      <header className="dh-today__head">
        <div className="dh-today__identity">
          <p className="dh-today__date">{data.dateLong}</p>
          <h1 className="dh-today__greeting">{greeting}</h1>
          <p className="dh-today__status" aria-live="polite">
            {attentionSummary}
          </p>
        </div>
        {/* CAL-02 — the three daily surfaces. It survives TODAY-11 because the
            Schedule panel's week strip navigates the SCHEDULE's day, while
            Tomorrow and Next 7 days carry tomorrow's TASKS and seven days of
            task counts — which a strip over one panel cannot. */}
        <DayNav active="today" />
      </header>

      {/*
       * ── ONE GRID ─────────────────────────────────────────────────────────
       * CONVERGE-01 §1. Everything below the day navigation is placed on a
       * SINGLE twelve-column grid, in the audit's order:
       *
       *   stats            4 · 4 · 4
       *   plan / schedule  7 · 5
       *   attention / continue
       *                    7 · 5
       *   goals / support  7 · 5
       *
       * ── What this replaces, and why the replacement is structural ─────────
       * Today was three separately-defined "ranks", each with its own
       * `grid-template-columns` chosen for its own contents — `1.55fr 1fr` for
       * work, `1.2fr 1fr 1fr` for context, `1fr 1fr` for support. Nothing lined
       * up between one band and the next, which is what made the page read as a
       * widget board rather than as a workspace. Measured at 3440 before this
       * change, the panel origins down the page were x = 264, 1322 | 264, 917,
       * 1465 | 264, 1138 — three different column systems, three different
       * gutters, in one composition.
       *
       * On one grid every band shares the same twelve tracks, so the plan, the
       * attention rail and the Goal rail all start on the same line and end on
       * the same line, and the Schedule, Continue and support columns do too.
       *
       * ── The order is the audit's, and it is a DECISION about the day ──────
       * "Needs attention" moves ABOVE "Goal progress". It is the surface that
       * says what has gone wrong — the only place an Asset obligation with no
       * open Task reaches the owner at all — and it was the LAST thing on the
       * page, below a Goal rail that answers a much slower question. Goal
       * progress is the long game and now sits with the day's other slow
       * surfaces at the foot.
       *
       * Nothing here is moved by CSS `order`. The DOM order IS the phone
       * composition, the reading order and the tab order — which is why this
       * reordering had to happen in the markup and why MOBILE-02 §5 waited for
       * it rather than doing it a second, different way in a media query.
       */}
      <div
        className="dh-today__grid"
        data-now-context={
          nowTask !== null && nextMeeting !== null
            ? "both"
            : nowTask !== null
              ? "now"
              : nextMeeting !== null
                ? "next"
                : "none"
        }
        /* Which of the two support panels exist, so the grid can give a lone
           survivor the full twelve tracks instead of leaving five columns of
           hole beside it. The pair is data-conditional, so its spans are too. */
        data-support={
          data.attention.length > 0 && data.continueProjects.length > 0
            ? "both"
            : data.attention.length > 0
              ? "attention"
              : data.continueProjects.length > 0
                ? "continue"
                : "none"
        }
      >
        {nowTask === null ? null : (
          <NowTaskPanel
            task={nowTask}
            rowProps={rowProps}
            overdue={buckets.overdue.some((task) => task.id === nowTask.id)}
          />
        )}

        {nextMeeting === null ? null : <NextUpPanel meeting={nextMeeting} />}

        <section
          className="dh-today__panel dh-today__panel--card dh-today__timeline"
          aria-labelledby="today-day-heading"
          /*
           * The stable landmark for "this IS the Today workspace".
           *
           * The screen's `h1` is the owner's GREETING, which changes with the
           * hour and with who is signed in, so a spec cannot wait on it; and the
           * region's accessible NAME is product copy that has now moved twice
           * ("My day" → "Focus" → "Today's plan"), taking the shared E2E helper
           * with it each time and timing out every dependent spec on a page that
           * had rendered perfectly. A test id at this architectural boundary is
           * the thing that is allowed to be stable while the copy is not.
           */
          data-testid="today-plan"
        >
          <div className="dh-today__panel-head">
            <h2 className="dh-today__panel-title" id="today-day-heading">
              Today’s plan
            </h2>
            {/* The mockup's "8 tasks". It is the CANONICAL count — the same
                number `/tasks?system=today` holds — so the heading and the
                foot's link can never disagree about the size of the day. */}
            {todayCount > 0 ? (
              <span className="dh-today__panel-note">
                {todayCount} {todayCount === 1 ? "task" : "tasks"}
              </span>
            ) : null}
          </div>

          {hasDay ? (
            <div className="dh-today__sections">
              {/*
               * TODAY-10 — Overdue is NAMED, in the same quiet heading language
               * as its siblings. The one band whose meaning could be carried by
               * colour is the one that must not be (AGENTS.md §15), and the
               * row's own date says it a second time in words — "2 days ago",
               * from the shared date cell, in the overdue colour.
               */}
              <PlanBand
                label="Overdue"
                tone="overdue"
                tasks={remainingOverdue}
                rowProps={rowProps}
              >
                {/* The remainder row is NOT a task row: it carries no completion
                    control and opens a collection rather than a record. It says
                    so in its class, so anything counting the day's overdue tasks
                    — CSS, a screen reader's list, a regression test — is not
                    counting the link that says how many were left out. */}
                {overdue.hidden > 0 ? (
                  <li className="dh-day-row dh-day-row--more">
                    <Link
                      className="dh-day-row__more-link"
                      to="/tasks?system=overdue"
                    >
                      +{overdue.hidden} more overdue
                    </Link>
                  </li>
                ) : null}
              </PlanBand>

              {/*
               * TODAY-10 — the day's own work, in two named bands.
               *
               * A task DUE today is a deadline; a task PLANNED for today is a
               * choice the owner made, and it may not be due for weeks. The
               * distinction is carried by the BAND rather than by the row,
               * because the row's date cell shows one date and the band says
               * which of the two put the task on the day. Each band draws only
               * when it has work.
               */}
              <PlanBand
                label="Due today"
                tasks={remainingDueToday}
                rowProps={rowProps}
              />
              <PlanBand
                label="Planned today"
                tasks={remainingPlannedToday}
                rowProps={rowProps}
              />

              {completedTasks.length > 0 ? (
                <details className="dh-today__completed">
                  <summary>Completed · {completedTasks.length}</summary>
                  <TaskList ariaLabel="Completed today tasks">
                    {completedTasks.map((task) => (
                      <TaskRow key={task.id} {...rowProps(task)} />
                    ))}
                  </TaskList>
                </details>
              ) : null}

              {/* Overdue work but nothing actually ON today is a real and
                  distinct state, and a panel that just stopped after the
                  slipped rows implied the day was full. */}
              {remainingOverdue.length === 0 &&
              remainingDueToday.length === 0 &&
              remainingPlannedToday.length === 0 &&
              completedTasks.length === 0 ? (
                <p className="dh-today__quiet">Nothing else planned today.</p>
              ) : null}
            </div>
          ) : (
            /* A compact line, not a hero: an empty day is a good day, and it
               does not need an illustration, a headline and a button to say
               so — the capture invitation directly below is the next action. */
            <p className="dh-today__quiet dh-today__quiet--prose">
              Nothing planned today.
            </p>
          )}

          {/*
           * The panel's foot: capture, and the bound stated rather than applied
           * silently. "+ Add task" is the mockup's own control and opens the
           * shared sheet on the Task panel; the "View all" link names the TRUE
           * size of the canonical view it leads to, so following it lands on a
           * list of exactly the promised size.
           */}
          <p className="dh-today__panel-foot">
            <AddTaskButton />
            {plan.hidden > 0 ? (
              <Link
                className="dh-btn dh-btn--ghost"
                to="/tasks?system=today"
                data-testid="today-focus-view-all"
              >
                View all {todayCount} tasks for today
              </Link>
            ) : null}
          </p>
        </section>

        <SchedulePanel
          week={data.week}
          todayIso={data.todayIso}
          stale={data.scheduleStale}
          hasSources={data.scheduleHasSources}
          onOpenEvent={onOpenEvent}
          eventHref={eventHref}
        />

        {/* HABITS-01 — the routine band, BELOW the day's work and its schedule.
            It spans the full grid rather than taking a column, because it is a
            short list of one-line rows and giving it a column would leave the
            other half of the row empty. See `HabitsPanel`. */}
        <HabitsPanel
          habits={data.habits}
          truncated={data.habitsTruncated}
          todayIso={data.todayIso}
        />

        <GoalProgressSection goals={data.goals} onUpdateGoal={onUpdateGoal} />

        {/*
         * ── The DECISION row ─────────────────────────────────────────────────
         * What has gone wrong, and what to pick up next. The audit moves this
         * pair up into the main flow, above the Goal rail: both are answers to
         * "what should I do now?", which is the question the owner opened this
         * page with, and both were previously below a rail that answers "how is
         * the year going?".
         *
         * Kept pragmatic. Neither is inflated into a card: a quiet heading, a
         * list of label-and-fact rows, and the fact each row carries is the one
         * that says why it is on the list.
         */}
        {data.attention.length > 0 ? (
          <section
            className="dh-today__panel dh-today__attention"
            aria-labelledby="today-attention-heading"
            data-testid="today-attention"
          >
            <div className="dh-today__panel-head">
              <h2
                className="dh-today__panel-title"
                id="today-attention-heading"
              >
                Needs attention
              </h2>
            </div>
            <ul className="dh-day-list">
              {data.attention.map((item: AttentionItem) => (
                <li className="dh-day-row dh-day-row--attention" key={item.id}>
                  {/* UIX-01 — the subject KIND as a small tonal tile, which
                        is what makes a mixed rail scannable before it is read.
                        Decorative: the row's label and detail carry every fact,
                        and the tone is identity, never a state. */}
                  <ToneIcon size="sm" tone={ATTENTION_TONES[item.kind]}>
                    <AttentionGlyph kind={item.kind} />
                  </ToneIcon>
                  <span className="dh-day-row__stack">
                    <Link className="dh-day-row__title" to={item.href}>
                      {item.label}
                    </Link>
                    <span className="dh-day-row__meta">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <TodayStatRank trend={data.activityTrend} goals={data.goals} />

        {/* Absent entirely when no project has open work — "continue working"
            on a project with nothing left to do is not a suggestion. */}
        {data.continueProjects.length > 0 ? (
          <section
            className="dh-today__panel dh-today__continue"
            aria-labelledby="today-continue-heading"
            data-testid="today-continue"
          >
            <div className="dh-today__panel-head">
              <h2 className="dh-today__panel-title" id="today-continue-heading">
                Continue working
              </h2>
              <Link className="dh-today__panel-action" to="/projects">
                All projects
              </Link>
            </div>
            <ul className="dh-day-list">
              {data.continueProjects.map((project: ContinueProject) => (
                <li className="dh-day-row dh-day-row--project" key={project.id}>
                  {/*
                   * UIX-01 — the project's OWN persisted identity mark, from
                   * the same stored `iconKey`/`colourRank` the Projects
                   * gallery and the Project record draw. Identity is
                   * recognition before reading, and one record must not have
                   * two appearances.
                   */}
                  <AccentIcon
                    entityType="project"
                    colourSlot={project.colourSlot}
                    iconKey={project.iconKey}
                    colourRank={project.colourRank}
                    size="sm"
                  />
                  <span className="dh-day-row__stack">
                    <Link
                      className="dh-day-row__title"
                      to={`/projects/${encodeURIComponent(project.id)}`}
                    >
                      {project.title}
                    </Link>
                    <span className="dh-day-row__meta">
                      {project.openCount} open{" "}
                      {project.openCount === 1 ? "task" : "tasks"} ·{" "}
                      {project.statusLabel}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Reflection closes the day without competing with the work above. */}
        <ReflectionCard reflection={data.reflection} />
      </div>

      {/* The one line the page ends on when the WHOLE page is clear — no day,
          nothing needing attention and no project with open work. It is a LINE,
          not a hero: an empty day is a good day, and it does not need an
          illustration, a headline and a button to say so. Gated on all three,
          because "All clear" printed under a "Continue working" list would be a
          summary of something that is not empty. */}
      {!hasDay &&
      data.attention.length === 0 &&
      data.continueProjects.length === 0 ? (
        <p className="dh-today__quiet dh-today__quiet--prose">
          <span className="dh-today__quiet-glyph" aria-hidden="true">
            <CheckCircleIcon />
          </span>
          All clear.
        </p>
      ) : null}

      {/* Every row mutation announces its outcome once, politely — the SAME one
          channel `/tasks` uses, so a change made here is announced in the same
          words it would be there. A refusal is a notification instead, because a
          failure has to interrupt. */}
      <p className="dh-visually-hidden" role="status" aria-live="polite">
        {actions.announcement ?? ""}
      </p>
    </div>
  );
}

/**
 * HABITS-01 — the routine band.
 *
 * ── Why it is here, and why it is SHORT ─────────────────────────────────────
 * Today's first job is the day's work, and TODAY-TASK-01 spent a whole pass
 * measuring how far down the page the first task had drifted. So this band sits
 * BELOW the plan and the schedule — never between the greeting and the first
 * task — and it is a list of one-line rows, not a card per habit. MEASURED on
 * the seeded fixture at 1440 and at 393: the first task's vertical position is
 * unchanged by this section, because nothing was inserted above it.
 *
 * ── What it shows ───────────────────────────────────────────────────────────
 * Only the Habits today is actually asking about. A day-based Habit appears on
 * the days it asks for; a count-based one appears while its week is unmet, or
 * once it is done today so the tick can be undone. A Habit that is not relevant
 * today is simply absent — Today never lists a behaviour it is not asking about,
 * and an unscheduled day is never printed as a miss.
 *
 * ── What it is NOT ──────────────────────────────────────────────────────────
 * Not a Task list. Nothing here is due, nothing here can be overdue, nothing
 * here is counted in the day's task figures or in any Project's progress, and
 * nothing here generates a Task. Not a streak board either: no flame, no day
 * count, no chain to break — just today's state and the week's count.
 */
function HabitsPanel({
  habits,
  truncated,
  todayIso,
}: {
  readonly habits: readonly SerializedHabit[];
  readonly truncated: boolean;
  readonly todayIso: string;
}) {
  const checkIn = useHabitCheckIn();

  /* ADR-086 — the loader is the truth; a patch lives only until it answers. */
  useEffect(() => {
    checkIn.clearPatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the data.
  }, [habits]);

  if (habits.length === 0) return null;

  return (
    <section
      className="dh-today__panel dh-today__habits-panel"
      aria-labelledby="today-habits-heading"
      data-testid="today-habits"
    >
      <div className="dh-today__panel-head">
        <h2 className="dh-today__panel-title" id="today-habits-heading">
          Habits
        </h2>
        <Link className="dh-today__panel-action" to="/habits">
          All habits
        </Link>
      </div>
      <ul className="dh-habit-list" aria-label="Habits for today">
        {habits.map((habit) => (
          <HabitRow
            key={habit.id}
            habit={habit}
            density="compact"
            doneOverride={checkIn.patches.get(habit.id)?.done}
            href={`/habits/${encodeURIComponent(habit.id)}`}
            onCheckedChange={(checked) =>
              checkIn.setChecked({
                habitId: habit.id,
                title: habit.title,
                dateIso: todayIso,
                checked,
              })
            }
          />
        ))}
      </ul>
      {truncated ? (
        <p className="dh-today__panel-foot">
          <Link className="dh-today__panel-action" to="/habits">
            More habits than fit here — see all
          </Link>
        </p>
      ) : null}
      <p className="dh-visually-hidden" role="status" aria-live="polite">
        {checkIn.announcement ?? ""}
      </p>
    </section>
  );
}

/**
 * "+ Add task" — ONE control, at the foot of the plan.
 *
 * `requestedType` rather than the chooser, for the reason `TasksWorkspace`
 * records: the chooser asks "what are you capturing?" on a surface whose answer
 * is never in doubt.
 *
 * ── Why there is no `primary` variant any more ──────────────────────────────
 * There were two of these: a filled one in the page header and this quiet one
 * beside the list. Both opened the same sheet on the same panel with the same
 * context, which made the header's copy pure duplication — CONVERGE-01 §1 A9
 * asks for exactly that to go, and MOBILE-02 §5 names it as the "duplicate large
 * Add Task CTA" a phone was paying ~60px of its first viewport for. The variant
 * went with the caller rather than being left as an unreachable branch.
 *
 * The ghost rung has no generic `Button` variant — it is the product's own
 * text-button class, and it is what every other foot control on this screen
 * already is, so the row reads as one set rather than as two kinds of link.
 */
function AddTaskButton({
  testId = "today-plan-add",
}: {
  readonly testId?: string;
}) {
  const capture = useCapture();
  const ref = useRef<HTMLButtonElement>(null);
  if (capture === null) return null;
  return (
    <button
      type="button"
      ref={ref}
      className="dh-btn dh-btn--ghost"
      data-testid={testId}
      onClick={() => {
        if (ref.current) capture.openCapture("task", ref.current);
      }}
    >
      <span className="dh-btn__icon" aria-hidden="true">
        <PlusIcon />
      </span>
      Add task
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Goal progress                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The measurable Goals worth a look today.
 *
 * ── The mockup's "+ Add goal" is deliberately absent ────────────────────────
 * A Goal requires an Area (`NewGoalForm` takes an `areaId`), so a page-level
 * "Add goal" on Today cannot complete without first asking which Area — and
 * FINAL-UI §9 deviation 2 already records that decision for the Goals page
 * itself, where the same button was drawn and not built. Drawing it here would
 * re-open a settled question on a surface with even less context to answer it.
 * "View all" goes to `/goals`, where an Area can be chosen.
 *
 * Its empty state is a LINE, not a panel: an owner with no measurable Goals
 * should not be shown a large empty analytics container every morning, but they
 * should be told once that adding a target makes this section work.
 */
function GoalProgressSection({
  goals,
  onUpdateGoal,
}: {
  readonly goals: readonly TodayGoal[];
  readonly onUpdateGoal?: (
    goal: TodayGoal,
    trigger: HTMLElement | null,
  ) => void;
}) {
  const onTrack = goals.filter((goal) =>
    goalIsOnTrack(goal.progress.status),
  ).length;
  return (
    <section
      className="dh-today__panel dh-today__goals"
      aria-labelledby="today-goals-heading"
      data-testid="today-goal-progress"
    >
      <div className="dh-today__panel-head">
        <h2 className="dh-today__panel-title" id="today-goals-heading">
          Goal progress
        </h2>
        <Link className="dh-today__panel-action" to="/goals">
          View all
        </Link>
      </div>
      {goals.length === 0 ? (
        <p className="dh-today__quiet dh-today__quiet--prose">
          No measurable Goals yet. Add a target to a{" "}
          <Link to="/goals">Goal</Link> and your progress shows up here.
        </p>
      ) : (
        <>
          {/*
           * The section's own one-line statement of where the set stands.
           *
           * It is the SAME arithmetic the stat card prints, from the same
           * predicate — not a second derivation — and it is here because a rail
           * of three bars answers "how is each one going?" and never "how many
           * are going well?". The separator is mandatory: "3 5" reads as
           * thirty-five, which is the "4 | 0" lesson DS-06 paid for once.
           */}
          <p className="dh-today__goals-note">
            {onTrack} of {goals.length} on track
          </p>
          <ul className="dh-today__goal-list">
            {goals.map((goal) => {
              const change = formatMeasurementChange(
                goal.changeInWindow,
                goal.progress.unit,
              );
              return (
                <li
                  className="dh-today__goal"
                  /*
                   * UIX-03 / IDENTITY-01 — the tile carries the Goal's resolved
                   * IDENTITY, stamped once here so everything inside it agrees:
                   * the mark, the meter and the change figure all resolve from
                   * this attribute rather than each deciding for itself.
                   */
                  {...identityAttribute(
                    resolveIdentity({
                      colourSlot: goal.colourSlot,
                      colourRank: null,
                      inherited: {
                        colourSlot: goal.areaColourSlot,
                        colourRank: goal.areaColourRank,
                      },
                    }).slot,
                  )}
                  key={goal.id}
                >
                  <AccentIcon
                    entityType="goal"
                    colourSlot={goal.colourSlot}
                    iconKey={goal.iconKey}
                    colourRank={null}
                    inherited={{
                      colourSlot: goal.areaColourSlot,
                      colourRank: goal.areaColourRank,
                      iconKey: goal.areaIconKey,
                    }}
                    size="sm"
                  />
                  {/*
                   * TODAY-11 — the mockup's Goal tile carries the AREA under the
                   * title, and DalyHub can: `loadGoalSummaries` already resolves
                   * it. VIS-01 had dropped it when the title and the Area shared
                   * one line and competed for it; the mockup stacks them, which
                   * is what makes the second line affordable again.
                   */}
                  <Link
                    className="dh-today__goal-title"
                    to={`/goals/${encodeURIComponent(goal.id)}`}
                  >
                    {goal.title}
                  </Link>
                  {goal.areaTitle.length > 0 ? (
                    <span className="dh-today__goal-area">
                      {goal.areaTitle}
                    </span>
                  ) : null}
                  <GoalProgressReadout
                    size="glance"
                    progress={goal.progress}
                    label={`${goal.title} progress`}
                    trailing={change ? `${change} this month` : null}
                  />
                  {/* One action, and it is the one a Goal needs most often. The
                      Goal record is a link away for everything else. It is a
                      TEXT button here: an outlined pill on four cards at once
                      made the least-used thing on each card its most
                      conspicuous. */}
                  {onUpdateGoal && goal.progress.type !== "milestone" ? (
                    <button
                      type="button"
                      className="dh-btn dh-btn--ghost dh-btn--sm"
                      data-testid="today-goal-update"
                      onClick={(event) =>
                        onUpdateGoal(goal, event.currentTarget)
                      }
                    >
                      {goalCheckInLabel(goal.progress.type, goal.progress.unit)}
                      <span className="dh-visually-hidden">{` for ${goal.title}`}</span>
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
