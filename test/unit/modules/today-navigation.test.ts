/**
 * TODAY-01 — the Today module wires into the registry-driven sidebar.
 *
 * Today declares only a navigable route (no entity type — it is a view over the
 * shared model), so it must appear in primary navigation at the top (navOrder 5),
 * and — declaring no entity type — surface with the shell's generic navigation
 * glyph rather than an entity icon (PrimaryNavigation's documented fallback). This
 * proves the manifest → registry → navigation flow without editing any central list.
 */

import { describe, expect, it } from "vitest";

import { createModuleRegistry } from "~/kernel/modules";
import todayModule from "~/modules/today/module";
import areasModule from "~/modules/areas/module";
import { buildNavigationModel } from "~/platform/modules/navigation-adapter";

describe("TODAY-01 navigation", () => {
  it("registers Today first, with no entity-type icon", () => {
    const registry = createModuleRegistry([todayModule, areasModule]);
    const nav = buildNavigationModel(
      registry.listRoutes(),
      (moduleId) => registry.getModule(moduleId)?.entityTypes[0]?.type,
    );

    const today = nav.find((item) => item.id === "today.index");
    expect(today).toBeDefined();
    expect(today).toMatchObject({ label: "Today", href: "/today", order: 5 });
    // A view, not an entity — no entity-type icon (generic glyph fallback).
    expect(today?.entityType).toBeUndefined();

    // Ordered ahead of Areas (navOrder 10).
    const ids = nav.map((item) => item.id);
    expect(ids.indexOf("today.index")).toBeLessThan(ids.indexOf("areas.index"));
  });
});
