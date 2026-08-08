import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { DiaryCapture } from "~/modules/diary/DiaryCapture";
import { NewNoteForm } from "~/modules/notes/NewNoteForm";
import { encodeCaptureContext } from "~/shared/capture/capture-context";
import type { CaptureContextContract } from "~/shared/capture/capture-context";

/**
 * DEBT-45 — the full-form hand-off, as the user experiences it.
 *
 * Two things must be true when Quick Capture hands off to a module's fuller
 * creation surface, and neither was true before:
 *
 *   1. the destination SAYS what it will do — the same context chip, in the same
 *      words, so the hand-off does not need re-reading;
 *   2. the destination SUBMITS the context to the canonical create route, so the
 *      relationship is actually made.
 *
 * The chip is also removable here, because relationship creation must never be an
 * invisible consequence of pressing Create.
 */

const personContext: CaptureContextContract = {
  sourceEntityId: "person-1",
  sourceEntityType: "person",
  sourceEntityTitle: "Vaughn Smith",
  sourceModule: "people",
  originatingRoute: "/person/person-1",
  mode: "removable",
  relationshipMeaning: "related",
  returnTo: "/person/person-1",
};

function contextQuery(context = personContext): string {
  return `ctx=${encodeURIComponent(encodeCaptureContext(context))}`;
}

function renderAt(path: string, node: ReactElement, entry: string) {
  const router = createMemoryRouter([{ path, element: node }], {
    initialEntries: [entry],
  });
  return render(<RouterProvider router={router} />);
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** The `captureContext` field of the most recent POST, parsed. */
function submittedContext(fetchMock: ReturnType<typeof vi.fn>): unknown {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
    string,
    { body: FormData },
  ];
  const raw = init.body.get("captureContext");
  return typeof raw === "string" ? JSON.parse(raw) : null;
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => vi.unstubAllGlobals());

describe("Note full form after a hand-off", () => {
  it("shows the same context chip the capture sheet showed", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderAt(
      "/notes",
      <NewNoteForm onCreated={() => {}} onCancel={() => {}} />,
      `/notes?drawer=new-note&${contextQuery()}`,
    );

    expect(screen.getByTestId("capture-context-chip")).toHaveTextContent(
      "Related to Vaughn Smith",
    );
  });

  it("submits the context to the canonical create route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, noteId: "note-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    renderAt(
      "/notes",
      <NewNoteForm onCreated={onCreated} onCancel={() => {}} />,
      `/notes?drawer=new-note&${contextQuery()}`,
    );

    fireEvent.change(screen.getByRole("textbox", { name: /Title/ }), {
      target: { value: "Notes from coffee" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create note" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("note-1"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/notes/new",
      expect.objectContaining({ method: "POST" }),
    );
    expect(submittedContext(fetchMock)).toMatchObject({
      sourceEntityId: "person-1",
      sourceEntityType: "person",
    });
  });

  it("lets the user remove the context deliberately, and then does not send it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, noteId: "note-1" }));
    vi.stubGlobal("fetch", fetchMock);
    renderAt(
      "/notes",
      <NewNoteForm onCreated={() => {}} onCancel={() => {}} />,
      `/notes?drawer=new-note&${contextQuery()}`,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove capture context Vaughn Smith",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("capture-context-chip")).toBeNull(),
    );

    fireEvent.change(screen.getByRole("textbox", { name: /Title/ }), {
      target: { value: "Unrelated note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create note" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(submittedContext(fetchMock)).toBeNull();
  });

  it("ignores a context whose type the note capture has no meaning for", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderAt(
      "/notes",
      <NewNoteForm onCreated={() => {}} onCancel={() => {}} />,
      `/notes?drawer=new-note&${contextQuery({
        ...personContext,
        sourceEntityId: "asset-1",
        sourceEntityType: "asset",
        sourceEntityTitle: "Passport",
      })}`,
    );

    expect(screen.queryByTestId("capture-context-chip")).toBeNull();
  });
});

describe("Diary capture after a hand-off", () => {
  it("stays chronology-first: no context means no extra field at all", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderAt(
      "/diary",
      <DiaryCapture todayKey="2026-05-20" onCaptured={() => {}} />,
      "/diary?inspector=new",
    );

    expect(screen.queryByTestId("capture-context-chip")).toBeNull();
    // The fast path is untouched: a type, a title, Capture.
    expect(screen.getByRole("button", { name: "Capture" })).toBeInTheDocument();
  });

  it("carries a Person context into the captured entry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, entryId: "entry-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const onCaptured = vi.fn();
    renderAt(
      "/diary",
      <DiaryCapture todayKey="2026-05-20" onCaptured={onCaptured} />,
      `/diary?inspector=new&${contextQuery()}`,
    );

    expect(screen.getByTestId("capture-context-chip")).toHaveTextContent(
      "Related to Vaughn Smith",
    );

    fireEvent.change(screen.getByRole("textbox", { name: /Title/ }), {
      target: { value: "Coffee with Vaughn" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    await waitFor(() => expect(onCaptured).toHaveBeenCalled());
    expect(submittedContext(fetchMock)).toMatchObject({
      sourceEntityId: "person-1",
      sourceEntityType: "person",
    });
  });
});
