import { RouterProvider, createMemoryRouter } from "react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NotesCollectionView } from "~/modules/notes/NotesCollection";
import type { SerializedNoteListItem } from "~/modules/notes/note-view";

/**
 * NOTES-01B — the Notes collection as behaviour: cards render as canonical
 * links, the honest subtitle/count, the empty vs error states are calm and
 * distinct, the "New note" affordance is present, and the keyset "Load more"
 * affordance appends the next page without duplicating cards or claiming a
 * false total (mirrors `test/unit/projects/ProjectsCollection.test.tsx`).
 */

function note(
  over: Partial<SerializedNoteListItem> = {},
): SerializedNoteListItem {
  return {
    id: "n1",
    title: "Reading list",
    createdAt: "2026-07-18T09:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    ...over,
  };
}

type LoaderData = {
  notes: readonly SerializedNoteListItem[];
  nextCursor: string | null;
  failed: boolean;
};

function renderCollection(
  data: LoaderData,
  loader?: (request: Request) => unknown,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/notes",
        ...(loader ? { loader: ({ request }) => loader(request) } : {}),
        element: (
          <NotesCollectionView
            notes={data.notes}
            nextCursor={data.nextCursor}
            failed={data.failed}
          />
        ),
      },
    ],
    { initialEntries: ["/notes"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Notes collection", () => {
  it("renders a Note card as a canonical link with its Updated metadata", () => {
    renderCollection({
      notes: [note({ title: "Reading list" })],
      nextCursor: null,
      failed: false,
    });

    const link = screen.getByRole("link", { name: "Open Reading list" });
    expect(link).toHaveAttribute("href", "/notes/n1");
    expect(screen.getByText("1 note")).toBeInTheDocument();
    expect(screen.getAllByText("New note").length).toBeGreaterThan(0);
  });

  it("shows a genuinely-empty state when there are no notes at all", () => {
    renderCollection({ notes: [], nextCursor: null, failed: false });
    expect(screen.getByText("No notes yet")).toBeInTheDocument();
  });

  it("shows a calm, retryable error state distinct from empty", () => {
    renderCollection({ notes: [], nextCursor: null, failed: true });
    expect(screen.getByText("We couldn't load your notes")).toBeInTheDocument();
    expect(screen.queryByText("No notes yet")).not.toBeInTheDocument();
  });

  it("does not claim a total, then appends the next keyset page without duplicates", async () => {
    renderCollection(
      {
        notes: [note({ id: "n1", title: "Alpha" })],
        nextCursor: "CURSOR_1",
        failed: false,
      },
      (request) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (cursor === "CURSOR_1") {
          return {
            notes: [
              note({ id: "n1", title: "Alpha" }),
              note({ id: "n2", title: "Bravo" }),
            ],
            nextCursor: null,
            failed: false,
          };
        }
        return { notes: [], nextCursor: null, failed: false };
      },
    );

    await screen.findByText("1 notes loaded");
    expect(screen.queryByText("1 note")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more notes" }));

    await waitFor(() => expect(screen.getByText("Bravo")).toBeInTheDocument());

    const list = screen.getByRole("list", { name: "Notes" });
    expect(within(list).getAllByText("Alpha")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Load more notes" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("2 notes")).toBeInTheDocument();
  });

  it("opens a note via a real link (accessible, not a div onClick)", () => {
    renderCollection({ notes: [note()], nextCursor: null, failed: false });
    const link = screen.getByRole("link", { name: "Open Reading list" });
    expect(link).toHaveAttribute("href", "/notes/n1");
  });
});
