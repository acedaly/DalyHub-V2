/**
 * V2.16 CONSOL-00 - the command palette agrees with the rail.
 *
 * The palette is the shell (AGENTS.md section 3): anything you can do by
 * clicking you can do by typing. That only holds while the two surfaces answer
 * the same questions, and the failure modes are quiet ones:
 *
 *   - a command that navigates to a route no module registers any more, so the
 *     owner types a thing they remember and lands on a 404;
 *   - a command still wearing a retired product label ("Analytics"), so the
 *     product has two names for one surface depending on how you reach it;
 *   - two commands with the same title, which is what happens when a module
 *     gains a second entry point and nobody removes the first.
 *
 * This asserts all three against the REAL registry. It deliberately does NOT
 * assert a grouping: the palette groups by KIND (Suggested, Current context,
 * Actions, Navigation, in `app/shared/commands/grouping.ts`) and V2.16
 * explicitly refuses to give it a second navigation taxonomy. There is one
 * information architecture, and it is the rail's.
 */

import { describe, expect, it } from "vitest";

import { discoverModuleRegistry } from "~/modules/discover-modules";
import { buildCommandCatalogue } from "~/platform/commands/command-catalogue";

const registry = discoverModuleRegistry();
const catalogue = buildCommandCatalogue(registry);

/**
 * Every path the route registry can serve, with each route's parent chain
 * resolved. Dynamic segments stay in the pattern, so a command that targets a
 * record path is checked against the SHAPE it must match rather than being
 * either skipped or wrongly failed.
 */
function routePatterns(): readonly string[] {
  const routes = registry.listRoutes();
  const byId = new Map(routes.map((route) => [route.id, route]));
  const patterns: string[] = [];
  for (const route of routes) {
    const segments: string[] = [];
    let current = byId.get(route.id);
    const seen = new Set<string>();
    while (current !== undefined && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.path !== undefined) {
        segments.unshift(...current.path.split("/"));
      }
      current =
        current.parentId === undefined ? undefined : byId.get(current.parentId);
    }
    patterns.push(
      `/${segments.filter((segment) => segment.length > 0).join("/")}`,
    );
  }
  return patterns;
}

/** True when a concrete path is served by one of the route patterns. */
function isServed(path: string, patterns: readonly string[]): boolean {
  const wanted = path.split("/").filter((segment) => segment.length > 0);
  return patterns.some((pattern) => {
    const parts = pattern.split("/").filter((segment) => segment.length > 0);
    if (parts.length !== wanted.length) return false;
    return parts.every(
      (part, index) => part.startsWith(":") || part === wanted[index],
    );
  });
}

describe("V2.16 CONSOL-00 command palette coherence", () => {
  it("has commands to check", () => {
    expect(catalogue.commands.length).toBeGreaterThan(20);
  });

  it("points every navigation command at a route the registry serves", () => {
    const patterns = routePatterns();
    for (const command of catalogue.commands) {
      if (command.kind !== "navigate") continue;
      if (command.target.kind !== "route") continue;
      // A command may carry search parameters or a drawer key; the ROUTE is
      // everything before the first `?` or `#`.
      const path = command.target.to.split(/[?#]/)[0] ?? "/";
      expect(
        isServed(path, patterns),
        `${command.id} -> ${command.target.to}`,
      ).toBe(true);
    }
  });

  it("never says Analytics, because the surface is called Insight", () => {
    // RPT-04 relabelled the module and deliberately kept `/analytics` as its
    // route. The identifier is historical; every owner-facing STRING is Insight.
    for (const command of catalogue.commands) {
      expect(command.title, command.id).not.toMatch(/analytics/i);
      expect(command.subtitle ?? "", command.id).not.toMatch(/analytics/i);
      expect(command.moduleLabel, command.id).not.toMatch(/analytics/i);
    }
  });

  it("wears the module label the rail wears", () => {
    // `moduleLabel` comes from the registry's module name, which is also what
    // the module manifest gives the rail. This pins that there is no second
    // source: Insight is one product surface with one name.
    const labels = new Set(
      catalogue.commands.map((entry) => entry.moduleLabel),
    );
    expect(labels.has("Insight")).toBe(true);
    expect(labels.has("Analytics")).toBe(false);
  });

  it("offers no two commands under one module and title", () => {
    // A duplicate title is an ambiguous result row: the owner cannot tell which
    // one they are about to run, and ranking decides for them.
    const seen = new Map<string, string>();
    for (const command of catalogue.commands) {
      const key = `${command.moduleLabel} ${command.title}`;
      const previous = seen.get(key);
      expect(
        previous,
        `${command.id} duplicates ${previous ?? ""}`,
      ).toBeUndefined();
      seen.set(key, command.id);
    }
  });

  /*
   * Two rows, one destination, different promises. That is what
   * `people.search` and `meetings.search` were, and it is what this catches.
   *
   * One pair is legitimate and is named rather than excused: Insight's range
   * presets are DERIVED from `INSIGHT_WINDOWS`, and the preset for the DEFAULT
   * window is `/analytics` without a parameter — because that is the range
   * `/analytics` actually opens on. Both rows tell the truth, and hard-coding
   * `?window=12-weeks` to make them differ would put a redundant parameter in
   * the owner's address bar to satisfy a test.
   */
  const SHARED_DESTINATIONS_BY_DESIGN: ReadonlySet<string> = new Set([
    "analytics.open",
  ]);

  it("offers no two navigation commands to one destination", () => {
    const seen = new Map<string, string>();
    for (const command of catalogue.commands) {
      if (command.kind !== "navigate") continue;
      if (command.target.kind !== "route") continue;
      const previous = seen.get(command.target.to);
      if (
        previous !== undefined &&
        (SHARED_DESTINATIONS_BY_DESIGN.has(previous) ||
          SHARED_DESTINATIONS_BY_DESIGN.has(command.id))
      ) {
        continue;
      }
      expect(
        previous,
        `${command.id} and ${previous ?? ""} both open ${command.target.to}`,
      ).toBeUndefined();
      seen.set(command.target.to, command.id);
    }
  });
});
