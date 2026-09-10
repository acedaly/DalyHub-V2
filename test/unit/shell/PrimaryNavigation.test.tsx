/**
 * PX-03 / V2.16 CONSOL-00 — grouping in the primary navigation.
 *
 * `NavigationItem.group` (FND-09's `meta.navGroup`) already flowed through the
 * navigation model. PX-03 rendered it as a decorative rule plus, for two of the
 * four groups, an `aria-hidden` caption; V2.16 re-cut the groups into the five
 * QUESTIONS the product answers and made the grouping SEMANTIC, because a
 * heading that says "Money" is the shortest answer to "where do I go for this?"
 * and hiding it from assistive technology would have shipped the release's
 * entire user-visible outcome to sighted users only.
 *
 * So these assert what the rail is now: one labelled list per group, in the
 * order `navigation-groups.ts` declares, and every row still an accessible,
 * labelled link regardless of grouping.
 *
 * ── UNTITLED-02 ─────────────────────────────────────────────────────────────
 *
 * Two changes here, both consequences of the rail being rebuilt on Untitled UI.
 *
 * The decorative `<hr>` at each group transition is GONE, by design: the heading
 * and the spacing already separate the blocks, and five rules down a 224px
 * column is five more lines on a surface whose whole job is to recede. The two
 * assertions that counted rules now assert its absence, so the decision is
 * pinned rather than merely un-tested.
 *
 * And the assertions key off `data-nav-group` and the accessible names rather
 * than off `.dh-nav__*` class names. The class names described paint, so a
 * restyle broke tests that had nothing to say about what changed; the group key
 * and the accessible name describe the information architecture, which is what
 * these tests are actually about.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";
import { COLLAPSED_RAIL_QUERY } from "~/shared/shell/collapsed-rail";
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

describe("V2.16 CONSOL-00 PrimaryNavigation grouping", () => {
  it("renders one list for a single group", () => {
    const { container } = renderNav([
      item("Today", 110, "do"),
      item("Plan", 120, "do"),
      item("Tasks", 150, "do"),
    ]);
    expect(container.querySelectorAll("[data-nav-group]")).toHaveLength(1);
    expect(screen.getAllByRole("list")).toHaveLength(1);
    for (const label of ["Today", "Plan", "Tasks"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("renders one block per group, separated by heading and space rather than by rules", () => {
    const { container } = renderNav([
      item("Today", 110, "do"),
      item("Notes", 250, "organise"),
      item("Diary", 260, "organise"),
      item("Finance", 410, "money"),
      item("Settings", 920, "system"),
      item("Help", 930, "system"),
    ]);
    expect(container.querySelectorAll("[data-nav-group]")).toHaveLength(4);
    expect([...container.querySelectorAll("[data-nav-group]")].map((el) =>
      el.getAttribute("data-nav-group"),
    )).toEqual(["do", "organise", "money", "system"]);
    // UNTITLED-02 — no decorative rules. Pinned so the quieter rail cannot
    // silently regain four horizontal lines.
    expect(container.querySelectorAll("hr")).toHaveLength(0);
  });

  it("names each group's list with its heading, so a screen reader hears it once", () => {
    renderNav([
      item("Today", 110, "do"),
      item("Finance", 410, "money"),
      item("Settings", 920, "system"),
    ]);
    // The heading NAMES the list rather than being hidden from the tree.
    expect(screen.getByRole("list", { name: "Do" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Money" })).toBeInTheDocument();
    // `system` is separated by position and carries an accessible name instead.
    expect(
      screen.getByRole("list", { name: "Tools and settings" }),
    ).toBeInTheDocument();
  });

  it("renders the groups in the information architecture's order, not the model's", () => {
    // A module that mis-numbers `navOrder` can sit in the wrong place inside its
    // own block; it can never interleave two blocks.
    const { container } = renderNav([
      item("Settings", 1, "system"),
      item("Finance", 2, "money"),
      item("Today", 3, "do"),
    ]);
    const headings = [...container.querySelectorAll("ul")].map(
      (list) =>
        list.getAttribute("aria-label") ?? list.getAttribute("aria-labelledby"),
    );
    expect(headings).toEqual([
      "nav-group-do",
      "nav-group-money",
      "Tools and settings",
    ]);
  });

  it("keeps a destination whose module declares no known group reachable, last", () => {
    // A manifest typo is a build-time defect (`navigation-groups.test.ts` fails
    // on it against the real registry). The shell still draws the row rather
    // than throwing, because a blank application is worse than an untidy rail.
    renderNav([item("Today", 110, "do"), item("Stray", 999, "stuff")]);
    expect(screen.getByRole("link", { name: "Stray" })).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Other destinations" }),
    ).toBeInTheDocument();
  });

  it("keeps every row an accessible link regardless of grouping", () => {
    renderNav([
      item("Today", 110, "do"),
      item("Notes", 250, "organise"),
      item("Settings", 920, "system"),
    ]);
    for (const label of ["Today", "Notes", "Settings"]) {
      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveAttribute("href", `/${label.toLowerCase()}`);
    }
  });

  it("separates groups without adding anything to the accessibility tree", () => {
    const { container } = renderNav([
      item("Today", 110, "do"),
      item("Notes", 250, "organise"),
    ]);
    // The blocks are told apart by their headings and their spacing. Nothing
    // decorative is rendered between them at all, so there is nothing a screen
    // reader has to be told to skip.
    expect(container.querySelectorAll("hr")).toHaveLength(0);
    expect(screen.getByRole("list", { name: "Do" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Organise" })).toBeInTheDocument();
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
  const items = [
    item("Today", 110, "do"),
    item("Notes", 250, "organise"),
    item("Projects", 210, "organise"),
  ];

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
    // `aria-current` IS the contract — the visual treatment reinforces it and is
    // asserted by the screenshot passes, not by a class name here.
    expect(projects).toHaveAttribute("aria-current", "page");
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
  const items = [item("Today", 110, "do"), item("Projects", 210, "organise")];

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
