/**
 * PX-03 — group dividers in the primary navigation.
 *
 * `NavigationItem.group` (FND-09's `meta.navGroup`) already flowed through the
 * navigation model but was never rendered. This proves the renderer inserts a
 * decorative divider exactly at each group transition, renders none when no
 * module declares a group (PX-02's original ungrouped behaviour, unchanged), and
 * keeps every row an accessible, labelled link regardless of grouping.
 */

import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";
import { PrimaryNavigation } from "~/shared/shell/PrimaryNavigation";

function item(label: string, order: number, group?: string): NavigationItem {
  return {
    id: `${label.toLowerCase()}.index`,
    moduleId: label.toLowerCase() as never,
    label,
    href: `/${label.toLowerCase()}`,
    order,
    ...(group === undefined ? {} : { group }),
  };
}

function renderNav(items: readonly NavigationItem[], initialPath = "/") {
  const Stub = createRoutesStub([
    {
      // A splat so any path renders the rail — the current-destination tests
      // navigate to record routes (`/projects/pr-1`) that have no stub route.
      path: "*",
      Component: () => <PrimaryNavigation id="nav" items={items} />,
    },
  ]);
  return render(<Stub initialEntries={[initialPath]} />);
}

describe("PX-03 PrimaryNavigation grouping", () => {
  it("renders no dividers when no item declares a group", () => {
    const { container } = renderNav([
      item("Today", 5),
      item("Areas", 10),
      item("Goals", 20),
    ]);
    expect(container.querySelectorAll(".dh-nav__divider")).toHaveLength(0);
    for (const label of ["Today", "Areas", "Goals"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("inserts one divider at each group transition", () => {
    const { container } = renderNav([
      item("Today", 5),
      item("Areas", 10),
      item("Notes", 100, "capture"),
      item("Diary", 110, "capture"),
      item("Reviews", 200, "insight"),
      item("Settings", 300, "system"),
      item("Help", 310, "system"),
    ]);
    // Transitions: (none→capture), (capture→insight), (insight→system) = 3.
    expect(container.querySelectorAll(".dh-nav__divider")).toHaveLength(3);
  });

  it("keeps every row an accessible link regardless of grouping", () => {
    renderNav([
      item("Today", 5),
      item("Notes", 100, "capture"),
      item("Settings", 300, "system"),
    ]);
    for (const label of ["Today", "Notes", "Settings"]) {
      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveAttribute("href", `/${label.toLowerCase()}`);
    }
  });

  it("dividers are decorative and excluded from the accessibility tree", () => {
    const { container } = renderNav([
      item("Today", 5),
      item("Notes", 100, "capture"),
    ]);
    const divider = container.querySelector(".dh-nav__divider");
    expect(divider).toHaveAttribute("aria-hidden", "true");
  });
});

/**
 * UX-01 — the rail keeps the owner's "you are here" anchor on record routes.
 *
 * Before UX-01 the rail used `NavLink`'s exact-match `end`, so opening any record
 * left NO row current while the phone bar (same model, nested match) kept the
 * module highlighted. These pin the corrected, shared behaviour.
 */
describe("UX-01 PrimaryNavigation current destination", () => {
  const items = [item("Today", 5), item("Notes", 100), item("Projects", 110)];

  it("marks the exact route as the current page", () => {
    renderNav(items, "/notes");
    expect(screen.getByRole("link", { name: "Notes" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps the module current while one of its records is open", () => {
    renderNav(items, "/projects/pr-1");
    const projects = screen.getByRole("link", { name: "Projects" });
    expect(projects).toHaveAttribute("aria-current", "page");
    expect(projects).toHaveClass("dh-nav__link--active");
  });

  it("marks exactly one row current, and none for an unlisted route", () => {
    const { container } = renderNav(items, "/projects/pr-1");
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);

    const other = renderNav(items, "/settings");
    expect(
      other.container.querySelectorAll('[aria-current="page"]'),
    ).toHaveLength(0);
  });
});
