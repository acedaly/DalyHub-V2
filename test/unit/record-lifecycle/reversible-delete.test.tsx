import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";
import {
  useReversibleDelete,
  type LifecyclePostResult,
} from "~/shared/record-lifecycle";

/**
 * PX-04 — reversible removal's FAILURE behaviour.
 *
 * Removal is the act a user most needs to be able to trust, so the interesting
 * cases are the ones where it goes wrong: a rejected request must not strand the
 * action in a permanently-disabled state, must not become an unhandled rejection
 * (it is fired without awaiting), and must not swallow the recovery the server
 * already explained.
 */

function Harness({
  post,
}: {
  readonly post: (intent: "delete" | "restore") => Promise<LifecyclePostResult>;
}) {
  const { remove, pending } = useReversibleDelete({
    entityType: "goal",
    title: "Ship v2",
    post,
    redirectTo: "/goals",
  });
  return (
    <button type="button" onClick={() => void remove()} disabled={pending}>
      Delete Goal
    </button>
  );
}

function renderHarness(
  post: (intent: "delete" | "restore") => Promise<LifecyclePostResult>,
) {
  return render(
    <MemoryRouter>
      <FeedbackProvider>
        <Harness post={post} />
      </FeedbackProvider>
    </MemoryRouter>,
  );
}

const toasts = () =>
  within(screen.getByRole("region", { name: "Notifications" }));

describe("useReversibleDelete — failure behaviour", () => {
  it("recovers from a REJECTED request instead of leaving the action disabled forever", async () => {
    // Regression: a network fault or a non-JSON response used to skip both
    // pending resets, so Delete stayed disabled until a page reload.
    const post = vi.fn(async () => {
      throw new Error("network down");
    });
    renderHarness(post);

    const button = screen.getByRole("button", { name: "Delete Goal" });
    fireEvent.click(button);

    await waitFor(() =>
      expect(
        toasts().getByText('Couldn’t delete "Ship v2". Please try again.'),
      ).toBeInTheDocument(),
    );
    // The action is usable again — and a retry genuinely re-fires.
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  });

  it("surfaces the route's OWN recovery message rather than a generic retry", async () => {
    // A blocked delete tells the user what to do first; collapsing that to
    // "try again" would send them round a loop that cannot succeed.
    const post = vi.fn(async () => ({
      ok: false,
      error:
        "This Goal still has active Projects. Move, complete or remove them first, then try again.",
    }));
    renderHarness(post);
    fireEvent.click(screen.getByRole("button", { name: "Delete Goal" }));

    await waitFor(() =>
      expect(
        toasts().getByText(/still has active Projects/),
      ).toBeInTheDocument(),
    );
    expect(
      toasts().queryByText('Couldn’t delete "Ship v2". Please try again.'),
    ).not.toBeInTheDocument();
  });

  it("still reports a plain boolean failure with the generic message", async () => {
    const post = vi.fn(async () => false);
    renderHarness(post);
    fireEvent.click(screen.getByRole("button", { name: "Delete Goal" }));

    await waitFor(() =>
      expect(
        toasts().getByText('Couldn’t delete "Ship v2". Please try again.'),
      ).toBeInTheDocument(),
    );
  });

  it("points at the durable path back when Undo itself fails", async () => {
    const post = vi.fn(async (intent: "delete" | "restore") => {
      if (intent === "restore") {
        throw new Error("network down");
      }
      return true;
    });
    renderHarness(post);
    fireEvent.click(screen.getByRole("button", { name: "Delete Goal" }));

    const undo = await screen.findByRole("button", { name: /Undo/i });
    fireEvent.click(undo);

    await waitFor(() =>
      expect(
        toasts().getByText(
          /Find it in Deleted Goals and restore it from there/,
        ),
      ).toBeInTheDocument(),
    );
  });
});
