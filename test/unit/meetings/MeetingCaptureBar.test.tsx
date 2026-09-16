import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  MeetingCaptureBar,
  defaultCaptureKind,
} from "~/modules/meetings/MeetingCaptureBar";
import type { MeetingCaptureOutcome } from "~/modules/meetings/meeting-offline-capture";

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
    const gate = deferred<MeetingCaptureOutcome>();
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

    gate.resolve({ kind: "saved" });

    // Settled: cleared, interactive again, and focused — ready for the next one
    // with the phone keyboard still up.
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue("");
    await waitFor(() => expect(input).toHaveFocus());
    expect(onAddItem).toHaveBeenCalledWith("action", "Book the room");
  });

  it("keeps the words and the focus when a save fails, so it can be retried", async () => {
    const onAddItem = vi.fn(async (): Promise<MeetingCaptureOutcome> => ({
      kind: "refused",
      message: "That couldn’t be saved. Your text is safe — try again.",
    }));
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
        onAddItem={async () => ({ kind: "saved" })}
        onAppendNote={async () => true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Outcome" }));
    expect(screen.getByRole("textbox", { name: "Outcome" })).toHaveFocus();
  });

  it("routes a note through the notes authority, not the item authority", async () => {
    const onAddItem = vi.fn(async (): Promise<MeetingCaptureOutcome> => ({
      kind: "saved",
    }));
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
        onAddItem={async () => ({ kind: "saved" })}
        onAppendNote={async () => true}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * MOBILE-03 — Agenda joined the bar, offline captures are reported as kept
 * rather than as failed, and the type the bar OPENS on follows the meeting.
 */
describe("capturing an agenda, and capturing without a connection", () => {
  it("offers Agenda and routes it through the item authority", async () => {
    const onAddItem = vi.fn(async (): Promise<MeetingCaptureOutcome> => ({
      kind: "saved",
    }));
    render(
      <MeetingCaptureBar
        initialKind="agenda"
        onAddItem={onAddItem}
        onAppendNote={async () => true}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Agenda" });
    fireEvent.change(input, { target: { value: "Budget for Q3" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() =>
      expect(onAddItem).toHaveBeenCalledWith("agenda", "Budget for Q3"),
    );
  });

  it("reports a queued capture as kept on the device, and clears the field", async () => {
    const onAddItem = vi.fn(async (): Promise<MeetingCaptureOutcome> => ({
      kind: "queued",
    }));
    render(
      <MeetingCaptureBar
        onAddItem={onAddItem}
        onAppendNote={async () => true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Decision" }));
    const input = screen.getByRole("textbox", { name: "Decision" });
    fireEvent.change(input, { target: { value: "Defer the rebuild" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(input).toBeEnabled());
    // A queued capture is a SUCCESS from the owner's side: the field clears, so
    // the next one can be typed straight away, and the status says where it is
    // rather than telling them to try again.
    expect(input).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent(
      /saved on this device/i,
    );
    expect(screen.getByRole("status")).not.toHaveTextContent(/try again/i);
  });

  it("opens on Agenda before a meeting is held and Note afterwards", () => {
    expect(defaultCaptureKind({ heldAt: null, status: "planned" })).toBe(
      "agenda",
    );
    expect(
      defaultCaptureKind({ heldAt: "2026-09-16T01:00:00Z", status: "planned" }),
    ).toBe("note");
    expect(defaultCaptureKind({ heldAt: null, status: "completed" })).toBe(
      "note",
    );
    expect(defaultCaptureKind({ heldAt: null, status: "cancelled" })).toBe(
      "note",
    );
  });
});
