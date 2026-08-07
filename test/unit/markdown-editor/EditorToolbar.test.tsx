/**
 * MOBILE-01 / EDIT-01 — the writing toolbar's primary/secondary split.
 *
 * EDIT-01 turned the row from words-in-tiles into compact icon controls. The
 * accessible NAME is still the word, which is why every assertion below still
 * queries by it — the contract these tests protect never depended on the glyph.
 * The "More" toggle's name became self-describing ("More formatting options"),
 * because "More" beside eleven other buttons named nothing on its own.
 *
 * The contract: common formatting is offered directly, low-frequency commands sit
 * one tap away behind "More", nothing becomes unreachable, and the whole row stays
 * exactly ONE Tab stop with Arrow-key navigation across everything on screen (the
 * DS-11 baseline for a command-button row).
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditorToolbar } from "~/shared/markdown-editor/EditorToolbar";
import {
  MARKDOWN_FORMATTING_ACTIONS,
  PRIMARY_FORMATTING_ACTIONS,
  SECONDARY_FORMATTING_ACTIONS,
} from "~/shared/markdown-editor/formatting-actions";

const MORE_LABEL = "More formatting options";
const LESS_LABEL = "Fewer formatting options";

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
    expect(screen.getByRole("button", { name: MORE_LABEL })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("reveals every remaining command in one tap — nothing is unreachable", () => {
    render(<EditorToolbar onAction={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: MORE_LABEL }));
    for (const action of SECONDARY_FORMATTING_ACTIONS) {
      expect(
        screen.getByRole("button", { name: action.label }),
      ).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: LESS_LABEL })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("stays exactly one Tab stop, expanded or collapsed", () => {
    render(<EditorToolbar onAction={vi.fn()} />);
    const tabStops = () =>
      controls().filter((button) => button.tabIndex === 0).length;
    expect(tabStops()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: MORE_LABEL }));
    expect(tabStops()).toBe(1);
  });

  it("moves across every visible control with the arrow keys", () => {
    render(<EditorToolbar onAction={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: MORE_LABEL }));

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
    fireEvent.click(screen.getByRole("button", { name: MORE_LABEL }));
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

/**
 * EDIT-01 — the state a formatting toolbar has to be able to show.
 *
 * A control that cannot say "this text is already bold" is a control that makes
 * the user guess, and guessing is how you end up with `****double bold****`.
 */
describe("EditorToolbar — active, history and grouping", () => {
  it("presses the controls whose formatting already applies", () => {
    render(<EditorToolbar onAction={vi.fn()} activeIds={new Set(["bold"])} />);
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Italic" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("gives one-shot insertions no pressed state at all", () => {
    // "Link" inserts; it is not a state the text can be IN, so `aria-pressed`
    // would be a lie in either direction.
    render(<EditorToolbar onAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Link" })).not.toHaveAttribute(
      "aria-pressed",
    );
  });

  it("omits undo/redo entirely when the surface cannot report them", () => {
    // The SSR/no-JS textarea has the browser's own undo stack, which no API can
    // query. A permanently-enabled button that may do nothing is worse than an
    // absent one.
    render(<EditorToolbar onAction={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: "Undo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Redo" }),
    ).not.toBeInTheDocument();
  });

  it("disables undo and redo until there is history to move through", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const { rerender } = render(
      <EditorToolbar
        onAction={vi.fn()}
        history={{ canUndo: false, canRedo: false, onUndo, onRedo }}
      />,
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();

    rerender(
      <EditorToolbar
        onAction={vi.fn()}
        history={{ canUndo: true, canRedo: false, onUndo, onRedo }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("separates the groups with dividers rather than a box per button", () => {
    const { container } = render(<EditorToolbar onAction={vi.fn()} />);
    expect(
      container.querySelectorAll(".dh-md-toolbar__separator").length,
    ).toBeGreaterThan(0);
  });

  it("names every control, so nothing is icon-only to assistive tech", () => {
    render(<EditorToolbar onAction={vi.fn()} />);
    for (const button of controls()) {
      expect(
        button.getAttribute("aria-label")?.trim().length ?? 0,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps the toolbar one Tab stop once undo/redo join it", () => {
    render(
      <EditorToolbar
        onAction={vi.fn()}
        history={{
          canUndo: true,
          canRedo: true,
          onUndo: vi.fn(),
          onRedo: vi.fn(),
        }}
      />,
    );
    expect(controls().filter((b) => b.tabIndex === 0).length).toBe(1);
  });
});

/**
 * EDIT-01 — the roving tab stop must always land on an ENABLED control.
 *
 * This is not a nicety. Undo is the FIRST control in the row and is disabled on
 * a freshly mounted editor, so parking the toolbar's single tab stop at index 0
 * put it on a button the browser will not tab to: the whole toolbar dropped out
 * of the Tab order. And because the row scrolls horizontally, that also left a
 * scrollable region with no focusable content — which axe reports as a serious
 * WCAG failure (`scrollable-region-focusable`), and did, on three CI shards.
 */
describe("EditorToolbar — the tab stop never rests on a disabled control", () => {
  const noHistory = { canUndo: false, canRedo: false } as const;

  function renderWithHistory(history: { canUndo: boolean; canRedo: boolean }) {
    return render(
      <EditorToolbar
        onAction={vi.fn()}
        history={{ ...history, onUndo: vi.fn(), onRedo: vi.fn() }}
      />,
    );
  }

  it("gives a freshly mounted editor a tabbable control, not a disabled Undo", () => {
    renderWithHistory(noHistory);
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo" }).tabIndex).toBe(-1);
    // Exactly one control is tabbable, and it is an enabled one.
    const tabbable = controls().filter((button) => button.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBeEnabled();
  });

  it("leaves the scrollable toolbar with focusable content", () => {
    // The axe rule this guards asks for either focusable content or a focusable
    // container. The assertion is the observable property, not the mechanism.
    const { container } = renderWithHistory(noHistory);
    const toolbar = container.querySelector(".dh-md-toolbar") as HTMLElement;
    const tabbable = Array.from(
      toolbar.querySelectorAll<HTMLElement>("button:not([disabled])"),
    ).filter((node) => node.tabIndex === 0);
    expect(tabbable.length + (toolbar.tabIndex === 0 ? 1 : 0)).toBeGreaterThan(
      0,
    );
  });

  it("skips disabled controls when arrowing", () => {
    renderWithHistory({ canUndo: false, canRedo: true });
    const redo = screen.getByRole("button", { name: "Redo" });
    redo.focus();
    // Arrowing backwards from Redo must not land on the disabled Undo; it wraps
    // to the last enabled control instead.
    fireEvent.keyDown(redo, { key: "ArrowLeft" });
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "Undo" }),
    );
    expect(document.activeElement).toBeEnabled();
  });

  it("moves the tab stop off a control that BECOMES disabled", () => {
    // Undoing the last edit disables Undo underneath the user's own focus. The
    // stop has to move rather than evaporate.
    const { rerender } = renderWithHistory({ canUndo: true, canRedo: false });
    screen.getByRole("button", { name: "Undo" }).focus();
    expect(screen.getByRole("button", { name: "Undo" }).tabIndex).toBe(0);

    rerender(
      <EditorToolbar
        onAction={vi.fn()}
        history={{
          canUndo: false,
          canRedo: true,
          onUndo: vi.fn(),
          onRedo: vi.fn(),
        }}
      />,
    );
    const tabbable = controls().filter((button) => button.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBeEnabled();
  });
});

/**
 * M3-TIP — the toolbar is the shared tooltip's reference adoption.
 *
 * It is the surface the August 2026 audit named: thirteen icon controls whose
 * only explanation was `title`, which never appears on keyboard focus — so the
 * shortcut hint reached a mouse and not the keyboard user who wanted it. These
 * assertions are the contract that replaced it, plus the guarantee that adopting
 * the tooltip changed NOTHING about the roving model, the pressed state or the
 * disabled state above.
 */
describe("EditorToolbar — tooltips", () => {
  it("explains a control on keyboard focus, with its shortcut", () => {
    render(<EditorToolbar onAction={vi.fn()} />);
    const bold = screen.getByRole("button", { name: "Bold" });
    act(() => {
      bold.focus();
    });
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Bold");
    // `Mod` resolves to Ctrl off an Apple platform, through the ONE formatter.
    expect(tooltip).toHaveTextContent("Ctrl+B");
    expect(bold).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("keeps the accessible NAME on the control, not in the tooltip", () => {
    render(<EditorToolbar onAction={vi.fn()} />);
    const heading = screen.getByRole("button", { name: "Heading" });
    act(() => {
      heading.focus();
    });
    expect(heading).toHaveAccessibleName("Heading");
    expect(heading).toHaveAccessibleDescription(
      "Heading — press again to change level",
    );
  });

  it("has retired `title` on every control", () => {
    // Leaving it would give a hovering user two tooltips, one of them the
    // browser's, in a font and a position DalyHub does not choose.
    render(
      <EditorToolbar
        onAction={vi.fn()}
        history={{
          canUndo: true,
          canRedo: true,
          onUndo: vi.fn(),
          onRedo: vi.fn(),
        }}
      />,
    );
    for (const button of controls()) {
      expect(button).not.toHaveAttribute("title");
    }
  });

  it("adds no Tab stop of its own while a tooltip is showing", () => {
    render(<EditorToolbar onAction={vi.fn()} />);
    const bold = screen.getByRole("button", { name: "Bold" });
    act(() => {
      bold.focus();
    });
    expect(screen.getByRole("tooltip")).not.toHaveAttribute("tabindex");
    // Still exactly one tab stop, and focus is still on the control.
    expect(controls().filter((button) => button.tabIndex === 0)).toHaveLength(
      1,
    );
    expect(bold).toHaveFocus();
  });

  it("dismisses on Escape without moving focus off the toolbar", () => {
    render(<EditorToolbar onAction={vi.fn()} />);
    const bold = screen.getByRole("button", { name: "Bold" });
    act(() => {
      bold.focus();
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(bold, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(bold).toHaveFocus();
  });

  it("leaves arrow-key roving intact, tooltip and all", () => {
    render(<EditorToolbar onAction={vi.fn()} />);
    const first = controls()[0];
    act(() => {
      first.focus();
    });
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(controls()[1]);
    // The tooltip followed the focus rather than sticking to the old control.
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
  });

  it("leaves a DISABLED history control disabled, and outside the roving stop", () => {
    // Explaining a greyed-out control is a thing a tooltip is FOR, so hovering
    // one is allowed to show it. What must not change is the control itself:
    // PR #124 deliberately kept a disabled Undo out of the single tab stop, and
    // the tooltip reads nothing and sets nothing on the button.
    render(
      <EditorToolbar
        onAction={vi.fn()}
        history={{
          canUndo: false,
          canRedo: false,
          onUndo: vi.fn(),
          onRedo: vi.fn(),
        }}
      />,
    );
    const undo = screen.getByRole("button", { name: "Undo" });
    fireEvent.pointerEnter(undo, { pointerType: "mouse" });
    expect(undo).toBeDisabled();
    expect(undo.tabIndex).toBe(-1);
    expect(controls().filter((button) => button.tabIndex === 0)).toHaveLength(
      1,
    );
  });
});
