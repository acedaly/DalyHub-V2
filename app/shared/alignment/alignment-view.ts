/**
 * AREA-03 Alignment — the shared, React-free presentation view-model
 * (ADR-040).
 *
 * The seam between the DERIVED `GoalAlignment` a loader evaluates server-side
 * and the calm text the Goals collection Card and the Goal record Summary
 * render. It owns ONLY display derivations — kept out of React so they are
 * unit-tested directly. It makes NO alignment decisions: the state, tone and
 * reason codes come pre-computed from the pure evaluator; this module never
 * re-derives them, and never parses a display string to decide anything.
 *
 * Tone: factual, concise, non-judgemental — never CRM/guilt phrasing
 * (PRODUCT_PRINCIPLES' anti-guilt mandate, ADR-040 §40.5).
 */

import type { CardTone } from "~/shared/card";
import { ownerCalendarIso } from "~/shared/datetime";
import { formatCalendarDate } from "~/shared/task-record/task-view";
import type {
  AlignmentEvaluationContext,
  AlignmentTone,
  GoalAlignment,
  GoalAlignmentEvidence,
  GoalAlignmentReason,
} from "~/kernel/alignment";
import { daysBetweenIsoDates, recentWindowStartIso } from "~/kernel/alignment";

/**
 * Build the owner-calendar evaluation context AND the SQL-facing window
 * bounds from a single instant, so the loader's facts read, the evaluator and
 * the display all agree on the same "today" (mirrors
 * `createOwnerHealthContext` exactly).
 */
export function createOwnerAlignmentContext(now: Date): {
  readonly evaluation: AlignmentEvaluationContext;
  readonly recentWindowStartIso: string;
} {
  const todayIso = ownerCalendarIso(now);
  return {
    evaluation: {
      now,
      todayIso,
      calendarIsoOf: (instant) => ownerCalendarIso(instant),
    },
    recentWindowStartIso: recentWindowStartIso(todayIso),
  };
}

/** Map an alignment tone to a Card/Record tone. The string values are a
 * strict subset, so this is a total, lossless identity. */
export function alignmentToneToCardTone(tone: AlignmentTone): CardTone {
  return tone;
}

/** The calm, human display text for one reason — currently a direct pass
 * through of the evaluator's own factual `summary` (structured fields are
 * already phrased server-side); kept as its own function so a future warmer
 * phrasing pass has one seam, mirroring `healthReasonText`. */
export function alignmentReasonText(reason: GoalAlignmentReason): string {
  return reason.summary;
}

/**
 * The concise accessible one-liner combining the state label and its primary
 * reason — e.g. "No recent action — Projects exist, but no recent Task
 * activity was found."
 */
export function alignmentAccessibleSummary(alignment: GoalAlignment): string {
  const primary = alignment.reasons[0];
  if (!primary) {
    return alignment.label;
  }
  const text = alignmentReasonText(primary);
  return text === alignment.label
    ? alignment.label
    : `${alignment.label} — ${text}`;
}

/** Whether alignment warrants surfacing an attention cue — only `neglected`.
 * Every other state (including `no_structure`/`unreachable`) is calm context,
 * never a "needs a look" flag, matching ADR-040 §40.5's precedence. */
export function alignmentNeedsAttention(alignment: GoalAlignment): boolean {
  return alignment.state === "neglected";
}

/**
 * Sort a page of Goal alignment results by state precedence (`neglected` →
 * `active` → `unreachable` → `no_structure` → `completed`), then by
 * recency/creation order within a state — ADR-040 §40.9. This sorts ONE
 * fetched page for display; it is not a workspace-wide priority ranking.
 */
const STATE_ORDER: Record<GoalAlignment["state"], number> = {
  neglected: 0,
  active: 1,
  unreachable: 2,
  no_structure: 3,
  completed: 4,
};

export function compareAlignmentForDisplay(
  a: {
    readonly alignment: GoalAlignment;
    readonly createdAt: string;
    readonly id: string;
  },
  b: {
    readonly alignment: GoalAlignment;
    readonly createdAt: string;
    readonly id: string;
  },
): number {
  const stateDiff =
    STATE_ORDER[a.alignment.state] - STATE_ORDER[b.alignment.state];
  if (stateDiff !== 0) {
    return stateDiff;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export type SerializedGoalAlignmentEvidence = {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly occurredAt: string;
};

export function serializeGoalAlignmentEvidence(
  evidence: GoalAlignmentEvidence,
): SerializedGoalAlignmentEvidence {
  return {
    taskId: evidence.taskId,
    taskTitle: evidence.taskTitle,
    projectId: evidence.projectId,
    projectTitle: evidence.projectTitle,
    occurredAt: evidence.occurredAt.toISOString(),
  };
}

/** A calm "today" / "yesterday" / "N days ago" label for one evidence row's
 * date, computed against the SAME owner-calendar day the alignment state
 * itself used — never a raw ISO timestamp in the UI. The occurred instant is
 * converted through the SAME `ownerCalendarIso` helper the evaluator's
 * `calendarIsoOf` uses (never a raw UTC slice): near UTC midnight, the
 * owner's Sydney calendar date can differ from the UTC date, and using the
 * UTC date here would disagree with the alignment state's own "how long
 * ago" reasoning by a day. */
export function evidenceDateLabel(
  occurredAtIso: string,
  todayIso: string,
): string {
  const occurredDate = ownerCalendarIso(new Date(occurredAtIso));
  const days = Math.max(0, daysBetweenIsoDates(occurredDate, todayIso));
  const formatted = formatCalendarDate(occurredDate) ?? occurredDate;
  if (days === 0) {
    return `${formatted} (today)`;
  }
  if (days === 1) {
    return `${formatted} (yesterday)`;
  }
  return `${formatted} (${days} days ago)`;
}
