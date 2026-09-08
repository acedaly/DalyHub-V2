/**
 * V2.16 CONSOL-00 — the rail's information architecture, over the REAL registry.
 *
 * This file supersedes `px-03-navigation.test.ts`, which asserted the four
 * shape-named groups (`daily` / `organise` / `more` / `system`) against a
 * hand-listed subset of fourteen modules. Two things were wrong with that, and
 * both are why the Finance/Views `navOrder` collision survived three releases:
 *
 *   1. A hand-listed subset cannot notice a module it does not list. Habits,
 *      Plan, Life Admin, Finance, Insight, Reports, Views and About all shipped
 *      after it and none of them appeared in it.
 *   2. `navOrder` was asserted only by implication (through label order inside a
 *      group), so two modules could claim the same number and the tie would be
 *      broken by module-discovery glob order without a single test failing.
 *
 * So this asserts the WHOLE navigation model, derived from the real discovered
 * registry, against the information architecture recorded in
 * `docs/product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md` §6 and implemented in
 * `app/shared/shell/navigation-groups.ts`. Adding a navigable module means
 * adding it here, on purpose, with a group and a place.
 */

import { describe, expect, it } from "vitest";

import { discoverModuleRegistry } from "~/modules/discover-modules";
import { buildBottomNavigation } from "~/shared/shell/mobile-navigation";
import { buildNavigationModel } from "~/platform/modules/navigation-adapter";
import {
  NAVIGATION_GROUPS,
  NAVIGATION_GROUP_ORDER,
  buildNavigationGroups,
  isNavigationGroupKey,
  ungroupedNavigation,
} from "~/shared/shell/navigation-groups";

function navigation() {
  const registry = discoverModuleRegistry();
  return buildNavigationModel(
    registry.listRoutes(),
    (moduleId) => registry.getModule(moduleId)?.entityTypes[0]?.type,
  );
}

/**
 * The rail, as V2.16 ships it: `[group, label, href, navOrder]`.
 *
 * The full expected model in one place, so a regroup is a deliberate edit to a
 * table rather than a diff spread across eight assertions.
 */
const EXPECTED: readonly (readonly [string, string, string, number])[] = [
  ["do", "Today", "/today", 110],
  ["do", "Plan", "/plan", 120],
  ["do", "Inbox", "/inbox", 130],
  ["do", "Upcoming", "/upcoming", 140],
  ["do", "Tasks", "/tasks", 150],

  ["organise", "Projects", "/projects", 210],
  ["organise", "Goals", "/goals", 220],
  ["organise", "Areas", "/areas", 230],
  ["organise", "Habits", "/habits", 240],
  ["organise", "Notes", "/notes", 250],
  ["organise", "Diary", "/diary", 260],
  ["organise", "Meetings", "/meetings", 270],
  ["organise", "People", "/people", 280],

  ["deal-with", "Life Admin", "/obligations", 310],
  ["deal-with", "Assets", "/assets", 320],

  ["money", "Finance", "/finance", 410],

  ["understand", "Insight", "/analytics", 510],
  ["understand", "Reports", "/reports", 520],
  ["understand", "Reviews", "/reviews", 530],
  ["understand", "AI", "/ai", 540],

  ["system", "Views", "/views", 910],
  ["system", "Settings", "/settings", 920],
  ["system", "Help", "/help", 930],
  ["system", "About", "/about", 940],
];

describe("V2.16 CONSOL-00 — the question-first rail", () => {
  it("is exactly the recorded information architecture, in order", () => {
    const actual = navigation().map(
      (item) => [item.group, item.label, item.href, item.order] as const,
    );
    expect(actual).toEqual(EXPECTED);
  });

  it("leaves no destination ungrouped, and invents no seventh group", () => {
    const nav = navigation();
    expect(ungroupedNavigation(nav)).toEqual([]);
    for (const item of nav) {
      expect(isNavigationGroupKey(item.group), item.label).toBe(true);
    }
  });

  it("gives every destination its own navOrder", () => {
    // Finance and Views both claimed 210 until V2.16, which meant two rows of
    // the rail were ordered by the module-discovery glob. A tie is not a
    // decision; it is the absence of one.
    const orders = navigation().map((item) => item.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("keeps each group inside its own hundred, so the next module lands on purpose", () => {
    const bands: Readonly<Record<string, readonly [number, number]>> = {
      do: [100, 199],
      organise: [200, 299],
      "deal-with": [300, 399],
      money: [400, 499],
      understand: [500, 599],
      system: [900, 999],
    };
    for (const item of navigation()) {
      const band = bands[item.group as string];
      expect(band, item.label).toBeDefined();
      expect(item.order, item.label).toBeGreaterThanOrEqual(band![0]);
      expect(item.order, item.label).toBeLessThanOrEqual(band![1]);
    }
  });

  it("groups the model into the six blocks, in the architecture's order", () => {
    const groups = buildNavigationGroups(navigation());
    expect(groups.map((group) => group.definition.key)).toEqual(
      NAVIGATION_GROUP_ORDER,
    );
    expect(groups.map((group) => group.items.length)).toEqual([
      5, 8, 2, 1, 4, 4,
    ]);
  });

  /*
   * A group NAME is navigation structure. There is no `/do`, no `/organise`,
   * no `/deal-with` — inventing a page to justify a label is how a taxonomy
   * becomes a product surface nobody asked for.
   */
  it("turns no group name into a route", () => {
    const registry = discoverModuleRegistry();
    const paths = new Set(
      registry.listRoutes().map((route) => route.path ?? ""),
    );
    for (const group of NAVIGATION_GROUPS) {
      expect(paths.has(group.key), group.key).toBe(false);
      expect(paths.has(group.key.replace("-", "")), group.key).toBe(false);
    }
  });

  /*
   * ROUTE STABILITY. A relabel is not a migration: every href below is a
   * bookmark an owner may already hold, and `/analytics` is the one most at
   * risk because its LABEL has said Insight since V2.13.
   */
  it("moves no URL — /analytics included", () => {
    const byLabel = new Map(
      navigation().map((item) => [item.label, item.href]),
    );
    expect(byLabel.get("Insight")).toBe("/analytics");
    expect(byLabel.get("Finance")).toBe("/finance");
    expect(byLabel.get("Reports")).toBe("/reports");
    expect(byLabel.get("Life Admin")).toBe("/obligations");
    expect(byLabel.get("Views")).toBe("/views");
  });

  /*
   * The rail says Insight. RPT-04 relabelled the module and deliberately kept
   * its route; nothing in navigation may say "Analytics" again.
   */
  it("says Insight, never Analytics", () => {
    for (const item of navigation()) {
      expect(item.label).not.toMatch(/analytics/i);
    }
  });

  it("derives the real entity-identity icon for entity-bearing modules", () => {
    const byLabel = new Map(navigation().map((item) => [item.label, item]));
    expect(byLabel.get("Notes")?.entityType).toBe("note");
    expect(byLabel.get("Diary")?.entityType).toBe("diary");
    expect(byLabel.get("Meetings")?.entityType).toBe("meeting");
    expect(byLabel.get("People")?.entityType).toBe("person");
    expect(byLabel.get("Assets")?.entityType).toBe("asset");
    expect(byLabel.get("Reviews")?.entityType).toBe("review");
  });

  it("gives every row a glyph — an entity identity or a declared nav icon", () => {
    // THEME-01: a row with neither drew a generic dot, which read as a missing
    // glyph in permanent chrome.
    for (const item of navigation()) {
      expect(
        item.entityType !== undefined || item.navIcon !== undefined,
        item.label,
      ).toBe(true);
    }
  });

  /*
   * RECALL-00-E (DEBT-226) — the REAL manifests derive exactly the singular
   * record + create prefixes for the three modules whose routes live outside
   * their collection's nesting, and nothing else.
   */
  it("derives the singular-route prefixes for People, Meetings and Assets — and only them", () => {
    const nav = navigation();
    const byLabel = new Map(nav.map((item) => [item.label, item]));
    expect(byLabel.get("People")?.activePathPrefixes).toEqual([
      "/new/person",
      "/person",
    ]);
    expect(byLabel.get("Meetings")?.activePathPrefixes).toEqual([
      "/new/meeting",
      "/meeting",
    ]);
    expect(byLabel.get("Assets")?.activePathPrefixes).toEqual([
      "/new/asset",
      "/asset",
    ]);
    for (const item of nav) {
      if (["People", "Meetings", "Assets"].includes(item.label)) continue;
      expect(item.activePathPrefixes, item.label).toBeUndefined();
    }
  });
});

/**
 * MOBILE-01 — the phone bar, over the same real registry.
 *
 * The strategy's §6 commits the bar to `Today · Tasks · Add · Projects · More`
 * for the whole of V2: three earned daily-driver slots, and no module earning a
 * fourth because it happens to exist. A regroup is the most likely moment for
 * that to break — Finance, Life Admin and Reports all became more prominent in
 * the rail without becoming more prominent on a phone, and they must not.
 *
 * The unit tests in `test/unit/shell/mobile-navigation.test.ts` prove the
 * ARITHMETIC (ordering, the cap, the capture slot) against a fixture. This
 * proves the ANSWER against the manifests.
 */
describe("V2.16 CONSOL-00 — the phone bar is unchanged", () => {
  it("carries exactly Today · Tasks · Add · Projects · More", () => {
    const slots = buildBottomNavigation(navigation());
    expect(
      slots.map((slot) =>
        slot.kind === "destination" ? slot.item.label : slot.kind,
      ),
    ).toEqual(["Today", "Tasks", "capture", "Projects", "more"]);
  });

  it("gives a phone slot to exactly three modules", () => {
    const opted = navigation().filter(
      (item) => item.mobilePrimaryOrder !== undefined,
    );
    expect(opted.map((item) => item.label)).toEqual([
      "Today",
      "Tasks",
      "Projects",
    ]);
  });

  it("gives no phone slot to Finance, Life Admin, Reports or AI", () => {
    // Not "not yet": a phone slot for Finance is a V3 question answered by
    // measured use (strategy §6), and existing is not use.
    const byLabel = new Map(navigation().map((item) => [item.label, item]));
    for (const label of ["Finance", "Life Admin", "Reports", "AI", "Insight"]) {
      expect(byLabel.get(label)?.mobilePrimaryOrder, label).toBeUndefined();
    }
  });
});
