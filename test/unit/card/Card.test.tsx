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
    expect(article).toHaveAttribute("data-density", "comfortable");
    expect(article).toHaveAttribute("data-presentation", "list");

    for (const presentation of ["board", "grid"] as const) {
      rerender(
        <Card
          id="a"
          title="T"
          density="compact"
          presentation={presentation}
          onOpen={() => {}}
        />,
      );
      article = screen.getByRole("article");
      expect(article).toHaveAttribute("data-density", "compact");
      expect(article).toHaveAttribute("data-presentation", presentation);
    }
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
    expect(onSelectedChange).toHaveBeenCalledWith(true);
    expect(onOpen).not.toHaveBeenCalled();
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

  it("names an icon-only overflow action accessibly", () => {
    renderCard({
      overflowAction: { id: "more", label: "More actions", onSelect: () => {} },
    });
    expect(
      screen.getByRole("button", { name: "More actions" }),
    ).toBeInTheDocument();
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
