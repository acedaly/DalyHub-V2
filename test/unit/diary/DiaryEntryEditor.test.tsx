import { useState } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiaryEntryEditor } from "~/modules/diary/DiaryEntryEditor";
import type { DiaryEntryEditData } from "~/modules/diary/routes/entry";
import { FeedbackProvider } from "~/shared/feedback";

/**
 * DIARY-01 — the route-backed editor as behaviour: it loads the entry from the
 * `/diary/:id` resource route, keeps Save disabled until the form is dirty,
 * saves through `/diary/:id/mutate`, and surfaces a server error while keeping
 * the user's draft.
 */

const ENTRY: DiaryEntryEditData = {
  id: "d1",
  title: "Quarterly review",
  entryType: "meeting",
  bodySource: "Discussed the roadmap.",
  occurredAtIso: "2026-07-19T04:30:00.000Z",
  occurredLocal: "2026-07-19T14:30",
  timezone: "Australia/Sydney",
};

function renderEditor(onSaved = vi.fn(), onCancel = vi.fn()) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <FeedbackProvider>
            <DiaryEntryEditor
              entryId="d1"
              onSaved={onSaved}
              onCancel={onCancel}
            />
          </FeedbackProvider>
        ),
      },
      { path: "/diary/:entryId", loader: () => ({ entry: ENTRY }) },
    ],
    { initialEntries: ["/"] },
  );
  return { onSaved, onCancel, ...render(<RouterProvider router={router} />) };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DiaryEntryEditor", () => {
  it("loads the entry and keeps Save disabled until the form is dirty", async () => {
    renderEditor();

    const title = (await screen.findByLabelText(/title/i)) as HTMLInputElement;
    expect(title.value).toBe("Quarterly review");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    fireEvent.change(title, { target: { value: "Quarterly review (final)" } });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("saves through the mutate route and reports success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { onSaved } = renderEditor();

    const title = (await screen.findByLabelText(/title/i)) as HTMLInputElement;
    fireEvent.change(title, { target: { value: "Quarterly review (final)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/diary/d1/mutate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces a server error and keeps the draft", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: false,
        formError: "The details couldn't be saved. Please try again.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { onSaved } = renderEditor();

    const title = (await screen.findByLabelText(/title/i)) as HTMLInputElement;
    fireEvent.change(title, { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      (await screen.findAllByText(/couldn't be saved/i)).length,
    ).toBeGreaterThan(0);
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe(
      "Changed",
    );
  });

  it("reloads the entry when the drawer id changes on a retained instance", async () => {
    // Reproduces a direct `?drawer=edit:<a>` → `?drawer=edit:<b>` change without
    // an unmount: the SAME DiaryEntryEditor instance gets a new `entryId` prop.
    function entryFor(id: string): DiaryEntryEditData {
      return {
        id,
        title: `Entry ${id}`,
        entryType: "note",
        bodySource: "",
        occurredAtIso: "2026-07-19T04:30:00.000Z",
        occurredLocal: "2026-07-19T14:30",
        timezone: "Australia/Sydney",
      };
    }
    function Switcher() {
      const [id, setId] = useState("d1");
      return (
        <FeedbackProvider>
          <button type="button" onClick={() => setId("d2")}>
            switch
          </button>
          <DiaryEntryEditor entryId={id} onSaved={vi.fn()} onCancel={vi.fn()} />
        </FeedbackProvider>
      );
    }
    const router = createMemoryRouter(
      [
        { path: "/", element: <Switcher /> },
        {
          path: "/diary/:entryId",
          loader: ({ params }) => ({
            entry: entryFor(params.entryId as string),
          }),
        },
      ],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);

    const title = () => screen.getByLabelText(/title/i) as HTMLInputElement;
    await waitFor(() => expect(title().value).toBe("Entry d1"));

    fireEvent.click(screen.getByRole("button", { name: "switch" }));

    // The second entry must load and display — never entry d1 under d2's id.
    await waitFor(() => expect(title().value).toBe("Entry d2"));
  });
});
