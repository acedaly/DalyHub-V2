/**
 * TODAY-01 — the Today dashboard, exercised as behaviour (not structure).
 *
 * It composes shared parts, so these tests assert what the owner experiences: the
 * six sections render, upcoming items are chronological, a focus task completes
 * optimistically, quick capture is inert-but-structured, and a card opens the DS-03
 * Drawer over the pane. Rendered inside a MemoryRouter + DrawerProvider — the same
 * frame the route provides.
 */

import { MemoryRouter } from "react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DrawerProvider } from "~/shared/drawer";
import type { DrawerEntry } from "~/shared/drawer";

import { TODAY_FIXTURE } from "~/modules/today/fixtures";
import { TodayDashboard } from "~/modules/today/TodayDashboard";
import { createTodayDrawerRenderer } from "~/modules/today/TodayDrawer";

function renderToday() {
  return render(
    <MemoryRouter>
      <DrawerProvider renderDrawer={createTodayDrawerRenderer(TODAY_FIXTURE)}>
        <TodayDashboard data={TODAY_FIXTURE} date="Sunday 19 July 2026" />
      </DrawerProvider>
    </MemoryRouter>,
  );
}

describe("TODAY-01 TodayDashboard", () => {
  it("renders the Today pane header with the current date", () => {
    renderToday();
    expect(
      screen.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sunday 19 July 2026")).toBeInTheDocument();
  });

  it("renders all six sections", () => {
    renderToday();
    for (const label of [
      /Today's focus/,
      /^Upcoming/,
      /Continue working/,
      /Recent notes/,
      /Daily timeline/,
      /Quick capture/,
    ]) {
      expect(
        screen.getByRole("heading", { level: 2, name: label }),
      ).toBeInTheDocument();
    }
  });

  it("shows focus tasks with a complete action", () => {
    renderToday();
    const focus = screen.getByRole("region", { name: /Today's focus/ });
    expect(within(focus).getByText("Finish PX-02")).toBeInTheDocument();
    expect(within(focus).getByText("Review PR")).toBeInTheDocument();
    expect(within(focus).getByText("Gym")).toBeInTheDocument();
    expect(
      within(focus).getAllByRole("button", { name: "Complete" }).length,
    ).toBe(3);
  });

  it("orders upcoming items chronologically regardless of source order", () => {
    renderToday();
    const upcoming = screen.getByRole("region", { name: /^Upcoming/ });
    const titles = within(upcoming)
      .getAllByRole("heading", { level: 3 })
      .map((node) => node.textContent);
    expect(titles).toEqual([
      "Design standup", // 09:00
      "Water the plants", // 11:30
      "1:1 with Sam", // 14:30
      "Send signed contract", // 17:00
    ]);
  });

  it("completes a focus task optimistically (done pill + reopen)", () => {
    renderToday();
    const focus = screen.getByRole("region", { name: /Today's focus/ });
    const firstComplete = within(focus).getAllByRole("button", {
      name: "Complete",
    })[0];
    fireEvent.click(firstComplete);
    expect(within(focus).getByText("Done")).toBeInTheDocument();
    expect(
      within(focus).getByRole("button", { name: "Reopen" }),
    ).toBeInTheDocument();
  });

  it("shows projects with progress and recent notes with snippets", () => {
    renderToday();
    const projects = screen.getByRole("region", { name: /Continue working/ });
    expect(within(projects).getByText("DalyHub V2")).toBeInTheDocument();
    expect(within(projects).getAllByRole("progressbar").length).toBeGreaterThan(
      0,
    );

    const notes = screen.getByRole("region", { name: /Recent notes/ });
    expect(within(notes).getByText("Standup notes")).toBeInTheDocument();
    expect(within(notes).getByText(/Ship PX-02/)).toBeInTheDocument();
  });

  it("renders the daily timeline in chronological order", () => {
    renderToday();
    const timeline = screen.getByRole("region", { name: /Daily timeline/ });
    const times = within(timeline)
      .getAllByText(/^\d\d:\d\d$/)
      .map((node) => node.textContent);
    expect(times).toEqual(["08:10", "09:00", "11:15", "13:00"]);
  });

  it("quick capture keeps the draft and states plainly it is not saved", () => {
    renderToday();
    const field = screen.getByPlaceholderText(
      "What needs your attention?",
    ) as HTMLTextAreaElement;
    const capture = screen.getByRole("button", { name: "Capture" });

    // Blank submission remains prevented.
    expect(capture).toBeDisabled();

    fireEvent.change(field, { target: { value: "Call the plumber" } });
    expect(capture).toBeEnabled();
    fireEvent.click(capture);

    // The draft is preserved (nothing is stored, so nothing is discarded)...
    expect(field.value).toBe("Call the plumber");
    // ...and the notice states plainly that nothing was saved — never claiming
    // the content was captured/saved/stored.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/not connected/i);
    expect(status).toHaveTextContent(/has not been saved/i);
    expect(status.textContent ?? "").not.toMatch(
      /\bcaptured\b|has been saved|was saved|stored/i,
    );

    // Editing the field clears the previous status message.
    fireEvent.change(field, { target: { value: "Call the plumber tomorrow" } });
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("opens a record in the Drawer when a card is activated", () => {
    renderToday();
    const focus = screen.getByRole("region", { name: /Today's focus/ });
    fireEvent.click(within(focus).getByRole("link", { name: "Finish PX-02" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { level: 3, name: "Finish PX-02" }),
    ).toBeInTheDocument();
  });

  it("labels a deadline as Deadline in the drawer (matching its card)", () => {
    const renderDrawer = createTodayDrawerRenderer(TODAY_FIXTURE);
    const result = renderDrawer({ key: "upcoming:u-contract" } as DrawerEntry);
    expect(result).not.toBeNull();
    render(<MemoryRouter>{result?.children}</MemoryRouter>);
    expect(screen.getByText("Deadline")).toBeInTheDocument();
    expect(screen.queryByText("Reminder")).not.toBeInTheDocument();
  });
});
