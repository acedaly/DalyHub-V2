import { MemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SummaryCards, type SummaryCardItem } from "~/shared/summary-cards";

/**
 * DS-13 — the shared summary-card grid.
 *
 * The accessibility contract is the point of this file: a labelled list, ONE tab
 * stop per navigable card, an accessible name that carries both the label and the
 * value, and no reliance on colour to convey meaning.
 */

function renderCards(items: readonly SummaryCardItem[], label = "Summary") {
  return render(
    <MemoryRouter>
      <SummaryCards items={items} label={label} />
    </MemoryRouter>,
  );
}

const ITEMS: SummaryCardItem[] = [
  { id: "a", label: "Meetings", value: "4", href: "/person/p1?tab=linked" },
  { id: "b", label: "Open tasks", value: "2", detail: "of 5 tasks" },
  { id: "c", label: "Last interaction", value: "3 days ago", tone: "success" },
];

describe("SummaryCards", () => {
  it("renders a labelled list with one item per fact", () => {
    renderCards(ITEMS, "Relationship summary");

    const list = screen.getByRole("list", { name: "Relationship summary" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });

  it("always shows the label beside the value, so meaning never rests on a number", () => {
    renderCards(ITEMS);

    expect(screen.getByText("Meetings")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("of 5 tasks")).toBeInTheDocument();
  });

  it("makes a card with a destination exactly ONE link, named label + value", () => {
    renderCards(ITEMS);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Meetings: 4");
    expect(links[0].getAttribute("href")).toBe("/person/p1?tab=linked");
  });

  it("renders a card with no destination as plain, non-interactive content", () => {
    renderCards([{ id: "b", label: "Open tasks", value: "2" }]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Open tasks")).toBeInTheDocument();
  });

  it("accepts an accessible-name override for a card whose value needs context", () => {
    renderCards([
      {
        id: "a",
        label: "Last interaction",
        value: "3 days ago",
        href: "/x",
        ariaLabel: "Last interaction: 3 days ago — open the timeline",
      },
    ]);
    expect(
      screen.getByRole("link", {
        name: "Last interaction: 3 days ago — open the timeline",
      }),
    ).toBeInTheDocument();
  });

  it("renders nothing at all rather than an empty list", () => {
    const { container } = renderCards([]);
    expect(container.querySelector(".dh-summary-cards")).toBeNull();
  });

  it("marks a decorative icon hidden from assistive tech", () => {
    const { container } = renderCards([
      {
        id: "a",
        label: "Meetings",
        value: "4",
        icon: <svg data-testid="glyph" />,
      },
    ]);
    expect(
      container.querySelector('.dh-summary-card__icon[aria-hidden="true"]'),
    ).toBeInTheDocument();
  });

  // The full axe sweep for this pattern runs in Playwright (`e2e/people-relationship.spec.ts`),
  // where it is exercised in light AND dark on a real page — the project's
  // established home for accessibility regression proof.
});
