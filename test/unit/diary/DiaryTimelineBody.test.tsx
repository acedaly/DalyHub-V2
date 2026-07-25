import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DiaryTimelineBody } from "~/modules/diary/DiaryTimelineBody";
import type {
  SerializedDayGroup,
  SerializedDiaryEntry,
} from "~/modules/diary/diary-view";

/**
 * DIARY-01B — the visual timeline body as behaviour: compact rows aligned to time
 * with an icon node, a strong title, an optional one-line excerpt and a restrained
 * type badge; day headings only in Timeline mode; a selected row marked with
 * `aria-current`; and separately-operable select/edit actions (no nested controls).
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

function renderBody(
  props: Partial<React.ComponentProps<typeof DiaryTimelineBody>> = {},
) {
  const onSelect = vi.fn();
  const onEdit = vi.fn();
  render(
    <DiaryTimelineBody
      groups={[group()]}
      mode="day"
      todayKey="2026-07-19"
      selectedId={null}
      onSelect={onSelect}
      onEdit={onEdit}
      {...props}
    />,
  );
  return { onSelect, onEdit };
}

describe("Diary timeline body", () => {
  it("shows the time, type badge and title for each entry", () => {
    renderBody({
      groups: [
        group({
          entries: [entry({ title: "Kickoff", occurredTimeLabel: "09:15" })],
        }),
      ],
    });
    const timeline = screen.getByRole("list", { name: "Diary timeline" });
    expect(within(timeline).getByText("09:15")).toBeInTheDocument();
    expect(within(timeline).getByText("Meeting")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Kickoff" }),
    ).toBeInTheDocument();
  });

  it("renders a one-line excerpt from the body but never the full markdown", () => {
    renderBody({
      groups: [
        group({
          entries: [
            entry({
              bodySource: "# Heading\n\nA **bold** reason to remember.",
            }),
          ],
        }),
      ],
    });
    expect(
      screen.getByText(/A \*\*bold\*\* reason to remember\./),
    ).toBeInTheDocument();
  });

  it("shows a backdated marker only when the entry was backdated", () => {
    renderBody({ groups: [group({ entries: [entry({ backdated: true })] })] });
    expect(screen.getByText("Backdated")).toBeInTheDocument();
  });

  it("keeps the day heading for the outline but hides it visually in Day mode", () => {
    const { rerender } = render(
      <DiaryTimelineBody
        groups={[group()]}
        mode="day"
        todayKey="2026-07-19"
        selectedId={null}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    // The h2 stays in the outline (h1 → h2 → h3, no skipped level) but is visually
    // hidden — the date lives in the navigator in Day mode.
    const dayHeading = screen.getByRole("heading", { level: 2, name: "Today" });
    expect(dayHeading).toHaveClass("dh-visually-hidden");

    rerender(
      <DiaryTimelineBody
        groups={[group()]}
        mode="timeline"
        todayKey="2026-07-19"
        selectedId={null}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Today" }),
    ).not.toHaveClass("dh-visually-hidden");
  });

  it("marks the selected row with aria-current", () => {
    renderBody({
      groups: [group({ entries: [entry({ id: "sel", title: "Chosen" })] })],
      selectedId: "sel",
    });
    expect(screen.getByRole("button", { name: "Chosen" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("fires onSelect from the title and onEdit from a separate edit control", () => {
    const { onSelect, onEdit } = renderBody({
      groups: [group({ entries: [entry({ id: "x", title: "Open me" })] })],
    });
    fireEvent.click(screen.getByRole("button", { name: "Open me" }));
    expect(onSelect).toHaveBeenCalledWith("x");
    fireEvent.click(screen.getByRole("button", { name: "Edit Open me" }));
    expect(onEdit).toHaveBeenCalledWith("x");
  });
});
