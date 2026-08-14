import { RouterProvider, createMemoryRouter, useLocation } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DiaryWorkspaceView,
  type DiaryWorkspaceViewProps,
} from "~/modules/diary/DiaryWorkspace";
import type { DiaryEntryEditData } from "~/modules/diary/routes/entry";
import type {
  SerializedDayGroup,
  SerializedDiaryEntry,
} from "~/modules/diary/diary-view";
import { FeedbackProvider } from "~/shared/feedback";

/**
 * DIARY-01B — the workspace as behaviour: a coherent toolbar (mode tabs, Day-mode
 * navigator, type filter, one New-entry action), capture launched on demand (button
 * + `c` shortcut) rather than a permanent panel, timeline selection opening the
 * docked details, and the empty / filtered-empty states.
 */

function entry(over: Partial<SerializedDiaryEntry> = {}): SerializedDiaryEntry {
  return {
    id: "d1",
    entryType: "meeting",
    entryTypeLabel: "Meeting",
    title: "Standup",
    bodySource: null,
    bodyIsLong: false,
    occurredAtIso: "2026-07-19T04:30:00.000Z",
    occurredTimeLabel: "14:30",
    backdated: false,
    ...over,
  };
}

function group(over: Partial<SerializedDayGroup> = {}): SerializedDayGroup {
  return { day: "2026-07-19", entries: [entry()], ...over };
}

function entryData(): DiaryEntryEditData {
  return {
    id: "d1",
    title: "Standup",
    entryType: "meeting",
    entryTypeLabel: "Meeting",
    bodySource: "",
    occurredAtIso: "2026-07-19T04:30:00.000Z",
    occurredLocal: "2026-07-19T14:30",
    occurredDateLabel: "19 July 2026",
    occurredTimeLabel: "14:30",
    backdated: false,
    createdLabel: "19 July 2026 at 14:30",
    updatedLabel: "19 July 2026 at 14:30",
    edited: false,
    timezone: "Australia/Sydney",
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="search">{location.search}</output>;
}

function renderWorkspace(
  over: Partial<DiaryWorkspaceViewProps> = {},
  url = "/diary",
) {
  const props: DiaryWorkspaceViewProps = {
    mode: "day",
    groups: [group()],
    nextCursor: null,
    typeCounts: null,
    failed: false,
    displayTimeZone: "Australia/Sydney",
    nowIso: "2026-07-19T02:00:00.000Z",
    todayKey: "2026-07-19",
    selectedDate: "2026-07-19",
    activeTypes: [],
    isFiltered: false,
    ...over,
  };
  const router = createMemoryRouter(
    [
      {
        path: "/diary",
        element: (
          <FeedbackProvider>
            <DiaryWorkspaceView {...props} />
            <LocationProbe />
          </FeedbackProvider>
        ),
      },
      { path: "/diary/:entryId", loader: () => ({ entry: entryData() }) },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
}

describe("Diary workspace", () => {
  it("renders one coherent toolbar in Day mode", () => {
    renderWorkspace();
    expect(
      screen.getByRole("heading", { level: 1, name: "Diary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Diary views" }),
    ).toBeInTheDocument();
    /*
     * UIX-04 §18 — the day navigator is a week STRIP of links, so it is a
     * `navigation` landmark named "Select a day" rather than a `group` of
     * steppers named "Selected day". Same job, and now a landmark a screen
     * reader can jump to.
     */
    expect(
      screen.getByRole("navigation", { name: "Select a day" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Filter by type" }),
    ).toBeInTheDocument();
    // The header primary action plus the mobile floating action both offer it.
    expect(
      screen.getAllByRole("button", { name: "New diary entry" }).length,
    ).toBeGreaterThanOrEqual(1);
    // The old always-open capture card is gone (capture is launched on demand).
    expect(screen.queryByRole("form", { name: "Quick capture" })).toBeNull();
  });

  it("launches capture from the New diary entry button", async () => {
    renderWorkspace();
    fireEvent.click(
      screen.getAllByRole("button", { name: "New diary entry" })[0],
    );
    expect(
      await screen.findByRole("form", { name: "Quick capture" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("search").textContent).toContain("inspector=new");
  });

  it("launches capture from the `c` keyboard shortcut", async () => {
    renderWorkspace();
    fireEvent.keyDown(document.body, { key: "c" });
    expect(
      await screen.findByRole("form", { name: "Quick capture" }),
    ).toBeInTheDocument();
  });

  it("opens the docked details when a timeline entry is selected", async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Standup" }));
    // The read state renders (its Edit action is unique to the panel).
    expect(
      await screen.findByRole("button", { name: "Edit entry" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("search").textContent).toContain(
      "inspector=view%3Ad1",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Standup" })).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
  });

  it("shows the Day-mode empty state with a capture action", () => {
    renderWorkspace({ groups: [] });
    expect(
      screen.getByText("Nothing recorded on this day"),
    ).toBeInTheDocument();
  });

  it("shows the Timeline empty state", () => {
    renderWorkspace({ mode: "timeline", groups: [] }, "/diary?mode=timeline");
    expect(screen.getByText("Your diary is empty")).toBeInTheDocument();
    // No day navigator in Timeline mode.
    expect(screen.queryByRole("group", { name: "Selected day" })).toBeNull();
  });

  it("shows a distinct filtered-empty state with a clear-filter link", () => {
    renderWorkspace(
      { groups: [], isFiltered: true, activeTypes: ["meeting"] },
      "/diary?type=meeting",
    );
    expect(
      screen.getByText("No entries match this filter"),
    ).toBeInTheDocument();
    const clear = screen.getByRole("link", { name: "Clear filter" });
    expect(clear.getAttribute("href")).not.toContain("type");
  });
});
