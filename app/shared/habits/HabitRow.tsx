/**
 * HABITS-01 — the ONE Habit row.
 *
 * Drawn identically by `/habits` and by Today's routine section, because they
 * are the same object seen from two places (the rule DS-04 established for the
 * Task row, applied here for the same reason: two copies of one row is how two
 * surfaces come to disagree about the same record).
 *
 * ── Anatomy ─────────────────────────────────────────────────────────────────
 *
 *   [check]  Strength training                       1 of 3 this week
 *            3x weekly - Health
 *
 * The leading control is the SHARED completion circle (`.dh-check-circle`), the
 * same element a Task row uses, so ticking a Habit is the same physical act as
 * finishing a task and inherits its 44px coarse-pointer target unchanged.
 *
 * ── What is deliberately NOT here ───────────────────────────────────────────
 * No flame, no streak number, no "day 17", no red anything, no confetti and no
 * progress ring. A missed day changes nothing about how this row is drawn: it
 * shows what the week asked for and what has happened, and stops. Where a day
 * was never scheduled the row SAYS so, in words, and offers no control — an
 * unscheduled Tuesday is not a failure and must never look like one.
 */

import { Link } from "react-router";

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
  const context = habit.area?.title ?? habit.goal?.title ?? null;
  const meta = [habit.scheduleShortLabel, context].filter(Boolean).join(" · ");

  return (
    <li
      className="dh-habit-row"
      data-density={density}
      data-state={done ? "done" : habit.today.kind}
      data-testid="habit-row"
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
        <span className="dh-habit-row__today">
          {done ? "Done today" : habit.today.label}
        </span>
        {habit.week.label === null ? null : (
          <span className="dh-habit-row__week">{habit.week.label}</span>
        )}
      </span>
      <span className="dh-visually-hidden">{` ${habit.scheduleLabel}.`}</span>
    </li>
  );
}
