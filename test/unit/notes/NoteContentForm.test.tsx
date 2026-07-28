import { Link, RouterProvider, createMemoryRouter } from "react-router";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { ReactElement } from "react";

import { MARKDOWN_SOURCE_MAX_BYTES } from "~/kernel/markdown";
import { NoteContentForm } from "~/modules/notes/NoteContentForm";

/**
 * The live editor (`~/shared/markdown-editor`) mounts CodeMirror only in a real
 * browser (Playwright covers that). In this happy-dom unit environment we force
 * its accessible, controlled `<textarea>` fallback — the same surface a no-JS
 * client gets — by making the lazily-imported CodeMirror setup throw, which the
 * editor's own `.catch` handles by keeping the fallback in place. The fallback
 * exercises the identical autosave/coordinator wiring these tests assert, so
 * this proves the real behaviour without a layout engine.
 */
vi.mock("~/shared/markdown-editor/editor-setup", () => ({
  createEditorExtensions: () => {
    throw new Error("CodeMirror is not mounted in unit tests");
  },
}));

/**
 * NOTES-05 — the Note Markdown editor as behaviour, driven by dependable
 * AUTOSAVE (no Save button) through the shared writing-first editor:
 *   - a debounced save fires automatically after the tuned pause, and an
 *     immediate blur also triggers one;
 *   - rapid edits WHILE a save is in flight coalesce — the newer value saves
 *     right after the in-flight one resolves, and is never lost;
 *   - a failed save preserves the user's draft, offers Retry, and is
 *     attributed honestly (offline vs a generic failure), auto-retrying the
 *     moment connectivity returns;
 *   - the navigation guard arms while a change is not yet safely persisted
 *     (unsaved/saving/error) and releases the instant it is (saved/idle);
 *   - exact Markdown source preservation (whitespace-only, CRLF) still holds;
 *   - an oversized document is refused client-side before any save attempt;
 *   - the editor offers an unobtrusive Read toggle that renders the note
 *     through the one shared FND-08 pipeline (no persistent Source/Split/Preview).
 */

function renderInRouter(node: ReactElement) {
  const router = createMemoryRouter(
    [
      { path: "/", element: node },
      { path: "/elsewhere", element: <div>Elsewhere</div> },
    ],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Stub `matchMedia` so `useIsWideViewport` sees a wide (or narrow) viewport. */
function stubMatchMedia(wide: boolean): MockInstance {
  const impl = (query: string): MediaQueryList =>
    ({
      matches: wide,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  return vi.spyOn(window, "matchMedia").mockImplementation(impl);
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setOnline(true);
});

const NOTE_AUTOSAVE_DEBOUNCE_MS = 1500;

describe("NoteContentForm", () => {
  it("autosaves after the debounce elapses, with no Save button anywhere", async () => {
    stubMatchMedia(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ kind: "update_content", ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();

    vi.useFakeTimers();
    try {
      renderInRouter(
        <NoteContentForm noteId="n1" initialContent="" onSaved={onSaved} />,
      );
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();

      fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
        target: { value: "New content" },
      });
      expect(screen.getByText("Unsaved")).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(NOTE_AUTOSAVE_DEBOUNCE_MS);
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toBe("/notes/n1/mutate");
      const body = (init as RequestInit).body as FormData;
      expect(body.get("intent")).toBe("update_content");
      expect(body.get("content")).toBe("New content");
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Saved")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("saves immediately on blur, without waiting for the debounce", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ kind: "update_content", ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    renderInRouter(
      <NoteContentForm noteId="n1" initialContent="" onSaved={() => {}} />,
    );
    const textbox = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(textbox, { target: { value: "Blurred save" } });
    fireEvent.blur(textbox);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });

  it("preserves whitespace-only and CRLF content exactly", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ kind: "update_content", ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    renderInRouter(
      <NoteContentForm noteId="n1" initialContent="" onSaved={() => {}} />,
    );
    const textbox = screen.getByRole("textbox", { name: "Note" });
    const source = "line one\r\nline two\r\n\r\n   \t  \r\n";
    fireEvent.change(textbox, { target: { value: source } });
    fireEvent.blur(textbox);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = fetchMock.mock.calls[0]![1].body as FormData;
    expect(body.get("content")).toBe(source);
  });

  it("coalesces a rapid edit made WHILE a save is in flight — the newer value is not lost, and saves next", async () => {
    let resolveFirst: (value: Response) => void = () => {};
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce(
        jsonResponse({ kind: "update_content", ok: true }),
      );
    vi.stubGlobal("fetch", fetchMock);

    vi.useFakeTimers();
    try {
      renderInRouter(
        <NoteContentForm noteId="n1" initialContent="" onSaved={() => {}} />,
      );
      const textbox = screen.getByRole("textbox", { name: "Note" });

      fireEvent.change(textbox, { target: { value: "Content A" } });
      fireEvent.blur(textbox); // dispatches save A immediately
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Saving…")).toBeInTheDocument();

      // Edit again WHILE save A is still in flight.
      fireEvent.change(textbox, { target: { value: "Content B" } });
      expect(textbox).toHaveValue("Content B"); // local edit never lost
      // Only ONE save was dispatched — no parallel save for the new edit yet.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Save A resolves — coalesce to the latest value (B) and save it next.
      await act(async () => {
        resolveFirst(jsonResponse({ kind: "update_content", ok: true }));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const secondBody = fetchMock.mock.calls[1]![1].body as FormData;
      expect(secondBody.get("content")).toBe("Content B");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText("Saved")).toBeInTheDocument();
      expect(textbox).toHaveValue("Content B");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a retryable error and keeps the user’s draft when the save fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          kind: "update_content",
          ok: false,
          formError: "storage failure",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ kind: "update_content", ok: true }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderInRouter(
      <NoteContentForm noteId="n1" initialContent="" onSaved={() => {}} />,
    );
    const textbox = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(textbox, {
      target: { value: "Draft that must survive" },
    });
    fireEvent.blur(textbox);

    await waitFor(() =>
      expect(screen.getByText("Couldn’t save")).toBeInTheDocument(),
    );
    expect(screen.getByText("storage failure")).toBeInTheDocument();
    expect(textbox).toHaveValue("Draft that must survive");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText("Couldn’t save")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("attributes a failure to being offline, and auto-retries the moment connectivity returns", async () => {
    setOnline(false);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        jsonResponse({ kind: "update_content", ok: true }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderInRouter(
      <NoteContentForm noteId="n1" initialContent="" onSaved={() => {}} />,
    );
    const textbox = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(textbox, { target: { value: "Offline edit" } });
    fireEvent.blur(textbox);

    await waitFor(() =>
      expect(screen.getByText(/You’re offline/)).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setOnline(true);
    fireEvent(window, new Event("online"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });

  it("refuses to even attempt a save of oversized content — no fetch call, an inline validation error instead", () => {
    renderInRouter(
      <NoteContentForm noteId="n1" initialContent="" onSaved={() => {}} />,
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const textbox = screen.getByRole("textbox", { name: "Note" });
    const tooLarge = "a".repeat(MARKDOWN_SOURCE_MAX_BYTES + 1);
    fireEvent.change(textbox, { target: { value: tooLarge } });
    fireEvent.blur(textbox);

    expect(screen.getByText(/Too large to save/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("navigation guard", () => {
    it("blocks navigation while unsaved, and Leave discards", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      renderInRouter(
        <>
          <Link to="/elsewhere">Go elsewhere</Link>
          <NoteContentForm noteId="n1" initialContent="" onSaved={() => {}} />
        </>,
      );
      fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
        target: { value: "Unsaved edit" },
      });

      fireEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));
      expect(
        await screen.findByText("Leave with unsaved changes?"),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Leave" }));
      await screen.findByText("Elsewhere");
    });

    it("blocks navigation while a save is in flight (not yet confirmed persisted)", async () => {
      const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
      vi.stubGlobal("fetch", fetchMock);
      renderInRouter(
        <>
          <Link to="/elsewhere">Go elsewhere</Link>
          <NoteContentForm noteId="n1" initialContent="" onSaved={() => {}} />
        </>,
      );
      const textbox = screen.getByRole("textbox", { name: "Note" });
      fireEvent.change(textbox, { target: { value: "In flight" } });
      fireEvent.blur(textbox);
      await waitFor(() =>
        expect(screen.getByText("Saving…")).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));
      expect(
        await screen.findByText("Leave with unsaved changes?"),
      ).toBeInTheDocument();
    });

    it("does not block navigation once the latest content is safely persisted", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ kind: "update_content", ok: true }));
      vi.stubGlobal("fetch", fetchMock);
      renderInRouter(
        <>
          <Link to="/elsewhere">Go elsewhere</Link>
          <NoteContentForm noteId="n1" initialContent="" onSaved={() => {}} />
        </>,
      );
      const textbox = screen.getByRole("textbox", { name: "Note" });
      fireEvent.change(textbox, { target: { value: "Saved edit" } });
      fireEvent.blur(textbox);
      await waitFor(() =>
        expect(screen.getByText("Saved")).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));
      await screen.findByText("Elsewhere");
      expect(
        screen.queryByText("Leave with unsaved changes?"),
      ).not.toBeInTheDocument();
    });

    it("suppressGuard forces navigation through regardless of autosave state (the record’s own Delete flow)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => new Promise<Response>(() => {})),
      );
      renderInRouter(
        <>
          <Link to="/elsewhere">Go elsewhere</Link>
          <NoteContentForm
            noteId="n1"
            initialContent=""
            onSaved={() => {}}
            suppressGuard
          />
        </>,
      );
      const textbox = screen.getByRole("textbox", { name: "Note" });
      fireEvent.change(textbox, { target: { value: "Unsaved" } });
      fireEvent.blur(textbox);
      await waitFor(() =>
        expect(screen.getByText("Saving…")).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));
      await screen.findByText("Elsewhere");
      expect(
        screen.queryByText("Leave with unsaved changes?"),
      ).not.toBeInTheDocument();
    });
  });

  describe("reading mode (NOTES-05)", () => {
    it("writes by default: the formatting toolbar and editable surface are present, no Source/Split/Preview", () => {
      renderInRouter(
        <NoteContentForm noteId="n1" initialContent="Hi" onSaved={() => {}} />,
      );
      expect(
        screen.getByRole("toolbar", { name: "Formatting" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Note" })).toBeInTheDocument();
      // The retired persistent view-mode controls are gone.
      for (const name of ["Source", "Split", "Preview"] as const) {
        expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      }
    });

    it("toggles to Read (rendering through the shared pipeline, hiding the editor) and back to Write", async () => {
      renderInRouter(
        <NoteContentForm
          noteId="n1"
          initialContent="# Heading"
          onSaved={() => {}}
        />,
      );
      // Write → Read.
      fireEvent.click(screen.getByRole("button", { name: "Read" }));
      expect(
        screen.queryByRole("textbox", { name: "Note" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("toolbar", { name: "Formatting" }),
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: "Heading" }),
        ).toBeInTheDocument(),
      );
      // Read → Write restores the editing surface.
      fireEvent.click(screen.getByRole("button", { name: "Write" }));
      expect(screen.getByRole("textbox", { name: "Note" })).toBeInTheDocument();
    });
  });

  /**
   * NOTES-04 — the formatting toolbar shares the SAME autosave coordinator and
   * source value as typed edits. These prove a toolbar action integrates with
   * autosave exactly like typing across the required moments: before a save,
   * during an in-flight save, after a failed save, while offline, and
   * immediately before a navigation.
   */
  describe("formatting toolbar autosave integration", () => {
    function selectAll(textarea: HTMLTextAreaElement) {
      textarea.focus();
      textarea.setSelectionRange(0, textarea.value.length);
    }

    it("a toolbar action triggers the same debounced autosave as typing", async () => {
      stubMatchMedia(false);
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ kind: "update_content", ok: true }));
      vi.stubGlobal("fetch", fetchMock);

      vi.useFakeTimers();
      try {
        renderInRouter(
          <NoteContentForm
            noteId="n1"
            initialContent="draft"
            onSaved={() => {}}
          />,
        );
        const textarea = screen.getByRole("textbox", {
          name: "Note",
        }) as HTMLTextAreaElement;
        selectAll(textarea);
        fireEvent.click(screen.getByRole("button", { name: "Bold" }));
        expect(textarea.value).toBe("**draft**");
        expect(screen.getByText("Unsaved")).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(NOTE_AUTOSAVE_DEBOUNCE_MS);
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const body = fetchMock.mock.calls[0]![1].body as FormData;
        expect(body.get("content")).toBe("**draft**");
      } finally {
        vi.useRealTimers();
      }
    });

    it("a toolbar action during an in-flight save is coalesced, never lost", async () => {
      let resolveFirst: (value: Response) => void = () => {};
      const first = new Promise<Response>((resolve) => {
        resolveFirst = resolve;
      });
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => first)
        .mockResolvedValueOnce(
          jsonResponse({ kind: "update_content", ok: true }),
        );
      vi.stubGlobal("fetch", fetchMock);

      vi.useFakeTimers();
      try {
        renderInRouter(
          <NoteContentForm noteId="n1" initialContent="" onSaved={() => {}} />,
        );
        const textarea = screen.getByRole("textbox", {
          name: "Note",
        }) as HTMLTextAreaElement;

        fireEvent.change(textarea, { target: { value: "Content A" } });
        fireEvent.blur(textarea); // save A dispatched immediately
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Saving…")).toBeInTheDocument();

        // Format WHILE save A is in flight.
        selectAll(textarea);
        fireEvent.click(screen.getByRole("button", { name: "Bold" }));
        expect(textarea.value).toBe("**Content A**");
        expect(fetchMock).toHaveBeenCalledTimes(1); // no parallel save yet

        await act(async () => {
          resolveFirst(jsonResponse({ kind: "update_content", ok: true }));
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const secondBody = fetchMock.mock.calls[1]![1].body as FormData;
        expect(secondBody.get("content")).toBe("**Content A**");
      } finally {
        vi.useRealTimers();
      }
    });

    it("a toolbar action after a failed save preserves and updates the draft", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            kind: "update_content",
            ok: false,
            formError: "storage failure",
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ kind: "update_content", ok: true }),
        );
      vi.stubGlobal("fetch", fetchMock);

      renderInRouter(
        <NoteContentForm
          noteId="n1"
          initialContent="draft"
          onSaved={() => {}}
        />,
      );
      const textarea = screen.getByRole("textbox", {
        name: "Note",
      }) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "edited" } });
      fireEvent.blur(textarea);
      await waitFor(() =>
        expect(screen.getByText("Couldn’t save")).toBeInTheDocument(),
      );

      // A formatting action applied on top of the failed draft keeps the work.
      selectAll(textarea);
      fireEvent.click(screen.getByRole("button", { name: "Bold" }));
      expect(textarea.value).toBe("**edited**");
    });

    it("a toolbar action made while offline preserves the content", async () => {
      setOnline(false);
      const fetchMock = vi
        .fn()
        .mockRejectedValue(new TypeError("Failed to fetch"));
      vi.stubGlobal("fetch", fetchMock);

      renderInRouter(
        <NoteContentForm
          noteId="n1"
          initialContent="draft"
          onSaved={() => {}}
        />,
      );
      const textarea = screen.getByRole("textbox", {
        name: "Note",
      }) as HTMLTextAreaElement;
      selectAll(textarea);
      fireEvent.click(screen.getByRole("button", { name: "Bold" }));
      fireEvent.blur(textarea);

      await waitFor(() =>
        expect(screen.getByText(/You’re offline/)).toBeInTheDocument(),
      );
      expect(textarea.value).toBe("**draft**");
    });

    it("arms the navigation guard after a formatting action leaves unsaved content", async () => {
      const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
      vi.stubGlobal("fetch", fetchMock);
      renderInRouter(
        <>
          <Link to="/elsewhere">Go elsewhere</Link>
          <NoteContentForm noteId="n1" initialContent="" onSaved={() => {}} />
        </>,
      );
      const textarea = screen.getByRole("textbox", {
        name: "Note",
      }) as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(0, 0);
      fireEvent.click(screen.getByRole("button", { name: "Bold" }));

      fireEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));
      expect(
        await screen.findByText("Leave with unsaved changes?"),
      ).toBeInTheDocument();
    });
  });
});
