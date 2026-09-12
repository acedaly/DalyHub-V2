/**
 * HABITS-01 — the ONE Habit row, for the surfaces that draw a LIST of them.
 *
 * Today's routine band, a Goal's supporting section and an Area's draw this;
 * they are the same object seen from three places, which is the rule DS-04
 * established for the Task row and for the same reason (two copies of one row is
 * how two surfaces come to disagree about the same record).
 *
 *     [check]  Strength training                       1 of 3 this week
 *              3× weekly · Health & Fitness
 *
 * ── UNTITLED-09 removed the second layout ───────────────────────────────────
 *
 * This component used to carry a `columns` arrangement as well, for the
 * `/habits` collection: seven grid cells per row, placed by a template declared
 * in `HabitList` and painted by ~140 lines of `habits.css`. The collection is now
 * a real `<table>` in Untitled's `application/table` grammar
 * (`~/modules/habits/HabitsTable`), where the nouns are column HEADINGS stated
 * once rather than cells that have to be kept in step with a header elsewhere.
 *
 * A list row and a table row are genuinely different objects — one is a
 * two-line band in a 21rem rail, the other is six aligned columns — and pretending
 * they were one component with a flag is what produced a "table" whose headings
 * sat over the wrong columns. This is the list row, and it does one thing.
 *
 * ── What is deliberately NOT here ───────────────────────────────────────────
 *
 * No flame, no streak number, no "day 17", no red anything and no confetti. A
 * missed day changes nothing about how this row is drawn: it shows what the week
 * asked for and what has happened, and stops. Where a day was never scheduled the
 * row SAYS so, in words, and offers no control — an unscheduled Tuesday is not a
 * failure and must never look like one.
 */
import { Link } from "react-router";

import { identityAttribute, resolveIdentity } from "~/shared/entity";

import type { SerializedHabit } from "./habit-view";

export interface HabitRowProps {
  readonly habit: SerializedHabit;
  /** Optimistic override for today's state, while a check-in is in flight. */
  readonly doneOverride?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  /** Where the title links to. Omit for a non-navigable context (a Goal card). */
  readonly href?: string;
  /** Compact presentation for Today, where vertical space is the scarce thing. */
  readonly density?: "comfortable" | "compact";
}

export function HabitRow({
  habit,
  doneOverride,
  onCheckedChange,
  href,
  density = "comfortable",
}: HabitRowProps) {
  const done = doneOverride ?? habit.today.done;
  const checkable = habit.today.checkable && onCheckedChange !== undefined;

  /*
   * The context line: cadence first, then WHERE this behaviour belongs.
   *
   * The Area is preferred over the Goal because it is the part of life the habit
   * sits in and is the shorter, more recognisable word; the Goal it supports is
   * on the record, one tap away. Both are plain text — a Habit does not alter a
   * Goal's progress, so drawing it as a progress-bearing chip would say
   * something untrue.
   */
  const place = habit.area ?? habit.goal ?? null;
  const meta = [habit.scheduleShortLabel, place?.title ?? null]
    .filter(Boolean)
    .join(" · ");

  /*
   * The row's identity comes from where the Habit BELONGS.
   *
   * A Habit stores no colour and no icon of its own, and it is not given one
   * here: the row takes the Area's (or the supporting Goal's) resolved identity
   * through the ONE shared resolver, so "Health & Fitness" is the same hue on
   * this row that it is on its own record. A Habit filed nowhere resolves to the
   * neutral container, which is the honest answer rather than a colour that
   * means something it does not mean.
   */
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

  const todayWord = done ? "Done today" : habit.today.label;

  return (
    <li
      className="dh-habit-row"
      data-density={density}
      data-state={done ? "done" : habit.today.kind}
      data-testid="habit-row"
      {...identityAttribute(identity.slot)}
    >
      <span className="dh-habit-row__lead">
        {checkable ? (
          <label className="dh-check-circle-target dh-habit-row__check">
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
                onCheckedChange?.(event.currentTarget.checked)
              }
            />
          </label>
        ) : (
          /*
           * A day the Habit never asked for gets a quiet placeholder rather than
           * a disabled checkbox. A disabled control is still announced, and it
           * still says "this could be finished" — which is exactly the wrong
           * thing to say about a Tuesday for a Monday/Wednesday/Friday habit.
           * The state is carried in words on the line below.
           */
          <span className="dh-habit-row__rest" aria-hidden="true" />
        )}
      </span>

      <span className="dh-habit-row__main">
        {href === undefined ? (
          <span className="dh-habit-row__title">{habit.title}</span>
        ) : (
          <Link
            className="dh-habit-row__title"
            to={href}
            aria-label={`Open ${habit.title}`}
            data-testid="habit-row-open"
          >
            {habit.title}
          </Link>
        )}
        <span className="dh-habit-row__meta">{meta}</span>
      </span>

      <span className="dh-habit-row__state">
        {/*
          Two facts, in the order they are wanted: what today is, and how the
          week is going. Both are plain text, and the row is never distinguished
          by colour alone — `data-state` only tints the tick that is already
          drawn as a tick.
        */}
        <span className="dh-habit-row__today">{todayWord}</span>
        {habit.week.label === null ? null : (
          <span className="dh-habit-row__week">{habit.week.label}</span>
        )}
      </span>
      <span className="dh-visually-hidden">{` ${habit.scheduleLabel}.`}</span>
    </li>
  );
}
