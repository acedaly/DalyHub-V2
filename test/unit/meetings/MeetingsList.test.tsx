import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  MeetingsList,
  type MeetingsListMeeting,
} from "~/modules/meetings/MeetingsList";
import {
  formatMeetingDayGroup,
  formatMeetingTime,
  meetingZoneLabel,
  type SerializedMeetingRow,
} from "~/modules/meetings/meeting-view";

/**
 * UIX-04 §25 — the Meetings collection as a grouped schedule.
 *
 * What is asserted is the reasoning, not the pixels: that the day headings are
 * DERIVED (relative to the owner's day, in the meeting's own timezone), that the
 * status is shown only when it contradicts the view rather than on every row,
 * and that Join stays a labelled control outside the row link.
 */

const SYDNEY = "Australia/Sydney";
const TODAY = "2026-08-10";

/*
 * UNTITLED-13 — the fixture is the ROW projection, which is what the collection
 * is now given.
 *
 * The loaders used to hand every row `serializeMeeting`, so a page of thirty
 * meetings shipped thirty complete notebooks — `agendaMarkdown`, `notesMarkdown`
 * and every `meeting_items` row — to draw thirty one-line rows. They ship
 * `serializeMeetingRow` now: the fields a row draws, plus the counts that let a
 * PAST row say what came out of the meeting.
 */
function meeting(
  over: Partial<SerializedMeetingRow> = {},
): SerializedMeetingRow {
  return {
    id: "m1",
    title: "Pathway working group",
    startsAt: "2026-08-10T04:30:00.000Z", // 14:30 Sydney on the 10th
    endsAt: null,
    timezone: SYDNEY,
    location: "Teams",
    mode: "online",
    meetingUrl: null,
    status: "planned",
    archivedAt: null,
    heldAt: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
    agendaItems: 0,
    hasAgendaBody: true,
    outcomes: { decisions: 0, outcomes: 0, actions: 0, hasNotes: false },
    ...over,
  };
}

function renderList(
  meetings: readonly MeetingsListMeeting[],
  view = "upcoming",
  todayKey = TODAY,
  ownerTimezone = SYDNEY,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/meetings",
        element: (
          <MeetingsList
            meetings={meetings}
            ariaLabel="upcoming meetings"
            todayKey={todayKey}
            ownerTimezone={ownerTimezone}
            view={view}
          />
        ),
      },
    ],
    { initialEntries: ["/meetings"] },
  );
  render(<RouterProvider router={router} />);
}

describe("MeetingsList", () => {
  it("groups consecutive meetings under a relative day heading", () => {
    renderList([
      meeting({ id: "m1", title: "Working group" }),
      meeting({
        id: "m2",
        title: "Catch-up",
        startsAt: "2026-08-10T23:00:00.000Z",
      }), // 09:00 Sydney on the 11th
    ]);

    /*
     * UNTITLED-13 — the count is a BADGE beside the heading, not inside it.
     *
     * REFINE had welded it into the `h2`, so the accessible name was
     * "Tomorrow 1" — a date with a bare digit on the end. Untitled's own
     * `TableCard.Header` puts the figure in a badge next to the title, and a
     * badge has to say what it counts, so the heading is the day and the badge
     * is "2 meetings". Both facts are still announced; neither is now a guess.
     */
    expect(
      screen.getByRole("heading", { level: 2, name: "Today" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Tomorrow" }),
    ).toBeInTheDocument();
  });

  it("names an absolute day beyond the relative window", () => {
    renderList([
      meeting({ id: "m3", startsAt: "2026-08-13T00:00:00.000Z" }), // 10:00 Sydney, Thu 13th
    ]);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Thursday, 13 August 2026",
      }),
    ).toBeInTheDocument();
  });

  it("shows the time in the MEETING's timezone, not the reader's", () => {
    renderList([meeting()]);
    // 04:30Z is 14:30 in Sydney. A reader in London must still see 2:30 pm.
    expect(screen.getByText("2:30 pm")).toBeInTheDocument();
    // …and says nothing about the zone, because it IS the owner's zone.
    expect(screen.queryByText("Sydney")).not.toBeInTheDocument();
  });

  it("names the zone only when the meeting is not in the owner's", () => {
    // 04:30Z is 00:30 in New York and 14:30 in Sydney: same instant, two very
    // different clocks, and a bare "12:30 am" under a Sydney owner's "Today"
    // would be a row that contradicts its own heading without saying why.
    renderList([meeting({ timezone: "America/New_York" })]);
    expect(screen.getByText("12:30 am")).toBeInTheDocument();
    expect(screen.getByText("New York")).toBeInTheDocument();
  });

  it("groups a foreign-zone meeting on the OWNER's day", () => {
    // 2026-08-10T22:00Z is still the 10th in New York and already the 11th in
    // Sydney. For a Sydney owner whose today is the 11th that is TODAY — read
    // in the meeting's own zone it came out as "Yesterday", in a list of
    // upcoming meetings.
    renderList(
      [
        meeting({
          startsAt: "2026-08-10T22:00:00.000Z",
          timezone: "America/New_York",
        }),
      ],
      "upcoming",
      "2026-08-11",
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Today" }),
    ).toBeInTheDocument();
  });

  it("formats the mode when a meeting has no location", () => {
    renderList([meeting({ location: null, mode: "in_person" })]);
    expect(screen.getByText("In person")).toBeInTheDocument();
    expect(screen.queryByText("in_person")).not.toBeInTheDocument();
  });

  it("suppresses the status the view already implies, and shows one that contradicts it", () => {
    renderList(
      [
        meeting({ id: "m1", title: "Planned one" }),
        meeting({ id: "m2", title: "Cancelled one", status: "cancelled" }),
      ],
      "upcoming",
    );
    expect(screen.queryByText("Planned")).not.toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("always names the archived state, whatever the view", () => {
    renderList(
      [meeting({ archivedAt: "2026-08-09T00:00:00.000Z" })],
      "archived",
    );
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("offers Join outside the row link, only for a joinable meeting", () => {
    renderList([
      meeting({
        id: "m1",
        title: "Working group",
        meetingUrl: "https://example.org/meet/x",
      }),
      meeting({
        id: "m2",
        title: "Held already",
        heldAt: "2026-08-10T05:00:00.000Z",
      }),
    ]);

    const join = screen.getByRole("link", { name: "Join Working group" });
    expect(join).toHaveAttribute("href", "https://example.org/meet/x");
    // Never nested inside the row's own link — one interactive control per target.
    expect(join.closest("a[href^='/meeting/']")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Join Held already" }),
    ).not.toBeInTheDocument();
  });

  /*
   * §7 — upcoming and past are not the same question, so they are not the same
   * row. Before this the two views drew identical metadata, so a meeting from
   * three weeks ago advertised how long it had been scheduled to run.
   */
  describe("the two readings", () => {
    it("an upcoming row states how long and where, and offers Join", () => {
      renderList(
        [
          meeting({
            endsAt: "2026-08-10T05:30:00.000Z", // an hour later
            meetingUrl: "https://example.org/meet/x",
            outcomes: {
              decisions: 2,
              outcomes: 1,
              actions: 3,
              hasNotes: true,
            },
          }),
        ],
        "upcoming",
      );
      expect(screen.getByText("1h")).toBeInTheDocument();
      expect(screen.getByText("Teams")).toBeInTheDocument();
      // Outcomes belong to a history, even when the record happens to hold
      // some: a meeting that has not happened is not read for what came of it.
      expect(screen.queryByTestId("meeting-row-decisions")).toBeNull();
      expect(screen.getByRole("link", { name: /^Join / })).toBeInTheDocument();
    });

    it("a past row states what came out of it, and offers no Join", () => {
      renderList(
        [
          meeting({
            status: "completed",
            endsAt: "2026-08-10T05:30:00.000Z",
            meetingUrl: "https://example.org/meet/x",
            outcomes: {
              decisions: 1,
              outcomes: 0,
              actions: 3,
              hasNotes: true,
            },
          }),
        ],
        "recent",
      );
      expect(screen.getByTestId("meeting-row-decisions")).toHaveTextContent(
        "1 decision",
      );
      expect(screen.getByTestId("meeting-row-actions")).toHaveTextContent(
        "3 actions",
      );
      expect(screen.getByTestId("meeting-row-notes")).toHaveTextContent(
        "Notes",
      );
      // The place still identifies WHICH weekly sync this was.
      expect(screen.getByText("Teams")).toBeInTheDocument();
      // The duration is a scheduling fact, and the call has finished.
      expect(screen.queryByText("1h")).toBeNull();
      expect(screen.queryByRole("link", { name: /^Join / })).toBeNull();
    });

    it("a past row with nothing recorded says nothing rather than zeros", () => {
      renderList(
        [meeting({ status: "completed", location: null, mode: null })],
        "recent",
      );
      expect(screen.queryByText(/0 decisions/)).toBeNull();
      expect(screen.queryByTestId("meeting-row-decisions")).toBeNull();
      expect(screen.queryByTestId("meeting-row-notes")).toBeNull();
    });

    it("warns on an upcoming meeting with no agenda at all, and not otherwise", () => {
      renderList(
        [
          meeting({
            id: "m1",
            title: "Bare",
            hasAgendaBody: false,
            agendaItems: 0,
          }),
          meeting({ id: "m2", title: "Written up", hasAgendaBody: true }),
          meeting({
            id: "m3",
            title: "Listed",
            hasAgendaBody: false,
            agendaItems: 4,
          }),
        ],
        "upcoming",
      );
      // One badge, on the one meeting with neither a body nor an item.
      expect(screen.getAllByText("No agenda")).toHaveLength(1);
    });

    it("never warns about a past meeting's agenda", () => {
      renderList(
        [
          meeting({
            status: "completed",
            hasAgendaBody: false,
            agendaItems: 0,
          }),
        ],
        "recent",
      );
      expect(screen.queryByText("No agenda")).toBeNull();
    });
  });

  it("opens the record from the row itself", () => {
    renderList([meeting()]);
    const row = screen.getByRole("link", { name: /Pathway working group/ });
    expect(row).toHaveAttribute("href", "/meeting/m1");
    expect(within(row).getByText("Teams")).toBeInTheDocument();
  });
});

describe("the meeting day/time formatters", () => {
  it("computes the relative heading against the OWNER's day", () => {
    // The same instant is "Today" for an owner on the 10th and "Yesterday" for
    // one on the 11th — which is the whole reason `todayKey` is resolved on the
    // server from the stored preference rather than in the browser.
    const at = "2026-08-10T04:30:00.000Z";
    expect(formatMeetingDayGroup(at, SYDNEY, "2026-08-10")).toBe("Today");
    expect(formatMeetingDayGroup(at, SYDNEY, "2026-08-11")).toBe("Yesterday");
    expect(formatMeetingDayGroup(at, SYDNEY, "2026-08-09")).toBe("Tomorrow");
  });

  it("resolves the day in the GIVEN zone, so a late instant is not the wrong date", () => {
    // 22:00 UTC on the 10th is 08:00 on the 11th in Sydney.
    const at = "2026-08-10T22:00:00.000Z";
    expect(formatMeetingDayGroup(at, SYDNEY, "2026-08-11")).toBe("Today");
    expect(formatMeetingTime(at, SYDNEY)).toBe("8:00 am");
    // The SAME instant, read in New York, is still the 10th — which is why the
    // collection passes the owner's zone here and the meeting's to the time.
    expect(formatMeetingDayGroup(at, "America/New_York", "2026-08-11")).toBe(
      "Yesterday",
    );
  });

  it("formats midnight and noon without a zero or a 24th hour", () => {
    expect(formatMeetingTime("2026-08-10T14:00:00.000Z", SYDNEY)).toBe(
      "12:00 am",
    );
    expect(formatMeetingTime("2026-08-10T02:00:00.000Z", SYDNEY)).toBe(
      "12:00 pm",
    );
  });

  it("names a zone from its IANA identifier, without Intl", () => {
    expect(meetingZoneLabel("America/New_York")).toBe("New York");
    expect(meetingZoneLabel("Australia/Sydney")).toBe("Sydney");
    expect(meetingZoneLabel("UTC")).toBe("UTC");
  });
});

/* -------------------------------------------------------------------------- */
/* DEBT-124 — the row can finally say WITH WHOM                                */
/* -------------------------------------------------------------------------- */

describe("DEBT-124 — People context on a meeting row", () => {
  /*
   * UIX-04 §25 lists "People / Project context" among what a meeting row may
   * show, and the collection could not show it — not because it was undesirable
   * but because the kernel published only `listForEntity`, so a page of thirty
   * rows meant thirty queries. The loader now resolves the whole page through
   * the batched `listForEntities`; what is asserted here is the ROW's half.
   */
  it("names the attendees the loader resolved", () => {
    renderList([
      meeting({
        attendees: { names: ["Mira Chen", "Anna Ruiz"], hasMore: false },
      } as Partial<MeetingsListMeeting>),
    ]);
    expect(screen.getByTestId("meeting-row-attendees")).toHaveTextContent(
      "Mira Chen, Anna Ruiz",
    );
  });

  it("says THAT there are more rather than a partial truth — and never a number", () => {
    /*
     * A row that named three of nine and stopped would be a true sentence that
     * reads as the whole list. But it must not say "+6" either: the read
     * behind it is bounded at `MEETING_ROW_ATTENDEE_LIMIT + 1`, so any count
     * derived from it is at most 1 however many attendees there are. Found by
     * review on PR #226; the contract is now a boolean and this asserts the
     * wording it produces.
     */
    renderList([
      meeting({
        attendees: {
          names: ["Mira Chen", "Anna Ruiz", "Tomas Lind"],
          hasMore: true,
        },
      } as Partial<MeetingsListMeeting>),
    ]);
    const row = screen.getByTestId("meeting-row-attendees");
    expect(row).toHaveTextContent(
      "Mira Chen, Anna Ruiz, Tomas Lind and others",
    );
    expect(
      row.textContent,
      "the row states a NUMBER of remaining attendees, which a bounded read " +
        "cannot know",
    ).not.toMatch(/\+\s*\d/);
  });

  it("says NOTHING when the page did not resolve any, rather than an empty label", () => {
    // `null` covers both "this meeting has no attendees" and "the relationship
    // read failed", and both must draw an honest absence rather than "with:".
    renderList([meeting()]);
    expect(screen.queryByTestId("meeting-row-attendees")).toBeNull();

    renderList([
      meeting({
        attendees: { names: [], hasMore: false },
      } as Partial<MeetingsListMeeting>),
    ]);
    expect(screen.queryByTestId("meeting-row-attendees")).toBeNull();
  });
});
