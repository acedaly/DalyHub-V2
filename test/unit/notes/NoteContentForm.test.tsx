import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { NoteContentForm } from "~/modules/notes/NoteContentForm";

/**
 * NOTES-01B — the Note Markdown source editor as behaviour: the exact source
 * (including whitespace-only content) round-trips through the field
 * unmodified, the Save action stays disabled until the content is genuinely
 * dirty (no-op saves are never emitted), the save-state transitions
 * (unsaved → saving → saved / error) are all represented, a failed save
 * preserves the user's typed draft, and Retry re-submits the same content.
 */

function renderInRouter(node: ReactElement) {
  const router = createMemoryRouter([{ path: "/", element: node }], {
    initialEntries: ["/"],
  });
  return render(<RouterProvider router={router} />);
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("NoteContentForm", () => {
  it("disables Save until the content is genuinely changed", () => {
    renderInRouter(
      <NoteContentForm noteId="n1" initialContent="Hello" onSaved={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "Hello world" },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    // Editing back to the exact saved baseline disables Save again — no-op
    // saves are never emitted from the UI.
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "Hello" },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("preserves whitespace-only content exactly, including leading/trailing whitespace", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      jsonResponse({ kind: "update_content", ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderInRouter(
      <NoteContentForm noteId="n1" initialContent="" onSaved={() => {}} />,
    );

    const whitespaceOnly = "   \n\t  \n";
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: whitespaceOnly },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/notes/n1/mutate");
    const body = (init as RequestInit).body as FormData;
    expect(body.get("content")).toBe(whitespaceOnly);
  });

  it("goes through saving then saved, calling onSaved, and never claims saved before the response resolves", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    renderInRouter(
      <NoteContentForm noteId="n1" initialContent="" onSaved={onSaved} />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "New content" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByText("Saving…")).toBeInTheDocument(),
    );
    expect(onSaved).not.toHaveBeenCalled();

    resolveFetch(jsonResponse({ kind: "update_content", ok: true }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });

  it("shows a retryable error and keeps the user's draft when the save fails", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        kind: "update_content",
        ok: false,
        formError: "That couldn't be saved. Please try again.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderInRouter(
      <NoteContentForm noteId="n1" initialContent="" onSaved={() => {}} />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "Draft that must survive" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByText("Couldn't save")).toBeInTheDocument(),
    );
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue(
      "Draft that must survive",
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("surfaces a validation field error against the content field", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        kind: "update_content",
        ok: false,
        fieldErrors: { content: "Content is too large." },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderInRouter(
      <NoteContentForm noteId="n1" initialContent="" onSaved={() => {}} />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "x".repeat(10) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        screen.getAllByText("Content is too large.").length,
      ).toBeGreaterThan(0),
    );
  });
});
