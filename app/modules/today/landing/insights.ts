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
    return "Nothing planned yet — start with what's overdue";
  }
  if (input.inboxCount > 0) {
    return "Nothing planned yet — pull something in from your inbox";
  }
  return "A clear day. Capture anything on your mind below.";
}
