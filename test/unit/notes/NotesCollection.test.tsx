import { useState } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  NotesCollectionView,
  type NoteCollectionState,
} from "~/modules/notes/NotesCollection";
import type { SerializedNoteListItem } from "~/modules/notes/note-view";
import { FeedbackProvider } from "~/shared/feedback";

/**
 * NOTES-01B/NOTES-01C — the Notes collection as behaviour: cards render as
 * canonical links, the honest subtitle/count, the empty vs error states are
 * calm and distinct, the "New note" affordance is present, the keyset "Load
 * more" affordance appends the next page without duplicating cards or
 * claiming a false total (mirrors `test/unit/projects/ProjectsCollection.test.tsx`),
 * and NOTES-01C's Active/Deleted lifecycle filter: the Deleted view has no
 * "New note" action, a distinct empty state, and each row offers a one-click
 * Restore instead of an open link (its canonical route 404s once deleted).
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
  state?: NoteCollectionState;
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
          <FeedbackProvider>
            <NotesCollectionView
              notes={data.notes}
              nextCursor={data.nextCursor}
              state={data.state ?? "active"}
              failed={data.failed}
            />
          </FeedbackProvider>
        ),
      },
    ],
    { initialEntries: ["/notes"] },
  );
  return render(<RouterProvider router={router} />);
}

/**
 * Like `renderCollection`, but the props `NotesCollectionView` receives are
 * driven by local React state (`setData`) rather than frozen at render time —
 * needed to simulate what a real `?state=active|deleted` navigation does
 * (swap `notes`/`nextCursor`/`state` via fresh loader data) at a precise,
 * test-controlled moment, independent of whatever a same-path "Load more"
 * fetch is doing.
 */
function renderStatefulCollection(
  initial: LoaderData,
  loader: (request: Request) => unknown,
) {
  let setData!: (data: LoaderData) => void;
  function Harness() {
    const [data, setDataState] = useState(initial);
    setData = setDataState;
    return (
      <NotesCollectionView
        notes={data.notes}
        nextCursor={data.nextCursor}
        state={data.state ?? "active"}
        failed={data.failed}
      />
    );
  }
  const router = createMemoryRouter(
    [
      {
        path: "/notes",
        loader: ({ request }) => loader(request),
        element: (
          <FeedbackProvider>
            <Harness />
          </FeedbackProvider>
        ),
      },
    ],
    { initialEntries: ["/notes"] },
  );
  const result = render(<RouterProvider router={router} />);
  return { ...result, setData: (data: LoaderData) => setData(data) };
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
            state: "active",
            failed: false,
          };
        }
        return { notes: [], nextCursor: null, state: "active", failed: false };
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

  it("renders the Active/Deleted segmented filter with the active state current", () => {
    renderCollection({ notes: [note()], nextCursor: null, failed: false });
    const group = screen.getByRole("group", { name: "Filter notes by state" });
    const active = within(group).getByRole("link", { name: "Active" });
    expect(active).toHaveAttribute("aria-current", "true");
    const deletedLink = within(group).getByRole("link", { name: "Deleted" });
    expect(deletedLink).toHaveAttribute("href", "/notes?state=deleted");
  });

  describe("Deleted Notes view (NOTES-01C)", () => {
    it("shows no 'New note' action and a distinct filtered-empty state", () => {
      renderCollection({
        notes: [],
        nextCursor: null,
        state: "deleted",
        failed: false,
      });
      expect(screen.getByText("No deleted notes")).toBeInTheDocument();
      expect(screen.queryByText("New note")).not.toBeInTheDocument();
      // The generic "No notes yet" empty state must never leak into this view.
      expect(screen.queryByText("No notes yet")).not.toBeInTheDocument();
    });

    it("renders a deleted Note as a static title with a Restore action, not an open link", () => {
      renderCollection({
        notes: [note({ title: "Old draft" })],
        nextCursor: null,
        state: "deleted",
        failed: false,
      });
      expect(
        screen.queryByRole("link", { name: /Old draft/ }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Old draft")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Restore" }),
      ).toBeInTheDocument();
      expect(screen.getByText("1 deleted note")).toBeInTheDocument();
    });

    it("restoring a Note posts the restore intent and removes it from view with a success toast", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: async () => ({ kind: "restore", ok: true }),
      });
      vi.stubGlobal("fetch", fetchMock);

      renderCollection({
        notes: [note({ id: "n1", title: "Old draft" })],
        nextCursor: null,
        state: "deleted",
        failed: false,
      });

      fireEvent.click(screen.getByRole("button", { name: "Restore" }));

      const toasts = await screen.findByRole("region", {
        name: "Notifications",
      });
      await waitFor(() =>
        expect(
          within(toasts).getByText('"Old draft" restored'),
        ).toBeInTheDocument(),
      );
      expect(
        screen.queryByRole("button", { name: "Restore" }),
      ).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        "/notes/n1/mutate",
        expect.objectContaining({ method: "POST" }),
      );
      const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
      expect(body.get("intent")).toBe("restore");

      vi.unstubAllGlobals();
    });

    it("shows a calm error toast and keeps the row when restore fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          json: async () => ({
            kind: "restore",
            ok: false,
            formError: "nope",
          }),
        }),
      );

      renderCollection({
        notes: [note({ id: "n1", title: "Old draft" })],
        nextCursor: null,
        state: "deleted",
        failed: false,
      });

      fireEvent.click(screen.getByRole("button", { name: "Restore" }));

      const toasts = await screen.findByRole("region", {
        name: "Notifications",
      });
      await waitFor(() =>
        expect(
          within(toasts).getByText('Couldn\'t restore "Old draft". Try again.'),
        ).toBeInTheDocument(),
      );
      // The row stays — nothing was actually restored.
      expect(screen.getByText("Old draft")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Restore" }),
      ).toBeInTheDocument();

      vi.unstubAllGlobals();
    });
  });

  // Regression coverage for two codex-review findings on PR #53.
  describe("pagination correctness across the Active/Deleted filter (NOTES-01C)", () => {
    it("discards a Load More response that resolves after the filter switched away, instead of merging it into the newly selected view", async () => {
      let releaseStalePage: () => void = () => {};
      const stalePagePromise = new Promise((resolve) => {
        releaseStalePage = () =>
          resolve({
            notes: [note({ id: "n2", title: "Bravo (stale active page)" })],
            nextCursor: "STALE_CURSOR",
            state: "active",
            failed: false,
          });
      });

      const { setData } = renderStatefulCollection(
        {
          notes: [note({ id: "n1", title: "Alpha" })],
          nextCursor: "CURSOR_1",
          state: "active",
          failed: false,
        },
        (request) => {
          const url = new URL(request.url);
          if (url.searchParams.get("cursor") === "CURSOR_1") {
            return stalePagePromise;
          }
          return {
            notes: [],
            nextCursor: null,
            state: "deleted",
            failed: false,
          };
        },
      );

      // Let the router's initial navigation commit before interacting.
      await screen.findByText("1 notes loaded");

      // Start "Load more" in the Active view — the fetch stays pending.
      fireEvent.click(screen.getByRole("button", { name: "Load more notes" }));

      // The user switches to Deleted BEFORE that fetch resolves — the same
      // prop change a real `?state=deleted` navigation would produce.
      act(() => {
        setData({
          notes: [],
          nextCursor: null,
          state: "deleted",
          failed: false,
        });
      });
      expect(screen.getByText("No deleted notes")).toBeInTheDocument();

      // NOW the stale Active-state page resolves.
      releaseStalePage();
      await act(async () => {
        await stalePagePromise;
        // Let the fetcher's own internal state settle after the awaited data.
        await new Promise((r) => setTimeout(r, 20));
      });

      // It must not have been merged into the Deleted view: no stray active
      // note, no borrowed cursor reopening a "Load more" that doesn't exist
      // for this (exhausted) Deleted page, and the honest empty state stands.
      expect(
        screen.queryByText("Bravo (stale active page)"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Load more deleted notes" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("No deleted notes")).toBeInTheDocument();
    });

    it("keeps Load More reachable when restoring every currently-visible Deleted note leaves more pages unloaded", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          json: async () => ({ kind: "restore", ok: true }),
        }),
      );

      renderCollection({
        notes: [note({ id: "n1", title: "Old draft" })],
        nextCursor: "MORE_DELETED",
        state: "deleted",
        failed: false,
      });

      expect(
        screen.getByRole("button", { name: "Load more deleted notes" }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Restore" }));

      const toasts = await screen.findByRole("region", {
        name: "Notifications",
      });
      await waitFor(() =>
        expect(
          within(toasts).getByText('"Old draft" restored'),
        ).toBeInTheDocument(),
      );

      // The only loaded row is gone, but more deleted notes exist on the
      // server (a truthy cursor) — must NOT claim the collection is empty,
      // and Load More must still be there to reach them.
      expect(screen.queryByText("No deleted notes")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Load more deleted notes" }),
      ).toBeInTheDocument();

      vi.unstubAllGlobals();
    });
  });
});
