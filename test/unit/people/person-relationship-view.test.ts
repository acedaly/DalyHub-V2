import { describe, expect, it } from "vitest";

import {
  EMPTY_RELATIONSHIP_RECORD_COUNTS,
  emptyPersonRelationshipFacts,
  evaluatePersonRelationship,
  type PersonRelationshipFacts,
  type RelationshipEvaluationContext,
  type RelationshipRecordCounts,
} from "~/kernel/relationships";
import {
  personActivityHref,
  personLinkedHref,
  personSharedRecords,
} from "~/modules/people/person-relationship-view";

/**
 * PEOPLE-03 — the People-owned relationship view-model.
 *
 * ── UNTITLED-18 — re-pointed, not deleted ───────────────────────────────────
 *
 * This file used to exercise `personRelationshipCards`, the producer for the
 * `SummaryCards` component. UNTITLED-13 replaced the band of counting tiles it
 * fed, leaving the producer with no consumer in `app/` and this file as its only
 * caller; both are gone now with the component.
 *
 * The RULE it was really guarding survived that change and is `personSharedRecords`'
 * own: a kind with no records is OMITTED rather than shown as zero, because an
 * empty relationship should read as an invitation and not as a list of what is
 * missing (AGENTS.md §5). Deleting the file would have taken that with it, so
 * the cases move to the function that now carries the rule.
 */

const CTX: RelationshipEvaluationContext = {
  now: new Date("2026-07-28T09:00:00.000Z"),
  todayIso: "2026-07-28",
  calendarIsoOf: (instant) => instant.toISOString().slice(0, 10),
  followUpFrequency: null,
  nextFollowUpIso: null,
};

function at(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

function relationshipWith(
  records: Partial<RelationshipRecordCounts>,
  dates: readonly string[] = ["2026-07-20"],
) {
  const instants = dates.map(at);
  const facts: PersonRelationshipFacts = {
    ...emptyPersonRelationshipFacts("pe1"),
    records: { ...EMPTY_RELATIONSHIP_RECORD_COUNTS, ...records },
    totalInteractions: instants.length,
    firstInteractionAt: instants[0] ?? null,
    lastInteractionAt: instants[instants.length - 1] ?? null,
    interactionSample: [...instants].reverse(),
  };
  return evaluatePersonRelationship(facts, CTX);
}

describe("personSharedRecords", () => {
  it("omits a kind with no records rather than showing a zero", () => {
    const rows = personSharedRecords(relationshipWith({}, []));
    expect(rows).toEqual([]);
  });

  it("lists only the kinds that have records", () => {
    const rows = personSharedRecords(
      relationshipWith({ meetings: 2, notes: 1 }),
    );
    expect(rows.map((row) => row.id)).toEqual(["meetings", "notes"]);
    expect(rows.map((row) => row.label)).toEqual(["Meetings", "Notes"]);
  });

  it("qualifies a count whose leading number is a subset", () => {
    /*
     * "3 open of 5 tasks", never a bare "3": the OPEN count leads because it is
     * the one that asks something of the owner, and an unqualified subset is a
     * number the reader cannot interpret.
     */
    const rows = personSharedRecords(
      relationshipWith({
        tasks: 5,
        openTasks: 3,
        projects: 4,
        activeProjects: 1,
      }),
    );
    expect(rows.find((row) => row.id === "tasks")?.value).toBe(
      "3 open of 5 tasks",
    );
    expect(rows.find((row) => row.id === "projects")?.value).toBe(
      "1 active of 4 projects",
    );
  });

  it("keeps a stable reading order across every kind", () => {
    const rows = personSharedRecords(
      relationshipWith({
        meetings: 1,
        tasks: 1,
        notes: 1,
        diaryEntries: 1,
        projects: 1,
        reviews: 1,
      }),
    );
    expect(rows.map((row) => row.id)).toEqual([
      "meetings",
      "tasks",
      "notes",
      "diary",
      "projects",
      "reviews",
    ]);
  });
});

describe("the record's cross-module destinations", () => {
  it("sends every shared record to the Linked tab, and history to Activity", () => {
    // The band states counts; the LINKED tab is the surface that opens the
    // record behind one, so a number never dead-ends.
    expect(personLinkedHref("pe 1")).toBe("/person/pe%201?tab=linked");
    expect(personActivityHref("pe 1")).toBe("/person/pe%201?tab=activity");
  });
});
