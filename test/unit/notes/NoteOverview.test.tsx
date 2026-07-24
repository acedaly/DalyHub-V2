import { RouterProvider, createMemoryRouter } from "react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { NoteOverview } from "~/modules/notes/NoteOverview";
import type {
  SerializedNoteDetails,
  SerializedNoteOverview,
} from "~/modules/notes/note-view";
import { FeedbackProvider } from "~/shared/feedback";

/**
 * NOTES-01B/NOTES-01C — the canonical Note record: generic entity identity
 * (title, Rename, Delete), the minimal "Note"/"Activity" tab structure (no
 * premature empty tab for a future capability), no bespoke Notes-only header,
 * and the Delete action's Undo-toast lifecycle flow (soft-delete → navigate
 * to `/notes` → an Undo toast whose Undo restores the Note).
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
  const router = createMemoryRouter(
    [
      { path: "/", element: node },
      { path: "/notes", element: <div>Notes collection</div> },
    ],
    { initialEntries: ["/"] },
  );
  return render(
    <FeedbackProvider>
      <RouterProvider router={router} />
    </FeedbackProvider>,
  );
}

describe("NoteOverview", () => {
  it("renders the generic entity identity (title, type label) and Rename/Delete actions", () => {
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
    expect(
      screen.getByRole("button", { name: "Delete note" }),
    ).toBeInTheDocument();
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

  it("shows the Summary's Updated date from a content save that postdates the last rename", () => {
    renderInRouter(
      <NoteOverview
        overview={overview({ updatedAt: "2026-07-20T10:00:00.000Z" })}
        details={details({
          content: "Hello",
          contentUpdatedAt: "2026-07-22T09:00:00.000Z",
        })}
        onRename={() => {}}
        onSaved={() => {}}
        activityTab={<div>Activity content</div>}
      />,
    );

    expect(screen.getByText("22 Jul 2026")).toBeInTheDocument();
    expect(screen.queryByText("20 Jul 2026")).not.toBeInTheDocument();
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

  describe("Delete (NOTES-01C)", () => {
    it("deletes, navigates to /notes, and offers Undo — choosing Undo restores it", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          json: async () => ({ kind: "delete", ok: true }),
        })
        .mockResolvedValueOnce({
          json: async () => ({ kind: "restore", ok: true }),
        });
      vi.stubGlobal("fetch", fetchMock);

      renderInRouter(
        <NoteOverview
          overview={overview({ title: "Reading list" })}
          details={details()}
          onRename={() => {}}
          onSaved={() => {}}
          activityTab={<div>Activity content</div>}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Delete note" }));

      await screen.findByText("Notes collection");
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "/notes/n1/mutate",
        expect.objectContaining({ method: "POST" }),
      );
      const deleteBody = fetchMock.mock.calls[0]?.[1]?.body as FormData;
      expect(deleteBody.get("intent")).toBe("delete");

      const toasts = await screen.findByRole("region", {
        name: "Notifications",
      });
      await waitFor(() =>
        expect(
          within(toasts).getByText('"Reading list" deleted'),
        ).toBeInTheDocument(),
      );

      fireEvent.click(within(toasts).getByRole("button", { name: "Undo" }));

      // The toast list may briefly empty (and its `<section>` unmount) between
      // the "deleted" toast being dismissed by Undo and the "restored" toast
      // landing — re-query fresh rather than reusing a DOM node that may have
      // been replaced.
      await waitFor(() =>
        expect(
          within(
            screen.getByRole("region", { name: "Notifications" }),
          ).getByText('"Reading list" restored'),
        ).toBeInTheDocument(),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/notes/n1/mutate",
        expect.objectContaining({ method: "POST" }),
      );
      const restoreBody = fetchMock.mock.calls[1]?.[1]?.body as FormData;
      expect(restoreBody.get("intent")).toBe("restore");

      vi.unstubAllGlobals();
    });

    it("shows a calm error and stays on the record when delete fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          json: async () => ({
            kind: "delete",
            ok: false,
            formError: "nope",
          }),
        }),
      );

      renderInRouter(
        <NoteOverview
          overview={overview({ title: "Reading list" })}
          details={details()}
          onRename={() => {}}
          onSaved={() => {}}
          activityTab={<div>Activity content</div>}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Delete note" }));

      const toasts = await screen.findByRole("region", {
        name: "Notifications",
      });
      await waitFor(() =>
        expect(
          within(toasts).getByText(
            'Couldn\'t delete "Reading list". Please try again.',
          ),
        ).toBeInTheDocument(),
      );
      // Never navigated away — the record is still here.
      expect(
        screen.getByRole("heading", { level: 1, name: "Reading list" }),
      ).toBeInTheDocument();

      vi.unstubAllGlobals();
    });
  });
});
