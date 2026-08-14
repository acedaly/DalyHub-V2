/**
 * PX-03 — group dividers in the primary navigation.
 *
 * `NavigationItem.group` (FND-09's `meta.navGroup`) already flowed through the
 * navigation model but was never rendered. This proves the renderer inserts a
 * decorative divider exactly at each group transition, renders none when no
 * module declares a group (PX-02's original ungrouped behaviour, unchanged), and
 * keeps every row an accessible, labelled link regardless of grouping.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";
import {
  COLLAPSED_RAIL_QUERY,
  PrimaryNavigation,
} from "~/shared/shell/PrimaryNavigation";

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

function renderNav(
  items: readonly NavigationItem[],
  initialPath = "/",
  // DS-03 — `collapsible` marks the RAIL instance, which collapses to glyphs on
  // a tablet. The phone sheet leaves it unset and never collapses.
  collapsible = false,
) {
  const Stub = createRoutesStub([
    {
      // A splat so any path renders the rail — the current-destination tests
      // navigate to record routes (`/projects/pr-1`) that have no stub route.
      path: "*",
      Component: () => (
        <PrimaryNavigation id="nav" items={items} collapsible={collapsible} />
      ),
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

/**
 * DS-03 — the COLLAPSED rail.
 *
 * Between `md` and `lg` the rail is a 68px column of glyphs. The layout is a
 * media query in `shell.css`; the only thing the component decides is whether a
 * row's label is currently readable and therefore whether its tooltip is needed.
 *
 * The property that matters most here is the one that is easy to get wrong and
 * invisible in a screenshot: a collapsed row must keep its ACCESSIBLE NAME. The
 * label is hidden visually and left in the document, so a screen reader reads
 * "Projects" at every width, and the tooltip is the DESCRIPTION on top of that —
 * never a replacement for the name.
 */
describe("DS-03 PrimaryNavigation collapsed rail", () => {
  const items = [item("Today", 5), item("Projects", 110)];

  /** Drive `matchMedia` so the component believes the rail is collapsed. */
  function withViewport(collapsed: boolean) {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: collapsed && query === COLLAPSED_RAIL_QUERY,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    return () => {
      window.matchMedia = original;
    };
  }

  it("keeps every destination's accessible name when collapsed", () => {
    const restore = withViewport(true);
    try {
      renderNav(items, "/today", true);
      // The NAME, not the tooltip: `getByRole(… { name })` reads the
      // accessibility tree, so this fails if the label were `display: none`d out
      // of it or replaced by a description.
      for (const label of ["Today", "Projects"]) {
        expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
      }
    } finally {
      restore();
    }
  });

  /** Hover a row and let the tooltip's intent delay elapse. */
  function hover(element: HTMLElement) {
    fireEvent.pointerEnter(element, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(500);
    });
  }

  it("describes a collapsed row with the shared tooltip", () => {
    vi.useFakeTimers();
    const restore = withViewport(true);
    try {
      renderNav(items, "/today", true);
      const projects = screen.getByRole("link", { name: "Projects" });
      hover(projects);
      // `aria-describedby` appears only while the tooltip is shown, and it is a
      // DESCRIPTION — the name above is unchanged either way.
      expect(projects).toHaveAttribute("aria-describedby");
      expect(screen.getByRole("tooltip")).toHaveTextContent("Projects");
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it("adds no tooltip while the labels are visible", () => {
    // A tooltip repeating text the user can already read is noise, and the
    // expanded rail is the common case.
    vi.useFakeTimers();
    const restore = withViewport(false);
    try {
      renderNav(items, "/today", true);
      hover(screen.getByRole("link", { name: "Projects" }));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it("never collapses the phone navigation SHEET", () => {
    // The sheet is full-width at every viewport it exists at, so it opts out and
    // never pays for the media listener. Rendered with `collapsible` unset.
    vi.useFakeTimers();
    const restore = withViewport(true);
    try {
      renderNav(items, "/today");
      hover(screen.getByRole("link", { name: "Projects" }));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it("keeps the current destination marked when collapsed", () => {
    const restore = withViewport(true);
    try {
      renderNav(items, "/projects/pr-1", true);
      expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    } finally {
      restore();
    }
  });
});
