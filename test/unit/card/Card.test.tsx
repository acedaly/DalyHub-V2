/**
 * DS-04 — the Shared Card behaviour & accessibility.
 *
 * Proves the acceptance criteria: one Card renders different entity types without
 * entity-specific imports; title + primary action render; optional regions omit;
 * density and presentation; labelled status; accessible progress; selection that
 * does not open the card; quick actions that fire independently; disabled actions
 * that don't fire; keyboard-operable primary action; DS-03 drawer integration; and
 * no invalidly-nested interactive controls.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Card } from "~/shared/card";
import type { CardProps } from "~/shared/card";

function renderCard(overrides: Partial<CardProps> = {}) {
  const props: CardProps = {
    id: "rec-1",
    title: "Website relaunch",
    ...overrides,
  };
  return render(<Card {...props} />);
}

describe("Card — entity-agnostic rendering", () => {
  it("renders a Project and a Person with the same component", () => {
    const { unmount } = renderCard({
      typeLabel: "Project",
      title: "Website relaunch",
      onOpen: () => {},
    });
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Website relaunch" }),
    ).toBeInTheDocument();
    unmount();

    renderCard({ typeLabel: "Person", title: "Dana Lee", href: "/x" });
    expect(screen.getByText("Person")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dana Lee" })).toHaveAttribute(
      "href",
      "/x",
    );
  });

  it("omits optional regions cleanly", () => {
    renderCard();
    expect(
      screen.getByRole("heading", { name: "Website relaunch" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("titles at h3 by default and at the requested level for correct nesting", () => {
    // Default: the title heading is level 3 (DS-11 baseline; unchanged behaviour).
    const { unmount } = renderCard({ title: "Default level" });
    expect(
      screen.getByRole("heading", { name: "Default level", level: 3 }),
    ).toBeInTheDocument();
    unmount();

    // A collection whose pane header is h1 nests its cards at h2 — no skipped level.
    renderCard({ title: "Under a pane header", headingLevel: 2 });
    expect(
      screen.getByRole("heading", { name: "Under a pane header", level: 2 }),
    ).toBeInTheDocument();
  });
});

describe("Card — density & presentation (one component)", () => {
  it("reflects density and presentation via data attributes", () => {
    const { rerender } = render(
      <Card
        id="a"
        title="T"
        density="comfortable"
        presentation="list"
        onOpen={() => {}}
      />,
    );
    let article = screen.getByRole("article");
    expect(article).toHaveAttribute("data-card-density", "comfortable");
    expect(article).toHaveAttribute("data-presentation", "list");

    /*
     * DEBT-113 — `list` is the only presentation now.
     *
     * This loop asserted `board` and `grid` too, which is how a dead branch
     * stays alive: nothing in the product ever constructed either, the grids
     * that used to (Projects, Goals, Areas) moved to
     * `EntityCard`/`EntityCardGrid`, and `card.css` still carried a documented
     * rule for a grid card that `card-family.css` contradicted. The density
     * half of what it covered is what survives, over the presentation that
     * exists.
     */
    rerender(
      <Card
        id="a"
        title="T"
        density="compact"
        presentation="list"
        onOpen={() => {}}
      />,
    );
    article = screen.getByRole("article");
    expect(article).toHaveAttribute("data-card-density", "compact");
    expect(article).toHaveAttribute("data-presentation", "list");
  });
});

describe("Card — status, progress & long content", () => {
  it("labels status with text (not colour alone)", () => {
    renderCard({ status: { label: "In progress", tone: "accent" } });
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("exposes accessible progress with a text equivalent and normalises invalid values", () => {
    renderCard({ progress: { value: 8, max: 24 } });
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "33");
    expect(bar).toHaveAttribute("aria-valuetext", "33%");

    // Invalid values normalise to 0 rather than throwing/rendering NaN.
    const { rerender } = render(
      <Card id="b" title="T" progress={{ value: Number.NaN }} />,
    );
    expect(screen.getAllByRole("progressbar").at(-1)).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    rerender(<Card id="b" title="T" progress={{ value: 5, max: 1 }} />);
    expect(screen.getAllByRole("progressbar").at(-1)).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });

  it("renders long titles with a wrapping hook", () => {
    const LONG =
      "supercalifragilisticexpialidocious-antidisestablishmentarianism";
    renderCard({ title: LONG });
    expect(screen.getByRole("heading", { name: LONG })).toHaveClass(
      "dh-card__title",
    );
  });
});

describe("Card — selection", () => {
  it("toggles selection without opening the record", () => {
    const onSelectedChange = vi.fn();
    const onOpen = vi.fn();
    renderCard({
      onOpen,
      selection: { selected: false, onSelectedChange },
    });
    const checkbox = screen.getByRole("checkbox", {
      name: "Select Website relaunch",
    });
    fireEvent.click(checkbox);
    // TASKS-06 — the modifier state travels with the toggle so a collection can
    // extend a RANGE. A plain click reports `shift: false`; the Card never decides
    // what a range means.
    expect(onSelectedChange).toHaveBeenCalledWith(true, { shift: false });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("reports a Shift-click so the collection can extend a range", () => {
    const onSelectedChange = vi.fn();
    renderCard({ selection: { selected: false, onSelectedChange } });
    fireEvent.click(screen.getByRole("checkbox"), { shiftKey: true });
    expect(onSelectedChange).toHaveBeenCalledWith(true, { shift: true });
  });

  it("communicates selected state via the native checked checkbox (not colour alone)", () => {
    renderCard({ selection: { selected: true, onSelectedChange: () => {} } });
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});

describe("Card — quick actions", () => {
  it("fires a quick action independently and never opens the card", () => {
    const onOpen = vi.fn();
    const complete = vi.fn();
    renderCard({
      onOpen,
      quickActions: [{ id: "complete", label: "Complete", onSelect: complete }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not fire a disabled quick action", () => {
    const archive = vi.fn();
    renderCard({
      quickActions: [
        { id: "archive", label: "Archive", disabled: true, onSelect: archive },
      ],
    });
    const button = screen.getByRole("button", { name: "Archive" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(archive).not.toHaveBeenCalled();
  });

  // DS-12: the overflow is now the ONE shared menu (the Record Header uses the
  // same one), so the trigger names the record it acts on and the action itself
  // is a `menuitem` inside the opened menu.
  it("renders the overflow as an accessible menu button naming its record", () => {
    renderCard({
      overflowActions: [
        { id: "archive", label: "Archive Project", onSelect: () => {} },
      ],
    });
    const trigger = screen.getByRole("button", {
      name: "More actions for Website relaunch",
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("menuitem", { name: "Archive Project" }),
    ).toBeInTheDocument();
  });

  it("normalises the single `overflowAction` into the same one-item menu", () => {
    const onSelect = vi.fn();
    renderCard({
      overflowAction: { id: "more", label: "More actions", onSelect },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "More actions for Website relaunch" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "More actions" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("Card — primary open action (DS-03 integration)", () => {
  it("opens via onOpen on an unmodified click and is a keyboard-operable control", () => {
    const onOpen = vi.fn();
    renderCard({ href: "/drawer", onOpen });
    const target = screen.getByRole("link", { name: "Website relaunch" });
    fireEvent.click(target);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("lets a modified click follow the link instead of calling onOpen", () => {
    const onOpen = vi.fn();
    renderCard({ href: "/drawer", onOpen });
    fireEvent.click(screen.getByRole("link", { name: "Website relaunch" }), {
      metaKey: true,
    });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("renders the primary target as a real button when only onOpen is given", () => {
    renderCard({ onOpen: () => {} });
    expect(
      screen.getByRole("button", { name: "Website relaunch" }),
    ).toBeInTheDocument();
  });
});

describe("Card — no invalidly-nested interactive controls", () => {
  it("keeps the card root non-interactive and actions outside the open target", () => {
    renderCard({
      onOpen: () => {},
      quickActions: [{ id: "a", label: "Complete", onSelect: () => {} }],
    });
    // The card itself is an article, not a button/link.
    const article = screen.getByRole("article");
    expect(article.tagName).toBe("ARTICLE");
    // The open target does not contain the action button (no nested interactives).
    const openTarget = screen.getByRole("button", { name: "Website relaunch" });
    const action = screen.getByRole("button", { name: "Complete" });
    expect(openTarget.contains(action)).toBe(false);
  });
});

describe("Card — roving tabindex (DS-09 keyboard collections)", () => {
  function renderRoving(rovingTabIndex: number) {
    return render(
      <Card
        id="rec-1"
        title="Website relaunch"
        href="/x"
        onOpen={() => {}}
        rovingTabIndex={rovingTabIndex}
        selection={{ selected: false, onSelectedChange: () => {} }}
        quickActions={[{ id: "a", label: "Complete", onSelect: () => {} }]}
        overflowAction={{ id: "o", label: "More", onSelect: () => {} }}
      />,
    );
  }

  it("puts ONLY the primary open control in the tab order (active card = 0)", () => {
    renderRoving(0);
    // The primary open target is the single tab stop for this card…
    expect(
      screen.getByRole("link", { name: "Website relaunch" }),
    ).toHaveAttribute("tabindex", "0");
    // …and the secondary controls are removed from the tab order (never extra stops).
    expect(
      screen.getByRole("checkbox", { name: "Select Website relaunch" }),
    ).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "Complete" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(
      screen.getByRole("button", { name: "More actions for Website relaunch" }),
    ).toHaveAttribute("tabindex", "-1");
  });

  it("takes the whole inactive card out of the tab order (primary = -1)", () => {
    renderRoving(-1);
    expect(
      screen.getByRole("link", { name: "Website relaunch" }),
    ).toHaveAttribute("tabindex", "-1");
    expect(
      screen.getByRole("checkbox", { name: "Select Website relaunch" }),
    ).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "Complete" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("leaves natural tab behaviour when rovingTabIndex is undefined", () => {
    render(
      <Card
        id="rec-1"
        title="Website relaunch"
        onOpen={() => {}}
        selection={{ selected: false, onSelectedChange: () => {} }}
        quickActions={[{ id: "a", label: "Complete", onSelect: () => {} }]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Website relaunch" }),
    ).not.toHaveAttribute("tabindex");
    // Secondary controls keep their natural tab position too.
    expect(
      screen.getByRole("checkbox", { name: "Select Website relaunch" }),
    ).not.toHaveAttribute("tabindex");
    expect(
      screen.getByRole("button", { name: "Complete" }),
    ).not.toHaveAttribute("tabindex");
  });
});
