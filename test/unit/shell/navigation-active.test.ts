/**
 * UX-01 — the ONE navigation-active rule.
 *
 * Both navigation surfaces (the desktop rail, the "More" sheet and the phone
 * bottom bar) render the SAME registry-derived model, so they must agree about
 * which destination the current route sits inside. These tests pin that one rule
 * so a future surface cannot quietly reintroduce an exact-match variant.
 */

import { describe, expect, it } from "vitest";

import {
  activeNavigationHref,
  isNavigationDestinationActive,
} from "~/shared/shell/navigation-active";

describe("isNavigationDestinationActive", () => {
  it("matches the destination's own path", () => {
    expect(isNavigationDestinationActive("/tasks", "/tasks")).toBe(true);
  });

  it("keeps a module current while a record beneath it is open", () => {
    expect(isNavigationDestinationActive("/projects", "/projects/pr-1")).toBe(
      true,
    );
    expect(isNavigationDestinationActive("/notes", "/notes/n-2/edit")).toBe(
      true,
    );
  });

  it("does not treat a longer sibling segment as nested", () => {
    expect(isNavigationDestinationActive("/today", "/todayish")).toBe(false);
  });

  it("never lets the home destination claim every route", () => {
    expect(isNavigationDestinationActive("/", "/")).toBe(true);
    expect(isNavigationDestinationActive("/", "/tasks")).toBe(false);
  });

  it("tolerates a trailing slash on the declared href", () => {
    expect(isNavigationDestinationActive("/areas/", "/areas/a-1")).toBe(true);
  });
});

describe("activeNavigationHref", () => {
  const hrefs = ["/today", "/tasks", "/tasks/review", "/notes"];

  it("returns the longest matching destination, so exactly one row is current", () => {
    expect(activeNavigationHref(hrefs, "/tasks/review")).toBe("/tasks/review");
    expect(activeNavigationHref(hrefs, "/tasks/tk-1")).toBe("/tasks");
  });

  it("returns null when the route sits under no destination", () => {
    expect(activeNavigationHref(hrefs, "/settings")).toBeNull();
  });
});

/*
 * RECALL-00-E (DEBT-226) — a destination is ALSO current inside its module's
 * declared route-path prefixes, so the singular record and create routes the
 * one destination map sends every link to (`/person/:id`, `/meeting/:id`,
 * `/asset/:id`, `/new/person`, …) keep their module's row current. These are
 * the exact route shapes that used to leave the rail, the More sheet and the
 * phone bar with ZERO `aria-current` items. Falsification: revert the
 * authority to nesting-only matching and every fixture below fails.
 */
describe("activeNavigationHref — module route prefixes (RECALL-00-E)", () => {
  const destinations = [
    { href: "/today" },
    { href: "/people", activePathPrefixes: ["/new/person", "/person"] },
    { href: "/meetings", activePathPrefixes: ["/new/meeting", "/meeting"] },
    { href: "/assets", activePathPrefixes: ["/new/asset", "/asset"] },
    { href: "/tasks" },
    { href: "/tasks/review" },
  ];

  it("keeps a module current on its singular record routes", () => {
    expect(activeNavigationHref(destinations, "/person/p-1")).toBe("/people");
    expect(activeNavigationHref(destinations, "/meeting/m-1")).toBe(
      "/meetings",
    );
    expect(activeNavigationHref(destinations, "/asset/a-1")).toBe("/assets");
  });

  it("keeps a module current on its create routes", () => {
    expect(activeNavigationHref(destinations, "/new/person")).toBe("/people");
    expect(activeNavigationHref(destinations, "/new/meeting")).toBe(
      "/meetings",
    );
    expect(activeNavigationHref(destinations, "/new/asset")).toBe("/assets");
  });

  it("matches prefixes segment-aware and nested, like hrefs", () => {
    expect(activeNavigationHref(destinations, "/person/p-1/activity")).toBe(
      "/people",
    );
    // `/personify` is not inside `/person`.
    expect(activeNavigationHref(destinations, "/personify")).toBeNull();
  });

  it("preserves longest-match for conventionally nested modules", () => {
    expect(activeNavigationHref(destinations, "/tasks/review")).toBe(
      "/tasks/review",
    );
    expect(activeNavigationHref(destinations, "/tasks/tk-1")).toBe("/tasks");
    expect(activeNavigationHref(destinations, "/people/recent")).toBe(
      "/people",
    );
  });

  it("still returns null for a route no destination or prefix claims", () => {
    expect(activeNavigationHref(destinations, "/settings")).toBeNull();
  });
});
