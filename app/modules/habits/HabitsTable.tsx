/**
 * UNTITLED-09 — the Habits collection as a TABLE.
 *
 * ── What this replaced ──────────────────────────────────────────────────────
 *
 * `HabitList columns` + `HabitRow layout="columns"`: a CSS-grid table declared
 * across two files in `habits.css`, ~140 lines of module stylesheet deciding the
 * tracks, the head, the cell typography, the hover reveal and three container
 * breakpoints. It looked like a table and behaved like a stack of `<li>`s, and
 * the seam showed on the screen: the column headings sat above the wrong
 * columns, the seven weekday LETTERS were repeated on every single row instead
 * of being stated once in a heading, and every row drew an identity tile that —
 * for a Habit, which stores no icon — was the same generic glyph eight times
 * down the page.
 *
 * Untitled's `application/table` grammar draws it now: the `bg-secondary` head
 * band with its xs semibold labels, the hairline-divided body, the `bg-primary`
 * rows with a `bg-secondary` hover, and the whole thing bounded by
 * `TableCard.Root`. The nouns moved into the headings, stated once.
 *
 * ── A semantic `<table>`, not React Aria's `Table` ──────────────────────────
 *
 * The same decision the Goal record's reading history records, for a stronger
 * reason. React Aria's `Table` is a GRID: you tab into it once and then arrow
 * between cells to reach anything interactive inside them. That is right for the
 * Areas and Projects tables, whose only in-row control is an overflow menu it is
 * fine to hunt for.
 *
 * It is wrong here. The Habits collection exists so that checking a Habit off is
 * instant — "stay where you are, change the thing in context, continue working"
 * — and a grid puts a mode switch between the keyboard and the one control this
 * page is FOR. A plain table keeps every check-in one Tab apart, in reading
 * order, and still gets Untitled's cell, head and row classes, which is where
 * the value of the library is on a surface like this.
 *
 * ── Columns, and how they drop ──────────────────────────────────────────────
 *
 *   ✓ · Habit (+ Area) · Schedule · Today · This week · Last 7 days · ⋯
 *
 * The check, the name, today's state and the overflow are always drawn; the
 * schedule, the week bar and the seven-day strip drop out below `@lg`, `@md` and
 * `@2xl`, and every fact they carried reappears on a quiet second line under the
 * name. Nothing is lost on a phone — a narrow screen is not a smaller desktop.
 *
 * They are CONTAINER queries, not viewport ones, because this table is also
 * drawn inside a narrow column and a viewport breakpoint would give it the
 * desktop column budget in a pane less than half that wide.
 *
 * ── The check control is a CIRCLE, deliberately ─────────────────────────────
 *
 * Untitled's `base/checkbox` is not used for it, and that is a product rule
 * rather than an omission: DalyHub draws COMPLETING as a circle and SELECTING as
 * a square (`DESIGN_SYSTEM.md` D7). Checking a Habit and finishing a Task are
 * the same physical gesture and must not be two different controls, so the
 * habit check is `.dh-check-circle` — the same 20px control, the same 44px
 * coarse-pointer target and the same forced-colours fallback the Task row uses.
 * Untitled's checkbox is used everywhere in Habits that the act really is
 * selection: the weekday picker in the schedule form.
 *
 * ── No identity tile ────────────────────────────────────────────────────────
 *
 * The old row drew an `AccentIcon` per Habit. A Habit stores no icon and no
 * colour, so the tile inherited its Area's — and for the majority that have no
 * Area it drew the entity's default glyph, which is the same mark on every row
 * and therefore identifies nothing. The Area's own coloured dot, beside the
 * Area's name, carries exactly the same fact where it means something.
 */

import type { ReactNode } from "react";

import type { FirstDayOfWeek } from "~/kernel/preferences";
import { identityAttribute, resolveIdentity } from "~/shared/entity";
import {
  HabitWeekStrip,
  HabitWeekStripHeading,
  type SerializedHabit,
  type useHabitCheckIn,
} from "~/shared/habits";
import { UntitledStatusBadge } from "~/shared/pill";
import { LabelledProgressBar } from "~/shared/ui/untitled/overrides/labelled-progress-bar";
import { TableCard } from "~/shared/ui/untitled/application/table/table";

/** Untitled's table head cell: `bg-secondary`, xs semibold, quaternary text. */
const HEAD =
  "px-4 py-2 text-left text-xs font-semibold whitespace-nowrap text-quaternary";

/** Untitled's table body cell. */
const CELL = "px-4 py-3 text-sm align-middle";

export interface HabitsTableProps {
  readonly habits: readonly SerializedHabit[];
  readonly firstDayOfWeek: FirstDayOfWeek;
  readonly todayIso: string;
  readonly checkIn: ReturnType<typeof useHabitCheckIn>;
  /** The table's accessible name — what this scope is showing. */
  readonly label: string;
  /** The card's divided footer: load-more, the archived door. */
  readonly footer?: ReactNode;
  /** A band drawn above the head, inside the same card. */
  readonly band?: ReactNode;
}

export function HabitsTable({
  habits,
  firstDayOfWeek,
  todayIso,
  checkIn,
  label,
  footer,
  band,
}: HabitsTableProps) {
  return (
    // Adapted from the Untitled UI React `application/table` source, in the
    // card-bounded arrangement Untitled's Pro Application UI dashboards use for
    // a collection table — the same composition `AreasTable` and
    // `ProjectsTable` adopt. Changes: DalyHub Habit columns and a per-row
    // check-in control.
    <TableCard.Root
      size="sm"
      className="@container/habits rounded-xl bg-primary shadow-xs ring-1 ring-secondary"
      data-untitled-source="application/table:table-card"
    >
      {band}
      <table
        className="w-full table-fixed border-collapse"
        data-testid="habit-list"
      >
        <caption className="dh-visually-hidden">{label}</caption>
        {/*
         * Untitled's head band. `aria-hidden` is NOT used — unlike the old CSS
         * grid's decorative header, these are real `<th scope="col">`, so every
         * cell is associated with its column name and the seven weekday letters
         * are stated once rather than on all eight rows.
         */}
        <thead>
          <tr className="border-b border-secondary bg-secondary">
            {/*
             * Fixed rem widths rather than percentages, and the NAME takes what
             * is left.
             *
             * `table-fixed` hands every column exactly the width its head
             * declares; a percentage budget therefore shrinks the state column
             * along with the table, and at 390 the "Not scheduled" badge was
             * being cut off inside a 55px cell — silently, because the card
             * clipped it and the document never scrolled. A column that cannot
             * hold its content is dropped, not squeezed.
             */}
            <th scope="col" className={`${HEAD} w-14`}>
              <span className="dh-visually-hidden">Done today</span>
            </th>
            <th scope="col" className={HEAD}>
              Habit
            </th>
            <th
              scope="col"
              className={`${HEAD} hidden w-40 @lg/habits:table-cell`}
            >
              Schedule
            </th>
            <th
              scope="col"
              className={`${HEAD} hidden w-36 @sm/habits:table-cell`}
            >
              Today
            </th>
            <th
              scope="col"
              className={`${HEAD} hidden w-44 @md/habits:table-cell`}
            >
              Progress
            </th>
            <th
              scope="col"
              className={`${HEAD} hidden w-32 @2xl/habits:table-cell`}
            >
              {/* The weekday letters live HERE, once, above the seven tracks
                  every row's dots are drawn in — not repeated on each row. */}
              This week
              <HabitWeekStripHeading firstDayOfWeek={firstDayOfWeek} />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-secondary">
          {habits.map((habit) => (
            <HabitTableRow
              key={habit.id}
              habit={habit}
              firstDayOfWeek={firstDayOfWeek}
              todayIso={todayIso}
              checkIn={checkIn}
            />
          ))}
        </tbody>
      </table>
      {footer}
    </TableCard.Root>
  );
}

/** Today's state, as the one badge that answers "did I do it?". */
function todayBadge(habit: SerializedHabit, done: boolean) {
  if (done) {
    return (
      <UntitledStatusBadge tone="success" dot size="sm">
        Done
      </UntitledStatusBadge>
    );
  }
  /*
   * A day the Habit never asked for is NEUTRAL and says so in words. It is not
   * a miss, it is not amber, and it must never be drawn as one: HABITS-01's
   * governing rule is that a Habit surface can say "you did not do it" without
   * looking like an alarm.
   */
  if (habit.today.kind === "not_scheduled") {
    return <span className="text-sm text-tertiary">Not scheduled</span>;
  }
  return (
    <UntitledStatusBadge tone="neutral" dot size="sm">
      {habit.today.label}
    </UntitledStatusBadge>
  );
}

function HabitTableRow({
  habit,
  firstDayOfWeek,
  todayIso,
  checkIn,
}: {
  readonly habit: SerializedHabit;
  readonly firstDayOfWeek: FirstDayOfWeek;
  readonly todayIso: string;
  readonly checkIn: ReturnType<typeof useHabitCheckIn>;
}) {
  const done = checkIn.patches.get(habit.id)?.done ?? habit.today.done;
  const checkable = habit.today.checkable && !habit.archived;

  /*
   * The row's identity comes from where the Habit BELONGS — the Area, or the
   * Goal it supports — through the ONE shared resolver, so "Health & Fitness" is
   * the same hue on this row that it is on its own record. A Habit filed nowhere
   * resolves to the neutral container, which is the honest answer.
   */
  const place = habit.area ?? habit.goal ?? null;
  const identity = resolveIdentity({
    inherited:
      place === null
        ? null
        : {
            colourSlot: place.colourSlot,
            iconKey: place.iconKey,
            colourRank: place.colourRank,
          },
  });

  const weekPercent =
    habit.week.expected > 0
      ? (habit.week.completed / habit.week.expected) * 100
      : null;

  return (
    <tr
      className="bg-primary transition duration-100 ease-linear hover:bg-secondary"
      data-testid="habit-row"
      data-state={done ? "done" : habit.today.kind}
      {...identityAttribute(identity.slot)}
    >
      <td className={`${CELL} pr-0`}>
        {checkable ? (
          /*
           * The completion circle — the Task row's control, for the same act.
           * See the note at the top of this file on why this is not Untitled's
           * checkbox.
           */
          <label className="dh-check-circle-target">
            <input
              type="checkbox"
              className="dh-check-circle"
              checked={done}
              data-testid="habit-check"
              data-habit-id={habit.id}
              aria-label={
                done
                  ? `Undo today’s check-in for ${habit.title}`
                  : `Check in ${habit.title} for today`
              }
              onChange={(event) =>
                checkIn.setChecked({
                  habitId: habit.id,
                  title: habit.title,
                  dateIso: todayIso,
                  checked: event.currentTarget.checked,
                })
              }
            />
          </label>
        ) : (
          /*
           * A day the Habit never asked for gets a quiet placeholder rather than
           * a disabled checkbox. A disabled control is still announced and still
           * says "this could be finished", which is exactly the wrong thing to
           * say about a Tuesday for a Monday/Wednesday/Friday habit. The state
           * is carried in the Today column, in words.
           */
          <span
            className="block size-5 rounded-full ring-1 ring-secondary"
            aria-hidden="true"
          />
        )}
      </td>

      <td className={CELL}>
        <a
          className="block truncate font-medium text-primary no-underline outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          href={`/habits/${encodeURIComponent(habit.id)}`}
          aria-label={`Open ${habit.title}`}
        >
          {habit.title}
        </a>
        {/*
         * The quiet second line. On a wide table it carries only the Area,
         * because every other fact has a column of its own; as the columns drop
         * it picks each one up, so a phone row states the schedule and the week
         * rather than losing them.
         */}
        {/*
         * The quiet second line.
         *
         * Separated by SPACE rather than by a middot. A middot between flex
         * items has to be attached to one of them, and when the line wraps —
         * which it does at 320, where this line carries four facts — it becomes
         * an orphan dot leading the second row. A wider gap does the same
         * grouping work and cannot leave punctuation stranded.
         */}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-tertiary">
          {/*
           * Today's state leads the phone line, because "did I do it?" is the
           * question this page answers first and the state column is the one
           * that cannot fit beside a title at 390.
           */}
          <span className="@sm/habits:hidden">
            {done ? "Done today" : habit.today.label}
          </span>
          {place === null ? null : (
            <span className="flex items-center gap-1.5">
              {/* The record's own hue, never the only carrier of the fact: the
                  Area's name is right beside it. */}
              <span
                className="size-1.5 shrink-0 rounded-full bg-[var(--dh-identity,var(--color-fg-quaternary))]"
                aria-hidden="true"
              />
              {place.title}
            </span>
          )}
          <span className="@lg/habits:hidden">{habit.scheduleShortLabel}</span>
          {habit.week.label === null ? null : (
            <span className="@md/habits:hidden">{habit.week.label}</span>
          )}
        </span>
      </td>

      <td
        className={`${CELL} hidden whitespace-nowrap text-tertiary @lg/habits:table-cell`}
      >
        {habit.scheduleShortLabel}
        {/*
         * "Mon · Wed · Fri" under "Weekdays" — the DAYS, beneath the word for
         * them, so a selected-weekday cadence is legible without opening the
         * record. Only for that one kind: "Every day" and "3× weekly" already
         * say everything their full sentence says.
         */}
        {habit.scheduleKind === "weekdays" &&
        habit.scheduleLabel !== habit.scheduleShortLabel ? (
          <span className="mt-0.5 block truncate text-xs text-quaternary">
            {habit.scheduleLabel}
          </span>
        ) : null}
      </td>

      <td className={`${CELL} hidden @sm/habits:table-cell`}>
        {todayBadge(habit, done)}
      </td>

      <td className={`${CELL} hidden @md/habits:table-cell`}>
        {weekPercent === null ? (
          <span className="text-tertiary">
            <span aria-hidden="true">—</span>
            <span className="sr-only">Nothing expected this week</span>
          </span>
        ) : (
          /*
           * The bar measures the WEEK, and only when the week asked for
           * something. It states nothing the words beside it do not already say,
           * which is why it is allowed to be a bar: it is a second reading of one
           * fact, not a new fact with no denominator.
           */
          <LabelledProgressBar
            label={`${habit.title} this week`}
            value={weekPercent}
            valueText={habit.week.label ?? ""}
            tone={habit.week.met ? "positive" : "neutral"}
            showValue
            valueLabel={
              <span className="text-xs text-tertiary">
                {habit.week.completed}/{habit.week.expected}
              </span>
            }
            data-complete={habit.week.met ? "true" : undefined}
          />
        )}
      </td>

      <td className={`${CELL} hidden @2xl/habits:table-cell`}>
        {habit.weekHistory === undefined ? null : (
          <HabitWeekStrip
            days={habit.weekHistory}
            firstDayOfWeek={firstDayOfWeek}
            summary={habit.week.label}
            title={habit.title}
          />
        )}
      </td>
    </tr>
  );
}
