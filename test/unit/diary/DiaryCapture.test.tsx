import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiaryCapture } from "~/modules/diary/DiaryCapture";

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
    render(<DiaryCapture todayKey="2026-07-20" onCaptured={onCaptured} />);

    fireEvent.change(screen.getByRole("textbox", { name: /Title/ }), {
      target: { value: "Kickoff" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    await waitFor(() =>
      expect(onCaptured).toHaveBeenCalledWith("new-1", "2026-07-20"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/diary/new",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("requires a title (fast-path validation)", async () => {
    mockCaptureOk();
    const onCaptured = vi.fn();
    render(<DiaryCapture todayKey="2026-07-20" onCaptured={onCaptured} />);
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    expect(
      (await screen.findAllByText("A title is required")).length,
    ).toBeGreaterThan(0);
    expect(onCaptured).not.toHaveBeenCalled();
  });

  it("submits with Ctrl/Cmd+Enter from the title field", async () => {
    mockCaptureOk("kbd-1");
    const onCaptured = vi.fn();
    render(<DiaryCapture todayKey="2026-07-20" onCaptured={onCaptured} />);
    const title = screen.getByRole("textbox", { name: /Title/ });
    fireEvent.change(title, { target: { value: "Keyboard" } });
    fireEvent.keyDown(title, { key: "Enter", ctrlKey: true });
    await waitFor(() =>
      expect(onCaptured).toHaveBeenCalledWith("kbd-1", "2026-07-20"),
    );
  });

  it("reports the backdated local day for an entry captured under a past 'when'", async () => {
    mockCaptureOk("memory-1");
    const onCaptured = vi.fn();
    render(<DiaryCapture todayKey="2026-07-20" onCaptured={onCaptured} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Title/ }), {
      target: { value: "Memory" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add details" }));
    fireEvent.change(screen.getByLabelText("When"), {
      target: { value: "2020-01-15T09:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await waitFor(() =>
      expect(onCaptured).toHaveBeenCalledWith("memory-1", "2020-01-15"),
    );
  });

  it("lets the chooser change the entry type", () => {
    mockCaptureOk();
    render(<DiaryCapture todayKey="2026-07-20" onCaptured={vi.fn()} />);
    const meeting = screen.getByRole("radio", { name: /Meeting/ });
    fireEvent.click(meeting);
    expect(meeting).toBeChecked();
  });
});
