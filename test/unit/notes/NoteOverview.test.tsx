import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { NoteOverview } from "~/modules/notes/NoteOverview";
import type {
  SerializedNoteDetails,
  SerializedNoteOverview,
} from "~/modules/notes/note-view";

/**
 * NOTES-01B — the canonical Note record: generic entity identity (title,
 * Rename), the minimal "Note"/"Activity" tab structure (no premature empty
 * tab for a future capability), and no bespoke Notes-only header.
 */

function overview(
  over: Partial<SerializedNoteOverview> = {},
): SerializedNoteOverview {
  return {
    id: "n1",
    title: "Reading list",
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    ...over,
  };
}

function details(
  over: Partial<SerializedNoteDetails> = {},
): SerializedNoteDetails {
  return { content: "", contentUpdatedAt: null, ...over };
}

function renderInRouter(node: ReactElement) {
  const router = createMemoryRouter([{ path: "/", element: node }], {
    initialEntries: ["/"],
  });
  return render(<RouterProvider router={router} />);
}

describe("NoteOverview", () => {
  it("renders the generic entity identity (title, type label) and a Rename action", () => {
    const onRename = vi.fn();
    renderInRouter(
      <NoteOverview
        overview={overview({ title: "Reading list" })}
        details={details()}
        onRename={onRename}
        onSaved={() => {}}
        activityTab={<div>Activity content</div>}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Reading list" }),
    ).toBeInTheDocument();
    // "Note" also labels the tab and the editor field, so scope the type-label
    // assertion to the record header's own identity marker.
    expect(document.querySelector(".record-type__label")).toHaveTextContent(
      "Note",
    );

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it("exposes exactly the Note and Activity tabs — no empty tab for a future capability", () => {
    renderInRouter(
      <NoteOverview
        overview={overview()}
        details={details()}
        onRename={() => {}}
        onSaved={() => {}}
        activityTab={<div>Activity content</div>}
      />,
    );

    const tablist = screen.getByRole("tablist");
    const tabs = screen.getAllByRole("tab");
    expect(tablist).toBeInTheDocument();
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Note", "Activity"]);
  });

  it("shows the Markdown source editor in the Note tab by default", () => {
    renderInRouter(
      <NoteOverview
        overview={overview()}
        details={details({ content: "# Hello" })}
        onRename={() => {}}
        onSaved={() => {}}
        activityTab={<div>Activity content</div>}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue(
      "# Hello",
    );
  });

  it("switches to the Activity tab and renders its content", () => {
    renderInRouter(
      <NoteOverview
        overview={overview()}
        details={details()}
        onRename={() => {}}
        onSaved={() => {}}
        activityTab={<div>Activity content</div>}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(screen.getByText("Activity content")).toBeInTheDocument();
  });
});
