/**
 * PEOPLE-03 — the pure, React-free presentation helpers for the derived
 * relationship model.
 *
 * It re-decides NOTHING: every function here reads the STRUCTURED fields the kernel
 * evaluator produced (`state`, `tone`, reason `code`/`days`/`date`/`count`, cadence
 * numbers) and turns them into calm English. Tests assert on the structured fields;
 * only this file owns wording, so the tone can be revised without touching a rule.
 *
 * Tone rules (AGENTS.md §5 — care, not a CRM):
 *   - never a failure framing ("overdue", "lapsed", "at risk", "you should");
 *   - a duration is a fact, never a score, a streak or a percentage;
 *   - warm, date-aware phrasing where a date reads better than a day count.
 *
 * Mirrors `~/shared/project-health/health-view.ts` in shape so the two derived
 * signals stay siblings rather than diverging dialects.
 */

import type {
  PersonRelationship,
  RelationshipCadence,
  RelationshipReason,
  RelationshipTone,
} from "~/kernel/relationships";
import type { CardTone } from "~/shared/card";
import type { SummaryCardTone } from "~/shared/summary-cards";

/**
 * Map a relationship tone to a Card/Record tone. The string values are identical
 * (relationships use a strict subset — never `warning`, never `danger`), so this is
 * a total, lossless identity, expressed as a function so the dependency is explicit
 * and type-checked.
 */
export function relationshipToneToCardTone(tone: RelationshipTone): CardTone {
  return tone;
}

/** The same identity, for the DS-13 summary-card tone vocabulary. */
export function relationshipToneToSummaryTone(
  tone: RelationshipTone,
): SummaryCardTone {
  return tone;
}

/** Format a `YYYY-MM-DD` owner-calendar date warmly, or null when unusable. */
export function formatRelationshipDate(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }
  const [y, m, d] = iso.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

/**
 * A calm, human phrase for a whole-day duration: "today", "yesterday", "3 days
 * ago", "about 2 weeks ago", "about 5 months ago". Approximations are marked as
 * approximations — the exact day count stays available in the structured field.
 */
export function relativeDayPhrase(dayCount: number): string {
  if (dayCount <= 0) {
    return "today";
  }
  if (dayCount === 1) {
    return "yesterday";
  }
  if (dayCount < 14) {
    return `${days(dayCount)} ago`;
  }
  if (dayCount < 60) {
    const weeks = Math.round(dayCount / 7);
    return `about ${weeks} weeks ago`;
  }
  if (dayCount < 365) {
    const months = Math.round(dayCount / 30.436_875);
    return `about ${months} ${months === 1 ? "month" : "months"} ago`;
  }
  const years = Math.round((dayCount / 365.25) * 10) / 10;
  return `about ${years} ${years === 1 ? "year" : "years"} ago`;
}

/**
 * A calm cadence phrase from the average interval: "about weekly", "about once a
 * fortnight", "about once a month", "a few times a year". Null when there is not
 * yet enough history to claim a rhythm.
 */
export function cadencePhrase(cadence: RelationshipCadence): string | null {
  const average = cadence.averageIntervalDays;
  if (average === null || average <= 0) {
    return null;
  }
  if (average <= 2) {
    return "most days";
  }
  if (average <= 10) {
    return "about weekly";
  }
  if (average <= 21) {
    return "about once a fortnight";
  }
  if (average <= 45) {
    return "about once a month";
  }
  if (average <= 120) {
    return "about once a quarter";
  }
  if (average <= 250) {
    return "a couple of times a year";
  }
  return "about once a year";
}

/**
 * The calm, human display text for one reason. Prefers warm, date-aware phrasing
 * derived from the reason's STRUCTURED fields; falls back to the evaluator's
 * factual `summary` for any code this file has no better wording for (so a new
 * reason code always renders something honest).
 */
export function relationshipReasonText(reason: RelationshipReason): string {
  switch (reason.code) {
    case "no_interactions":
      return reason.summary;
    case "recent_interaction":
      return reason.days === undefined
        ? reason.summary
        : `You shared something ${relativeDayPhrase(reason.days)}.`;
    case "steady_rhythm":
      return reason.days === undefined
        ? reason.summary
        : reason.date
          ? `Last shared moment ${relativeDayPhrase(reason.days)}, on ${formatRelationshipDate(reason.date) ?? reason.date}.`
          : `About one shared moment every ${days(reason.days)}.`;
    case "single_interaction":
      return "One shared moment so far — not yet enough to read a rhythm.";
    case "cadence_elapsed":
      return reason.summary;
    case "follow_up_date_passed": {
      const when = formatRelationshipDate(reason.date ?? null);
      return when ? `You planned to follow up on ${when}.` : reason.summary;
    }
    case "rhythm_elapsed":
      return reason.summary;
    case "extended_absence": {
      const when = formatRelationshipDate(reason.date ?? null);
      return when ? `Nothing shared since ${when}.` : reason.summary;
    }
  }
}

/**
 * The one-line answer to "when did I last interact with them" — the phrase the
 * record header and the collection card both use, so the two can never drift.
 */
export function lastInteractionPhrase(
  relationship: PersonRelationship,
): string {
  const { daysSinceLastInteraction } = relationship.cadence;
  if (daysSinceLastInteraction === null) {
    return "No shared history yet";
  }
  return relativeDayPhrase(daysSinceLastInteraction);
}
