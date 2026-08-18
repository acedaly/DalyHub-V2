/**
 * HABITS-01 — the "Supporting habits" section a Goal or an Area record draws.
 *
 * ── It is EVIDENCE, not arithmetic ──────────────────────────────────────────
 * The load-bearing product rule of this component is what it does NOT do.
 * Completing "Strength training" is evidence of the behaviour behind "Reach
 * 70 kg"; it is not a weight measurement, and it must never move the Goal's
 * percentage. The Goal's existing progress model — measurements, milestones and
 * contributing Projects — stays the one authority on how the Goal is going, and
 * nothing in this section is a term in it.
 *
 * So the section is deliberately read-only and deliberately flat: a heading, a
 * few rows, and each row's own factual line. There is no aggregate "habit
 * score", no combined percentage and no ring — inventing one would be exactly
 * the manufactured measure the whole item refuses.
 *
 * ── Bounded by construction ─────────────────────────────────────────────────
 * The rows are read for a whole page of anchors at once
 * (`readSupportingHabits`), so a Goal gallery never becomes a query per card.
 * This component receives finished rows and issues nothing.
 */

import { HabitRow } from "./HabitRow";
import type { SerializedHabit } from "./habit-view";

export interface SupportingHabitsProps {
  readonly habits: readonly SerializedHabit[];
  /** "Supporting habits" on a Goal; "Habits" on an Area. */
  readonly title?: string;
  /** The one line that explains what the section is, and what it is not. */
  readonly note?: string;
  readonly headingId?: string;
}

export function SupportingHabits({
  habits,
  title = "Supporting habits",
  note = "Behaviours you are practising towards this. They are evidence of the work, not part of the measured progress.",
  headingId,
}: SupportingHabitsProps) {
  // Absent entirely when there is nothing to show: a heading over an empty
  // panel is chrome describing nothing (RECORD-01).
  if (habits.length === 0) return null;

  return (
    <section
      className="dh-supporting-habits"
      aria-labelledby={headingId}
      data-testid="supporting-habits"
    >
      <div className="dh-supporting-habits__head">
        <h2 className="dh-supporting-habits__title" id={headingId}>
          {title}
        </h2>
        <a className="dh-supporting-habits__note" href="/habits">
          All habits
        </a>
      </div>
      <p className="dh-supporting-habits__note">{note}</p>
      <ul className="dh-habit-list dh-supporting-habits__list">
        {habits.map((habit) => (
          <HabitRow
            key={habit.id}
            habit={habit}
            density="compact"
            href={`/habits/${encodeURIComponent(habit.id)}`}
          />
        ))}
      </ul>
    </section>
  );
}
