/**
 * THEME-01 — the navigation glyph resolver.
 *
 * The defect this closes: modules with no entity type (Today, Help, About,
 * Settings, AI) rendered a generic dot in the sidebar and the phone bottom bar,
 * which reads as a missing glyph in permanent chrome. These tests hold the fix —
 * every navigation row renders a real icon, and the kernel's closed set of glyph
 * names can never get ahead of the glyphs that exist.
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NAV_ICON_NAMES } from "~/kernel/modules";
import { NavIcon, navIconRegistryIsComplete } from "~/shared/shell/NavIcon";

describe("THEME-01 navigation glyphs", () => {
  it("renders a glyph for every name the module contract allows", () => {
    // Adding a name to the kernel's closed set without adding its icon must fail
    // here, not silently render nothing in navigation.
    expect(navIconRegistryIsComplete()).toBe(true);
    for (const name of NAV_ICON_NAMES) {
      const { container } = render(<NavIcon navIcon={name} />);
      expect(container.querySelector("svg"), name).not.toBeNull();
    }
  });

  it("falls back to the module's entity identity when no glyph is named", () => {
    // A module that names nothing shows the SAME glyph its entity shows on a
    // Card, so a Projects row and a Project card are recognisably one thing.
    const { container } = render(<NavIcon entityType="task" />);
    expect(container.querySelector(".dh-entity-icon")).not.toBeNull();
  });

  it("lets a DESTINATION override its module's entity glyph", () => {
    /*
     * POLISH-01 reversed this precedence, and the reversal is the point.
     *
     * Inbox, Upcoming and Tasks are three destinations of the ONE Tasks module,
     * so entity-first meant all three drew the Task tick — the same mark three
     * rows running in the daily group, on a rail whose collapsed 68px form has
     * no labels to tell them apart. Naming a glyph is a decision about one
     * destination; inheriting the entity's is a default, and a default must not
     * beat a decision.
     */
    const named = render(<NavIcon entityType="task" navIcon="inbox" />);
    const inherited = render(<NavIcon entityType="task" />);
    expect(named.container.innerHTML).not.toBe(inherited.container.innerHTML);
    expect(named.container.querySelector("svg")).not.toBeNull();
  });

  it("gives every navigable destination in the product a distinct glyph", () => {
    /*
     * The audit's finding, as an assertion: six destinations shared three
     * glyphs. Rendering each name and comparing the SVG geometry is what stops
     * a future manifest quietly pointing two rows at one icon again.
     */
    const seen = new Map<string, string>();
    for (const name of NAV_ICON_NAMES) {
      const { container } = render(<NavIcon navIcon={name} />);
      const shape = container.querySelector("svg")?.innerHTML ?? "";
      const clash = [...seen.entries()].find(([, other]) => other === shape);
      expect(clash?.[0], `${name} draws the same glyph as ${clash?.[0]}`).toBe(
        undefined,
      );
      seen.set(name, shape);
    }
  });

  it("renders a real glyph for a module that declares neither", () => {
    const { container } = render(<NavIcon />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders a real glyph for an unrecognised entity type", () => {
    const { container } = render(<NavIcon entityType="not-an-entity" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
