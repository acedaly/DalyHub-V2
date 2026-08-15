/**
 * TODAY-DAY — the Today screen.
 *
 * The surface the owner lands on every morning, rebuilt around ONE question:
 * *what am I doing today?* It is a place to work, not a report about work.
 *
 * ── WHAT IT IS ───────────────────────────────────────────────────────────────
 *
 *   greeting + date                                        [ Plan day ]
 *   ┌────────────┐┌────────────┐┌────────────┐┌────────────┐
 *   │ Tasks today││ Overdue    ││ Meetings   ││ Progress ◯ │  the day's figures
 *   │ 6          ││ 2          ││ 2          ││ 68%        │  as quiet cards
 *   └────────────┘└────────────┘└────────────┘└────────────┘
 *   ┌───────────────────────────────────┐┌──────────────────┐
 *   │ Focus                             ││ Schedule         │
 *   │  OVERDUE                          ││  09:30 Standup   │
 *   │   ▏Send the summary  Due 2 days ago│├──────────────────┤
 *   │  DUE TODAY                        ││ Needs attention  │
 *   │   ☐ Draft the notes    P1  Project │├──────────────────┤
 *   │  PLANNED TODAY                    ││ Continue working │
 *   │   ☐ Refactor the tokens    Project ││                  │
 *   │  View all 14 tasks for today      ││                  │
 *   └───────────────────────────────────┘└──────────────────┘
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
 * There was one: a tinted, elevated summary carrying the same three counts. The
 * approved direction replaced it with this row, and the trade is deliberate.
 * A hero spends the page's largest type on a HEADLINE ("Your day") and leaves
 * the figures at label size beside it; a row of stat cards spends it on the
 * FIGURES, which is what the screen is actually asked. It is also calmer: four
 * cards on the canvas instead of one violet band, which is the restraint the
 * DalyHub design system asks for (DALYHUB_DESIGN_SYSTEM.md §1).
 *
 * The rules the hero held are unchanged and are still enforced in one pure,
 * unit-tested place (`dayChips` / `dayProgress`): a zero never paints, every
 * figure links to the canonical view that holds it, and slipped work is the one
 * thing given a tone.
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
 *   - **Zeros never render.** Every figure, the progress ring, every timeline
 *     section and every rail row is conditional on its own count. A quiet day is
 *     a short page, not a page of noughts — and the summary itself does not
 *     paint when it would have nothing to say.
 *   - **One fact, one place.** Overdue work is a summary figure AND actionable
 *     rows — and is banned from the rail, which holds only what the timeline
 *     does not show. M3X's summary REPLACED the assist-chip row for this reason;
 *     it did not join it.
 *   - **No tinted surface at all.** Today is the product's calmest screen by
 *     design: the figures lead, the day follows, and colour is spent only on
 *     slipped work and on the progress ring. Every panel is one quiet tonal
 *     surface.
 *   - **Tasks have no times.** A task is a date; a meeting is an instant. So
 *     there is no Morning/Afternoon grouping and no invented time beside a task.
 *   - **Tonal surfaces, not outlined cards.** Each column is ONE surface with
 *     plain rows inside it. No panel inside a panel.
 *
 * Capture is the global `+` alone: this screen offers no second capture control.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

// Imported from the specific module rather than the `~/shared/commands` barrel,
// so the Today route chunk does not eagerly pull the palette controller.
import { useRegisterContextualActions } from "~/shared/commands/CommandContextProvider";
import type { AppAction } from "~/shared/commands/action";
import { StatCard, StatCardItem, StatCardRow } from "~/shared/card";
import { AccentIcon } from "~/shared/entity";
import { areaAccentForRank } from "~/shared/pill";
import { ProgressRing } from "~/shared/charts";
import { withDrawerPushed, useDrawer } from "~/shared/drawer";
import {
  AssetIcon,
  CalendarIcon,
  CheckCircleIcon,
  GoalIcon,
  ProjectIcon,
  ScheduleIcon,
  TaskIcon,
  TrendingUpIcon,
  ToneIcon,
  type ToneName,
} from "~/shared/icons";
import { ComparisonBars } from "~/shared/charts";
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
  dayChips,
  dayProgress,
  focusTodaySlice,
  greetingFor,
  dayPartForHour,
  nextUp,
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
import { activityTrendSummary, weekdayLabel } from "./trend-view";
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
 * UIX-01 — the glance row's tonal identities, keyed by the chip model's id.
 *
 * Four figures, four hues, in the reference's own distribution: the day's work
 * in the product's violet, slipped work in coral, the day's timed events in
 * blue, and progress in green. Overdue's coral is IDENTITY; what says the
 * figure needs attention is `tone="attention"` on the number itself, plus the
 * word "Overdue" above it.
 */
const STAT_ACCENTS: Readonly<Record<string, ToneName>> = {
  tasks: "violet",
  meetings: "blue",
  overdue: "coral",
};

/** The glyph each glance figure carries. Decorative; the label states the fact. */
function statGlyph(id: string) {
  switch (id) {
    case "meetings":
      return <CalendarIcon />;
    case "overdue":
      return <ScheduleIcon />;
    default:
      return <CheckCircleIcon />;
  }
}

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
    });
  }

  if (measures.length === 0) return null;

  return (
    <ul className="dh-today__summary" data-testid="today-summary">
      {measures.map((measure) => (
        <li className="dh-today__measure" key={measure.id}>
          {/*
           * The LABEL leads and the figure follows, because that is the reading
           * order the reference sets and the only one that works when three
           * cards sit side by side: the eye lands on the number, and the words
           * above it are what the number is OF.
           */}
          <span className="dh-today__measure-label">{measure.label}</span>
          <span className="dh-today__measure-value">{measure.value}</span>
          <span className="dh-today__measure-note">{measure.note}</span>
        </li>
      ))}
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

  const progress = dayProgress(buckets);
  /*
   * TODAY-10 — the figure is the CANONICAL count, not the row count.
   *
   * "Tasks for today" links straight to `/tasks?system=today`, so it has to be
   * that view's number. A Task due today that has also slipped its plan is filed
   * under Overdue here and counted by that view there; deriving the figure from
   * the membership rule rather than from the "for today" run is what stops the
   * card and its own destination disagreeing.
   */
  const todayCount = tasksForTodayCount(buckets, data.todayIso);
  const chips = dayChips({
    taskCount: todayCount,
    meetingCount: data.meetings.length,
    // A task completed this morning is not overdue work any more, however far
    // its date has passed — it stays in the band, dimmed, but it is not counted.
    overdueCount: buckets.overdue.filter((task) => !isDone(task)).length,
  });
  const overdue = overdueSlice(buckets.overdue);
  const focus = focusTodaySlice(buckets);
  const greeting = greetingFor(dayPartForHour(data.hour), data.ownerName);

  /*
   * The day's figures, as the stat-card row.
   *
   * They ARE the chip model — `dayChips` supplies the count, the noun, the tone
   * and the destination — so every rule that model has always held is still
   * enforced in one pure, unit-tested place rather than re-derived here: a zero
   * never paints, every figure links to the canonical view that holds it, and
   * `state-overdue` is spent on slipped work alone.
   */
  /*
   * The one thing on the day that is still AHEAD, from the shared derivation.
   *
   * It is no longer a surface of its own — the approved direction answers "what
   * next?" on the figure it belongs to, which is the meetings card. It is
   * re-derived against the OPTIMISTIC buckets, so ticking a task off updates it
   * without waiting for the loader.
   */
  const next = useMemo(
    () => nextUp({ meetings: data.meetings, buckets }),
    [data.meetings, buckets],
  );

  const stats = useMemo(
    () =>
      chips.map((chip) => ({
        id: chip.id,
        value: String(chip.count),
        // "6 / Tasks for today" rather than "6 / tasks": a label above a figure
        // is read as a heading for it, and a heading is not a plural noun.
        label: chip.heading,
        href: chip.href,
        tone: chip.tone === "error" ? ("attention" as const) : undefined,
        // The meetings card carries the day's next START TIME, because that is
        // the one figure on this row with something ahead of it. A meeting that
        // has already begun is not "next", which is why the flag is decided on
        // the server against the request instant.
        supporting:
          chip.id === "meetings" && next?.kind === "meeting"
            ? `Next: ${next.timeLabel}`
            : undefined,
      })),
    [chips, next],
  );

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
      {/* The header block is PAGE CONTENT on the canvas — the greeting is the
          screen's heading, not a widget with a label above it. It is compact by
          design: M3X moved the day's WEIGHT into the summary below it, so the
          greeting states who and when and then gets out of the way. */}
      {/*
       * The header block is PAGE CONTENT on the canvas — the greeting is the
       * screen's heading, not a widget with a label above it. "Plan day" sits
       * here now that there is no hero to carry it: it is a NAVIGATION to the
       * canonical Tasks view of today's work, and the page header is where a
       * page-level navigation belongs.
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

      {stats.length > 0 || progress ? (
        <StatCardRow label="Today at a glance" data-testid="today-stats">
          {stats.map((stat) => (
            <StatCardItem key={stat.id}>
              <StatCard
                label={stat.label}
                value={stat.value}
                supporting={stat.supporting}
                tone={stat.tone}
                accent={STAT_ACCENTS[stat.id] ?? "violet"}
                icon={statGlyph(stat.id)}
                href={stat.href}
                data-testid={`today-stat-${stat.id}`}
              />
            </StatCardItem>
          ))}
          {progress ? (
            <StatCardItem>
              <StatCard
                label="Daily progress"
                value={`${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`}
                supporting={`${progress.done} of ${progress.total} done today`}
                accent="green"
                icon={<TrendingUpIcon />}
                data-testid="today-stat-progress"
                ring={
                  <ProgressRing
                    value={progress.done / Math.max(1, progress.total)}
                    label={`Today's progress: ${progress.done} of ${progress.total} done`}
                    size={44}
                    thickness={5}
                    color="var(--md-sys-color-accent-green)"
                  />
                }
              />
            </StatCardItem>
          ) : null}
        </StatCardRow>
      ) : null}

      {/* CAL-02 — the three daily surfaces. A restrained text rail directly
          under the page's own heading block, exactly where every other
          collection in DalyHub puts its principal-mode rail. */}
      <DayNav active="today" />

      <TodaySummary trend={data.activityTrend} goals={data.goals} />

      {/*
       * UIX-01 — THREE balanced regions, then progress across the full width.
       *
       *   ┌──────────────┐┌──────────┐┌──────────┐
       *   │ Focus        ││ Schedule ││ Needs    │
       *   │              ││          ││ attention│
       *   └──────────────┘└──────────┘└──────────┘
       *   ┌────────────────────────────────────────┐
       *   │ Goal progress · This week              │
       *   └────────────────────────────────────────┘
       *
       * The redesign's composition, and a real improvement on the two unequal
       * columns it replaces: the rail used to stack Schedule, attention and
       * Continue working into one 21rem strip beside a list that is usually
       * shorter than they are, so a 1440px window ended in a tall thin column
       * beside empty canvas. Three regions of comparable height fill the fold,
       * and Goal progress — which is horizontal by nature, a row of compact
       * measures — gets the width it always wanted underneath.
       *
       * `data-columns` states how many regions actually have content, so the
       * grid never renders an empty track: a day with no meetings is two
       * regions, not three with a hole in the middle. Nothing is moved by CSS
       * `order` — the DOM order IS the phone composition (Focus, then the day's
       * context, then progress), which is also the reading and tab order.
       */}
      <div
        className="dh-today__body"
        data-columns={data.schedule.count > 0 ? 3 : 2}
      >
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
         * CAL-01 — the day's unified SCHEDULE, in its own region.
         *
         * Every occurrence from every enabled external calendar source, plus the
         * DalyHub Meetings no occurrence already represents, in one chronology.
         * It replaced a panel that held Meetings alone; the region, its heading
         * and its position are unchanged, which is deliberate — CAL-01 adds the
         * owner's real day to Today, it does not redesign Today (§16).
         *
         * Absent when the day holds nothing, and `data-columns` above drops its
         * track with it: a "Schedule" heading over nothing is chrome.
         */}
        {data.schedule.count > 0 ? (
          <div className="dh-today__col dh-today__col--schedule">
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
          </div>
        ) : null}

        <GoalProgressSection goals={data.goals} onUpdateGoal={onUpdateGoal} />

        <div className="dh-today__col dh-today__col--attention">
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

        {/*
         * DS-06 — Goal progress, as the body grid's last child.
         *
         * "Am I making progress?" is the question Today's second half exists to
         * answer, and both concepts give it a band of its own directly under the
         * day's work. It is placed by the grid (see `today.css`) into the row
         * beneath Focus and Schedule, with the attention column spanning past
         * it — so it fills the hole those two unequal columns leave rather than
         * starting a new band below everything.
         *
         * Last in the DOM, which keeps the phone's hierarchy unchanged:
         * immediate actions, then what needs a look, then progress. Nothing here
         * is moved by CSS `order`.
         */}
      </div>

      {/*
       * DS-06 — the week's trend, across the full width beneath the day.
       *
       * Goal progress USED to sit here beside it. It has moved INTO the body
       * grid above (as its last child, so the reading and tab order are
       * unchanged) because the three regions were not the "comparable height"
       * UIX-01 assumed: measured on a real workspace, Focus ran to ~400px,
       * Schedule to ~130px and the attention column to ~680px, which left a
       * 500×300px hole in the bottom-left of the fold with Goal progress
       * stranded below it. The body's grid now spans the attention column across
       * both rows and lands Goal progress in that hole — the same full-width-ish
       * row of compact measures, in the space the page already had.
       *
       * The trend stays here: it is a wide, thin band about the WEEK rather than
       * the day, it is the last thing on the phone for the same reason, and it
       * wants the whole page rather than two thirds of it.
       */}
      {/*
       * The day's figures, as quiet cards on the canvas — BELOW the day's work.
       *
       * Every card is still conditional on its own count, exactly as the chip
       * row and the hero before it were: a quiet day renders no row at all
       * rather than a line of noughts, and the progress card appears only once
       * something is done — a 0% ring first thing in the morning is a guilt
       * meter rather than a measure (see `dayProgress`).
       *
       * FINAL-UI moved the whole row from ABOVE the body grid to below it, and
       * §45 of the brief is the rule: "do not put decorative stats before
       * actionable content". Concept 1's Today opens on the day's tasks and its
       * schedule and keeps its two small measures — "This week", "Focus" — at
       * the bottom of the page. Two 80px figure cards between the greeting and
       * the first task were the difference between a command centre and a
       * dashboard, and they cost the fold ~110px of the owner's actual work.
       *
       * Nothing is hidden and nothing is moved by CSS `order`: the DOM order is
       * the phone order too, which is the same reordering §45 asks for there.
       */}
      <div className="dh-today__progress">
        <ActivityTrendSection trend={data.activityTrend} />
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
                 * UIX-03 — the tile's wash is the AREA's accent, the same one
                 * the mark above it and the Goal's gallery card carry. UIX-01
                 * tinted it from a hash of the Goal's id, which spent colour
                 * without meaning anything; the tile is just as colourful now
                 * and the colour says which part of life the Goal serves.
                 */
                data-accent={
                  goal.areaColourRank === null
                    ? undefined
                    : String(areaAccentForRank(goal.areaColourRank))
                }
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
                  iconKey={goal.areaIconKey}
                  colourRank={goal.areaColourRank}
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

/* -------------------------------------------------------------------------- */
/* Workload trend                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Seven days of tasks created against tasks completed.
 *
 * Chosen over a productivity score because a score is a number nobody can check
 * and this is two numbers everybody can. The sentence beneath states the week's
 * totals, and it only claims the workload moved when the arithmetic supports it.
 */
function ActivityTrendSection({
  trend,
}: {
  readonly trend: TodayActivityTrend | null;
}) {
  // A week with nothing in it is not a chart with no bars — it is no section.
  if (trend === null) return null;

  const summary = activityTrendSummary(trend);
  return (
    <section
      className="dh-today__panel"
      aria-labelledby="today-trend-heading"
      data-testid="today-activity-trend"
    >
      <div className="dh-today__panel-head">
        <h2 className="dh-today__panel-title" id="today-trend-heading">
          This week
        </h2>
      </div>
      <ComparisonBars
        data-testid="today-trend-chart"
        points={trend.days.map((day) => ({
          key: day.dateIso,
          label: weekdayLabel(day.dateIso),
          primary: day.completed,
          secondary: day.created,
        }))}
        primaryLabel="Completed"
        secondaryLabel="Created"
        summary={summary.accessible}
      />
      <p className="dh-today__trend-note">{summary.visible}</p>
    </section>
  );
}
