/**
 * FOLLOW-01 — the OWNER-FACING WORDS for a period's plan account.
 *
 * The vocabulary lives in the kernel, beside the derivation that produces it,
 * for the reason [ADR-110] decision 6 gives: one derivation per question, shared
 * by every consumer. Weekly Planning and the weekly Review must not describe the
 * same fact in two different sentences, and the only way to guarantee that is
 * for neither of them to own the sentence.
 *
 * ── What the words may not do ───────────────────────────────────────────────
 * No percentage, no grade, no streak, no "good week", no "productive", no
 * ranking of one period against another, and no verb that makes the owner the
 * subject of a failure. A plan that changed is a decision the owner made, not a
 * lapse — a week deliberately re-planned on Tuesday because Tuesday changed is
 * not a week they failed, which is exactly the sentence ADR-110 says no single
 * number can say. So: counts, with the denominator printed beside them, in the
 * product's own nouns.
 *
 * ── Two sentences this file must never be able to produce ───────────────────
 * A day that has not happened is not a miss, and a period still running has not
 * failed work it has not reached (ADR-110 decision 5, promoted from HABITS-01).
 * Both are structural here rather than editorial: the phase decides the tense
 * and `carriedAhead` is counted separately from `carried` so "still to come"
 * can never be printed as "left unfinished".
 */

import type {
  PeriodPlanAccount,
  PeriodPlanCounts,
  TaskPlanAccountEntry,
  TaskPlanOutcome,
} from "./task-plan-history";

/** "1 Task" / "3 Tasks" — the product's own noun, pluralised once. */
function plural(count: number, one: string, many: string): string {
  return count === 1 ? `${count} ${one}` : `${count} ${many}`;
}

/** "a, b and c" — an Oxford-free list, as the Review already writes them. */
function joinPhrases(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * One line of the account: a count, what it counts, and the outcome it came
 * from so a surface can group, link or filter by it without re-deriving.
 */
export interface PlanAccountFact {
  /** A stable machine key — used as a DOM hook and a test anchor. */
  readonly key: string;
  readonly label: string;
  readonly count: number;
  /** The outcomes this line covers, so the entries behind it are findable. */
  readonly outcomes: readonly TaskPlanOutcome[];
  /** True only for the line that is still ahead of the owner, never a miss. */
  readonly ahead: boolean;
}

/** The whole statement, in words. `facts` is empty when nothing is to report. */
export interface PeriodPlanStatement {
  /** The one sentence a surface may show on its own. */
  readonly headline: string;
  /** What moved, or null when nothing did. Never "0 changes". */
  readonly movement: string | null;
  /** The lines behind the headline, in a fixed order, zeroes omitted. */
  readonly facts: readonly PlanAccountFact[];
  /** True when the period's plan held nothing at all. */
  readonly empty: boolean;
}

/** The noun a surface calls its period — `/plan` says "week", a Review's
 * period may be a month, so it is an argument rather than a constant. */
export interface PlanAccountWordsOptions {
  readonly periodNoun?: string;
}

/**
 * The ordered lines. Zeroes are omitted rather than printed: an account of a
 * calm week should be three lines long, not nine lines of "0".
 */
export function planAccountFacts(
  account: PeriodPlanAccount,
  options: PlanAccountWordsOptions = {},
): readonly PlanAccountFact[] {
  const noun = options.periodNoun ?? "period";
  const c: PeriodPlanCounts = account.counts;
  const closed = account.phase === "closed";
  const lines: PlanAccountFact[] = [
    {
      key: "kept",
      label: "Done on the day planned",
      count: c.kept,
      outcomes: ["kept"],
      ahead: false,
    },
    {
      key: "early",
      label: "Done ahead of the day planned",
      count: c.completedEarly,
      outcomes: ["completed_early"],
      ahead: false,
    },
    {
      key: "late",
      label: "Done later than planned",
      count: c.completedLate,
      outcomes: ["completed_late"],
      ahead: false,
    },
    {
      key: "ahead",
      label: "Still to come",
      count: c.carriedAhead,
      outcomes: ["carried"],
      ahead: true,
    },
    {
      key: "open",
      label: closed ? "Left unfinished" : "Still open",
      count: c.carried,
      outcomes: ["carried"],
      ahead: false,
    },
    {
      key: "moved-out",
      label: `Moved out of the ${noun}`,
      count: c.movedOut,
      outcomes: ["moved_out"],
      ahead: false,
    },
    {
      key: "cleared",
      label: "Taken off the plan",
      count: c.cleared,
      outcomes: ["cleared"],
      ahead: false,
    },
    {
      key: "dropped",
      label: "No longer being done",
      count: c.dropped,
      outcomes: ["dropped"],
      ahead: false,
    },
    {
      key: "unplanned",
      label: "Done without being planned",
      count: c.unplanned,
      outcomes: ["unplanned"],
      ahead: false,
    },
  ];
  return lines.filter((line) => line.count > 0);
}

/**
 * The account, as the one sentence a surface may show on its own.
 *
 * The tense follows the phase, so a week that has not happened is described as
 * a plan and a week still running is described as far as it has got.
 */
export function planAccountStatement(
  account: PeriodPlanAccount,
  options: PlanAccountWordsOptions = {},
): PeriodPlanStatement {
  const noun = options.periodNoun ?? "period";
  const c = account.counts;
  const facts = planAccountFacts(account, options);

  if (!account.available) {
    return {
      headline: `The history behind this ${noun}'s plan could not be read just now.`,
      movement: null,
      facts: [],
      empty: false,
    };
  }

  if (c.planned === 0 && c.unplanned === 0) {
    return {
      headline:
        account.phase === "future"
          ? `Nothing is planned for this ${noun} yet.`
          : `Nothing was planned for this ${noun}.`,
      movement: null,
      facts: [],
      empty: true,
    };
  }

  if (c.planned === 0) {
    // Work was finished, but this period's plan never held any of it. That is a
    // real and unremarkable way to have a week; it is not an absence of data.
    return {
      headline: `Nothing was planned for this ${noun}. ${plural(c.unplanned, "Task was", "Tasks were")} completed anyway.`,
      movement: null,
      facts,
      empty: false,
    };
  }

  const held =
    account.phase === "future"
      ? `${plural(c.planned, "Task is", "Tasks are")} planned for this ${noun}`
      : `This ${noun}'s plan held ${plural(c.planned, "Task", "Tasks")}`;

  const parts: string[] = [];
  const done = c.kept + c.completedEarly + c.completedLate;
  if (done > 0) {
    /*
     * "how much got done" and "how much got done on the day" are the two halves
     * of the question, and the second is PARENTHETICAL rather than a list item:
     * comma-joined into the surrounding list it read as a separate outcome, so a
     * week of two completions looked like a week of three things happening.
     */
    parts.push(
      c.kept === done
        ? `${done} done on the day planned`
        : `${done} done (${c.kept} on the day planned)`,
    );
  }
  if (c.carriedAhead > 0) parts.push(`${c.carriedAhead} still to come`);
  if (c.carried > 0) {
    parts.push(
      account.phase === "closed"
        ? `${c.carried} left unfinished`
        : `${c.carried} still open`,
    );
  }
  if (c.movedOut > 0) parts.push(`${c.movedOut} moved out`);
  if (c.cleared > 0) parts.push(`${c.cleared} taken off the plan`);
  if (c.dropped > 0) parts.push(`${c.dropped} no longer being done`);

  const tail = parts.length > 0 ? `: ${joinPhrases(parts)}.` : ".";
  const unplanned =
    c.unplanned > 0
      ? ` ${plural(c.unplanned, "Task was", "Tasks were")} completed without being planned for it.`
      : "";

  return {
    headline: `${held}${tail}${unplanned}`,
    movement: movementSentence(account, noun),
    facts,
    empty: false,
  };
}

/**
 * What MOVED, as its own sentence — and it is a sentence rather than a flag
 * because the count is the useful part. "Moved once" and "moved four times"
 * describe different weeks, and a boolean would report them identically.
 */
export function movementSentence(
  account: PeriodPlanAccount,
  periodNoun = "period",
): string | null {
  const c = account.counts;
  const parts: string[] = [];
  if (c.reschedules > 0) {
    parts.push(
      c.rescheduled === c.reschedules
        ? `${plural(c.reschedules, "Task moved", "Tasks each moved")} to another day`
        : `${plural(c.rescheduled, "Task", "Tasks")} moved to another day ${plural(c.reschedules, "time", "times")} between them`,
    );
  }
  if (c.movedIn > 0) {
    parts.push(
      `${plural(c.movedIn, "Task came", "Tasks came")} into the ${periodNoun} from another day`,
    );
  }
  if (c.added > 0) {
    parts.push(
      `${plural(c.added, "Task was", "Tasks were")} placed during the ${periodNoun}`,
    );
  }
  if (parts.length === 0) return null;
  return `${joinPhrases(parts).replace(/^./, (first) => first.toUpperCase())}.`;
}

/**
 * One entry's own line: the dates the outcome was read from, so the owner can
 * disagree with the rule rather than having to trust it.
 *
 * `formatDay` is the owner's date preference, supplied by the caller — this
 * module formats no date itself, exactly as REVIEW-03's evaluator does not.
 */
export function entryReason(
  entry: TaskPlanAccountEntry,
  formatDay: (iso: string) => string,
  periodNoun = "period",
): string {
  const planned =
    entry.plannedDayJudged === null ? null : formatDay(entry.plannedDayJudged);
  const moves =
    entry.reschedules === 0
      ? ""
      : entry.reschedules === 1
        ? " after moving once"
        : ` after moving ${entry.reschedules} times`;

  switch (entry.outcome) {
    case "kept":
      return `Planned for ${planned}, done on ${planned}${moves}.`;
    case "completed_late":
      return `Planned for ${planned}, done on ${formatDay(entry.completedDay as string)}${moves}.`;
    case "completed_early":
      return `Planned for ${planned}, done on ${formatDay(entry.completedDay as string)} — ahead of its day${moves}.`;
    case "carried":
      return entry.planStillAhead
        ? `Planned for ${planned}, which has not arrived yet${moves}.`
        : `Planned for ${planned}, and still open${moves}.`;
    case "moved_out":
      return `Planned for ${planned}, now planned for ${formatDay(entry.plannedDayAtClose as string)} — outside this ${periodNoun}.`;
    case "cleared":
      return `Planned for ${planned}, then taken off the plan${moves}.`;
    case "dropped":
      return `Planned for ${planned}, and has since been cancelled or parked.`;
    case "unplanned":
      return `Completed on ${formatDay(entry.completedDay as string)} without being planned for this ${periodNoun}.`;
  }
}
