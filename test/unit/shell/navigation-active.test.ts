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
