import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NotesList } from "~/modules/notes/NotesList";
import { NotesRail } from "~/modules/notes/NotesRail";
import type { SerializedNoteListItem } from "~/modules/notes/note-view";

/**
 * UIX-04 §5/§6 — the Notes list and the rail beside an open note.
 *
 * Both are lists of documents, and what is asserted is what §6 says a row may
 * show: a title, a preview and an updated date. The rail additionally has to
 * carry the SELECTED state to assistive tech, not only to the eye.
 */

function note(
  over: Partial<SerializedNoteListItem> = {},
): SerializedNoteListItem {
  return {
    id: "n1",
    title: "Direct-entry pathway",
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-08T09:00:00.000Z",
    effectiveUpdatedAt: "2026-08-08T09:00:00.000Z",
    tags: [],
    archived: false,
    excerpt: "The current pathway assumes every student arrives…",
    linkCount: 0,
    ...over,
  };
}

function renderIn(element: React.ReactElement, at = "/notes") {
  const router = createMemoryRouter(
    [
      { path: "/notes", element },
      { path: "/notes/:noteId", element },
    ],
    { initialEntries: [at] },
  );
  render(<RouterProvider router={router} />);
}

describe("NotesList", () => {
  it("renders one row per note, named for the note itself", () => {
    renderIn(
      <NotesList
        notes={[note(), note({ id: "n2", title: "Standup notes" })]}
        ariaLabel="Notes"
      />,
    );
    const list = screen.getByRole("list", { name: "Notes" });
    expect(list).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Direct-entry pathway/ }),
    ).toHaveAttribute("href", "/notes/n1");
    expect(screen.getByRole("link", { name: /Standup notes/ })).toHaveAttribute(
      "href",
      "/notes/n2",
    );
  });

  it("shows the preview, the tags and the updated date — and nothing else", () => {
    renderIn(
      <NotesList
        notes={[note({ tags: ["oppo", "policy"] })]}
        ariaLabel="Notes"
      />,
    );
    expect(
      screen.getByText("The current pathway assumes every student arrives…"),
    ).toBeInTheDocument();
    // CONVERGE-01 §6 — tags are CHIPS in a named list, not a comma-joined
    // string. Each is a countable object rather than a sentence fragment.
    const tags = screen.getByRole("list", { name: /^Tags on / });
    expect(
      within(tags)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["oppo", "policy"]);
    expect(screen.getByText("8 Aug 2026")).toBeInTheDocument();
    // The gallery's per-row noise, gone: no type label, no link count.
    expect(screen.queryByText("Note")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Links/)).not.toBeInTheDocument();
  });

  /*
   * CONVERGE-01 §6 — a note may carry any number of tags, and the row's metadata
   * column has a fixed width. The bound is stated, never silent.
   */
  it("bounds the chips and states the remainder rather than truncating silently", () => {
    renderIn(
      <NotesList
        notes={[note({ tags: ["a", "b", "c", "d", "e"] })]}
        ariaLabel="Notes"
      />,
    );
    const items = within(
      screen.getByRole("list", { name: /^Tags on / }),
    ).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "a",
      "b",
      "c",
      "+2",
    ]);
    // The two that are not drawn are still NAMED, for a reader who cannot see
    // the row at all.
    expect(screen.getByLabelText("2 more: d, e")).toBeInTheDocument();
  });

  it("draws no tag list at all for an untagged note", () => {
    renderIn(<NotesList notes={[note({ tags: [] })]} ariaLabel="Notes" />);
    expect(screen.queryByRole("list", { name: /^Tags on / })).toBeNull();
  });

  it("says so in WORDS when a note is archived", () => {
    renderIn(
      <NotesList notes={[note({ archived: true })]} ariaLabel="Notes" />,
    );
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("names an empty body rather than leaving the line blank", () => {
    renderIn(<NotesList notes={[note({ excerpt: "" })]} ariaLabel="Notes" />);
    expect(screen.getByText("No additional text")).toBeInTheDocument();
  });

  it("offers Restore and NO open target in the Deleted view", () => {
    // A deleted entity's canonical route 404s everywhere in the kernel, so a
    // link to it would be a link to a 404.
    renderIn(
      <NotesList
        notes={[note()]}
        ariaLabel="Deleted notes"
        onRestore={() => {}}
        pendingIds={new Set()}
      />,
    );
    expect(
      screen.queryByRole("link", { name: /Direct-entry pathway/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });
});

describe("NotesRail", () => {
  it("is a named navigation landmark of note links", () => {
    renderIn(
      <NotesRail
        notes={[note(), note({ id: "n2", title: "Standup notes" })]}
        hasMore={false}
      />,
    );
    expect(
      screen.getByRole("navigation", { name: "Notes" }),
    ).toBeInTheDocument();
  });

  it("marks the OPEN note with aria-current, and only that one", () => {
    // The ROUTE is the selection: the rail holds no selected-id state, so this
    // is asserted by rendering it at the note's own URL.
    renderIn(
      <NotesRail
        notes={[note(), note({ id: "n2", title: "Standup notes" })]}
        hasMore={false}
      />,
      "/notes/n2",
    );
    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", "/notes/n2");
  });

  it("says the list is bounded when it is", () => {
    renderIn(<NotesRail notes={[note()]} hasMore={true} />);
    expect(screen.getByRole("link", { name: "All notes" })).toHaveAttribute(
      "href",
      "/notes",
    );
  });
});
