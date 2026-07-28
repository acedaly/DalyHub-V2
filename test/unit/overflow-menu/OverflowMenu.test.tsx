import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OverflowMenu } from "~/shared/overflow-menu";
import type { OverflowMenuItem } from "~/shared/overflow-menu";

/**
 * DS-12 — the ONE shared overflow (⋯) menu, as BEHAVIOUR.
 *
 * The Record Header and the Card both render this component, so these assertions
 * are the product-wide contract for "where do I find the secondary and
 * destructive actions on a record?": a labelled menu button, a real WAI-ARIA menu
 * of menu items, keyboard-complete navigation, Escape that closes only the menu
 * and returns focus, and a disabled item that stays visible and explains itself
 * rather than disappearing.
 */

const ITEMS: OverflowMenuItem[] = [
  { id: "archive", label: "Archive Project", onSelect: vi.fn() },
  {
    id: "delete",
    label: "Delete Project",
    tone: "danger",
    onSelect: vi.fn(),
  },
];

function renderMenu(items: readonly OverflowMenuItem[] = ITEMS) {
  return render(
    <>
      <button type="button">before</button>
      <OverflowMenu items={items} label="More actions for Website relaunch" />
    </>,
  );
}

function trigger(): HTMLElement {
  return screen.getByRole("button", {
    name: "More actions for Website relaunch",
  });
}

describe("OverflowMenu", () => {
  it("renders nothing at all when there are no items", () => {
    renderMenu([]);
    expect(
      screen.queryByRole("button", { name: /More actions/ }),
    ).not.toBeInTheDocument();
  });

  it("is an accessible menu button naming the record it acts on", () => {
    renderMenu();
    const button = trigger();
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("menu", { name: "More actions for Website relaunch" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("opens on ArrowDown with the first item focused, and wraps with the arrow keys", () => {
    renderMenu();
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });

    const [first, second] = screen.getAllByRole("menuitem");
    expect(first).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(second).toHaveFocus();

    // Past the end wraps back to the top — one composite widget, no dead end.
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "End" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Home" });
    expect(first).toHaveFocus();
  });

  it("opens on ArrowUp with the LAST item focused", () => {
    renderMenu();
    fireEvent.keyDown(trigger(), { key: "ArrowUp" });
    const items = screen.getAllByRole("menuitem");
    expect(items[items.length - 1]).toHaveFocus();
  });

  it("runs an item, closes, and returns focus to the trigger", () => {
    const onSelect = vi.fn();
    renderMenu([{ id: "archive", label: "Archive Project", onSelect }]);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive Project" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  // Regression: the menu used to run `onSelect` BEFORE closing, so a handler
  // that opened a dialog captured the menu item as its opener — an element that
  // was already unmounting — and cancelling the dialog dropped focus to the top
  // of the page instead of back on the ⋯ button.
  it("focuses its persistent trigger BEFORE running a handler, so a dialog gets a live opener", () => {
    let activeWhenHandlerRan: Element | null = null;
    renderMenu([
      {
        id: "archive",
        label: "Archive Project",
        onSelect: () => {
          activeWhenHandlerRan = document.activeElement;
        },
      },
    ]);
    const button = trigger();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive Project" }));

    expect(activeWhenHandlerRan).toBe(button);
    expect(document.body.contains(activeWhenHandlerRan)).toBe(true);
  });

  it("does NOT steal focus back when the item is a link about to navigate", () => {
    let activeWhenHandlerRan: Element | null = null;
    renderMenu([
      {
        id: "open",
        label: "Open in Settings",
        href: "/settings",
        onSelect: () => {
          activeWhenHandlerRan = document.activeElement;
        },
      },
    ]);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: "Open in Settings" }));
    expect(activeWhenHandlerRan).not.toBe(trigger());
  });

  it("closes on Escape and restores focus, without disturbing anything above it", () => {
    renderMenu();
    fireEvent.click(trigger());
    const menu = screen.getByRole("menu");

    // The menu stops the event, so an enclosing Drawer never also closes on the
    // same key press (DS-11: Escape acts on the top layer only).
    const reachedDocument = vi.fn();
    document.addEventListener("keydown", reachedDocument);
    fireEvent.keyDown(menu, { key: "Escape" });
    document.removeEventListener("keydown", reachedDocument);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(reachedDocument).not.toHaveBeenCalled();
  });

  it("keeps a blocked item visible, disabled and self-explaining — never hidden", () => {
    const onSelect = vi.fn();
    renderMenu([
      {
        id: "delete",
        label: "Delete Area",
        tone: "danger",
        disabled: true,
        description: "Move or remove everything inside this Area first.",
        onSelect,
      },
    ]);
    fireEvent.click(trigger());

    const item = screen.getByRole("menuitem", { name: "Delete Area" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("Move or remove everything inside this Area first."),
    ).toBeInTheDocument();

    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("conveys a destructive item by wording AND tone, never tone alone", () => {
    renderMenu();
    fireEvent.click(trigger());
    const item = screen.getByRole("menuitem", { name: "Delete Project" });
    // The tone is reinforcement; the label still says what it does.
    expect(item).toHaveAttribute("data-tone", "danger");
    expect(item).toHaveTextContent("Delete Project");
  });

  it("renders an item with an href as a real link, so it can be opened in a new tab", () => {
    renderMenu([{ id: "open", label: "Open in Settings", href: "/settings" }]);
    fireEvent.click(trigger());
    expect(
      screen.getByRole("menuitem", { name: "Open in Settings" }),
    ).toHaveAttribute("href", "/settings");
  });
});
