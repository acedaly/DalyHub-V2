/**
 * MOBILE-01 — the writing toolbar's primary/secondary split.
 *
 * The contract: common formatting is offered directly, low-frequency commands sit
 * one tap away behind "More", nothing becomes unreachable, and the whole row stays
 * exactly ONE Tab stop with Arrow-key navigation across everything on screen (the
 * DS-11 baseline for a command-button row).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditorToolbar } from "~/shared/markdown-editor/EditorToolbar";
import {
  MARKDOWN_FORMATTING_ACTIONS,
  PRIMARY_FORMATTING_ACTIONS,
  SECONDARY_FORMATTING_ACTIONS,
} from "~/shared/markdown-editor/formatting-actions";

/** Every focusable control the toolbar currently renders. */
function controls(): HTMLButtonElement[] {
  return Array.from(
    screen.getByRole("toolbar").querySelectorAll("button:not([disabled])"),
  );
}

describe("formatting action split", () => {
  it("partitions the catalogue without losing or duplicating an action", () => {
    const ids = [
      ...PRIMARY_FORMATTING_ACTIONS,
      ...SECONDARY_FORMATTING_ACTIONS,
    ].map((action) => action.id);
    expect(new Set(ids).size).toBe(MARKDOWN_FORMATTING_ACTIONS.length);
  });

  it("keeps the toolbar short enough to be scannable on a phone", () => {
    expect(PRIMARY_FORMATTING_ACTIONS.length).toBeLessThan(
      MARKDOWN_FORMATTING_ACTIONS.length,
    );
    expect(PRIMARY_FORMATTING_ACTIONS.length).toBeGreaterThan(0);
  });
});

describe("EditorToolbar", () => {
  it("shows the common formatting directly and hides the rest behind More", () => {
    render(<EditorToolbar onAction={vi.fn()} />);
    for (const action of PRIMARY_FORMATTING_ACTIONS) {
      expect(
        screen.getByRole("button", { name: action.label }),
      ).toBeInTheDocument();
    }
    for (const action of SECONDARY_FORMATTING_ACTIONS) {
      expect(
        screen.queryByRole("button", { name: action.label }),
      ).not.toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("reveals every remaining command in one tap — nothing is unreachable", () => {
    render(<EditorToolbar onAction={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    for (const action of SECONDARY_FORMATTING_ACTIONS) {
      expect(
        screen.getByRole("button", { name: action.label }),
      ).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("stays exactly one Tab stop, expanded or collapsed", () => {
    render(<EditorToolbar onAction={vi.fn()} />);
    const tabStops = () =>
      controls().filter((button) => button.tabIndex === 0).length;
    expect(tabStops()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(tabStops()).toBe(1);
  });

  it("moves across every visible control with the arrow keys", () => {
    render(<EditorToolbar onAction={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));

    const first = controls()[0];
    first.focus();
    fireEvent.keyDown(first, { key: "End" });
    // End reaches the LAST secondary action, so a revealed command is genuinely
    // keyboard-reachable rather than pointer-only.
    const last = SECONDARY_FORMATTING_ACTIONS.at(-1);
    expect(
      screen.getByRole("button", { name: last?.label ?? "" }),
    ).toHaveFocus();

    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowRight",
    });
    // Wrapping from the end returns to the first primary action.
    expect(
      screen.getByRole("button", {
        name: PRIMARY_FORMATTING_ACTIONS[0].label,
      }),
    ).toHaveFocus();
  });

  it("applies a revealed secondary action through the same callback", () => {
    const onAction = vi.fn();
    render(<EditorToolbar onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const table = SECONDARY_FORMATTING_ACTIONS.find(
      (action) => action.id === "table",
    );
    fireEvent.click(screen.getByRole("button", { name: table?.label ?? "" }));
    expect(onAction).toHaveBeenCalledWith(table);
  });

  it("does not steal focus from the editor on pointer press", () => {
    render(<EditorToolbar onAction={vi.fn()} />);
    const bold = screen.getByRole("button", { name: "Bold" });
    // `mousedown` is prevented, so the caret (and, on a phone, the software
    // keyboard) survives a formatting tap.
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    bold.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
