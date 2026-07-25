import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuickCapture } from "~/modules/diary/QuickCapture";
import { FeedbackProvider } from "~/shared/feedback";

/**
 * DIARY-01 — the quick-capture surface as behaviour: required-title validation
 * without a server round-trip, Cmd/Ctrl+Enter submission, duplicate-submit
 * prevention, draft retention on a rejected capture, and the reset + refocus
 * after a successful capture.
 */

function renderCapture(onCaptured = vi.fn()) {
  return {
    onCaptured,
    ...render(
      <FeedbackProvider>
        <QuickCapture onCaptured={onCaptured} />
      </FeedbackProvider>,
    ),
  };
}

function titleInput(): HTMLInputElement {
  return screen.getByLabelText(/title/i) as HTMLInputElement;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("QuickCapture", () => {
  it("rejects an empty title on the client without calling the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderCapture();

    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    expect(
      (await screen.findAllByText("A title is required")).length,
    ).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits on Cmd/Ctrl+Enter from a field", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, entryId: "d1" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderCapture();

    fireEvent.change(titleInput(), { target: { value: "A decision" } });
    fireEvent.keyDown(titleInput(), { key: "Enter", metaKey: true });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/diary/new",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("prevents a duplicate submit while one is in flight", async () => {
    let resolve: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderCapture();

    fireEvent.change(titleInput(), { target: { value: "Twice" } });
    const button = screen.getByRole("button", { name: "Capture" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve?.({ json: async () => ({ ok: true, entryId: "d1" }) });
    });
  });

  it("retains the entered draft when the server rejects the capture", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: false, fieldErrors: { title: "Too long" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderCapture();

    fireEvent.change(titleInput(), { target: { value: "Kept text" } });
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    expect((await screen.findAllByText("Too long")).length).toBeGreaterThan(0);
    expect(titleInput().value).toBe("Kept text");
  });

  it("resets the draft and refocuses the title after a successful capture", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, entryId: "d1" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { onCaptured } = renderCapture();

    fireEvent.change(titleInput(), { target: { value: "An idea" } });
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(titleInput().value).toBe(""));
    await waitFor(() => expect(document.activeElement).toBe(titleInput()));
  });
});
