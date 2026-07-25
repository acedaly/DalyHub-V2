import { RouterProvider, createMemoryRouter } from "react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiaryDetailsHost } from "~/modules/diary/DiaryDetailsPanel";
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

function renderHost(
  entry: DiaryEntryEditData,
  initialMode: "read" | "edit" = "read",
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
            <DiaryDetailsHost
              entryId={requestedId}
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

  it("degrades calmly when the loaded entry doesn't match the requested id", async () => {
    renderHost(fixture({ id: "someone-else" }), "read", "e1");
    expect(
      await screen.findByText("That entry is no longer available."),
    ).toBeInTheDocument();
  });
});
