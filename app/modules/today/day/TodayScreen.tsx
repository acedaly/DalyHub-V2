/**
 * TODAY-DAY — the Today screen.
 *
 * The surface the owner lands on every morning, rebuilt around ONE question:
 * *what am I doing today?* It is a place to work, not a report about work.
 *
 * ── WHAT IT IS ───────────────────────────────────────────────────────────────
 *
 *   greeting + date                                        [ Plan day ]
 *   Today · Tomorrow · Next 7 days
 *   ┌──────────────────┐┌──────────────────┐┌──────────────────┐
 *   │ Tasks completed  ││ Tasks captured   ││ Goals on track   │  the week's
 *   │ 24               ││ 31               ││ 3 of 5           │  three measures
 *   └──────────────────┘└──────────────────┘└──────────────────┘
 *   ┌───────────────────────────────────┐┌──────────────────┐
 *   │ Focus                             ││ Needs attention  │
 *   │  OVERDUE                          │├──────────────────┤
 *   │   ▏Send the summary  Due 2 days ago││ Schedule         │
 *   │  DUE TODAY                        ││  09:30 Standup   │
 *   │   ☐ Draft the notes    P1  Project │├──────────────────┤
 *   │  PLANNED TODAY                    ││ Goal progress    │
 *   │   ☐ Refactor the tokens    Project │├──────────────────┤
 *   │  View all 14 tasks for today      ││ Continue working │
 *   └───────────────────────────────────┘└──────────────────┘
 *
 * ── REDESIGN-03: what this surface STOPPED doing ─────────────────────────────
 * The convergence merge landed two independently redesigned Todays on top of
 * each other and kept both. The page carried FIVE metric cards above the first
 * task — a `StatCardRow` of Meetings/Overdue/Daily-progress, and then this
 * summary's three — and a workload chart at the bottom restating two of them a
 * third time. Measured on the base commit at 390px, the entire first viewport
 * was chrome: greeting, two cards, the day rail, three more cards, and not one
 * row of the owner's actual work.
 *
 * Every figure in the row that went was already on the page, said better:
 *
 *   Meetings today · Next 20:00   →  the Schedule panel, which names the meeting
 *   Overdue 44                    →  Focus's own Overdue band and "+41 more"
 *   Daily progress 68%            →  removed outright, see below
 *
 * The workload chart went with them. It plotted `completed` against `created`
 * for seven days and then printed "21 completed · 124 created" underneath —
 * which is the first two cards of this summary, in the same units, over the same
 * window, one screen apart. Trends belong to Analytics, which owns a real range
 * picker and states each figure's provenance; the summary's completed measure
 * links there.
 *
 * ── WHY THERE IS NO DAILY-PROGRESS PERCENTAGE ────────────────────────────────
 * Because the product does not have one. `DALYHUB_DESIGN_SYSTEM.md` §5d rules
 * out "no focus time, no 'daily progress' percentage — DalyHub tracks no time
 * and computes no percentage of a life", and `~/kernel/analytics/analytics.ts`
 * refuses the same two figures by name where the supplied reference asks for
 * them. Analytics has held that line since UIX-05. Today had quietly broken it:
 * a green ring reading `completed / today's tasks` as a headline percentage.
 *
 * It is not a defensible daily metric either. The denominator is whatever the
 * owner happened to date for today, so clearing three of three reads 100% and
 * clearing nine of twelve reads 75% — the emptier day scores better. The
 * information it carried is on the page as the thing itself: the day's list,
 * with what is done dimmed in place.
 *
 * ── WHY THERE IS NO FOCUS TIME ───────────────────────────────────────────────
 * The reference's middle card reads "Focus time · 6h 45m". DalyHub captures no
 * focus time — no timer, no session record, no field it could be derived from —
 * and the brief is explicit that an unavailable metric is left out rather than
 * faked to match a screenshot. The slot goes to the honest sibling of the first
 * figure, from the same bounded query: what was CAPTURED this week beside what
 * was completed. Read together they say whether the week is clearing or filling.
 *
 * ── WHY FOCUS HAS THREE BANDS (TODAY-10) ─────────────────────────────────────
 * It had two: an unnamed run of slipped work, and one list called "For today".
 * That list combined two different commitments and printed neither, so a task
 * planned for today but not due for six weeks was indistinguishable from a
 * deadline — while the SAME record on `/tasks?system=today`, which Today's own
 * figure links to, read "Sun, 20 Sep". The bands say it once per group instead
 * of once per row, which is what keeps the title dominant at 320px. The SET is
 * unchanged; only its legibility is. See `day-view.ts` for the classifier.
 *
 * ── WHY THERE IS NO HERO ─────────────────────────────────────────────────────
 * There was one: a tinted, elevated summary carrying the day's counts. The
 * approved direction replaced it, and the trade is deliberate. A hero spends the
 * page's largest type on a HEADLINE ("Your day") and leaves the figures at label
 * size beside it; the reference spends it on the FIGURES, and it spends it on
 * the WEEK rather than the day — because the day itself is the list directly
 * underneath, and a figure that counts what is visible two inches below it is
 * not a measure, it is a caption.
 *
 * ── WHAT IT DELIBERATELY IS NOT ──────────────────────────────────────────────
 * There is no search hero (search is an icon in the top app bar with `/`), no
 * "Customise" affordance, no widget system, no collapsible sections, and no Task
 * Summary donut. Those were the surface counting itself: six stat chips mostly
 * rendering zeros, a ring restating three of them, and the actual day pushed below
 * the fold. Every number on this page is now painted exactly once, and a number
 * with nothing to say is not painted at all.
 *
 * ── THE RULES THAT KEEP IT HONEST ────────────────────────────────────────────
 *   - **Zeros never render.** Every measure, every timeline section and every
 *     rail row is conditional on its own count. A quiet day is a short page, not
 *     a page of noughts — and the summary itself does not paint when it would
 *     have nothing to say.
 *   - **One fact, one place.** This is the rule REDESIGN-03 enforced. Overdue
 *     work is actionable ROWS in Focus and nothing else: not a card above them,
 *     not a rail entry beside them. A figure earns its place by counting
 *     something the page does not otherwise show.
 *   - **No tinted surface at all.** Today is the product's calmest screen by
 *     design: the day leads and colour is spent on slipped work alone. No
 *     metric tile carries an accent, and nothing on the page is a coloured
 *     block.
 *   - **Tasks have no times.** A task is a date; a meeting is an instant. So
 *     there is no Morning/Afternoon grouping and no invented time beside a task.
 *   - **ONE card, and it holds the work.** The day's own tasks sit inside a
 *     bordered surface; every supporting section beside them is a heading, its
 *     rows and space. No panel inside a panel, and no row of equal-weight
 *     rectangles pretending each section matters as much as the day.
 *
 * Capture is the global `+` alone: this screen offers no second capture control.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  AssetIcon,
  CheckCircleIcon,
  GoalIcon,
  ProjectIcon,
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

import { PriorityIndicator } from "~/shared/task-record/PriorityIndicator";

import { DayNav } from "../schedule/DayNav";
import { ScheduleList } from "../schedule/ScheduleList";

import {
  bucketDay,
  focusTodaySlice,
  greetingFor,
  dayPartForHour,
  overdueLabel,
  overdueSlice,
  tasksForTodayCount,
  type DayTask,
} from "./day-view";
import {
  type AttentionItem,
  type AttentionKind,
  type ContinueProject,
} from "./attention-view";
import { HELP_DRAWER_KEY } from "../keyboard/KeyboardHelp";
import { goalIsOnTrack } from "~/shared/goal-progress";

import type { TodayActivityTrend, TodayGoal } from "./goal-progress";
import type { TodayDayData } from "./load";

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
   * Persist a task's completion through the EXISTING task-completion path
   * (`POST /tasks/:id`), so ticking a row on Today writes the same record the
   * Tasks collection and the Task Drawer edit.
   */
  readonly onCompleteTask?: (taskId: string, complete: boolean) => void;
  /**
   * CAL-01 — open an imported calendar occurrence's detail in Today's own
   * Drawer. Supplied by the route, which owns the Drawer, exactly as the Task
   * record already is.
   */
  readonly onOpenEvent?: (entryId: string) => void;
  readonly eventHref?: (entryId: string) => string;
};

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
 * One task row: a checkbox that completes, and a title that opens the record.
 *
 * The checkbox and the title are two separate controls on purpose — ticking is
 * the frequent act and must never be a click away from opening a drawer by
 * accident, and opening must never require aiming past a checkbox.
 */
function TaskRow({
  task,
  done,
  trailing,
  onToggle,
  openHref,
  onOpen,
}: {
  readonly task: DayTask;
  readonly done: boolean;
  /** The row's one trailing fact — the project, or the overdue age. */
  readonly trailing: React.ReactNode;
  readonly onToggle: (done: boolean) => void;
  readonly openHref: string;
  readonly onOpen: () => void;
}) {
  return (
    <li className="dh-day-row" data-done={done ? "true" : undefined}>
      {/*
       * MOBILE-01 (iPhone daily driver) — the shared 44px hit area.
       *
       * The circle itself is 20px and stays 20px; what it lacked was the
       * `.dh-check-circle-target` label the Tasks collection and the Project
       * tasks tab both wrap it in. Measured before this change at 320/375/390/430:
       * the effective target on Today's Focus rows was 20×20, on the single most
       * used control in the product, on the surface a phone opens first. The
       * label pulls its own padding back out of the row's rhythm, so the row is
       * still laid out against the circle and no row grew.
       */}
      <label className="dh-check-circle-target">
        <input
          type="checkbox"
          className="dh-check-circle dh-day-row__check"
          checked={done}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          onChange={(event) => onToggle(event.currentTarget.checked)}
        />
      </label>
      <a
        className="dh-day-row__title"
        href={openHref}
        onClick={(event) => {
          if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.button !== 0
          ) {
            return;
          }
          event.preventDefault();
          onOpen();
        }}
      >
        {task.title}
      </a>
      {/*
       * TODAY-10 — priority, and ONLY when the task has one.
       *
       * Focus orders by priority, so the row has to be able to explain its own
       * position; without it the panel is a list in an order the owner cannot
       * see. It is the SHARED `PriorityIndicator` the Tasks collection, the
       * Waiting card and Search all draw — one appearance, one vocabulary, no
       * Today-only priority treatment — and it renders NOTHING when the task is
       * untriaged, which is most rows on most days. Priority never groups this
       * panel and never tints a row: the Matrix is not coming back.
       *
       * It sits AFTER the title rather than before it so every title in the
       * panel still starts at the same x — a list is read down its left edge,
       * and a leading badge on some rows and not others is a ragged one.
       */}
      <PriorityIndicator
        priority={task.priority}
        className="dh-day-row__priority"
      />
      {trailing}
    </li>
  );
}

/**
 * TODAY-10 — one named band of the Focus panel.
 *
 * A band is a heading and its rows, and nothing else: no card, no surface, no
 * count beside the label. It renders only when it holds work, so the panel's
 * shape follows the day rather than the model — a day with only deadlines is one
 * labelled list, not one list and an empty heading.
 *
 * The label is an `h3` under the panel's own `h2`, which is what makes the
 * headings a real outline for a screen reader: Focus → Overdue / Due today /
 * Planned today.
 */
function FocusBand({
  label,
  tasks,
  isDone,
  onToggle,
  taskHref,
  onOpen,
}: {
  readonly label: string;
  readonly tasks: readonly DayTask[];
  readonly isDone: (task: DayTask) => boolean;
  readonly onToggle: (task: DayTask, done: boolean) => void;
  readonly taskHref: (id: string) => string;
  readonly onOpen: (id: string) => void;
}) {
  if (tasks.length === 0) {
    return null;
  }
  return (
    <div className="dh-day-section">
      <h3 className="dh-day-section__label">{label}</h3>
      <ul className="dh-day-list">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            done={isDone(task)}
            // The row's ONE trailing fact stays the Project or Area: "what is
            // this part of?" is the question asked straight after "what is it?",
            // and the band above already answered "why is it here today?".
            trailing={
              task.parent ? (
                <span className="dh-day-row__meta">{task.parent.title}</span>
              ) : null
            }
            onToggle={(next) => onToggle(task, next)}
            openHref={taskHref(task.id)}
            onOpen={() => onOpen(task.id)}
          />
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The day's three MEASURES, above the working columns.
 *
 * The reference opens Today with a strip of three low-profile figures, and it
 * is right about why: the greeting says who and when, and then the owner wants
 * one glance that says whether the week is going well before they look at any
 * individual row.
 *
 * ── Focus time is deliberately absent ────────────────────────────────────────
 * The reference's middle card reads "Focus time · 6h 45m". DalyHub does not
 * capture focus time — there is no timer, no session record and no field it
 * could be derived from — and the brief is explicit that an unavailable metric
 * is left out rather than faked to match a screenshot. Its slot goes to the
 * honest sibling of the first figure, from the same bounded query: what was
 * CAPTURED this week beside what was completed. Read together they say whether
 * the week is clearing or filling, which is the question the strip is for.
 *
 * Every figure here is a real reading. A card whose data is missing renders no
 * card, so the strip can be three, two, one or none.
 *
 * ── REDESIGN-03: the measures that CAN be checked, link ──────────────────────
 * The workload chart that used to sit at the foot of this page plotted the first
 * two figures per-day and then restated their totals in a sentence, so the same
 * two numbers appeared twice on one screen. Removing it left a real question —
 * where does the owner go to see the SHAPE of the week? — and Analytics is the
 * honest answer: it owns a range picker, states each figure's provenance and
 * refuses the same invented metrics this screen does. So "Tasks completed" is a
 * link now rather than a dead figure, which is the rule every other number on
 * Today already followed.
 *
 * "Tasks captured" deliberately does not link: there is no canonical view of
 * "created in the last seven days", and a link to an approximation of itself is
 * worse than no link at all.
 */
function TodaySummary({
  trend,
  goals,
}: {
  readonly trend: TodayActivityTrend | null;
  readonly goals: readonly TodayGoal[];
}) {
  const measures: {
    id: string;
    label: string;
    value: string;
    note: string;
    href?: string;
  }[] = [];

  if (trend !== null) {
    /*
     * The window is a ROLLING seven days ending today, not the calendar week,
     * so it is named that way.
     *
     * The reference's card reads "this week", and copying that wording would
     * have been a small lie with a real cost: read on a Wednesday, "this week"
     * means three days to the owner and seven to the query, and the comparison
     * underneath it would be measuring a full week against a partial one. The
     * chart beside it has always been a rolling seven days for good reasons —
     * a calendar week would give it one bar on a Monday — so the honest fix is
     * the label rather than the window.
     */
    const delta =
      trend.previousCompleted === null
        ? null
        : trend.totalCompleted - trend.previousCompleted;
    measures.push({
      id: "completed",
      label: "Tasks completed",
      value: String(trend.totalCompleted),
      note:
        delta === null
          ? "Last 7 days"
          : delta === 0
            ? "Last 7 days · level with the previous 7"
            : `Last 7 days · ${delta > 0 ? "+" : "−"}${Math.abs(delta)} on the previous 7`,
      href: "/analytics",
    });
    measures.push({
      id: "captured",
      label: "Tasks captured",
      value: String(trend.totalCreated),
      note: "Last 7 days",
    });
  }

  if (goals.length > 0) {
    /*
     * `goalIsOnTrack`, NOT `!goalNeedsAttention`.
     *
     * The evaluator has nine statuses and only two of them need attention, so
     * the negation counted "no measurement configured", "nothing recorded yet"
     * and "stale" as on track — which is how this card read "4 of 4" against a
     * set of Goals that were mostly not being measured. The predicate lives
     * beside `goalNeedsAttention` in `~/shared/goal-progress` so the definition
     * of "on track" is one definition rather than this screen's opinion.
     */
    const onTrack = goals.filter((goal) =>
      goalIsOnTrack(goal.progress.status),
    ).length;
    measures.push({
      id: "goals",
      label: "Goals on track",
      value: String(onTrack),
      note: `of ${goals.length} goal${goals.length === 1 ? "" : "s"}`,
      href: "/goals",
    });
  }

  if (measures.length === 0) return null;

  return (
    <ul className="dh-today__summary" data-testid="today-summary">
      {measures.map((measure) => {
        /*
         * The LABEL leads and the figure follows, because that is the reading
         * order the reference sets and the only one that works when three cards
         * sit side by side: the eye lands on the number, and the words above it
         * are what the number is OF.
         *
         * The three parts are the same markup whether or not the measure links,
         * so a linked and an unlinked card are the same object at a glance —
         * the link is an affordance on the card, not a different card.
         */
        const body = (
          <>
            <span className="dh-today__measure-label">{measure.label}</span>
            <span className="dh-today__measure-value">{measure.value}</span>
            <span className="dh-today__measure-note">{measure.note}</span>
          </>
        );
        return (
          <li className="dh-today__measure" key={measure.id}>
            {measure.href === undefined ? (
              body
            ) : (
              /* The whole card is the target — a figure the owner is being
                 invited to check should not need them to aim at its label. */
              <Link className="dh-today__measure-link" to={measure.href}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function TodayScreen({
  data,
  onCompleteTask,
  onUpdateGoal,
  onOpenEvent,
  eventHref,
}: TodayScreenProps) {
  const [searchParams] = useSearchParams();
  const { openDrawer } = useDrawer();

  /*
   * Optimistic completion overrides, keyed by task id → intended state. The
   * server truth is the base; an override reflects an in-flight toggle and is
   * dropped the moment fresh loader data arrives. Ticking a task must feel
   * instant (AGENTS.md §16), and the progress figure is derived from the SAME
   * overridden state, so the bar and the row can never disagree.
   */
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );
  useEffect(() => {
    setOverrides((previous) => (previous.size === 0 ? previous : new Map()));
  }, [data]);

  const isDone = useCallback(
    (task: DayTask) => overrides.get(task.id) ?? task.completed,
    [overrides],
  );

  const toggle = useCallback(
    (task: DayTask, willBeDone: boolean) => {
      setOverrides((previous) => {
        const next = new Map(previous);
        next.set(task.id, willBeDone);
        return next;
      });
      onCompleteTask?.(task.id, willBeDone);
    },
    [onCompleteTask],
  );

  /*
   * The day, re-bucketed against the OPTIMISTIC completion state.
   *
   * Re-running the pure bucketing (rather than patching the loader's arrays)
   * is what keeps a ticked task in place, dimmed at the end of the day's list,
   * and the progress denominator stable while the row moves.
   */
  const buckets = useMemo(() => {
    const applied = [...data.overdue, ...data.today].map((task) => {
      const override = overrides.get(task.id);
      if (override === undefined || override === task.completed) {
        return task;
      }
      return {
        ...task,
        completed: override,
        completedDate: override ? data.todayIso : null,
      };
    });
    return bucketDay(applied, data.todayIso);
  }, [data, overrides]);

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
  const focus = focusTodaySlice(buckets);
  const greeting = greetingFor(dayPartForHour(data.hour), data.ownerName);

  const openTask = useCallback(
    (id: string) => openDrawer(`task:${id}`),
    [openDrawer],
  );

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

  const taskHref = useCallback(
    (id: string) =>
      `?${withDrawerPushed(searchParams, `task:${id}`).toString()}`,
    [searchParams],
  );

  /*
   * The Focus panel holds the day's TASKS. Meetings moved to their own Schedule
   * panel — a meeting is something that happens to you at a time and a task is
   * something you do on a date, and the approved direction draws them as two
   * columns rather than as two bands of one list.
   */
  const hasDay = buckets.overdue.length > 0 || buckets.today.length > 0;

  return (
    <div className="dh-today">
      {/*
       * The header block is PAGE CONTENT on the canvas — the greeting is the
       * screen's heading, not a widget with a label above it. It is compact by
       * design: the day's WEIGHT is in the work below it, so the greeting states
       * who and when and then gets out of the way. "Plan day" sits here because
       * it is a NAVIGATION to the canonical Tasks view of today's work, and the
       * page header is where a page-level navigation belongs.
       *
       * (This comment was duplicated verbatim by the convergence merge — two
       * copies of the same paragraph, one describing a hero that no longer
       * existed. REDESIGN-03 kept one.)
       */}
      <header className="dh-today__head">
        <div className="dh-today__identity">
          <h1 className="dh-today__greeting">{greeting}</h1>
          <p className="dh-today__date">{data.dateLong}</p>
        </div>
        <Link className="dh-btn dh-btn--secondary" to="/tasks?system=today">
          Plan day
        </Link>
      </header>

      {/* CAL-02 — the three daily surfaces. A restrained text rail directly
          under the page's own heading block, exactly where every other
          collection in DalyHub puts its principal-mode rail. It is a MODE
          switch for this page, so it stays adjacent to the page's title rather
          than being pushed below the figures. */}
      <DayNav active="today" />

      {/*
       * ONE row of measures, and it is about the WEEK.
       *
       * The `StatCardRow` that used to sit above this — Meetings today, Overdue,
       * Daily progress — is gone (see the note at the top of this file). Every
       * figure on it counted something the page renders in full a few hundred
       * pixels lower, which made it a caption printed at headline size; two of
       * the three also spent an accent colour and a glyph tile doing it, which
       * is what made the top of Today read as a dashboard rather than as a
       * workspace.
       */}
      <TodaySummary trend={data.activityTrend} goals={data.goals} />

      {/*
       * REDESIGN-03 — the day, then the day's context beside it.
       *
       *   ┌──────────────────────────┐┌──────────────────┐
       *   │ Focus                    ││ Needs attention  │
       *   │                          │├──────────────────┤
       *   │                          ││ Schedule         │
       *   │                          │├──────────────────┤
       *   │                          ││ Goal progress    │
       *   │                          │├──────────────────┤
       *   │                          ││ Continue working │
       *   └──────────────────────────┘└──────────────────┘
       *
       * ── Why the three-region grid went ───────────────────────────────────────
       * UIX-01 replaced a work column plus a rail with THREE side-by-side regions
       * on the reasoning that they would be of "comparable height". Measured on a
       * seeded workspace at 1440px they are not, and the merge made it worse by
       * landing Goal progress in the middle track instead of the full-width row
       * its own comment still described: Focus ran to ~300px while the region
       * beside it ran to ~780px, leaving a ~470×640px hole of empty canvas in the
       * bottom-left of the page — directly under the day's own work, which is the
       * worst place on the screen to put nothing.
       *
       * A dominant work column with a single supporting rail is what the approved
       * reference draws, and it cannot produce that hole: the rail's sections
       * stack, so the two columns end when their content ends rather than being
       * forced to a common row height by the grid.
       *
       * The rail's order is the brief's priority order — what needs attention,
       * what is happening at a time, whether the longer game is moving, and then
       * where to pick work back up. Nothing is moved by CSS `order`: the DOM
       * order IS the phone composition, which is also the reading and tab order.
       */}
      <div className="dh-today__body">
        <div className="dh-today__col dh-today__col--focus">
          <section
            /* FINAL-UI — the ONE card on Today. Concept 1 draws the day's own
             * work inside a bordered surface and every supporting section
             * beside it as a plain section; see `today.css`. */
            className="dh-today__panel dh-today__panel--card dh-today__timeline"
            aria-labelledby="today-day-heading"
          >
            <div className="dh-today__panel-head">
              <h2 className="dh-today__panel-title" id="today-day-heading">
                Focus
              </h2>
            </div>

            {hasDay ? (
              <div className="dh-today__sections">
                {/*
                 * TODAY-10 — Overdue is now NAMED.
                 *
                 * UIX-01 left it headless on the reasoning that "the tint is the
                 * signal, and a heading would spend a row saying what the colour
                 * already says". That was sound while it was the only band. It is
                 * not now: with "Due today" and "Planned today" labelled beneath
                 * it, an unnamed first run reads as an unexplained preamble, and
                 * the one band whose meaning is carried by COLOUR would be the one
                 * with no words (AGENTS.md §15 — never colour alone). The label is
                 * the same quiet uppercase divider its siblings take, so naming it
                 * costs one small-caps line and makes it no louder.
                 */}
                {overdue.shown.length > 0 ? (
                  <div className="dh-day-section" data-tone="overdue">
                    <h3 className="dh-day-section__label">Overdue</h3>
                    <ul className="dh-day-list dh-day-list--overdue">
                      {overdue.shown.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          done={isDone(task)}
                          trailing={
                            <span className="dh-day-row__due">
                              {overdueLabel(task, data.todayIso)}
                            </span>
                          }
                          onToggle={(next) => toggle(task, next)}
                          openHref={taskHref(task.id)}
                          onOpen={() => openTask(task.id)}
                        />
                      ))}
                      {/* The remainder row is NOT a task row: it carries no
                      completion control and opens a collection rather than a
                      record. It says so in its class, so anything counting the
                      day's overdue tasks — CSS, a screen reader's list, a
                      regression test — is not counting the link that says how
                      many were left out. */}
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
                    </ul>
                  </div>
                ) : null}

                {/*
                 * TODAY-10 — the day's own work, in two named bands.
                 *
                 * "For today" was one list of two different commitments. A task
                 * DUE today is a deadline; a task PLANNED for today is a choice
                 * the owner made, and it may not be due for weeks — on the
                 * heavy fixture a task due 20 September sat in "For today"
                 * looking exactly like a deadline, while the same record on
                 * `/tasks?system=today` plainly read "Sun, 20 Sep". Today was
                 * the LESS clear of the two surfaces.
                 *
                 * The distinction is carried by the band, not by the row,
                 * because the row's one trailing slot is already the Project —
                 * and at 320px a row cannot hold a title, a date phrase AND a
                 * project without the title losing. A band label states the
                 * fact once for every row under it and costs no width at all.
                 * Each band draws only when it has work, so the ordinary day
                 * with nothing planned separately is one labelled list, not two.
                 */}
                <FocusBand
                  label="Due today"
                  tasks={focus.dueToday}
                  isDone={isDone}
                  onToggle={toggle}
                  taskHref={taskHref}
                  onOpen={openTask}
                />
                <FocusBand
                  label="Planned today"
                  tasks={focus.plannedToday}
                  isDone={isDone}
                  onToggle={toggle}
                  taskHref={taskHref}
                  onOpen={openTask}
                />

                {/*
                 * The bound, stated rather than applied silently. It names the
                 * TRUE size of the canonical view it links to, so following it
                 * lands on a list of exactly the promised size.
                 */}
                {focus.hidden > 0 ? (
                  <p className="dh-today__panel-foot">
                    <Link
                      className="dh-btn dh-btn--ghost"
                      to="/tasks?system=today"
                      data-testid="today-focus-view-all"
                    >
                      View all {todayCount} tasks for today
                    </Link>
                  </p>
                ) : null}

                {/* Overdue work but nothing actually ON today is a real and
                    distinct state, and a panel that just stopped after the
                    slipped rows implied the day was full. */}
                {buckets.today.length === 0 ? (
                  <p className="dh-today__quiet">Nothing else planned today.</p>
                ) : null}
              </div>
            ) : (
              /* A compact line, not a hero: an empty day is a good day, and it
               does not need an illustration, a headline and a button to say so.
               Capture stays where it always is — the global +. */
              <p className="dh-today__quiet dh-today__quiet--prose">
                Nothing planned today. Capture anything new with the{" "}
                <span className="dh-today__plus" aria-hidden="true">
                  +
                </span>
                <span className="dh-visually-hidden">plus</span> button.
              </p>
            )}
          </section>
        </div>

        {/*
         * The RAIL: everything that gives the day its context, in the brief's
         * own priority order — attention, then the timed day, then the longer
         * game, then where to pick work back up.
         *
         * One column rather than three regions, so a short section is followed
         * by the next one instead of by empty canvas.
         */}
        <div className="dh-today__col dh-today__col--rail">
          <section
            className="dh-today__panel"
            aria-labelledby="today-attention-heading"
          >
            <div className="dh-today__panel-head">
              <h2
                className="dh-today__panel-title"
                id="today-attention-heading"
              >
                Needs attention
              </h2>
            </div>
            {data.attention.length > 0 ? (
              <ul className="dh-day-list">
                {data.attention.map((item: AttentionItem) => (
                  <li
                    className="dh-day-row dh-day-row--attention"
                    key={item.id}
                  >
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
            ) : (
              /* ONE quiet row — never a large green card, and never beside
                 items. "All clear" is a fact, not an achievement. */
              <p className="dh-today__quiet">
                <span className="dh-today__quiet-glyph" aria-hidden="true">
                  <CheckCircleIcon />
                </span>
                All clear
              </p>
            )}
          </section>

          {/*
           * CAL-01 — the day's unified SCHEDULE.
           *
           * Every occurrence from every enabled external calendar source, plus
           * the DalyHub Meetings no occurrence already represents, in one
           * chronology. It replaced a panel that held Meetings alone; its
           * heading and its contents are unchanged, which is deliberate —
           * CAL-01 adds the owner's real day to Today, it does not redesign
           * Today (§16). REDESIGN-03 moved it from a track of its own into the
           * rail, and it now carries the day's timed commitments alone: the
           * "Meetings today · Next 20:00" card that used to sit above the fold
           * said less about the same meeting than this panel's first row does.
           *
           * Absent when the day holds nothing: a "Schedule" heading over
           * nothing is chrome.
           */}
          {data.schedule.count > 0 ? (
            <section
              className="dh-today__panel"
              aria-labelledby="today-schedule-heading"
              data-testid="today-schedule"
            >
              <div className="dh-today__panel-head">
                <h2
                  className="dh-today__panel-title"
                  id="today-schedule-heading"
                >
                  Schedule
                </h2>
              </div>
              <ScheduleList
                schedule={data.schedule}
                onOpenEvent={onOpenEvent}
                eventHref={eventHref}
              />
              {/*
               * Freshness, stated only when it is NOT fine.
               *
               * A line saying "everything synced" on every visit is noise; a day
               * built from a failed refresh that says nothing is a lie. So the
               * panel is silent when the projection is current and says so
               * plainly when it is not — and points at the place that can fix it.
               */}
              {data.scheduleStale ? (
                <p className="dh-today__panel-foot">
                  <Link
                    className="dh-btn dh-btn--ghost"
                    to="/settings?section=calendars"
                  >
                    A calendar did not refresh — showing the last schedule
                    DalyHub loaded
                  </Link>
                </p>
              ) : null}
            </section>
          ) : null}

          <GoalProgressSection goals={data.goals} onUpdateGoal={onUpdateGoal} />

          {/* Absent entirely when no project has open work — "continue working"
              on a project with nothing left to do is not a suggestion. */}
          {data.continueProjects.length > 0 ? (
            <section
              className="dh-today__panel"
              aria-labelledby="today-continue-heading"
            >
              <div className="dh-today__panel-head">
                <h2
                  className="dh-today__panel-title"
                  id="today-continue-heading"
                >
                  Continue working
                </h2>
              </div>
              <ul className="dh-day-list">
                {data.continueProjects.map((project: ContinueProject) => (
                  <li
                    className="dh-day-row dh-day-row--project"
                    key={project.id}
                  >
                    {/*
                     * UIX-01 — the project's OWN persisted identity mark.
                     *
                     * It was a monochrome letter in a grey circle; it is now the
                     * same `AccentIcon` the Projects gallery and the Project
                     * record draw, from the same stored `iconKey`/`colourRank`.
                     * Identity is recognition before reading, and one record
                     * must not have two appearances.
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
                      {/*
                       * ONE concise state line, as the reference draws it
                       * ("3 tasks overdue" / "On track"). The 6px completion bar
                       * that used to sit under it went with the redesign: a
                       * three-row attention list is scanned for WHICH project
                       * needs a look, and a per-row bar answers a question
                       * ("how far through is it?") that the Project record and
                       * the Projects gallery both already answer properly.
                       */}
                      <span className="dh-day-row__meta">
                        {project.openCount} open{" "}
                        {project.openCount === 1 ? "task" : "tasks"} ·{" "}
                        {project.statusLabel}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="dh-today__panel-foot">
                <Link className="dh-btn dh-btn--ghost" to="/projects">
                  All projects
                </Link>
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Goal progress                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The measurable Goals worth a look today.
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
      </div>
      {goals.length === 0 ? (
        <p className="dh-today__quiet dh-today__quiet--prose">
          No measurable Goals yet. Add a target to a{" "}
          <Link to="/goals">Goal</Link> and your progress shows up here.
        </p>
      ) : (
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
                 * IDENTITY, stamped once here so everything inside it agrees.
                 *
                 * UIX-01 tinted it from a hash of the Goal's id, which spent
                 * colour without meaning anything. It is the Goal's own chosen
                 * colour where it has one and its Area's otherwise — and
                 * because the attribute sits on the tile, the mark, the meter
                 * and the change figure inside it all resolve from it rather
                 * than each deciding for itself.
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
                {/*
                 * UIX-03 — the mark is the Goal's AREA identity.
                 *
                 * UIX-01 derived a tone from a hash of the Goal's id, because a
                 * Goal genuinely had no persisted colour then. It has one now —
                 * its Area's, the same rule a Project follows — so this is the
                 * mark the Goals gallery draws, on the same rank, with the same
                 * glyph. Four measurable Goals are still four colours; the
                 * difference is that the colour now MEANS the part of life each
                 * one serves, and the same Goal is the same colour on both
                 * screens. It is identity, never status: the state word beside
                 * the bar is what says how the Goal is going.
                 */}
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
                 * VIS-01 — the head is the TITLE, and nothing else.
                 *
                 * The Area used to sit beside it. It is the definition of
                 * metadata already visible elsewhere: the Goal record states
                 * it, the Goals gallery states it, and on a glance surface it
                 * competed with the title for the one line a compact card has.
                 */}
                <Link
                  className="dh-today__goal-title"
                  to={`/goals/${encodeURIComponent(goal.id)}`}
                >
                  {goal.title}
                </Link>
                <GoalProgressReadout
                  size="glance"
                  progress={goal.progress}
                  label={`${goal.title} progress`}
                  trailing={change ? `${change} this month` : null}
                />
                {/* One action, and it is the one a Goal needs most often. The
                    Goal record is a link away for everything else. It is a TEXT
                    button here: an outlined pill on four cards at once made the
                    least-used thing on each card its most conspicuous. */}
                {onUpdateGoal && goal.progress.type !== "milestone" ? (
                  <button
                    type="button"
                    className="dh-btn dh-btn--ghost dh-btn--sm"
                    data-testid="today-goal-update"
                    onClick={(event) => onUpdateGoal(goal, event.currentTarget)}
                  >
                    {goalCheckInLabel(goal.progress.type, goal.progress.unit)}
                    <span className="dh-visually-hidden">{` for ${goal.title}`}</span>
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/*
 * The workload trend USED to be here — seven days of created against completed,
 * as paired bars, with the week's totals in a sentence beneath.
 *
 * REDESIGN-03 removed it. Not because a chart is wrong on a daily surface, but
 * because this one said what the summary above it already said: the sentence
 * under the bars read "21 completed · 124 created", and the first two cards of
 * `TodaySummary` read "Tasks completed 21" and "Tasks captured 124" over the
 * same rolling seven days. One page, two renderings, one screen apart.
 *
 * The shape it added was also the least trustworthy thing on the page. The bars
 * share one linear scale, so a single day of bulk capture flattens the other six
 * to hairlines — on the seeded design fixture the Sunday "created" bar is 124
 * against a weekday range of 0–7, and the chart becomes one block and a row of
 * lines. A chart that is only legible on unremarkable weeks is not a chart.
 *
 * Trends belong to Analytics, which has a real range picker, states where each
 * figure comes from, and refuses the same invented metrics this screen does. The
 * summary's completed measure links straight there.
 */
