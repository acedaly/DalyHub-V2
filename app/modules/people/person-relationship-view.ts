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

/** One row of the Person record's "What you share" band. */
export interface PersonSharedRecord {
  readonly id: string;
  /** The product's noun, plural — "Meetings", "Notes". */
  readonly label: string;
  /** The already-formatted count, including any "of N" qualification. */
  readonly value: string;
}

/**
 * UNTITLED-13 — what the owner actually SHARES with this Person.
 *
 * The same facts `personRelationshipCards` publishes, minus the two that were
 * measuring the relationship rather than describing it:
 *
 *   - **"Total interactions"** — a count of a friendship is a CRM metric, which
 *     §21 rules out by name. The number survives as the supporting line under
 *     the rhythm band, where it is evidence for a cadence rather than a score.
 *   - **"Last interaction" and "First interaction"** — both are about WHEN, not
 *     about what is shared. The first is the header's stay-in-touch state and
 *     the rhythm band; the second is a "Known since" fact in the upcoming strip.
 *
 * What is left is the honest answer to "what is between us": the records. A
 * kind with no records is OMITTED rather than shown as zero, because an empty
 * relationship should read as an invitation and not as a list of what is
 * missing (AGENTS.md §5) — which is `personRelationshipCards`' own rule, kept.
 *
 * Every row leads to the Linked tab, which is the surface that opens the record
 * behind it; the caller supplies the href once rather than per row.
 */
export function personSharedRecords(
  relationship: PersonRelationship,
): PersonSharedRecord[] {
  const { summary } = relationship;
  const rows: PersonSharedRecord[] = [];

  if (summary.meetings > 0) {
    rows.push({
      id: "meetings",
      label: "Meetings",
      value: String(summary.meetings),
    });
  }
  if (summary.tasks > 0) {
    rows.push({
      id: "tasks",
      label: "Commitments",
      // The OPEN count leads, because that is the one that asks something of
      // the owner; the total qualifies it so the number is never ambiguous.
      value: `${summary.openTasks} open of ${count(summary.tasks, "task", "tasks")}`,
    });
  }
  if (summary.notes > 0) {
    rows.push({ id: "notes", label: "Notes", value: String(summary.notes) });
  }
  if (summary.diaryEntries > 0) {
    rows.push({
      id: "diary",
      label: "Diary mentions",
      value: String(summary.diaryEntries),
    });
  }
  if (summary.projects > 0) {
    rows.push({
      id: "projects",
      label: "Projects",
      value: `${summary.activeProjects} active of ${count(summary.projects, "project", "projects")}`,
    });
  }
  if (summary.reviews > 0) {
    rows.push({
      id: "reviews",
      label: "Reviews",
      value: String(summary.reviews),
    });
  }

  return rows;
}
