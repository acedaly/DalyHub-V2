import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { DiaryCapture } from "~/modules/diary/DiaryCapture";

/**
 * DEBT-45 — capture is now route-aware: a hand-off from Quick Capture carries its
 * source record in the `?ctx=` parameter, so the form reads the URL. It is
 * rendered in a router here for that reason, exactly as every other route-backed
 * create form in the suite is (`test/unit/notes/create-forms.test.tsx`).
 */
function renderCapture(node: ReactElement, entry = "/diary") {
  const router = createMemoryRouter([{ path: "/diary", element: node }], {
    initialEntries: [entry],
  });
  return render(<RouterProvider router={router} />);
}

/**
 * DIARY-01B — the compact capture flow as behaviour: the fast path (default type +
 * title + submit) posts to the reserved capture route, keyboard submit works, the
 * type chooser is operable, and the captured local day is reported (so a backdated
 * entry can be surfaced on the day it actually belongs to).
 */

function mockCaptureOk(entryId = "e1") {
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => ({ ok: true, entryId }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Diary capture", () => {
  it("captures via the fast path and reports today’s local day", async () => {
    const fetchMock = mockCaptureOk("new-1");
    const onCaptured = vi.fn();
    renderCapture(
      <DiaryCapture todayKey="2026-07-20" onCaptured={onCaptured} />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: /Title/ }), {
      target: { value: "Kickoff" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    await waitFor(() =>
      expect(onCaptured).toHaveBeenCalledWith("new-1", "2026-07-20", false),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/diary/new",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("requires a title (fast-path validation)", async () => {
    mockCaptureOk();
    const onCaptured = vi.fn();
    renderCapture(
      <DiaryCapture todayKey="2026-07-20" onCaptured={onCaptured} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    expect(
      (await screen.findAllByText("A title is required")).length,
    ).toBeGreaterThan(0);
    expect(onCaptured).not.toHaveBeenCalled();
  });

  it("submits with Ctrl/Cmd+Enter from the title field", async () => {
    mockCaptureOk("kbd-1");
    const onCaptured = vi.fn();
    renderCapture(
      <DiaryCapture todayKey="2026-07-20" onCaptured={onCaptured} />,
    );
    const title = screen.getByRole("textbox", { name: /Title/ });
    fireEvent.change(title, { target: { value: "Keyboard" } });
    fireEvent.keyDown(title, { key: "Enter", ctrlKey: true });
    await waitFor(() =>
      expect(onCaptured).toHaveBeenCalledWith("kbd-1", "2026-07-20", false),
    );
  });

  it("reports the backdated local day for an entry captured under a past 'when'", async () => {
    mockCaptureOk("memory-1");
    const onCaptured = vi.fn();
    renderCapture(
      <DiaryCapture todayKey="2026-07-20" onCaptured={onCaptured} />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: /Title/ }), {
      target: { value: "Memory" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add details" }));
    fireEvent.change(screen.getByLabelText("When"), {
      target: { value: "2020-01-15T09:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await waitFor(() =>
      expect(onCaptured).toHaveBeenCalledWith("memory-1", "2020-01-15", false),
    );
  });

  it("keeps the panel open and clears the form for a repeated capture (MOBILE-01)", async () => {
    mockCaptureOk("burst-1");
    const onCaptured = vi.fn();
    renderCapture(
      <DiaryCapture todayKey="2026-07-20" onCaptured={onCaptured} />,
    );

    const title = () => screen.getByRole("textbox", { name: /Title/ });
    fireEvent.change(title(), { target: { value: "First thought" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save and add another" }),
    );

    // The workspace is told to KEEP the panel open, so a burst of entries costs
    // one re-open rather than one per entry.
    await waitFor(() =>
      expect(onCaptured).toHaveBeenCalledWith("burst-1", "2026-07-20", true),
    );
    // …and the form is cleared and refocused, so the next entry is type-and-save.
    await waitFor(() => expect((title() as HTMLInputElement).value).toBe(""));
    expect(title()).toHaveFocus();
  });

  it("returns to the close-on-save path for the next ordinary capture", async () => {
    mockCaptureOk("burst-2");
    const onCaptured = vi.fn();
    renderCapture(
      <DiaryCapture todayKey="2026-07-20" onCaptured={onCaptured} />,
    );
    const title = () => screen.getByRole("textbox", { name: /Title/ });

    fireEvent.change(title(), { target: { value: "One" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save and add another" }),
    );
    await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1));

    fireEvent.change(title(), { target: { value: "Two" } });
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    // The add-another intent does not stick — the plain Capture still closes.
    await waitFor(() =>
      expect(onCaptured).toHaveBeenLastCalledWith(
        "burst-2",
        "2026-07-20",
        false,
      ),
    );
  });

  it("lets the chooser change the entry type", () => {
    mockCaptureOk();
    renderCapture(<DiaryCapture todayKey="2026-07-20" onCaptured={vi.fn()} />);
    const meeting = screen.getByRole("radio", { name: /Meeting/ });
    fireEvent.click(meeting);
    expect(meeting).toBeChecked();
  });
});
