import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmationDialog } from "~/shared/settings";

/** A deferred promise the test can settle by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Harness({
  onConfirm,
  typedConfirmation,
}: {
  onConfirm: () => Promise<void>;
  typedConfirmation?: { phrase: string };
}) {
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  return (
    <div>
      <button
        type="button"
        onClick={(event) => {
          setOpener(event.currentTarget);
          setOpen(true);
        }}
      >
        Open
      </button>
      <ConfirmationDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        title="Delete workspace?"
        confirmLabel="Delete workspace"
        cancelLabel="Cancel"
        typedConfirmation={typedConfirmation}
        opener={opener}
      >
        This permanently deletes the workspace.
      </ConfirmationDialog>
    </div>
  );
}

/**
 * A harness whose trigger DISAPPEARS on demand — mirroring a `DangerousAction`
 * whose own mutation triggers an async revalidation that swaps the surrounding
 * view (e.g. archiving a project hides the "Archive project…" button behind the
 * read-only Archived view). Removal is driven imperatively (`exposeRemove`),
 * never by a click (which would itself move focus) or a timer race — so the test
 * can wait for the dialog to genuinely restore focus to the trigger FIRST, then
 * remove it, proving the DELAYED-removal case deterministically.
 */
function HarnessWithVanishingTrigger({
  onConfirm,
  exposeRemove,
}: {
  onConfirm: () => Promise<void>;
  exposeRemove: (remove: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const [triggerRemoved, setTriggerRemoved] = useState(false);
  useEffect(() => {
    exposeRemove(() => setTriggerRemoved(true));
  }, [exposeRemove]);
  return (
    <div>
      <main id="main-content" tabIndex={-1}>
        {!triggerRemoved ? (
          <button
            type="button"
            onClick={(event) => {
              setOpener(event.currentTarget);
              setOpen(true);
            }}
          >
            Archive project…
          </button>
        ) : (
          <p>Archived</p>
        )}
      </main>
      <ConfirmationDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        title="Archive this project?"
        confirmLabel="Archive project"
        cancelLabel="Cancel"
        opener={opener}
      >
        This project becomes read-only.
      </ConfirmationDialog>
    </div>
  );
}

describe("DS-10b ConfirmationDialog", () => {
  it("is a labelled modal dialog with the consequence text", async () => {
    render(<Harness onConfirm={() => Promise.resolve()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Delete workspace?",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("This permanently deletes the workspace.");
  });

  it("moves initial focus to the safe Cancel button, not the destructive one", async () => {
    render(<Harness onConfirm={() => Promise.resolve()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel).toHaveFocus());
  });

  it("restores focus to the trigger on cancel", async () => {
    render(<Harness onConfirm={() => Promise.resolve()} />);
    const trigger = screen.getByRole("button", { name: "Open" });
    fireEvent.click(trigger);
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The post-close focus safety net returns focus to the opener.
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes on Escape", async () => {
    render(<Harness onConfirm={() => Promise.resolve()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  // Regression: the scrim must NOT be inerted, or its outside-click cancel is dead.
  it("inerts the background while keeping the scrim and panel interactive", async () => {
    render(<Harness onConfirm={() => Promise.resolve()} />);
    const trigger = screen.getByRole("button", { name: "Open" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    // The background (the trigger, a sibling of the dialog root) is inert.
    expect(trigger.hasAttribute("inert")).toBe(true);
    // The scrim stays interactive — it is still in the a11y tree (an inert
    // element would be removed, so this query would fail), and it is not inert.
    const scrim = screen.getByRole("button", { name: "Dismiss dialog" });
    expect(scrim.hasAttribute("inert")).toBe(false);
    // The dialog panel is not inert either.
    expect(screen.getByRole("dialog").hasAttribute("inert")).toBe(false);
  });

  it("closes when the scrim (outside) is clicked", async () => {
    render(<Harness onConfirm={() => Promise.resolve()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss dialog" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("traps Tab focus within the panel after the inert change", async () => {
    render(<Harness onConfirm={() => Promise.resolve()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel).toHaveFocus());
    // Shift+Tab from the first focusable wraps to the last within the panel —
    // it never escapes to the (inert) background trigger.
    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(
      screen.getByRole("button", { name: "Delete workspace" }),
    ).toHaveFocus();
  });

  it("runs onConfirm and closes on success", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete workspace" }),
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows an inline alert and stays open on failure, then allows retry", async () => {
    const onConfirm = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce();
    render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const confirm = await screen.findByRole("button", {
      name: "Delete workspace",
    });
    fireEvent.click(confirm);
    // Inline alert appears; dialog stays open.
    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Retry succeeds and closes.
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("prevents duplicate submissions while a confirmation is in flight", async () => {
    const gate = deferred<void>();
    const onConfirm = vi.fn(() => gate.promise);
    render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const confirm = await screen.findByRole("button", {
      name: "Delete workspace",
    });
    fireEvent.click(confirm);
    // While pending, both Confirm and Cancel are disabled — no second submit.
    await waitFor(() => expect(confirm).toBeDisabled());
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // Let it finish so no act warning lingers.
    gate.resolve();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  // PROJ-05 Slice 4: archiving a project (or any dangerous action whose success
  // revalidates the surrounding view) can remove the trigger AFTER this dialog has
  // already restored focus to it. Focus must land somewhere meaningful — never be
  // silently orphaned to `<body>`.
  it("reclaims focus to the page's main region when its trigger vanishes shortly after close", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    let removeTrigger: (() => void) | null = null;
    render(
      <HarnessWithVanishingTrigger
        onConfirm={onConfirm}
        exposeRemove={(remove) => {
          removeTrigger = remove;
        }}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Archive project…" });
    fireEvent.click(trigger);
    fireEvent.click(
      await screen.findByRole("button", { name: "Archive project" }),
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The dialog has restored focus to the trigger (the ordinary, undisturbed
    // path) BEFORE it is removed — proving this is the DELAYED-removal case, not
    // merely the already-handled "opener disconnected at restore time" case.
    await waitFor(() => expect(trigger).toHaveFocus());

    // The "revalidation" now swaps the view, removing the still-focused trigger.
    act(() => {
      removeTrigger?.();
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Archive project…" }),
      ).toBeNull(),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.getElementById("main-content"),
      ),
    );
  });

  describe("typed confirmation", () => {
    it("keeps Confirm disabled until the exact phrase is typed", async () => {
      render(
        <Harness
          onConfirm={() => Promise.resolve()}
          typedConfirmation={{ phrase: "DELETE" }}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Open" }));
      const confirm = await screen.findByRole("button", {
        name: "Delete workspace",
      });
      expect(confirm).toBeDisabled();
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "delete" } });
      expect(confirm).toBeDisabled(); // case-sensitive
      fireEvent.change(input, { target: { value: "DELETE" } });
      expect(confirm).toBeEnabled();
    });

    it("moves initial focus to the confirmation input", async () => {
      render(
        <Harness
          onConfirm={() => Promise.resolve()}
          typedConfirmation={{ phrase: "DELETE" }}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Open" }));
      const input = await screen.findByRole("textbox");
      await waitFor(() => expect(input).toHaveFocus());
    });
  });
});
