/**
 * TODAY-DAY — the Today screen.
 *
 * The surface the owner lands on every morning, rebuilt around ONE question:
 * *what am I doing today?* It is a place to work, not a report about work.
 *
 * ── WHAT IT IS ───────────────────────────────────────────────────────────────
 *
 *   greeting + date            page content on the canvas — no card, no widget
 *   ┌───────────────────────────────────────────────────────────┐
 *   │ ◯72%  Today · Your day        8 tasks   2 overdue         │  the summary
 *   │       3 of 8 done today                   [ Plan day ]    │  (expressive)
 *   └───────────────────────────────────────────────────────────┘
 *   ┌──────────────────────┬──────────────────┐
 *   │ My day               │ Needs attention  │
 *   │  overdue (tinted)    │ Continue working │
 *   │  meetings            │                  │
 *   │  due today           │                  │
 *   └──────────────────────┴──────────────────┘
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
 *   - **One expressive surface.** The summary is the page's only tinted, shaped,
 *     elevated object. Everything below it is a quiet tonal panel, which is what
 *     makes the summary read as the answer rather than as another box.
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
import { ExpressiveSummary } from "~/shared/card";
import { withDrawerPushed, useDrawer } from "~/shared/drawer";
import {
  CheckCircleIcon,
  GoalIcon,
  MeetingIcon,
  ProjectIcon,
  ScheduleIcon,
  TaskIcon,
} from "~/shared/icons";
import { ProgressTrack } from "~/shared/progress";
import { ComparisonBars } from "~/shared/charts";
import {
  GoalProgressReadout,
  formatMeasurementChange,
  goalCheckInLabel,
} from "~/shared/goal-progress";

import {
  bucketDay,
  dayChips,
  dayProgress,
  greetingFor,
  dayPartForHour,
  overdueLabel,
  overdueSlice,
  type DayTask,
} from "./day-view";
import {
  projectInitial,
  type AttentionItem,
  type AttentionKind,
  type ContinueProject,
} from "./attention-view";
import { HELP_DRAWER_KEY } from "../keyboard/KeyboardHelp";
import type { TodayActivityTrend, TodayGoal } from "./goal-progress";
import { activityTrendSummary, weekdayLabel } from "./trend-view";
import type { DayMeeting, TodayDayData } from "./load";

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
    case "inbox":
      return <TaskIcon />;
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
      <input
        type="checkbox"
        className="dh-day-row__check"
        checked={done}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        onChange={(event) => onToggle(event.currentTarget.checked)}
      />
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
      {trailing}
    </li>
  );
}

/** One meeting row. Meetings are not checkboxes — they happen to you. */
function MeetingRow({ meeting }: { readonly meeting: DayMeeting }) {
  return (
    <li className="dh-day-row dh-day-row--meeting">
      <span className="dh-day-row__time">{meeting.timeLabel}</span>
      <span className="dh-day-row__glyph" aria-hidden="true">
        <MeetingIcon />
      </span>
      <Link
        className="dh-day-row__title"
        to={`/meetings/${encodeURIComponent(meeting.id)}`}
      >
        {meeting.title}
      </Link>
      {meeting.context ? (
        <span className="dh-day-row__meta">{meeting.context}</span>
      ) : null}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                  */
/* -------------------------------------------------------------------------- */

export function TodayScreen({
  data,
  onCompleteTask,
  onUpdateGoal,
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
  const chips = dayChips({
    taskCount: buckets.today.length,
    meetingCount: data.meetings.length,
    overdueCount: buckets.overdue.length,
  });
  const overdue = overdueSlice(buckets.overdue);
  const greeting = greetingFor(dayPartForHour(data.hour), data.ownerName);

  /*
   * The summary's figures ARE the chip model, rendered as figures. Splitting the
   * count from its noun is the only difference, and `dayChips` supplies both, so
   * the rules the chip row held — a zero never paints, every figure links to the
   * canonical view that holds it, `error` is spent on slipped work alone — are
   * still enforced in one pure, unit-tested place rather than re-derived here.
   */
  const summaryStats = useMemo(
    () =>
      chips.map((chip) => ({
        id: chip.id,
        value: chip.count,
        label: chip.noun,
        tone: chip.tone === "error" ? ("attention" as const) : undefined,
        href: chip.href,
      })),
    [chips],
  );

  /*
   * The summary's headline names the day in the owner's terms. It states what is
   * actually true rather than always saying "today": a day with nothing on it
   * says so, and a day whose only work has slipped does not claim to be busy.
   */
  const headline =
    buckets.today.length > 0
      ? "Your day"
      : buckets.overdue.length > 0
        ? "Nothing due today"
        : "A clear day";

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

  const hasDay =
    buckets.overdue.length > 0 ||
    data.meetings.length > 0 ||
    buckets.today.length > 0;

  return (
    <div className="dh-today">
      {/* The header block is PAGE CONTENT on the canvas — the greeting is the
          screen's heading, not a widget with a label above it. It is compact by
          design: M3X moved the day's WEIGHT into the summary below it, so the
          greeting states who and when and then gets out of the way. */}
      <header className="dh-today__head">
        <div className="dh-today__identity">
          <h1 className="dh-today__greeting">{greeting}</h1>
          <p className="dh-today__date">{data.dateLong}</p>
        </div>
      </header>

      {/*
       * M3X — the day's ONE expressive surface, and the only place its figures
       * are painted. It replaced the assist-chip row rather than joining it:
       * two surfaces stating the same three counts would break Today's own
       * "one fact, one place" rule, which is the rule that made this screen
       * worth keeping.
       *
       * Everything on it is conditional, exactly as the chip row was. A quiet
       * day renders the headline and nothing else; the ring appears only once
       * something is done, because a 0% ring first thing in the morning is a
       * guilt meter rather than a measure (see `dayProgress`).
       */}
      {summaryStats.length > 0 || progress ? (
        <ExpressiveSummary
          className="dh-today__summary"
          data-testid="today-summary"
          eyebrow="Today"
          headline={headline}
          supporting={
            progress
              ? `${progress.done} of ${progress.total} done today`
              : undefined
          }
          ring={
            progress
              ? {
                  value: progress.done / Math.max(1, progress.total),
                  label: `Today's progress: ${progress.done} of ${progress.total} done`,
                  centre: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`,
                }
              : undefined
          }
          stats={summaryStats}
          action={
            /*
             * "Plan day" is a NAVIGATION, not a feature: DalyHub has no
             * dedicated planning flow, so it goes to the canonical Tasks view
             * of today's work — where planning already lives. Building a second
             * planning surface here is explicitly out of scope. It moved from
             * the day panel's header into the summary because the summary is
             * where the decision to plan is made.
             */
            <Link className="dh-btn dh-btn--primary" to="/tasks?system=today">
              Plan day
            </Link>
          }
        />
      ) : null}

      <div className="dh-today__body">
        <section
          className="dh-today__panel dh-today__timeline"
          aria-labelledby="today-day-heading"
        >
          <div className="dh-today__panel-head">
            <h2 className="dh-today__panel-title" id="today-day-heading">
              My day
            </h2>
          </div>

          {hasDay ? (
            <div className="dh-today__sections">
              {/* Overdue carries NO heading: the tint is the signal, and a
                  heading would spend a row saying what the colour already says. */}
              {overdue.shown.length > 0 ? (
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
              ) : null}

              {data.meetings.length > 0 ? (
                <div className="dh-day-section">
                  <h3 className="dh-day-section__label">Meetings</h3>
                  <ul className="dh-day-list">
                    {data.meetings.map((meeting) => (
                      <MeetingRow key={meeting.id} meeting={meeting} />
                    ))}
                  </ul>
                </div>
              ) : null}

              {buckets.today.length > 0 ? (
                <div className="dh-day-section">
                  <h3 className="dh-day-section__label">Due today</h3>
                  <ul className="dh-day-list">
                    {buckets.today.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        done={isDone(task)}
                        trailing={
                          task.parent ? (
                            <span className="dh-day-row__meta">
                              {task.parent.title}
                            </span>
                          ) : null
                        }
                        onToggle={(next) => toggle(task, next)}
                        openHref={taskHref(task.id)}
                        onOpen={() => openTask(task.id)}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            /* A compact line, not a hero: an empty day is a good day, and it
               does not need an illustration, a headline and a button to say so.
               Capture stays where it always is — the global +. */
            <p className="dh-today__quiet">
              Nothing planned today. Capture anything new with the{" "}
              <span className="dh-today__plus" aria-hidden="true">
                +
              </span>
              <span className="dh-visually-hidden">plus</span> button.
            </p>
          )}
        </section>

        <div className="dh-today__rail">
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
                    <span className="dh-day-row__glyph" aria-hidden="true">
                      <AttentionGlyph kind={item.kind} />
                    </span>
                    <Link className="dh-day-row__title" to={item.href}>
                      {item.label}
                    </Link>
                    <span className="dh-day-row__meta">{item.detail}</span>
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
                    <span className="dh-day-row__avatar" aria-hidden="true">
                      {projectInitial(project.title)}
                    </span>
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
                      {project.taskTotal > 0 ? (
                        <ProgressTrack
                          className="dh-day-row__progress"
                          label={`${project.title} progress`}
                          percent={
                            (project.taskCompleted / project.taskTotal) * 100
                          }
                          valueText={`${project.taskCompleted} of ${project.taskTotal} tasks`}
                        />
                      ) : null}
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
          GOAL-02 — the two sections that answer "am I making progress?" and "is
          my workload moving in the right direction?".

          They live INSIDE the body grid, continuing the day's own column beneath
          the timeline while the rail spans both rows. That is not decoration: as
          a separate row below the whole body they began under the TALLER of the
          two columns, which left a screen of dead space under "My day" on a
          desktop. Here they simply carry on where the day's work ends.

          Their DOM position keeps Today's hierarchy on a phone, where everything
          is one column: immediate actions, then what needs a look, then progress.
          Neither is a dashboard — Goal progress is at most four Goals with the
          one action each needs, and the trend is a single comparison with a
          sentence under it. Both disappear when they have nothing to say.
        */}
        <div className="dh-today__progress">
          <GoalProgressSection goals={data.goals} onUpdateGoal={onUpdateGoal} />
          <ActivityTrendSection trend={data.activityTrend} />
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
      className="dh-today__panel"
      aria-labelledby="today-goals-heading"
      data-testid="today-goal-progress"
    >
      <div className="dh-today__panel-head">
        <h2 className="dh-today__panel-title" id="today-goals-heading">
          Goal progress
        </h2>
      </div>
      {goals.length === 0 ? (
        <p className="dh-today__quiet">
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
              <li className="dh-today__goal" key={goal.id}>
                <div className="dh-today__goal-head">
                  <Link
                    className="dh-today__goal-title"
                    to={`/goals/${encodeURIComponent(goal.id)}`}
                  >
                    {goal.title}
                  </Link>
                  <span className="dh-today__goal-area">{goal.areaTitle}</span>
                </div>
                <GoalProgressReadout
                  progress={goal.progress}
                  label={`${goal.title} progress`}
                  trailing={change ? `${change} this month` : null}
                />
                {/* One action, and it is the one a Goal needs most often. The
                    Goal record is a link away for everything else. */}
                {onUpdateGoal && goal.progress.type !== "milestone" ? (
                  <button
                    type="button"
                    className="dh-btn dh-btn--outlined dh-btn--sm"
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
