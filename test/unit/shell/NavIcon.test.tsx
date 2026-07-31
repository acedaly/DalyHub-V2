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

  it("prefers the module's entity identity when it declares one", () => {
    // A module with an entity type must show the SAME glyph the entity shows on a
    // Card, so a declared navIcon never competes with it.
    const withEntity = render(<NavIcon entityType="task" navIcon="today" />);
    const entityOnly = render(<NavIcon entityType="task" />);
    expect(withEntity.container.innerHTML).toBe(entityOnly.container.innerHTML);
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
