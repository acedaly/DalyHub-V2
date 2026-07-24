import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { NewNoteForm } from "~/modules/notes/NewNoteForm";

/**
 * NOTES-01B — the "New note" DS-06 create form as behaviour: required-title
 * validation, duplicate-submit prevention, server-authoritative errors, and
 * the success path (mirrors `test/unit/projects/create-forms.test.tsx`).
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

describe("NewNoteForm", () => {
  it("requires a title before it will submit", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderInRouter(<NewNoteForm onCreated={() => {}} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Create note" }));
    await waitFor(() =>
      expect(screen.getAllByText("A title is required").length).toBeGreaterThan(
        0,
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to /notes/new and reports the new note id on success", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      jsonResponse({ ok: true, noteId: "n-new" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    renderInRouter(<NewNoteForm onCreated={onCreated} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "Reading list" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create note" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("n-new"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/notes/new");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("surfaces a server field error against the title, preserving the typed draft", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: false, fieldErrors: { title: "Too long." } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderInRouter(<NewNoteForm onCreated={() => {}} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "A title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create note" }));

    await waitFor(() =>
      expect(screen.getAllByText("Too long.").length).toBeGreaterThan(0),
    );
    expect(screen.getByLabelText(/Title/)).toHaveValue("A title");
  });

  it("prevents a duplicate submit while a create is in flight", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderInRouter(<NewNoteForm onCreated={() => {}} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "Reading list" },
    });
    const button = screen.getByRole("button", { name: "Create note" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(jsonResponse({ ok: true, noteId: "n-new" }));
  });
});
