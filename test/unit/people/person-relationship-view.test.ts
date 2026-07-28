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
  personRelationshipCards,
} from "~/modules/people/person-relationship-view";

/**
 * PEOPLE-03 — the People-owned summary-card view-model.
 *
 * It asserts the two things the Person Summary promises: that every aggregate
 * ANSWERS a question the record exists to answer, and that every aggregate LEADS
 * somewhere (cross-module navigation), never dead-ending on a number.
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

function cardById(
  cards: ReturnType<typeof personRelationshipCards>,
  id: string,
) {
  return cards.find((card) => card.id === id);
}

describe("personRelationshipCards", () => {
  it("always answers 'when did I last interact' and 'how much have we shared'", () => {
    const cards = personRelationshipCards(relationshipWith({}, []));

    expect(cards.map((card) => card.id)).toEqual([
      "last-interaction",
      "total-interactions",
    ]);
    expect(cardById(cards, "last-interaction")?.value).toBe("None yet");
    expect(cardById(cards, "total-interactions")?.value).toBe("0");
    expect(cardById(cards, "total-interactions")?.detail).toBe(
      "Nothing recorded yet",
    );
  });

  it("surfaces every requested aggregate when there is something to show", () => {
    const cards = personRelationshipCards(
      relationshipWith({
        meetings: 4,
        diaryEntries: 2,
        notes: 3,
        tasks: 5,
        openTasks: 2,
        projects: 3,
        activeProjects: 1,
        reviews: 1,
        total: 18,
      }),
    );

    expect(cardById(cards, "meetings")?.value).toBe("4");
    expect(cardById(cards, "diary")?.label).toBe("Diary mentions");
    expect(cardById(cards, "notes")?.value).toBe("3");
    expect(cardById(cards, "open-tasks")).toMatchObject({
      label: "Open tasks",
      value: "2",
      detail: "of 5 tasks",
    });
    expect(cardById(cards, "active-projects")).toMatchObject({
      label: "Active projects",
      value: "1",
      detail: "of 3 projects",
    });
    expect(cardById(cards, "reviews")?.value).toBe("1");
    expect(cardById(cards, "first-interaction")?.value).toBe("20 July 2026");
  });

  it("omits an empty count rather than scoring the relationship at zero", () => {
    const cards = personRelationshipCards(relationshipWith({ meetings: 2 }));
    const ids = cards.map((card) => card.id);

    expect(ids).toContain("meetings");
    expect(ids).not.toContain("diary");
    expect(ids).not.toContain("notes");
    expect(ids).not.toContain("reviews");
    expect(ids).not.toContain("active-projects");
  });

  it("gives every card a destination — an aggregate never dead-ends", () => {
    const cards = personRelationshipCards(
      relationshipWith({
        meetings: 1,
        diaryEntries: 1,
        notes: 1,
        tasks: 1,
        openTasks: 1,
        projects: 1,
        activeProjects: 1,
        reviews: 1,
        total: 7,
      }),
    );

    for (const card of cards) {
      expect(card.href).toBeTruthy();
    }
    // Shared-record counts open the surface that lists and opens those records…
    expect(cardById(cards, "meetings")?.href).toBe(personLinkedHref("pe1"));
    expect(cardById(cards, "reviews")?.href).toBe(personLinkedHref("pe1"));
    // …and interaction facts open the ONE relationship timeline.
    expect(cardById(cards, "last-interaction")?.href).toBe(
      personActivityHref("pe1"),
    );
    expect(cardById(cards, "first-interaction")?.href).toBe(
      personActivityHref("pe1"),
    );
  });

  it("carries the relationship tone onto the last-interaction card only", () => {
    const cards = personRelationshipCards(
      relationshipWith({ meetings: 1, total: 1 }),
    );
    expect(cardById(cards, "last-interaction")?.tone).toBe("success");
    expect(cardById(cards, "meetings")?.tone).toBeUndefined();
  });

  it("builds destinations that survive an id needing escaping", () => {
    expect(personLinkedHref("a b/c")).toBe("/person/a%20b%2Fc?tab=linked");
    expect(personActivityHref("a b/c")).toBe("/person/a%20b%2Fc?tab=activity");
  });

  it("summarises how many days the interactions are spread across", () => {
    const cards = personRelationshipCards(
      relationshipWith({}, ["2026-06-01", "2026-06-15", "2026-07-20"]),
    );
    expect(cardById(cards, "total-interactions")).toMatchObject({
      value: "3",
      detail: "across 3 days",
    });
  });
});
