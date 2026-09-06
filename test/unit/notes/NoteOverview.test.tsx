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
import type { InlineSaveOutcome } from "~/shared/inline-edit";

/** The default inline-save stub: the title field accepts, nothing is asserted. */
const accept = async (): Promise<InlineSaveOutcome> => ({ ok: true });

// Force the live editor's accessible `<textarea>` fallback in happy-dom (see the
// note in NoteContentForm.test.tsx): CodeMirror mounts only in a real browser.
vi.mock("~/shared/markdown-editor/editor-setup", () => ({
  createEditorExtensions: () => {
    throw new Error("CodeMirror is not mounted in unit tests");
  },
}));

/**
 * NOTES-01B/NOTES-01C — the canonical Note record: generic entity identity
 * (title, Rename, Delete), the "Note"/"Linked"/"Activity" tab structure (the
 * Linked tab is the shared Universal Relationship System's Linked Items section),
 * no bespoke Notes-only header,
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
  return {
    content: "",
    contentUpdatedAt: null,
    tags: [],
    archivedAt: null,
    ...over,
  };
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

/**
 * PX-04 — Delete lives in the ONE shared overflow menu now (DS-12), so a test
 * opens the menu and picks the item, exactly as a user would.
 */
function openOverflowDelete(): HTMLElement {
  const trigger = screen.getByRole("button", { name: /^More actions for / });
  fireEvent.click(trigger);
  return screen.getByRole("menuitem", { name: "Delete Note" });
}

describe("NoteOverview", () => {
  it("renders the generic entity identity and edits the title in place", async () => {
    const onRename = vi.fn(accept);
    renderInRouter(
      <NoteOverview
        overview={overview({ title: "Reading list" })}
        details={details()}
        onRename={onRename}
        onSaved={() => {}}
        onEditTags={() => {}}
        backlinksTab={<div>Backlinks content</div>}
        linksTab={<div>Linked content</div>}
        activityTab={<div>Activity content</div>}
        aiTab={<div>AI content</div>}
        evidenceTab={<div>Evidence content</div>}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Reading list" }),
    ).toBeInTheDocument();
    /*
     * RECORD-01 — the "Note" type label is gone from the header: the breadcrumb
     * directly above the title already says "Notes", so the eyebrow was a line
     * of header height restating the line above it. The record's identity is
     * now carried by the breadcrumb, the entity glyph and the title.
     */
    expect(document.querySelector(".record-type__label")).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    ).toHaveTextContent("Notes");

    // EDIT-02 — the dedicated Rename action is gone; the heading itself is the
    // control, exactly as it is on an Area, a Project and a Goal.
    expect(
      screen.queryByRole("button", { name: "Rename" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Note title: Reading list" }),
    );
    const input = screen.getByRole("textbox", { name: "Note title" });
    fireEvent.change(input, { target: { value: "Reading queue" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onRename).toHaveBeenCalledWith("Reading queue"));

    // PX-04: Delete now lives in the ONE shared overflow menu, the same slot as
    // every other record's lifecycle actions, with the shared wording.
    fireEvent.click(
      screen.getByRole("button", { name: "More actions for Reading list" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Delete Note" }),
    ).toBeInTheDocument();
  });

  it("exposes the Note, Backlinks, Links and Activity tabs (NOTES-02 separates the two link directions)", () => {
    renderInRouter(
      <NoteOverview
        overview={overview()}
        details={details()}
        onRename={accept}
        onSaved={() => {}}
        onEditTags={() => {}}
        backlinksTab={<div>Backlinks content</div>}
        linksTab={<div>Linked content</div>}
        activityTab={<div>Activity content</div>}
        aiTab={<div>AI content</div>}
        evidenceTab={<div>Evidence content</div>}
      />,
    );

    const tablist = screen.getByRole("tablist");
    const tabs = screen.getAllByRole("tab");
    expect(tablist).toBeInTheDocument();
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Note",
      "Backlinks",
      "Links",
      // AI-01 — the extraction surface, between the relationship tabs and the
      // record's own history. The writing surface stays first and default.
      "AI",
      // V2.11 FILE-01 — the shared Evidence tab. A Note may CARRY a file; it
      // does not become one, and nothing parses an attachment into the text.
      "Evidence",
      "Activity",
    ]);
  });

  it("shows the Markdown source editor in the Note tab by default", () => {
    renderInRouter(
      <NoteOverview
        overview={overview()}
        details={details({ content: "# Hello" })}
        onRename={accept}
        onSaved={() => {}}
        onEditTags={() => {}}
        backlinksTab={<div>Backlinks content</div>}
        linksTab={<div>Linked content</div>}
        activityTab={<div>Activity content</div>}
        aiTab={<div>AI content</div>}
        evidenceTab={<div>Evidence content</div>}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue(
      "# Hello",
    );
  });

  it("shows the Summary’s Updated date from a content save that postdates the last rename", () => {
    renderInRouter(
      <NoteOverview
        overview={overview({ updatedAt: "2026-07-20T10:00:00.000Z" })}
        details={details({
          content: "Hello",
          contentUpdatedAt: "2026-07-22T09:00:00.000Z",
        })}
        onRename={accept}
        onSaved={() => {}}
        onEditTags={() => {}}
        backlinksTab={<div>Backlinks content</div>}
        linksTab={<div>Linked content</div>}
        activityTab={<div>Activity content</div>}
        aiTab={<div>AI content</div>}
        evidenceTab={<div>Evidence content</div>}
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
        onRename={accept}
        onSaved={() => {}}
        onEditTags={() => {}}
        backlinksTab={<div>Backlinks content</div>}
        linksTab={<div>Linked content</div>}
        activityTab={<div>Activity content</div>}
        aiTab={<div>AI content</div>}
        evidenceTab={<div>Evidence content</div>}
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
          onRename={accept}
          onSaved={() => {}}
          onEditTags={() => {}}
          backlinksTab={<div>Backlinks content</div>}
          linksTab={<div>Linked content</div>}
          activityTab={<div>Activity content</div>}
          aiTab={<div>AI content</div>}
          evidenceTab={<div>Evidence content</div>}
        />,
      );

      fireEvent.click(openOverflowDelete());

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
          onRename={accept}
          onSaved={() => {}}
          onEditTags={() => {}}
          backlinksTab={<div>Backlinks content</div>}
          linksTab={<div>Linked content</div>}
          activityTab={<div>Activity content</div>}
          aiTab={<div>AI content</div>}
          evidenceTab={<div>Evidence content</div>}
        />,
      );

      fireEvent.click(openOverflowDelete());

      const toasts = await screen.findByRole("region", {
        name: "Notifications",
      });
      await waitFor(() =>
        expect(
          within(toasts).getByText(
            'Couldn’t delete "Reading list". Please try again.',
          ),
        ).toBeInTheDocument(),
      );
      // Never navigated away — the record is still here.
      expect(
        screen.getByRole("heading", { level: 1, name: "Reading list" }),
      ).toBeInTheDocument();

      vi.unstubAllGlobals();
    });

    // Regression coverage for the codex-review finding on PR #53: Delete used
    // to navigate away immediately, unmounting the editor before its debounced
    // autosave ever fired — the just-typed content was discarded outright, and
    // Undo restored the STALE previously-committed content instead. Delete now
    // flushes the pending edit through the same field first (`flushRef` /
    // `field.flush()`, see `use-delete-note.ts` and `use-autosave-field.ts`).
    it("flushes an unsaved edit through the editor’s own save path before deleting, so the deleted content is the latest typed content", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          json: async () => ({ kind: "update_content", ok: true }),
        })
        .mockResolvedValueOnce({
          json: async () => ({ kind: "delete", ok: true }),
        });
      vi.stubGlobal("fetch", fetchMock);

      renderInRouter(
        <NoteOverview
          overview={overview({ title: "Reading list" })}
          details={details({ content: "original" })}
          onRename={accept}
          onSaved={() => {}}
          onEditTags={() => {}}
          backlinksTab={<div>Backlinks content</div>}
          linksTab={<div>Linked content</div>}
          activityTab={<div>Activity content</div>}
          aiTab={<div>AI content</div>}
          evidenceTab={<div>Evidence content</div>}
        />,
      );

      // Edit, but do NOT blur and do NOT wait out the debounce — Delete must
      // still capture this content, not the last-committed "original".
      fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
        target: { value: "edited but not yet saved" },
      });
      fireEvent.click(openOverflowDelete());

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

      const firstBody = fetchMock.mock.calls[0]?.[1]?.body as FormData;
      expect(firstBody.get("intent")).toBe("update_content");
      expect(firstBody.get("content")).toBe("edited but not yet saved");

      const secondBody = fetchMock.mock.calls[1]?.[1]?.body as FormData;
      expect(secondBody.get("intent")).toBe("delete");

      await screen.findByText("Notes collection");
      const toasts = await screen.findByRole("region", {
        name: "Notifications",
      });
      await waitFor(() =>
        expect(
          within(toasts).getByText('"Reading list" deleted'),
        ).toBeInTheDocument(),
      );

      vi.unstubAllGlobals();
    });

    it("refuses to delete when the pending edit fails to save, and preserves the draft", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: async () => ({
          kind: "update_content",
          ok: false,
          formError: "That couldn’t be saved.",
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      renderInRouter(
        <NoteOverview
          overview={overview({ title: "Reading list" })}
          details={details({ content: "original" })}
          onRename={accept}
          onSaved={() => {}}
          onEditTags={() => {}}
          backlinksTab={<div>Backlinks content</div>}
          linksTab={<div>Linked content</div>}
          activityTab={<div>Activity content</div>}
          aiTab={<div>AI content</div>}
          evidenceTab={<div>Evidence content</div>}
        />,
      );

      fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
        target: { value: "edited but will fail to save" },
      });
      fireEvent.click(openOverflowDelete());

      const toasts = await screen.findByRole("region", {
        name: "Notifications",
      });
      await waitFor(() =>
        expect(
          within(toasts).getByText(
            'Couldn’t save your latest changes, so "Reading list" wasn’t deleted. Fix the save error, then try again.',
          ),
        ).toBeInTheDocument(),
      );

      // Only the (failed) content save was attempted — delete was never sent.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(
        (fetchMock.mock.calls[0]?.[1]?.body as FormData).get("intent"),
      ).toBe("update_content");

      // Still on the record, draft intact — nothing was lost or navigated away.
      expect(
        screen.getByRole("heading", { level: 1, name: "Reading list" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue(
        "edited but will fail to save",
      );

      vi.unstubAllGlobals();
    });
  });
});
