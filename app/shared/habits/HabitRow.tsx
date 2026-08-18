/**
 * HABITS-01 / UX-02 — the ONE Habit row.
 *
 * Drawn identically by `/habits` and by Today's routine section, because they
 * are the same object seen from two places (the rule DS-04 established for the
 * Task row, applied here for the same reason: two copies of one row is how two
 * surfaces come to disagree about the same record).
 *
 * ── Two layouts, ONE row ────────────────────────────────────────────────────
 * UX-02 (Mockup 8) draws the collection as a four-column table, and Today still
 * draws a compact two-line band in a rail. Those are two arrangements of the
 * same facts, so they are one component with a `layout` — not a second row.
 *
 *   layout="row" (the default, unchanged)
 *
 *     [check]  Strength training                       1 of 3 this week
 *              3× weekly · Health & Fitness
 *
 *   layout="columns" (the collection)
 *
 *     [check] [▧]  Strength training   3× weekly     1 of 3 this week   M T W T F S S  ›
 *                  ● Health & Fitness  Mon · Wed · Fri  ▓▓▓░░░░         ● ● ○ · · · ·
 *
 * The columns are the LIST's columns (`HabitList` declares the template once),
 * which is what keeps every cell on the same vertical line down the page.
 *
 * ── What is deliberately NOT here ───────────────────────────────────────────
 * No flame, no streak number, no "day 17", no red anything and no confetti. A
 * missed day changes nothing about how this row is drawn: it shows what the week
 * asked for and what has happened, and stops. Where a day was never scheduled the
 * row SAYS so, in words, and offers no control — an unscheduled Tuesday is not a
 * failure and must never look like one.
 *
 * The one figure UX-02 added is a PROPORTION BAR beside the week's own words, and
 * it measures exactly what those words say ("1 of 3 this week"). It is not a
 * score, it never turns red, and a week that asked for nothing draws no bar at
 * all rather than an empty one.
 */

import { Link } from "react-router";

import type { FirstDayOfWeek } from "~/kernel/preferences";
import {
  AccentIcon,
  identityAttribute,
  resolveIdentity,
  type IdentitySource,
} from "~/shared/entity";
import { ChevronRightIcon } from "~/shared/icons";
import { ProgressTrack } from "~/shared/progress";

import { HabitWeekStrip } from "./HabitWeekStrip";
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
  /**
   * UX-02 — the collection's four-column arrangement (Mockup 8).
   *
   * Only a surface whose `HabitList` declared `columns` may ask for this: the
   * cells are placed by the list's grid template, so a `columns` row in a flat
   * list would stack its own cells in an order nobody chose.
   */
  readonly layout?: "row" | "columns";
  /**
   * The owner's week start, for the strip's column order. Required for the
   * strip to draw; without it the `columns` layout simply omits that cell.
   */
  readonly firstDayOfWeek?: FirstDayOfWeek;
}

export function HabitRow({
  habit,
  doneOverride,
  onCheckedChange,
  href,
  density = "comfortable",
  layout = "row",
  firstDayOfWeek,
}: HabitRowProps) {
  const done = doneOverride ?? habit.today.done;
  const checkable = habit.today.checkable && onCheckedChange !== undefined;
  const columns = layout === "columns";

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
  const context = place?.title ?? null;
  const meta = [habit.scheduleShortLabel, context].filter(Boolean).join(" · ");

  /*
   * UX-02 — the row's identity comes from where the Habit BELONGS.
   *
   * A Habit stores no colour and no icon of its own, and it is not given one
   * here: the tile takes the Area's (or the supporting Goal's) resolved identity
   * through the ONE shared resolver, so "Health & Fitness" is the same hue on
   * this row that it is on its own record. A Habit filed nowhere draws the
   * neutral container and the entity's default glyph, which is the honest answer
   * rather than a colour that means something it does not mean.
   */
  const inherited: IdentitySource | null =
    place === null
      ? null
      : {
          colourSlot: place.colourSlot,
          iconKey: place.iconKey,
          colourRank: place.colourRank,
        };
  const identity = resolveIdentity({ inherited });

  const todayWord = done ? "Done today" : habit.today.label;

  return (
    <li
      className="dh-habit-row"
      data-density={density}
      data-layout={layout}
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

      {columns ? (
        /* Decorative: the title beside it is the name, and the context line
           names the Area in words. A tile that had its own accessible name would
           make a screen reader read every row's Area twice. */
        <span className="dh-habit-row__icon" aria-hidden="true">
          {/* The shared identity TILE at its compact rung — a mark that
              identifies without dominating a 44px row. It resolves through the
              ONE resolver, from the same source the row's own dot does. */}
          <AccentIcon entityType="habit" size="sm" inherited={inherited} />
        </span>
      ) : null}

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
        {columns ? (
          context === null ? null : (
            /* The dot is the record's own hue, inherited from the row — never a
               second colour system, and never the only carrier of the fact: the
               Area's name is right beside it. */
            <span className="dh-habit-row__place">
              <span className="dh-habit-row__place-dot" aria-hidden="true" />
              {context}
            </span>
          )
        ) : (
          <span className="dh-habit-row__meta">{meta}</span>
        )}
      </span>

      {columns ? (
        <>
          <span className="dh-habit-row__schedule">
            <span className="dh-habit-row__cadence">
              {habit.scheduleShortLabel}
            </span>
            {/*
             * "Mon · Wed · Fri" under "Weekdays" — the DAYS, beneath the word
             * for them, so a selected-weekday cadence is legible without
             * opening the record.
             *
             * Only for that one kind. "Every day" and "3× weekly" already say
             * everything their full sentence says, and drawing "3× a week"
             * under "3× weekly" is one fact printed twice.
             */}
            {habit.scheduleKind === "weekdays" &&
            habit.scheduleLabel !== habit.scheduleShortLabel ? (
              <span className="dh-habit-row__cadence-detail">
                {habit.scheduleLabel}
              </span>
            ) : null}
          </span>

          <span className="dh-habit-row__progress">
            {/*
             * TWO facts, in the order they are wanted, exactly as the flat row
             * states them: what today IS, then how the week is going.
             *
             * Mockup 8 draws one line per row, and it can — every row in the
             * picture is either done or has a week count. The product cannot:
             * "Not scheduled today" is a fact HABITS-01 requires the row to say
             * IN WORDS, and a row that printed only "2 of 5 this week" on a day
             * its cadence never asked for would have quietly dropped it.
             */}
            <span
              className="dh-habit-row__today"
              data-done={done ? "true" : undefined}
            >
              {todayWord}
            </span>
            {habit.week.label === null ? null : (
              <span className="dh-habit-row__week">{habit.week.label}</span>
            )}
            {/*
             * The bar measures the WEEK, and only when the week asked for
             * something. It states nothing the words above do not already say,
             * which is why it is allowed to be a bar: it is a second reading of
             * one fact, not a new fact with no denominator.
             */}
            {habit.week.expected > 0 ? (
              <ProgressTrack
                label={`${habit.title} this week`}
                percent={(habit.week.completed / habit.week.expected) * 100}
                valueText={habit.week.label ?? ""}
                complete={habit.week.met}
                status={habit.week.met ? "success" : "neutral"}
                className="dh-habit-row__bar"
              />
            ) : null}
          </span>

          <span className="dh-habit-row__week-cell">
            {habit.weekHistory === undefined ||
            firstDayOfWeek === undefined ? null : (
              <HabitWeekStrip
                days={habit.weekHistory}
                firstDayOfWeek={firstDayOfWeek}
                summary={habit.week.label}
                title={habit.title}
              />
            )}
          </span>

          <span className="dh-habit-row__open">
            {href === undefined ? null : (
              /*
               * The trailing affordance Mockup 8 draws. It is the SAME
               * destination the title already links to, so it carries no
               * accessible name of its own — `aria-hidden` with `tabIndex={-1}`
               * keeps it out of the tab order and out of the reading, rather
               * than giving every row two identical links to walk past.
               */
              <Link
                className="dh-habit-row__open-link"
                to={href}
                aria-hidden="true"
                tabIndex={-1}
              >
                <ChevronRightIcon />
              </Link>
            )}
          </span>
        </>
      ) : (
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
      )}
      <span className="dh-visually-hidden">{` ${habit.scheduleLabel}.`}</span>
    </li>
  );
}
