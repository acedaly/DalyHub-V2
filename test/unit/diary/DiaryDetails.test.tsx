import { useState } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DiaryDetailsHost,
  type DetailsPanelMode,
} from "~/modules/diary/DiaryDetailsPanel";
import type { DiaryEntryEditData } from "~/modules/diary/routes/entry";
import { FeedbackProvider } from "~/shared/feedback";

/**
 * DIARY-01B — the details panel as behaviour: a polished READ state (title, type,
 * when, created) that fabricates nothing, a deliberate EDIT state reached via the
 * Edit action, and a save that posts to the mutate route and returns to read.
 */

function fixture(over: Partial<DiaryEntryEditData> = {}): DiaryEntryEditData {
  return {
    id: "e1",
    title: "Team stand-up",
    entryType: "meeting",
    entryTypeLabel: "Meeting",
    bodySource: "",
    occurredAtIso: "2026-05-20T20:30:00.000Z",
    occurredLocal: "2026-05-21T06:30",
    occurredDateLabel: "21 May 2026",
    occurredTimeLabel: "06:30",
    backdated: false,
    createdLabel: "21 May 2026 at 06:30",
    updatedLabel: "21 May 2026 at 06:30",
    edited: false,
    timezone: "Australia/Sydney",
    ...over,
  };
}

/**
 * A tiny harness that stands in for the Inspector URL key: it holds the read/edit
 * mode and wires `onRequestEdit`/`onRequestRead` to it (as `replaceInspector` does
 * in the workspace), so the test drives the same URL-synced transition.
 */
function Harness({
  requestedId,
  initialMode,
  onChanged,
  onClose,
}: {
  requestedId: string;
  initialMode: DetailsPanelMode;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<DetailsPanelMode>(initialMode);
  return (
    <DiaryDetailsHost
      entryId={requestedId}
      mode={mode}
      onRequestEdit={() => setMode("edit")}
      onRequestRead={() => setMode("read")}
      onChanged={onChanged}
      onClose={onClose}
      deleteRedirectTo="?"
      onDeleted={onChanged}
    />
  );
}

function renderHost(
  entry: DiaryEntryEditData,
  initialMode: DetailsPanelMode = "read",
  requestedId: string = entry.id,
) {
  const onChanged = vi.fn();
  const onClose = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: "/diary",
        element: (
          <FeedbackProvider>
            <Harness
              requestedId={requestedId}
              initialMode={initialMode}
              onChanged={onChanged}
              onClose={onClose}
            />
          </FeedbackProvider>
        ),
      },
      { path: "/diary/:entryId", loader: () => ({ entry }) },
    ],
    { initialEntries: ["/diary"] },
  );
  render(<RouterProvider router={router} />);
  return { onChanged, onClose };
}

afterEach(() => vi.unstubAllGlobals());

describe("Diary details panel", () => {
  it("shows a polished read state without fabricated fields", async () => {
    renderHost(fixture());
    expect(
      await screen.findByRole("heading", { level: 3, name: "Team stand-up" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Meeting")).toBeInTheDocument();
    // Appears for both "When" and "Created" (real stamps, nothing fabricated).
    expect(screen.getAllByText(/21 May 2026 at 06:30/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("No details recorded.")).toBeInTheDocument();
    // No invented sections.
    expect(screen.queryByText(/Mood/i)).toBeNull();
    expect(screen.queryByText(/Attendees/i)).toBeNull();
    expect(screen.queryByText(/Attachments/i)).toBeNull();
  });

  /*
   * DIARY-02 — the entry is a Linked Items consumer.
   *
   * The assertions are about HIERARCHY as much as presence: the entry's own title
   * remains the h3, "Related" is a subordinate h4 below the content, and the
   * shared relationship surface (not a Diary-only one) is what renders inside it.
   */
  it("exposes Related through the shared Linked Items surface, below the entry", async () => {
    renderHost(fixture());

    const related = await screen.findByRole("heading", {
      level: 4,
      name: "Related",
    });
    expect(related).toBeInTheDocument();
    // The entry itself still owns the strongest heading on the panel.
    expect(
      screen.getByRole("heading", { level: 3, name: "Team stand-up" }),
    ).toBeInTheDocument();
    // The shared section, identified by its own heading — proof this is the
    // Universal Relationship System and not a bespoke Diary component.
    //
    // At level 5, because the panel already titles the section "Related" (h4)
    // above it. The shared section takes a `headingLevel` so a nested host keeps
    // a valid outline; hard-coded at h2 it produced a real axe `heading-order`
    // failure here (4 → 2 → 3).
    expect(
      screen.getByRole("heading", { level: 5, name: "Linked items" }),
    ).toBeInTheDocument();
    // Content comes before context in the DOM, which is the reading order too.
    expect(
      related.compareDocumentPosition(screen.getByText("No details recorded.")),
    ).toBe(Node.DOCUMENT_POSITION_PRECEDING);
  });

  it("shows a Backdated badge and an Updated stamp only when real", async () => {
    renderHost(
      fixture({
        backdated: true,
        edited: true,
        updatedLabel: "22 May 2026 at 09:00",
      }),
    );
    expect(await screen.findByText("Backdated")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });

  it("moves to the edit form via the Edit action and saves back to read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) }),
    );
    const { onChanged } = renderHost(fixture());

    fireEvent.click(await screen.findByRole("button", { name: "Edit entry" }));
    const form = await screen.findByRole("form", { name: "Edit entry" });
    const title = screen.getByRole("textbox", { name: /Title/ });
    expect(title).toHaveValue("Team stand-up");

    fireEvent.change(title, { target: { value: "Team stand-up (edited)" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // Returns to the read state.
    expect(
      await screen.findByRole("button", { name: "Edit entry" }),
    ).toBeInTheDocument();
  });

  it("renders edit mode directly when the URL key is edit (deep-link / refresh)", async () => {
    renderHost(fixture(), "edit");
    // No local mode state: the mode comes from the prop (URL key), so a refresh
    // on edit:<id> restores the edit form rather than falling back to read.
    expect(
      await screen.findByRole("form", { name: "Edit entry" }),
    ).toBeInTheDocument();
  });

  it("degrades calmly when the loaded entry doesn’t match the requested id", async () => {
    renderHost(fixture({ id: "someone-else" }), "read", "e1");
    expect(
      await screen.findByText("That entry is no longer available."),
    ).toBeInTheDocument();
  });
});
