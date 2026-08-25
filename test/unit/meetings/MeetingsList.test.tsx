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
  type SerializedMeeting,
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

function meeting(over: Partial<SerializedMeeting> = {}): SerializedMeeting {
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
    agendaMarkdown: "",
    notesMarkdown: "",
    items: [],
    archivedAt: null,
    heldAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    deletedAt: null,
    ...over,
  } as SerializedMeeting;
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
     * REFINE — the count is INSIDE the heading, so it is inside the heading's
     * NAME.
     *
     * The day heading took the Tasks group-heading language ("Tomorrow · 1"),
     * and the count is a real part of it rather than an annotation beside it —
     * a heading a screen reader announces as "Tomorrow" while the eye reads
     * "Tomorrow · 1" is two different headings. The middot is `aria-hidden`, so
     * the accessible name is the words and the figure with one space between
     * them.
     */
    expect(
      screen.getByRole("heading", { level: 2, name: "Today 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Tomorrow 1" }),
    ).toBeInTheDocument();
  });

  it("names an absolute day beyond the relative window", () => {
    renderList([
      meeting({ id: "m3", startsAt: "2026-08-13T00:00:00.000Z" }), // 10:00 Sydney, Thu 13th
    ]);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Thursday, 13 August 2026 1",
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
      screen.getByRole("heading", { level: 2, name: "Today 1" }),
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
        attendees: { names: ["Mira Chen", "Anna Ruiz"], more: 0 },
      } as Partial<MeetingsListMeeting>),
    ]);
    expect(screen.getByTestId("meeting-row-attendees")).toHaveTextContent(
      "Mira Chen, Anna Ruiz",
    );
  });

  it("says how many MORE there are rather than a partial truth", () => {
    // A row that named three of nine and stopped would be a true sentence that
    // reads as the whole list.
    renderList([
      meeting({
        attendees: { names: ["Mira Chen", "Anna Ruiz", "Tomas Lind"], more: 6 },
      } as Partial<MeetingsListMeeting>),
    ]);
    expect(screen.getByTestId("meeting-row-attendees")).toHaveTextContent(
      "Mira Chen, Anna Ruiz, Tomas Lind +6",
    );
  });

  it("says NOTHING when the page did not resolve any, rather than an empty label", () => {
    // `null` covers both "this meeting has no attendees" and "the relationship
    // read failed", and both must draw an honest absence rather than "with:".
    renderList([meeting()]);
    expect(screen.queryByTestId("meeting-row-attendees")).toBeNull();

    renderList([
      meeting({
        attendees: { names: [], more: 0 },
      } as Partial<MeetingsListMeeting>),
    ]);
    expect(screen.queryByTestId("meeting-row-attendees")).toBeNull();
  });
});
