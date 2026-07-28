/**
 * PEOPLE-03 — the People-owned view-model for the derived relationship.
 *
 * Pure, React-free and server-safe: it turns the kernel's `PersonRelationship` into
 * the DS-13 summary cards the Person Summary renders, and nothing else. It
 * re-derives no rule and formats no date itself — wording and date formatting stay
 * in the shared `~/shared/relationships` view helpers so the Person record, the
 * collection card and any later surface read identically.
 *
 * Cross-module navigation (requirement: every aggregate must lead somewhere):
 *   - counts of shared records open the Person's **Linked** tab, the canonical
 *     surface that lists each shared record and opens it in its own module;
 *   - interaction facts open the Person's **Activity** tab, the ONE relationship
 *     timeline (PEOPLE-02), whose every item links to its originating record.
 *
 * Both destinations are ordinary in-app routes built with the existing
 * `?tab=` convention the Person record already uses for deep-linking, so Back /
 * Forward and copy-paste keep working.
 */

import type { PersonRelationship } from "~/kernel/relationships";
import {
  formatRelationshipDate,
  relationshipToneToSummaryTone,
  relativeDayPhrase,
} from "~/shared/relationships";
import type { SummaryCardItem } from "~/shared/summary-cards";

/** The Person record's Linked tab — where shared records are opened. */
export function personLinkedHref(personId: string): string {
  return `/person/${encodeURIComponent(personId)}?tab=linked`;
}

/** The Person record's Activity tab — the ONE relationship timeline. */
export function personActivityHref(personId: string): string {
  return `/person/${encodeURIComponent(personId)}?tab=activity`;
}

function count(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

/**
 * The relationship summary cards, in a stable reading order that answers the
 * questions the Person record exists to answer:
 *
 *   when did I last interact → how often → how much have we shared → of what kind.
 *
 * A card whose count is zero is OMITTED rather than shown as "0": an empty
 * relationship should read as an invitation, not as a scoreboard of what is missing
 * (AGENTS.md §5). "Last interaction" and "Total interactions" always appear, because
 * their absence is itself the answer.
 */
export function personRelationshipCards(
  relationship: PersonRelationship,
): SummaryCardItem[] {
  const { summary, cadence } = relationship;
  const activityHref = personActivityHref(relationship.personId);
  const linkedHref = personLinkedHref(relationship.personId);
  const tone = relationshipToneToSummaryTone(relationship.tone);

  const cards: SummaryCardItem[] = [
    {
      id: "last-interaction",
      label: "Last interaction",
      value:
        cadence.daysSinceLastInteraction === null
          ? "None yet"
          : relativeDayPhrase(cadence.daysSinceLastInteraction),
      detail: formatRelationshipDate(summary.lastInteractionDate) ?? undefined,
      href: activityHref,
      tone,
    },
    {
      id: "total-interactions",
      label: "Total interactions",
      value: String(summary.totalInteractions),
      detail:
        summary.totalInteractions === 0
          ? "Nothing recorded yet"
          : cadence.interactionDays > 1
            ? `across ${count(cadence.interactionDays, "day", "days")}`
            : undefined,
      href: activityHref,
    },
  ];

  if (summary.meetings > 0) {
    cards.push({
      id: "meetings",
      label: "Meetings",
      value: String(summary.meetings),
      href: linkedHref,
    });
  }
  if (summary.diaryEntries > 0) {
    cards.push({
      id: "diary",
      label: "Diary mentions",
      value: String(summary.diaryEntries),
      href: linkedHref,
    });
  }
  if (summary.notes > 0) {
    cards.push({
      id: "notes",
      label: "Notes",
      value: String(summary.notes),
      href: linkedHref,
    });
  }
  if (summary.tasks > 0) {
    cards.push({
      id: "open-tasks",
      label: "Open tasks",
      value: String(summary.openTasks),
      detail: `of ${count(summary.tasks, "task", "tasks")}`,
      href: linkedHref,
    });
  }
  if (summary.projects > 0) {
    cards.push({
      id: "active-projects",
      label: "Active projects",
      value: String(summary.activeProjects),
      detail: `of ${count(summary.projects, "project", "projects")}`,
      href: linkedHref,
    });
  }
  if (summary.reviews > 0) {
    cards.push({
      id: "reviews",
      label: "Reviews",
      value: String(summary.reviews),
      href: linkedHref,
    });
  }
  if (summary.firstInteractionDate) {
    cards.push({
      id: "first-interaction",
      label: "First interaction",
      value:
        formatRelationshipDate(summary.firstInteractionDate) ??
        summary.firstInteractionDate,
      href: activityHref,
    });
  }

  return cards;
}
