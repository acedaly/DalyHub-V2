/**
 * V2.14 GROUND-03 — the deterministic intent parser for Ask DalyHub.
 *
 * ## The model never chooses
 *
 * This module decides which question the owner asked and which parameters it
 * carries. It is a bounded rule set over a CLOSED intent vocabulary, and it runs
 * before any repository is touched — so the data a request reads is decided by
 * DalyHub, from the owner's words, and never by a model, a tool call or a
 * generated query. That is the architectural invariant V2.14 exists to make
 * true; a parser that "asked the model which source to use" would give it away
 * in one line.
 *
 * ## Deliberately small
 *
 * It is not a natural-language engine and must not become one. It recognises
 * four questions and a handful of ways to name a period, and everything else
 * falls through to `null` — which the surface answers honestly by saying what
 * Ask CAN do. Falling through is the SAFE direction: an unrecognised question
 * costs the owner a sentence, and a misrecognised one costs them a wrong answer
 * about their own money.
 *
 * PURE: no clock (the owner's day is passed in), no storage, no I/O.
 */

import { addDaysToIsoDate } from "~/kernel/alignment";

/** The grounded questions Ask can answer. A CLOSED set, one builder each. */
export const GROUNDED_ASK_INTENTS = [
  "finance_comparison",
  "goal_movement",
  "project_health",
  "obligation_horizon",
] as const;

export type GroundedAskIntent = (typeof GROUNDED_ASK_INTENTS)[number];

export function isGroundedAskIntent(
  value: unknown,
): value is GroundedAskIntent {
  return (
    typeof value === "string" &&
    (GROUNDED_ASK_INTENTS as readonly string[]).includes(value)
  );
}

/** A resolved owner-calendar period, inclusive at both ends. */
export interface AskPeriod {
  readonly startIso: string;
  readonly endIso: string;
  readonly label: string;
}

/**
 * A resolved question: the intent, its parameters, and how each was arrived at.
 *
 * `assumptions` is not decoration. A question that named one period and got a
 * default for the other must SAY so, because an answer computed over a period
 * the owner did not ask for is wrong however well it is written.
 */
export type GroundedAskRequest =
  | {
      readonly intent: "finance_comparison";
      readonly later: AskPeriod;
      readonly earlier: AskPeriod;
      readonly assumptions: readonly string[];
    }
  | {
      readonly intent: "goal_movement";
      readonly days: number;
      readonly assumptions: readonly string[];
    }
  | {
      readonly intent: "project_health";
      readonly assumptions: readonly string[];
    }
  | {
      readonly intent: "obligation_horizon";
      readonly days: number;
      readonly assumptions: readonly string[];
    };

/** The bounds every parameter is clamped to, stated once. */
export const ASK_PARAMETER_BOUNDS = {
  /** The longest forward horizon an obligation question may ask for. */
  maxHorizonDays: 365,
  minHorizonDays: 1,
  defaultHorizonDays: 60,
  /** The longest backward window a Goal-movement question may ask for. */
  maxMovementDays: 365,
  minMovementDays: 7,
  defaultMovementDays: 90,
} as const;

/* -------------------------------------------------------------------------- */
/* Calendar words                                                             */
/* -------------------------------------------------------------------------- */

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** The whole calendar month `month` (1-12) of `year`, as an owner period. */
export function monthPeriod(year: number, month: number): AskPeriod {
  const end = daysInMonth(year, month);
  return {
    startIso: `${year}-${pad(month)}-01`,
    endIso: `${year}-${pad(month)}-${pad(end)}`,
    label: `${MONTH_LABELS[month - 1]} ${year}`,
  };
}

/** Shift a `(year, month)` pair by `delta` months. */
function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

/**
 * Every period expression in the question, in the order they appear.
 *
 * Recognised: a month name with an optional year, "this month", "last month".
 * A month name WITHOUT a year resolves to the most recent occurrence that has
 * already begun — asking about "August" in September 2026 means August 2026,
 * and asking in February 2026 means August 2025. Guessing forward would answer
 * about a month that has not happened.
 */
export function periodsIn(question: string, todayIso: string): AskPeriod[] {
  const text = question.toLowerCase();
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7));
  const found: { at: number; period: AskPeriod }[] = [];

  const thisMonth = text.indexOf("this month");
  if (thisMonth >= 0) {
    found.push({ at: thisMonth, period: monthPeriod(year, month) });
  }
  const lastMonth = text.indexOf("last month");
  if (lastMonth >= 0) {
    const shifted = shiftMonth(year, month, -1);
    found.push({
      at: lastMonth,
      period: monthPeriod(shifted.year, shifted.month),
    });
  }

  for (const [index, name] of MONTH_NAMES.entries()) {
    const pattern = new RegExp(`\\b${name}\\b(?:\\s+(\\d{4}))?`, "g");
    for (const match of text.matchAll(pattern)) {
      const explicitYear = match[1] === undefined ? null : Number(match[1]);
      const monthNumber = index + 1;
      const resolved =
        explicitYear !== null
          ? explicitYear
          : monthNumber <= month
            ? year
            : year - 1;
      found.push({
        at: match.index ?? 0,
        period: monthPeriod(resolved, monthNumber),
      });
    }
  }

  found.sort((a, b) => a.at - b.at);
  const unique: AskPeriod[] = [];
  for (const entry of found) {
    if (!unique.some((period) => period.startIso === entry.period.startIso)) {
      unique.push(entry.period);
    }
  }
  return unique;
}

/** A number of days named in the question, clamped, or null. */
function daysIn(question: string): number | null {
  const text = question.toLowerCase();
  const match =
    /\b(\d{1,3})\s*(day|days|week|weeks|month|months)\b/.exec(text) ?? null;
  if (match === null) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2] ?? "days";
  if (unit.startsWith("week")) return amount * 7;
  if (unit.startsWith("month")) return amount * 30;
  return amount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/* -------------------------------------------------------------------------- */
/* The parser                                                                 */
/* -------------------------------------------------------------------------- */

const MONEY_WORDS =
  /\b(spend|spent|spending|expensive|cost|costs|costly|money|budget|transactions?)\b/;
const COMPARE_WORDS = /\b(than|compare|compared|versus|vs\.?|difference)\b/;
const GOAL_WORDS = /\bgoals?\b/;
const MOVEMENT_WORDS =
  /\b(moved?|moving|movement|progress|stalled|stuck|measurement|measured|recorded)\b/;
const PROJECT_WORDS = /\bprojects?\b/;
const HEALTH_WORDS = /\b(at risk|risk|risky|blocked|stale|health|trouble)\b/;
const OBLIGATION_WORDS =
  /\b(due|deal with|owe|owing|obligations?|renewals?|bills?|falls? due|expiring|expires)\b/;
const FORWARD_WORDS = /\b(next|upcoming|coming|soon|ahead|over the next)\b/;

/**
 * Resolve a question into a grounded intent, or `null`.
 *
 * The order is deliberate and the conditions are conjunctive: each rule needs a
 * SUBJECT word and an INTENT word, so a question that merely mentions money
 * while asking something else is not routed into a comparison. Finance is
 * checked first because it is the only intent that needs two periods, and the
 * only one whose misfire would be expensive.
 */
export function resolveGroundedAskIntent(
  question: string,
  todayIso: string,
): GroundedAskRequest | null {
  const text = question.toLowerCase().trim();
  if (text.length === 0) return null;

  if (MONEY_WORDS.test(text)) {
    const periods = periodsIn(question, todayIso);
    if (
      periods.length >= 2 ||
      (periods.length === 1 && COMPARE_WORDS.test(text))
    ) {
      return financeComparison(periods, todayIso);
    }
    if (COMPARE_WORDS.test(text) && periods.length === 0) {
      // "compare my spending" with no period named at all: both periods are
      // defaults, and the answer says so rather than choosing silently.
      return financeComparison([], todayIso);
    }
  }

  if (GOAL_WORDS.test(text) && MOVEMENT_WORDS.test(text)) {
    const named = daysIn(text);
    return {
      intent: "goal_movement",
      days:
        named === null
          ? ASK_PARAMETER_BOUNDS.defaultMovementDays
          : clamp(
              named,
              ASK_PARAMETER_BOUNDS.minMovementDays,
              ASK_PARAMETER_BOUNDS.maxMovementDays,
            ),
      assumptions:
        named === null
          ? [
              `No period was named, so this covers the last ${ASK_PARAMETER_BOUNDS.defaultMovementDays} days.`,
            ]
          : [],
    };
  }

  if (PROJECT_WORDS.test(text) && HEALTH_WORDS.test(text)) {
    return {
      intent: "project_health",
      assumptions: [
        "This reads the states recorded at your recent weekly Reviews, not today's.",
      ],
    };
  }

  if (
    OBLIGATION_WORDS.test(text) &&
    (FORWARD_WORDS.test(text) || daysIn(text) !== null)
  ) {
    const named = daysIn(text);
    return {
      intent: "obligation_horizon",
      days:
        named === null
          ? ASK_PARAMETER_BOUNDS.defaultHorizonDays
          : clamp(
              named,
              ASK_PARAMETER_BOUNDS.minHorizonDays,
              ASK_PARAMETER_BOUNDS.maxHorizonDays,
            ),
      assumptions:
        named === null
          ? [
              `No horizon was named, so this covers the next ${ASK_PARAMETER_BOUNDS.defaultHorizonDays} days.`,
            ]
          : [],
    };
  }

  return null;
}

/**
 * Resolve the two periods a money comparison needs.
 *
 * With two named, the LATER one is the subject ("why was August more expensive
 * than July?" is a question about August). With one, the month before it is the
 * comparison. With none, this month and last month — stated as an assumption,
 * never silently.
 */
function financeComparison(
  periods: readonly AskPeriod[],
  todayIso: string,
): GroundedAskRequest {
  const assumptions: string[] = [];
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7));

  let later: AskPeriod;
  let earlier: AskPeriod;

  if (periods.length >= 2) {
    const ordered = [...periods].sort((a, b) =>
      a.startIso < b.startIso ? -1 : 1,
    );
    earlier = ordered[0] as AskPeriod;
    later = ordered[ordered.length - 1] as AskPeriod;
    if (periods.length > 2) {
      assumptions.push(
        `More than two periods were named; this compares ${earlier.label} with ${later.label}.`,
      );
    }
  } else if (periods.length === 1) {
    later = periods[0] as AskPeriod;
    const before = shiftMonth(
      Number(later.startIso.slice(0, 4)),
      Number(later.startIso.slice(5, 7)),
      -1,
    );
    earlier = monthPeriod(before.year, before.month);
    assumptions.push(
      `Only one period was named, so this compares ${later.label} with the month before it.`,
    );
  } else {
    later = monthPeriod(year, month);
    const before = shiftMonth(year, month, -1);
    earlier = monthPeriod(before.year, before.month);
    assumptions.push(
      `No period was named, so this compares ${later.label} with ${earlier.label}.`,
    );
  }

  return { intent: "finance_comparison", later, earlier, assumptions };
}

/**
 * A forward window of `days` owner days from today, inclusive of today.
 *
 * Exported so the obligation builder and its tests resolve the horizon the same
 * way, rather than each doing the arithmetic.
 */
export function horizonPeriod(todayIso: string, days: number): AskPeriod {
  const endIso = addDaysToIsoDate(todayIso, Math.max(0, days - 1));
  return {
    startIso: todayIso,
    endIso,
    label: `the next ${days} days`,
  };
}

/** A backward window of `days` owner days ending today, inclusive. */
export function lookbackPeriod(todayIso: string, days: number): AskPeriod {
  const startIso = addDaysToIsoDate(todayIso, -Math.max(0, days - 1));
  return {
    startIso,
    endIso: todayIso,
    label: `the last ${days} days`,
  };
}

/**
 * What Ask can answer, in the owner's words.
 *
 * One list, used by the refusal sentence and by the suggested questions on the
 * Ask page, so the examples can never drift from what the parser recognises.
 */
export const GROUNDED_ASK_EXAMPLES: readonly {
  readonly intent: GroundedAskIntent;
  readonly question: string;
}[] = [
  {
    intent: "finance_comparison",
    question: "Why was August more expensive than July?",
  },
  { intent: "goal_movement", question: "Which Goals haven't moved recently?" },
  {
    intent: "project_health",
    question: "Which Projects have been at risk recently?",
  },
  {
    intent: "obligation_horizon",
    question: "What do I need to deal with in the next 60 days?",
  },
];
