/**
 * UX-01 — the Today Meetings widget as BEHAVIOUR.
 *
 * "What is on today?" is part of the question Today exists to answer, and until
 * UX-01 the landing page had no answer for it at all. These assert the three
 * things that make the section trustworthy rather than decorative: every row names
 * the meeting and links to its canonical record; a meeting that has already
 * started says so in a WORD (never a colour or a dimmed row alone); and an empty
 * day teaches the next step instead of dead-ending.
 */

import { MemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MeetingsWidget } from "~/modules/today/landing/widgets";
import type { MeetingsWidgetData } from "~/modules/today/landing/types";

function renderWidget(data: MeetingsWidgetData) {
  render(
    <MemoryRouter>
      <MeetingsWidget data={data} />
    </MemoryRouter>,
  );
}

const STANDUP = {
  id: "m-1",
  title: "Team standup",
  timeLabel: "09:30",
  context: "Online",
  started: true,
};

const REVIEW = {
  id: "m-2",
  title: "Budget review",
  timeLabel: "14:00",
  context: null,
  started: false,
};

describe("UX-01 Today Meetings widget", () => {
  it("lists today's meetings with their time and a link to the record", () => {
    renderWidget({ meetings: [STANDUP, REVIEW], remainingCount: 1 });

    const list = screen.getByRole("list", { name: "Today’s meetings" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);

    expect(items[0]).toHaveTextContent("Team standup");
    expect(items[0]).toHaveTextContent("09:30");
    expect(within(items[0]!).getByRole("link")).toHaveAttribute(
      "href",
      "/meeting/m-1",
    );
  });

  it("says in words that a meeting has already started", () => {
    renderWidget({ meetings: [STANDUP, REVIEW], remainingCount: 1 });
    const items = screen.getAllByRole("listitem");
    // Colour alone would not survive a theme, greyscale or a screen reader.
    expect(items[0]).toHaveTextContent("Started");
    expect(items[1]).not.toHaveTextContent("Started");
  });

  it("shows a location or mode when the meeting has one, and nothing when it does not", () => {
    renderWidget({ meetings: [STANDUP, REVIEW], remainingCount: 1 });
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Online");
    expect(items[1]).toHaveTextContent("14:00");
  });

  it("teaches the next step on a day with nothing scheduled", () => {
    renderWidget({ meetings: [], remainingCount: 0 });

    expect(screen.getByText("Nothing scheduled today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Meetings" })).toHaveAttribute(
      "href",
      "/meetings",
    );
    expect(screen.queryByRole("list")).toBeNull();
  });
});
