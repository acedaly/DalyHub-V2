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

/*
 * UNTITLED-13 — these contracts CHANGED, and the change is the point of the
 * pass.
 *
 * The tab used to open on a grid of up to nine counting tiles, two of which
 * ("Total interactions", "First interaction") were measuring the relationship
 * rather than describing it. §21 of the brief rules that out by name: People is
 * not a CRM, and a count of a friendship is a CRM metric. So the tiles are two
 * things now — a "What you share" band of the records, and the rhythm band's own
 * supporting line for the counts that are evidence rather than headlines — and
 * the question each old test was really asking is asserted on whichever of them
 * now answers it.
 */
describe("PersonSummary — what you share", () => {
  it("answers 'when did I last interact' at a glance", () => {
    renderSummary(relationship({}, ["2026-07-25"]));

    // The relative phrase AND the date, in the rhythm band where the rest of
    // "what is happening now" lives. It is `lastInteractionPhrase` — the same
    // derivation the record header and the collection row use.
    expect(screen.getByText("Last spoke")).toBeInTheDocument();
    expect(screen.getByText("3 days ago")).toBeInTheDocument();
    expect(screen.getByText("25 July 2026")).toBeInTheDocument();
  });

  it("answers 'what have we shared' with one row per kind of record", () => {
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

    const shared = screen.getByRole("list", { name: "What you share" });
    for (const label of [
      "Meetings",
      "Diary mentions",
      "Notes",
      "Commitments",
      "Projects",
      "Reviews",
    ]) {
      expect(within(shared).getByText(label)).toBeInTheDocument();
    }
    // The OPEN count leads and the total qualifies it, so a number is never
    // ambiguous about which it is.
    expect(within(shared).getByText("2 open of 5 tasks")).toBeInTheDocument();
    expect(
      within(shared).getByText("1 active of 2 projects"),
    ).toBeInTheDocument();
  });

  it("counts the relationship nowhere — that was the CRM metric", () => {
    renderSummary(
      relationship({ meetings: 4, total: 4 }, ["2026-06-01", "2026-07-25"]),
    );

    // "Total interactions: 47" was a headline tile. The same fact survives as
    // the rhythm band's supporting SENTENCE, which is evidence for a cadence
    // rather than a score for a friendship.
    expect(screen.queryByText("Total interactions")).not.toBeInTheDocument();
    expect(
      screen.getByText(/2 recorded moments across 2 days\./),
    ).toBeInTheDocument();
  });

  it("reads as an invitation, not a scoreboard, when nothing is shared yet", () => {
    renderSummary(relationship());

    // No band at all rather than a band of zeros: an absence is drawn as an
    // absence, which is `personSharedRecords`' own rule.
    expect(
      screen.queryByRole("list", { name: "What you share" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Last spoke")).not.toBeInTheDocument();
  });

  it("makes every shared kind navigable, and each row exactly one link", () => {
    renderSummary(relationship({ meetings: 2, total: 2 }, ["2026-07-25"]));

    const shared = screen.getByRole("list", { name: "What you share" });
    const links = within(shared).getAllByRole("link");
    expect(links.length).toBe(within(shared).getAllByRole("listitem").length);
    expect(
      within(shared)
        .getByRole("link", { name: /^Meetings: 2$/ })
        .getAttribute("href"),
    ).toBe("/person/p1?tab=linked");
  });

  it("offers the Activity tab as a real link, not a click handler", () => {
    renderSummary(relationship({}, ["2026-07-25"]));

    // §36 — it navigates, so it has an href and a middle click works.
    expect(
      screen.getByRole("link", { name: "All activity" }).getAttribute("href"),
    ).toBe("/person/p1?tab=activity");
  });
});

describe("PersonSummary — stay-in-touch", () => {
  /*
   * RECORD-01 — the derived STATE LABEL now lives once, in the record header's
   * context line (`StayInTouchIndicator`, asserted in `PersonRecord.test.tsx`),
   * and this panel explains it rather than repeating the pill. So these tests
   * assert what the panel is now responsible for: the REASONS and the cadence
   * facts, still as text and still without guilt language.
   */
  it("explains the state in words, never by colour alone", () => {
    renderSummary(relationship({}, ["2026-07-25"]));

    const region = screen.getByRole("region", { name: "Staying in touch" });
    // A reason is present and is real prose — meaning never rides on the tone.
    const reasons = within(region).getAllByRole("listitem");
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons[0].textContent ?? "").not.toHaveLength(0);
    // And the pill is NOT repeated here: the header already states it.
    expect(
      within(region).queryByText("Recently connected"),
    ).not.toBeInTheDocument();
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
    expect(
      within(region).getByText(/You chose about every 30 days/),
    ).toBeInTheDocument();
  });

  it("never uses guilt language for a long silence", () => {
    renderSummary(relationship({}, ["2024-01-05"]));

    const region = screen.getByRole("region", { name: "Staying in touch" });
    expect(region.textContent ?? "").not.toHaveLength(0);
    expect(region.textContent ?? "").not.toMatch(
      /overdue|neglect|lapsed|you should/i,
    );
  });

  it("keeps both regions real, labelled landmarks with real headings", () => {
    renderSummary(relationship({ meetings: 1, total: 1 }, ["2026-07-25"]));

    /*
     * UNTITLED-13 — level 2, not 3.
     *
     * These are sections of a RECORD whose title is the `h1`, so an `h3`
     * directly beneath it skipped a rank — which axe reports as "Heading order
     * invalid" and a screen-reader user walking by heading experiences as a
     * missing level. The `SectionHeading` override exists for precisely this
     * and takes the rank from the document rather than from the look.
     */
    expect(
      screen.getByRole("heading", { name: "What you share", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Staying in touch", level: 2 }),
    ).toBeInTheDocument();
    // Exactly one labelled region per section — never a wrapper landmark
    // duplicating the shared component's own.
    expect(
      screen.getAllByRole("region", { name: "Staying in touch" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("list", { name: "What you share" }),
    ).toBeInTheDocument();
  });
});

describe("PersonSummary — the hand-entered last-interaction field", () => {
  it("is shown, clearly labelled as noted, only while nothing has been recorded", () => {
    renderSummary(relationship(), { lastInteraction: "2020-01-01" });

    expect(screen.getByText("Last interaction (noted)")).toBeInTheDocument();
    expect(screen.getByText("1 January 2020")).toBeInTheDocument();
  });

  it("gives way to the derived answer once there is real history", () => {
    renderSummary(relationship({}, ["2026-07-25"]), {
      lastInteraction: "2020-01-01",
    });

    // One "last interaction" on the tab, and it is the derived one.
    expect(
      screen.queryByText("Last interaction (noted)"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("1 January 2020")).not.toBeInTheDocument();
    expect(screen.getByText("3 days ago")).toBeInTheDocument();
  });
});
