import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MeetingCaptureBar } from "~/modules/meetings/MeetingCaptureBar";

/**
 * MOBILE-01 — the Meeting capture bar's repeated-entry contract.
 *
 * The bar exists so a whole meeting can be captured without leaving the
 * workspace: choose a type, type, Enter, type, Enter. That only works if the
 * field keeps focus across a save — on a phone, losing focus dismisses the
 * keyboard, which turns every subsequent capture into two extra taps.
 *
 * The field is deliberately `disabled` while a save is in flight (honest feedback,
 * and it stops a double submit), and disabling it blurs it. So "refocus after
 * saving" is not incidental polish — it is the behaviour that makes the bar worth
 * having, and it is easy to write in a way that silently does nothing, because a
 * `focus()` call on a still-disabled element is dropped without error.
 *
 * These tests hold that contract on the success path, the failure path (where the
 * user's words must survive so they can retry) and the type switch.
 */

/** A save that resolves only when the test says so, so `busy` is observable. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("capturing repeatedly during a meeting", () => {
  it("clears the field and returns focus to it after a save completes", async () => {
    const gate = deferred<boolean>();
    const onAddItem = vi.fn(() => gate.promise);
    render(
      <MeetingCaptureBar
        onAddItem={onAddItem}
        onAppendNote={async () => true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Action" }));
    const input = screen.getByRole("textbox", { name: "Action" });
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: "Book the room" } });
    fireEvent.submit(input.closest("form")!);

    // In flight the field is disabled. A real browser blurs a disabled element —
    // which is exactly why the refocus has to happen after it is re-enabled — but
    // happy-dom does not model that, so this asserts the disabled state only and
    // the phone journey in `e2e/mobile-capture-journeys.spec.ts` proves the focus
    // behaviour in a real browser.
    await waitFor(() => expect(input).toBeDisabled());

    gate.resolve(true);

    // Settled: cleared, interactive again, and focused — ready for the next one
    // with the phone keyboard still up.
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue("");
    await waitFor(() => expect(input).toHaveFocus());
    expect(onAddItem).toHaveBeenCalledWith("action", "Book the room");
  });

  it("keeps the words and the focus when a save fails, so it can be retried", async () => {
    const onAddItem = vi.fn(async () => false);
    render(
      <MeetingCaptureBar
        onAddItem={onAddItem}
        onAppendNote={async () => true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Decision" }));
    const input = screen.getByRole("textbox", { name: "Decision" });
    fireEvent.change(input, { target: { value: "Ship on Friday" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(input).toBeEnabled());
    // A failed capture must never cost the words.
    expect(input).toHaveValue("Ship on Friday");
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent(/couldn’t be saved/);
  });

  it("focuses the field when a capture type is chosen", () => {
    render(
      <MeetingCaptureBar
        onAddItem={async () => true}
        onAppendNote={async () => true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Outcome" }));
    expect(screen.getByRole("textbox", { name: "Outcome" })).toHaveFocus();
  });

  it("routes a note through the notes authority, not the item authority", async () => {
    const onAddItem = vi.fn(async () => true);
    const onAppendNote = vi.fn(async () => true);
    render(
      <MeetingCaptureBar onAddItem={onAddItem} onAppendNote={onAppendNote} />,
    );

    const input = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(input, { target: { value: "Raised the budget risk" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() =>
      expect(onAppendNote).toHaveBeenCalledWith("Raised the budget risk"),
    );
    expect(onAddItem).not.toHaveBeenCalled();
  });

  it("renders nothing at all for a read-only meeting", () => {
    const { container } = render(
      <MeetingCaptureBar
        readOnly
        onAddItem={async () => true}
        onAppendNote={async () => true}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
