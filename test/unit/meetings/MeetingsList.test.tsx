import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MeetingsList } from "~/modules/meetings/MeetingsList";
import {
  formatMeetingDayGroup,
  formatMeetingTime,
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
  meetings: readonly SerializedMeeting[],
  view = "upcoming",
  todayKey = TODAY,
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

  it("resolves the day in the MEETING's zone, so a late instant is not the wrong date", () => {
    // 22:00 UTC on the 10th is 08:00 on the 11th in Sydney.
    const at = "2026-08-10T22:00:00.000Z";
    expect(formatMeetingDayGroup(at, SYDNEY, "2026-08-11")).toBe("Today");
    expect(formatMeetingTime(at, SYDNEY)).toBe("8:00 am");
  });

  it("formats midnight and noon without a zero or a 24th hour", () => {
    expect(formatMeetingTime("2026-08-10T14:00:00.000Z", SYDNEY)).toBe(
      "12:00 am",
    );
    expect(formatMeetingTime("2026-08-10T02:00:00.000Z", SYDNEY)).toBe(
      "12:00 pm",
    );
  });
});
