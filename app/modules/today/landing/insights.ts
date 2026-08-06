/**
 * TODAY-08 — pure derivations for the Morning Brief and Insights widgets.
 *
 * These are calm, operational SIGNALS derived from data the loader already read —
 * never a second query, never a chart, never a manufactured streak or urgency
 * (AGENTS.md §2.4 "calm over urgent"; the anti-guilt mandate). Everything here is
 * a pure function of primitive inputs so it is fully unit-testable and free of
 * React, storage, timezones and D1.
 *
 * The owner's calendar day is resolved server-side (`ownerCalendarIso`) and passed
 * in — nothing here calls `Date.now()`, so "today"/"this morning" is the owner's
 * day, not the UTC Worker runtime's.
 */

/** The part of the day, for a calm greeting. Derived from the owner-local hour. */
export type DayPart = "morning" | "afternoon" | "evening";

/** Resolve the day part from an owner-local hour (0–23). */
export function dayPartForHour(hour: number): DayPart {
  if (hour < 12) {
    return "morning";
  }
  if (hour < 18) {
    return "afternoon";
  }
  return "evening";
}

/** A calm greeting for the day part (no name required, no exclamation). */
export function greetingFor(part: DayPart): string {
  switch (part) {
    case "morning":
      return "Good morning";
    case "afternoon":
      return "Good afternoon";
    case "evening":
      return "Good evening";
  }
}

/** The facts the insights/brief derivations need — all already loaded. */
export interface InsightsInput {
  /** Tasks whose plan has slipped (scheduled before today, still open). */
  readonly overdueCount: number;
  /** Tasks committed to today (scheduled today, still open). */
  readonly plannedTodayCount: number;
  /** Unscheduled backlog tasks ("Anytime") — the inbox to plan from. */
  readonly inboxCount: number;
  /** Tasks blocked on someone/something else. */
  readonly waitingCount: number;
  /** Tasks completed today (recent accomplishments). */
  readonly completedTodayCount: number;
  /** Active projects the owner is currently working on. */
  readonly activeProjectCount: number;
  /** Active projects whose derived health needs attention (at-risk/blocked/stale). */
  readonly projectsNeedingAttentionCount: number;
  /** Areas whose roll-up suggests a review is due (no active projects/goals). */
  readonly areasNeedingReviewCount: number;
  /** Goals whose recent action does not match intent ("neglected" alignment). */
  readonly goalsAtRiskCount: number;
  /** Whether a diary entry exists for today (drives the streak nudge). */
  readonly hasDiaryToday: boolean;
}

/** One calm insight row: a label, a count, and a tone (never colour-only). */
export interface InsightSignal {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  /** `attention` signals get a quiet emphasis; `neutral` are plain facts. */
  readonly tone: "attention" | "neutral" | "positive";
  /** An optional in-app destination that answers the signal. */
  readonly href?: string;
}

/**
 * Derive the Insights signals from the loaded facts. Only signals with something
 * to say are returned (a zero count is omitted, never rendered as "0 overdue" —
 * the anti-guilt rule), and recent accomplishments are framed positively.
 */
export function deriveInsights(input: InsightsInput): readonly InsightSignal[] {
  const signals: InsightSignal[] = [];
  const push = (
    id: string,
    label: string,
    count: number,
    tone: InsightSignal["tone"],
    href?: string,
  ) => {
    if (count > 0) {
      signals.push({ id, label, count, tone, href });
    }
  };
  push("overdue", "Tasks overdue", input.overdueCount, "attention");
  push(
    "waiting",
    "Waiting on others",
    input.waitingCount,
    "neutral",
    "/today/waiting",
  );
  push(
    "projects-attention",
    "Projects needing attention",
    input.projectsNeedingAttentionCount,
    "attention",
    "/projects",
  );
  push(
    "areas-review",
    "Areas to review",
    input.areasNeedingReviewCount,
    "neutral",
    "/areas",
  );
  push(
    "goals-risk",
    "Goals at risk",
    input.goalsAtRiskCount,
    "attention",
    "/goals",
  );
  push("inbox", "In your inbox", input.inboxCount, "neutral");
  push(
    "accomplished",
    "Completed today",
    input.completedTodayCount,
    "positive",
  );
  return signals;
}

/** A single calm line summarising the day's shape for the Morning Brief. */
export function briefFocusLine(input: InsightsInput): string {
  if (input.plannedTodayCount > 0) {
    const noun = input.plannedTodayCount === 1 ? "task" : "tasks";
    return `${input.plannedTodayCount} ${noun} planned for today`;
  }
  if (input.overdueCount > 0) {
    return "Nothing planned yet — start with what’s overdue";
  }
  if (input.inboxCount > 0) {
    return "Nothing planned yet — pull something in from your inbox";
  }
  return "A clear day. Capture anything on your mind below.";
}

/* -------------------------------------------------------------------------- */
/* M3-01 — the dashboard summaries                                            */
/* -------------------------------------------------------------------------- */

/**
 * The task summary a ring can be drawn from: three mutually exclusive buckets
 * that add up to the whole open-plus-completed-today picture.
 *
 * "In progress" is `waiting` — tasks blocked on someone or something else — and
 * that naming is deliberate rather than loose: DalyHub has no per-task started
 * flag, so the only honest thing the product can say about a task being underway
 * is that it is waiting on something. The card labels it in those words.
 *
 * The INBOX is deliberately excluded. It is a backlog, not today's business, and
 * folding it into the denominator made the ring say "0 of 85 tasks finished
 * today" on a day with one task planned — which is a true division of the wrong
 * numbers. What the card counts is what the owner committed to today (planned),
 * what has slipped (overdue), what is blocked (waiting) and what is finished.
 */
export interface TaskSummary {
  /** Open and not waiting: planned for today, overdue, or still in the inbox. */
  readonly toDo: number;
  /** Open and blocked on someone or something else. */
  readonly inProgress: number;
  /** Completed on the owner's today. */
  readonly done: number;
  /** Everything above — the denominator the ring is drawn against. */
  readonly total: number;
  /** `done / total`, 0 when there is nothing to divide by. */
  readonly completedFraction: number;
}

/** Derive the task summary from facts the loader has already read. */
export function deriveTaskSummary(input: InsightsInput): TaskSummary {
  const toDo = Math.max(0, input.plannedTodayCount + input.overdueCount);
  const inProgress = Math.max(0, input.waitingCount);
  const done = Math.max(0, input.completedTodayCount);
  const total = toDo + inProgress + done;
  return {
    toDo,
    inProgress,
    done,
    total,
    completedFraction: total === 0 ? 0 : done / total,
  };
}

/**
 * A 0–100 score for the day, from two facts and nothing else.
 *
 * THE FORMULA, stated here because a number on a dashboard that nobody can
 * explain is a number nobody should trust:
 *
 *     completion = done / (done + open)      the share of the day's work finished
 *     penalty    = min(overdue, 5) / 5       how far the plan has slipped, capped
 *     score      = round(100 * completion * (1 - 0.4 * penalty))
 *
 * Three properties are deliberate:
 *
 *   - It is bounded and it saturates. Five overdue tasks and fifty overdue tasks
 *     score the same, because past five the number stops being information and
 *     starts being a rebuke (AGENTS.md §2.4, the anti-guilt rule).
 *   - The penalty is a 40% ceiling, not a wipe-out. A day with real progress and
 *     some slippage still reads as a day with real progress.
 *   - A day with nothing to do scores 0 rather than 100, and the card renders its
 *     empty state instead of the ring — a perfect score for having no tasks would
 *     be a manufactured achievement.
 *
 * It counts nothing else. No streaks, no percentile, no comparison to other
 * people: DalyHub has one user and nobody to be measured against.
 */
export const PRODUCTIVITY_OVERDUE_CAP = 5;
export const PRODUCTIVITY_OVERDUE_WEIGHT = 0.4;

export function deriveProductivityScore(input: InsightsInput): number {
  const done = Math.max(0, input.completedTodayCount);
  const open = Math.max(
    0,
    input.plannedTodayCount + input.overdueCount + input.waitingCount,
  );
  const considered = done + open;
  if (considered === 0) {
    return 0;
  }
  const completion = done / considered;
  const penalty =
    Math.min(Math.max(0, input.overdueCount), PRODUCTIVITY_OVERDUE_CAP) /
    PRODUCTIVITY_OVERDUE_CAP;
  return Math.round(
    100 * completion * (1 - PRODUCTIVITY_OVERDUE_WEIGHT * penalty),
  );
}

/**
 * One short, honest line for the score. It never congratulates a bad day and
 * never scolds a slow one; it says what the number means and stops.
 */
export function productivityEncouragement(score: number, done: number): string {
  if (done === 0) {
    return "Nothing finished yet today. The first one is the hard one.";
  }
  if (score >= 75) {
    return "A strong day so far. The plan and the work agree.";
  }
  if (score >= 40) {
    return "Steady progress, with some of the plan still open.";
  }
  return "More is open than closed today. Worth picking one thing.";
}
