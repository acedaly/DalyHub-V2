import { MemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_RELATIONSHIP_RECORD_COUNTS,
  emptyPersonRelationshipFacts,
  evaluatePersonRelationship,
  type RelationshipEvaluationContext,
  type RelationshipRecordCounts,
} from "~/kernel/relationships";
import { PersonSummary } from "~/modules/people/PersonSummary";
import type { SerializedPerson } from "~/modules/people/person-view";
import { FeedbackProvider } from "~/shared/feedback";

/**
 * PEOPLE-03 — the Person Summary as the relationship answer sheet.
 *
 * Opening a Person must immediately answer: when did I last interact with them,
 * how often do we interact, what have we shared, and where do I go to see it. These
 * tests assert exactly that, plus the accessibility contract (labelled regions, real
 * headings, one link per navigable card).
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

function relationship(
  records: Partial<RelationshipRecordCounts> = {},
  dates: readonly string[] = [],
  ctx: RelationshipEvaluationContext = CTX,
) {
  const instants = dates.map(at);
  return evaluatePersonRelationship(
    {
      ...emptyPersonRelationshipFacts("p1"),
      records: { ...EMPTY_RELATIONSHIP_RECORD_COUNTS, ...records },
      totalInteractions: instants.length,
      firstInteractionAt: instants[0] ?? null,
      lastInteractionAt: instants[instants.length - 1] ?? null,
      interactionSample: [...instants].reverse(),
    },
    ctx,
  );
}

function person(over: Partial<SerializedPerson> = {}): SerializedPerson {
  return {
    id: "p1",
    title: "Ada Lovelace",
    preferredName: null,
    firstName: "Ada",
    middleName: null,
    lastName: "Lovelace",
    pronouns: null,
    organisation: "Analytical Engines",
    role: "Mathematician",
    department: null,
    email: null,
    secondaryEmail: null,
    mobile: null,
    workPhone: null,
    address: null,
    website: null,
    birthday: null,
    relationship: "colleague",
    relationshipLabel: "Colleague",
    tags: [],
    notes: null,
    favouriteContactMethod: null,
    favouriteContactMethodLabel: null,
    followUpFrequency: null,
    followUpFrequencyLabel: null,
    nextFollowUp: null,
    lastInteraction: null,
    photoUrl: null,
    initials: "AL",
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

function renderSummary(
  rel = relationship(),
  personOver: Partial<SerializedPerson> = {},
) {
  return render(
    <MemoryRouter>
      <FeedbackProvider>
        <PersonSummary
          person={person(personOver)}
          relationship={rel}
          onEditContact={vi.fn()}
        />
      </FeedbackProvider>
    </MemoryRouter>,
  );
}

describe("PersonSummary — the relationship summary", () => {
  it("answers 'when did I last interact' at a glance", () => {
    renderSummary(relationship({}, ["2026-07-25"]));

    const cards = screen.getByRole("list", { name: "Relationship" });
    expect(within(cards).getByText("Last interaction")).toBeInTheDocument();
    expect(within(cards).getByText("3 days ago")).toBeInTheDocument();
  });

  it("answers 'what have we shared' with one card per kind", () => {
    renderSummary(
      relationship(
        {
          meetings: 4,
          diaryEntries: 2,
          notes: 1,
          tasks: 5,
          openTasks: 2,
          projects: 2,
          activeProjects: 1,
          reviews: 1,
          total: 15,
        },
        ["2026-06-01", "2026-07-25"],
      ),
    );

    const cards = screen.getByRole("list", { name: "Relationship" });
    for (const label of [
      "Meetings",
      "Diary mentions",
      "Notes",
      "Open tasks",
      "Active projects",
      "Reviews",
      "First interaction",
    ]) {
      expect(within(cards).getByText(label)).toBeInTheDocument();
    }
  });

  it("reads as an invitation, not a scoreboard, when nothing is shared yet", () => {
    renderSummary(relationship());

    const cards = screen.getByRole("list", { name: "Relationship" });
    expect(within(cards).getByText("None yet")).toBeInTheDocument();
    expect(within(cards).queryByText("Meetings")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Nothing shared yet\./i, { exact: false }),
    ).toBeInTheDocument();
  });

  it("makes every aggregate navigable, and each card exactly one link", () => {
    renderSummary(relationship({ meetings: 2, total: 2 }, ["2026-07-25"]));

    const cards = screen.getByRole("list", { name: "Relationship" });
    const links = within(cards).getAllByRole("link");
    expect(links.length).toBe(within(cards).getAllByRole("listitem").length);
    expect(
      within(cards)
        .getByRole("link", { name: /^Meetings: 2$/ })
        .getAttribute("href"),
    ).toBe("/person/p1?tab=linked");
    expect(
      within(cards)
        .getByRole("link", { name: /^Last interaction:/ })
        .getAttribute("href"),
    ).toBe("/person/p1?tab=activity");
  });
});

describe("PersonSummary — stay-in-touch", () => {
  it("states the derived state as text, never as colour alone", () => {
    renderSummary(relationship({}, ["2026-07-25"]));

    const region = screen.getByRole("region", { name: "Staying in touch" });
    expect(within(region).getByText("Recently connected")).toBeInTheDocument();
  });

  it("explains the state and shows the cadence facts behind it", () => {
    renderSummary(
      relationship({}, [
        "2026-06-01",
        "2026-06-15",
        "2026-07-01",
        "2026-07-25",
      ]),
    );

    const region = screen.getByRole("region", { name: "Staying in touch" });
    expect(within(region).getByText("How often")).toBeInTheDocument();
    expect(within(region).getByText("Longest gap")).toBeInTheDocument();
    expect(within(region).getByText("First interaction")).toBeInTheDocument();
  });

  it("names the cadence the owner chose when they chose one", () => {
    renderSummary(
      relationship({}, ["2026-05-01"], {
        ...CTX,
        followUpFrequency: "monthly",
      }),
      { followUpFrequency: "monthly", followUpFrequencyLabel: "Monthly" },
    );

    const region = screen.getByRole("region", { name: "Staying in touch" });
    expect(within(region).getByText("Due for follow-up")).toBeInTheDocument();
    expect(
      within(region).getByText(/You chose about every 30 days/),
    ).toBeInTheDocument();
  });

  it("never uses guilt language for a long silence", () => {
    renderSummary(relationship({}, ["2024-01-05"]));

    const region = screen.getByRole("region", { name: "Staying in touch" });
    expect(within(region).getByText("It’s been a while")).toBeInTheDocument();
    expect(region.textContent ?? "").not.toMatch(
      /overdue|neglect|lapsed|you should/i,
    );
  });

  it("keeps both regions real, labelled landmarks with real headings", () => {
    renderSummary(relationship({ meetings: 1, total: 1 }, ["2026-07-25"]));

    expect(
      screen.getByRole("heading", { name: "Relationship", level: 3 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Staying in touch", level: 3 }),
    ).toBeInTheDocument();
    // Exactly one labelled region per section — never a wrapper landmark
    // duplicating the shared component's own.
    expect(
      screen.getAllByRole("region", { name: "Staying in touch" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("list", { name: "Relationship" }),
    ).toBeInTheDocument();
  });
});
