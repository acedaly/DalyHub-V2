import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DiaryTimelineView,
  type DiaryTimelineViewProps,
} from "~/modules/diary/DiaryTimeline";
import type {
  SerializedDayGroup,
  SerializedDiaryEntry,
} from "~/modules/diary/diary-view";
import { FeedbackProvider } from "~/shared/feedback";

/**
 * DIARY-01 — the Timeline as behaviour: day grouping with friendly headings,
 * immediate type/time/title, the safe fallback label for an unknown type, the
 * distinct empty vs filtered-empty states, the collapsed/expanded Markdown body,
 * and the URL-backed type filter that resets pagination (drops `cursor`).
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

function renderTimeline(
  over: Partial<DiaryTimelineViewProps> = {},
  initialUrl = "/diary",
) {
  const props: DiaryTimelineViewProps = {
    groups: [],
    nextCursor: null,
    failed: false,
    displayTimeZone: "Australia/Sydney",
    nowIso: "2026-07-19T02:00:00.000Z",
    todayKey: "2026-07-19",
    activeTypes: [],
    from: "",
    to: "",
    isFiltered: false,
    ...over,
  };
  const router = createMemoryRouter(
    [
      {
        path: "/diary",
        element: (
          <FeedbackProvider>
            <DiaryTimelineView {...props} />
          </FeedbackProvider>
        ),
      },
    ],
    { initialEntries: [initialUrl] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Diary Timeline presentation", () => {
  it("groups entries under friendly day headings with time, type and title", () => {
    renderTimeline({
      groups: [
        group({
          day: "2026-07-19",
          entries: [
            entry({ id: "a", title: "Kickoff", occurredTimeLabel: "09:15" }),
          ],
        }),
        group({
          day: "2026-07-18",
          entries: [
            entry({ id: "b", title: "Retro", entryTypeLabel: "Reflection" }),
          ],
        }),
      ],
    });

    expect(
      screen.getByRole("heading", { level: 2, name: "Today" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Yesterday" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Kickoff" }),
    ).toBeInTheDocument();
    // Scope type/time assertions to the timeline (the filter also lists types).
    const timeline = screen.getByRole("list", { name: "Diary timeline" });
    expect(within(timeline).getByText("09:15")).toBeInTheDocument();
    expect(within(timeline).getByText("Reflection")).toBeInTheDocument();
  });

  it("renders an absolute date heading for older days", () => {
    renderTimeline({
      groups: [group({ day: "2026-07-15", entries: [entry({ id: "c" })] })],
    });
    expect(
      screen.getByRole("heading", { level: 2, name: /15 July 2026$/ }),
    ).toBeInTheDocument();
  });

  it("renders a valid-but-unknown entry type through its safe fallback label", () => {
    renderTimeline({
      groups: [
        group({
          entries: [
            entry({
              id: "x",
              entryType: "custom.workout",
              entryTypeLabel: "Workout",
            }),
          ],
        }),
      ],
    });
    expect(screen.getByText("Workout")).toBeInTheDocument();
  });

  it("shows a backdated marker only when the entry was backdated", () => {
    renderTimeline({
      groups: [group({ entries: [entry({ backdated: true })] })],
    });
    expect(screen.getByText("Backdated")).toBeInTheDocument();
  });

  it("shows the empty state (directing to capture) for an empty, unfiltered diary", () => {
    renderTimeline({ groups: [], isFiltered: false });
    expect(screen.getByText("Your diary is empty")).toBeInTheDocument();
    // Capture stays reachable even when empty.
    expect(screen.getByRole("button", { name: "Capture" })).toBeInTheDocument();
  });

  it("shows a distinct filtered-empty state with a clear-filter action", () => {
    renderTimeline({
      groups: [],
      isFiltered: true,
      activeTypes: ["meeting"],
    });
    expect(
      screen.getByText("No entries match this filter"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filter" })).toHaveAttribute(
      "href",
      "/diary",
    );
  });

  it("collapses a long body behind a Show more / Show less disclosure", () => {
    renderTimeline({
      groups: [
        group({
          entries: [
            entry({
              id: "long",
              bodySource: "x".repeat(400),
              bodyIsLong: true,
            }),
          ],
        }),
      ],
    });
    const showMore = screen.getByRole("button", { name: "Show more" });
    expect(showMore).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(showMore);
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});

describe("Diary type filter", () => {
  it("marks the active type and drops the cursor when changing scope", () => {
    renderTimeline(
      { groups: [group()], activeTypes: ["meeting"], isFiltered: true },
      "/diary?cursor=abc&type=meeting",
    );

    const filter = screen.getByRole("group", { name: "Filter by type" });
    const meeting = within(filter).getByRole("link", { name: "Meeting" });
    expect(meeting).toHaveAttribute("aria-current", "true");

    // Switching to another type drops the stale cursor (pagination reset).
    const idea = within(filter).getByRole("link", { name: "Idea" });
    const ideaHref = idea.getAttribute("href") ?? "";
    expect(ideaHref).toContain("type=idea");
    expect(ideaHref).not.toContain("cursor");

    // "All" clears the filter and the cursor.
    const all = within(filter).getByRole("link", { name: "All" });
    const allHref = all.getAttribute("href") ?? "";
    expect(allHref).not.toContain("type");
    expect(allHref).not.toContain("cursor");
  });
});
