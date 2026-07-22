/**
 * PROJ-02 Project Health — the shared, React-free presentation view-model.
 *
 * The seam between the DERIVED `ProjectHealth` a loader evaluates server-side
 * (ADR-035) and the calm text the collection Card, the project Record Layout and
 * Today's "Continue working" card render. It owns ONLY display derivations — the
 * human phrasing of a reason (formatting a date, choosing warm wording), the
 * accessible one-line summary and the tone → Card/Record tone mapping — kept out of
 * React so they are unit-tested directly. It makes NO health decisions: the state,
 * tone and reason codes come pre-computed from the pure evaluator; this module never
 * re-derives them, and never parses a display string to decide anything.
 *
 * Tone: factual, concise, non-judgmental, no CRM/guilt phrasing (PRODUCT_EXPERIENCE).
 */

import type { CardTone } from "~/shared/card";
import { ownerCalendarIso } from "~/shared/datetime";
import { formatCalendarDate } from "~/shared/task-record/task-view";
import type {
  HealthEvaluationContext,
  HealthReason,
  HealthTone,
  ProjectHealth,
} from "~/kernel/project-health";

/**
 * Build the owner-calendar evaluation context from an instant. Resolves "today" and
 * every activity/wait instant in the owner's timezone (`~/shared/datetime`), so
 * "overdue", "due soon" and "days since" match the owner's calendar day, not the UTC
 * runtime's. The loader passes a single `now` so the SQL facts and the pure evaluator
 * agree on the same day; tests inject a fixed instant.
 */
export function createOwnerHealthContext(now: Date): HealthEvaluationContext {
  return {
    now,
    todayIso: ownerCalendarIso(now),
    calendarIsoOf: (instant) => ownerCalendarIso(instant),
  };
}

/**
 * Map a health tone to a Card/Record tone. The string values are identical (health
 * uses a strict subset), so this is a total, lossless identity — expressed as a
 * function so the dependency is explicit and type-checked.
 */
export function healthToneToCardTone(tone: HealthTone): CardTone {
  return tone;
}

/**
 * The calm, human display text for one reason. Prefers warm, date-aware phrasing
 * derived from the reason's STRUCTURED fields (never re-deciding anything); falls
 * back to the evaluator's factual `summary`. Staleness in particular avoids CRM
 * language — "No progress since 8 Jul 2026", not "Inactive: 21 days".
 */
export function healthReasonText(reason: HealthReason): string {
  switch (reason.code) {
    case "stale": {
      const date = reason.date ? formatCalendarDate(reason.date) : null;
      return date ? `No progress since ${date}` : reason.summary;
    }
    case "long_waiting": {
      if (typeof reason.days === "number") {
        const unit = reason.days === 1 ? "day" : "days";
        return `Longest wait is ${reason.days} ${unit}`;
      }
      return reason.summary;
    }
    default:
      return reason.summary;
  }
}

/**
 * The concise accessible one-liner combining the state label and its primary reason
 * — the accessible name a card/pill exposes so a screen reader hears the state AND
 * why, without repeating every secondary reason. E.g. "At risk — 2 tasks past their
 * due date".
 */
export function healthAccessibleSummary(health: ProjectHealth): string {
  const primary = health.reasons[0];
  if (!primary) {
    return health.label;
  }
  const text = healthReasonText(primary);
  // Avoid a redundant "No tasks yet — No tasks yet" style echo.
  return text === health.label ? health.label : `${health.label} — ${text}`;
}

/**
 * Whether health warrants surfacing an attention cue at all. `on_track` and
 * `completed` (with no open tasks) are calm; the UI still shows a restrained
 * on-track pill, but callers that only want to flag attention use this.
 */
export function healthNeedsAttention(health: ProjectHealth): boolean {
  return (
    health.state === "at_risk" ||
    health.state === "blocked" ||
    health.state === "stale"
  );
}
