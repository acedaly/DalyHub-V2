import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_NOTIFICATIONS } from "~/shared/feedback/config";
import { FeedbackProvider } from "~/shared/feedback/FeedbackProvider";
import {
  useFeedback,
  type FeedbackApi,
} from "~/shared/feedback/feedback-context";

let api: FeedbackApi;

function Capture() {
  api = useFeedback();
  return null;
}

function renderProvider() {
  return render(
    <FeedbackProvider>
      <Capture />
    </FeedbackProvider>,
  );
}

/** A fake-timer-friendly, abortable wait. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("DS-10 FeedbackProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("throws if useFeedback is used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Capture />)).toThrow(/FeedbackProvider/);
    spy.mockRestore();
  });

  it("renders a success toast with title and message", () => {
    renderProvider();
    act(() => {
      api.notifySuccess("Task completed", { message: "All good" });
    });
    expect(screen.getByText("Task completed")).toBeInTheDocument();
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("auto-dismisses a success notification after its duration", async () => {
    renderProvider();
    act(() => {
      api.notifySuccess("Saved");
    });
    expect(screen.getByRole("group", { name: "Saved" })).toBeInTheDocument();
    await advance(5000);
    expect(
      screen.queryByRole("group", { name: "Saved" }),
    ).not.toBeInTheDocument();
  });

  it("keeps an error notification sticky (no auto-dismiss)", async () => {
    renderProvider();
    act(() => {
      api.notifyError("Couldn’t save");
    });
    await advance(60_000);
    expect(
      screen.getByRole("group", { name: "Couldn’t save" }),
    ).toBeInTheDocument();
  });

  it("pauses auto-dismiss while hovered, then resumes", async () => {
    renderProvider();
    act(() => {
      api.notifySuccess("Saved");
    });
    const region = screen.getByRole("region", { name: "Notifications" });
    fireEvent.mouseEnter(region);
    await advance(5000);
    expect(screen.getByRole("group", { name: "Saved" })).toBeInTheDocument(); // frozen while hovered
    fireEvent.mouseLeave(region);
    await advance(5000);
    expect(
      screen.queryByRole("group", { name: "Saved" }),
    ).not.toBeInTheDocument();
  });

  it("coalesces repeats with the same dedupeKey and shows a count", () => {
    renderProvider();
    act(() => {
      api.notifyInfo("Message received", { dedupeKey: "msg" });
      api.notifyInfo("Message received", { dedupeKey: "msg" });
    });
    expect(
      screen.getAllByRole("group", { name: "Message received" }),
    ).toHaveLength(1);
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("dismisses a notification via its close button", () => {
    renderProvider();
    act(() => {
      api.notifyInfo("Sync scheduled");
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss: Sync scheduled" }),
    );
    expect(
      screen.queryByRole("group", { name: "Sync scheduled" }),
    ).not.toBeInTheDocument();
  });

  it("announces politely for success and assertively for errors", () => {
    const { container } = renderProvider();
    act(() => {
      api.notifyError("Boom");
    });
    expect(
      container.querySelector('[aria-live="assertive"]'),
    ).toHaveTextContent("Boom");
    act(() => {
      api.notifySuccess("Yay");
    });
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(
      "Yay",
    );
  });

  describe("undo", () => {
    it("runs the undo handler on Undo and does not commit", async () => {
      renderProvider();
      const onUndo = vi.fn();
      const onExpire = vi.fn();
      act(() => {
        api.notifyUndo("Deleted “Draft”", { onUndo, onExpire });
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      });
      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(onExpire).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("group", { name: "Deleted “Draft”" }),
      ).not.toBeInTheDocument();
    });

    it("commits (onExpire) when the undo window elapses", async () => {
      renderProvider();
      const onUndo = vi.fn();
      const onExpire = vi.fn();
      act(() => {
        api.notifyUndo("Deleted “Draft”", { onUndo, onExpire });
      });
      await advance(8000);
      expect(onExpire).toHaveBeenCalledTimes(1);
      expect(onUndo).not.toHaveBeenCalled();
    });

    it("commits (onExpire) when the undo toast is dismissed early", () => {
      renderProvider();
      const onUndo = vi.fn();
      const onExpire = vi.fn();
      act(() => {
        api.notifyUndo("Deleted “Draft”", { onUndo, onExpire });
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Dismiss: Deleted “Draft”" }),
      );
      expect(onExpire).toHaveBeenCalledTimes(1);
      expect(onUndo).not.toHaveBeenCalled();
    });

    it("does not coalesce two undos — each keeps and commits its own handler", async () => {
      renderProvider();
      const expireA = vi.fn();
      const expireB = vi.fn();
      act(() => {
        api.notifyUndo("Deleted A", { onUndo: vi.fn(), onExpire: expireA });
        api.notifyUndo("Deleted B", { onUndo: vi.fn(), onExpire: expireB });
      });
      // Two distinct toasts (undo notifications never merge).
      expect(
        screen.getByRole("group", { name: "Deleted A" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("group", { name: "Deleted B" }),
      ).toBeInTheDocument();
      await advance(8000);
      expect(expireA).toHaveBeenCalledTimes(1);
      expect(expireB).toHaveBeenCalledTimes(1);
    });

    it("commits (onExpire) exactly once when an undo is evicted by stack overflow", () => {
      renderProvider();
      const onUndo = vi.fn();
      const onExpire = vi.fn();
      act(() => {
        // The undo is raised first (oldest, auto-dismissing). A burst of
        // newer auto-dismissing notifications then exceeds the bound and evicts it.
        api.notifyUndo("Deleted “Draft”", { onUndo, onExpire });
        for (let i = 0; i < MAX_NOTIFICATIONS; i += 1) {
          api.notifySuccess(`Saved ${i}`);
        }
      });
      // Evicted from the visible stack, but its optimistic action still commits —
      // exactly once — and is NOT undone.
      expect(
        screen.queryByRole("group", { name: "Deleted “Draft”" }),
      ).not.toBeInTheDocument();
      expect(onExpire).toHaveBeenCalledTimes(1);
      expect(onUndo).not.toHaveBeenCalled();
    });

    it("commits every pending undo exactly once on dismiss-all", () => {
      renderProvider();
      const expireA = vi.fn();
      const expireB = vi.fn();
      act(() => {
        api.notifyUndo("Deleted A", { onUndo: vi.fn(), onExpire: expireA });
        api.notifyUndo("Deleted B", { onUndo: vi.fn(), onExpire: expireB });
      });
      fireEvent.click(screen.getByRole("button", { name: "Dismiss all" }));
      expect(expireA).toHaveBeenCalledTimes(1);
      expect(expireB).toHaveBeenCalledTimes(1);
    });

    it("commits pending undos on unmount (window torn down)", () => {
      const { unmount } = renderProvider();
      const onExpire = vi.fn();
      act(() => {
        api.notifyUndo("Deleted “Draft”", { onUndo: vi.fn(), onExpire });
      });
      act(() => {
        unmount();
      });
      expect(onExpire).toHaveBeenCalledTimes(1);
    });
  });

  it("handles a rejected async notification action without crashing", async () => {
    renderProvider();
    const onSelect = vi.fn().mockRejectedValue(new Error("boom"));
    act(() => {
      api.notifyInfo("Actionable", { action: { label: "Do it", onSelect } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Do it" }));
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    // The rejection is swallowed (no unhandled rejection) and the toast dismisses.
    expect(
      screen.queryByRole("group", { name: "Actionable" }),
    ).not.toBeInTheDocument();
  });

  describe("background operations", () => {
    it("runs an operation through running → success and notifies", async () => {
      renderProvider();
      let resolved: unknown;
      act(() => {
        void api
          .runOperation({
            label: "Exporting",
            run: ({ signal }) => wait(500, signal),
            successMessage: "Export ready",
          })
          .then((r) => {
            resolved = r;
          });
      });
      expect(screen.getByText("Exporting")).toBeInTheDocument();
      expect(screen.getByText("Working…")).toBeInTheDocument();
      await advance(500);
      expect(
        screen.getByRole("group", { name: "Export ready" }),
      ).toBeInTheDocument();
      expect(resolved).toBeUndefined();
    });

    it("cancels a cancellable operation and retires the row", async () => {
      renderProvider();
      act(() => {
        void api
          .runOperation({
            label: "Syncing calendar",
            cancellable: true,
            run: ({ signal }) => wait(60_000, signal),
          })
          .catch(() => {});
      });
      expect(screen.getByText("Syncing calendar")).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      });
      expect(screen.queryByText("Syncing calendar")).not.toBeInTheDocument();
    });

    it("surfaces failure with Retry, then succeeds on retry", async () => {
      renderProvider();
      let attempts = 0;
      act(() => {
        void api
          .runOperation({
            label: "Importing",
            retryable: true,
            run: async ({ signal }) => {
              await wait(100, signal);
              attempts += 1;
              if (attempts < 2) {
                throw new Error("Temporary error");
              }
            },
          })
          .catch(() => {});
      });
      await advance(100);
      expect(screen.getByText(/Temporary error/)).toBeInTheDocument();
      const retry = screen.getByRole("button", { name: "Retry" });
      await act(async () => {
        fireEvent.click(retry);
      });
      await advance(100);
      expect(
        screen.queryByRole("button", { name: "Retry" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Done")).toBeInTheDocument();
    });
  });
});
