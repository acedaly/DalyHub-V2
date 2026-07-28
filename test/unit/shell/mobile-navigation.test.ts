/**
 * MOBILE-01 — the phone bottom-navigation model.
 *
 * These assert the CONTRACT the shell depends on: that the bar is derived from the
 * registry capability (never a hard-coded list), that it can never exceed its
 * five-control budget, that Capture sits mid-bar and More last, and that exactly
 * one destination is ever active.
 */

import { describe, expect, it } from "vitest";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";
import {
  MOBILE_PRIMARY_DESTINATION_LIMIT,
  activeDestinationHref,
  buildBottomNavigation,
  isDestinationActive,
  resolveMobilePrimaryDestinations,
} from "~/shared/shell/mobile-navigation";

function item(
  overrides: Partial<NavigationItem> & Pick<NavigationItem, "id" | "href">,
): NavigationItem {
  return {
    moduleId: overrides.id.split(".")[0] as never,
    label: overrides.label ?? overrides.id,
    order: overrides.order ?? 100,
    ...overrides,
  } as NavigationItem;
}

/** The navigation model as the shipped manifests produce it. */
const SHIPPED: readonly NavigationItem[] = [
  item({
    id: "today.index",
    href: "/today",
    label: "Today",
    order: 5,
    mobilePrimaryOrder: 10,
  }),
  item({ id: "areas.index", href: "/areas", label: "Areas", order: 10 }),
  item({
    id: "tasks.index",
    href: "/tasks",
    label: "Tasks",
    order: 40,
    mobilePrimaryOrder: 20,
  }),
  item({ id: "notes.index", href: "/notes", label: "Notes", order: 100 }),
  item({
    id: "diary.index",
    href: "/diary",
    label: "Diary",
    order: 110,
    mobilePrimaryOrder: 30,
  }),
  item({
    id: "meetings.index",
    href: "/meetings",
    label: "Meetings",
    order: 120,
  }),
];

describe("resolveMobilePrimaryDestinations", () => {
  it("includes only destinations that declared the capability", () => {
    expect(
      resolveMobilePrimaryDestinations(SHIPPED).map((entry) => entry.label),
    ).toEqual(["Today", "Tasks", "Diary"]);
  });

  it("orders by the module-declared mobilePrimaryOrder, not by navOrder", () => {
    const navigation = [
      item({ id: "a.index", href: "/a", order: 1, mobilePrimaryOrder: 30 }),
      item({ id: "b.index", href: "/b", order: 2, mobilePrimaryOrder: 10 }),
      item({ id: "c.index", href: "/c", order: 3, mobilePrimaryOrder: 20 }),
    ];
    expect(
      resolveMobilePrimaryDestinations(navigation).map((entry) => entry.href),
    ).toEqual(["/b", "/c", "/a"]);
  });

  it("breaks a mobilePrimaryOrder tie by navOrder, then registry position", () => {
    const navigation = [
      item({ id: "a.index", href: "/a", order: 20, mobilePrimaryOrder: 10 }),
      item({ id: "b.index", href: "/b", order: 10, mobilePrimaryOrder: 10 }),
      item({ id: "c.index", href: "/c", order: 10, mobilePrimaryOrder: 10 }),
    ];
    expect(
      resolveMobilePrimaryDestinations(navigation).map((entry) => entry.href),
    ).toEqual(["/b", "/c", "/a"]);
  });

  it("caps the bar at its budget so a fourth opt-in never shrinks the targets", () => {
    const navigation = [1, 2, 3, 4, 5].map((n) =>
      item({ id: `m${n}.index`, href: `/m${n}`, mobilePrimaryOrder: n }),
    );
    expect(resolveMobilePrimaryDestinations(navigation)).toHaveLength(
      MOBILE_PRIMARY_DESTINATION_LIMIT,
    );
  });

  it("drops a destination the owner hid, because the shell passes filtered navigation", () => {
    const withoutDiary = SHIPPED.filter((entry) => entry.href !== "/diary");
    expect(
      resolveMobilePrimaryDestinations(withoutDiary).map(
        (entry) => entry.label,
      ),
    ).toEqual(["Today", "Tasks"]);
  });
});

describe("buildBottomNavigation", () => {
  it("produces Today · Tasks · Capture · Diary · More for the shipped manifests", () => {
    const slots = buildBottomNavigation(SHIPPED);
    expect(
      slots.map((slot) =>
        slot.kind === "destination" ? slot.item.label : slot.kind,
      ),
    ).toEqual(["Today", "Tasks", "capture", "Diary", "more"]);
  });

  it("never exceeds the five-control budget", () => {
    const navigation = [1, 2, 3, 4, 5, 6].map((n) =>
      item({ id: `m${n}.index`, href: `/m${n}`, mobilePrimaryOrder: n }),
    );
    expect(buildBottomNavigation(navigation)).toHaveLength(5);
  });

  it("still offers Capture and More when no module opted in", () => {
    // A navigable module that did NOT declare the capability contributes no
    // bottom-bar slot — it stays reachable through More. Capture and More are
    // unconditional, so the bar is never empty.
    expect(
      buildBottomNavigation([item({ id: "a.index", href: "/a" })]).map(
        (slot) => slot.kind,
      ),
    ).toEqual(["capture", "more"]);
  });

  it("keeps Capture mid-bar and More last with two destinations", () => {
    const navigation = [
      item({ id: "a.index", href: "/a", mobilePrimaryOrder: 1 }),
      item({ id: "b.index", href: "/b", mobilePrimaryOrder: 2 }),
    ];
    expect(buildBottomNavigation(navigation).map((slot) => slot.kind)).toEqual([
      "destination",
      "capture",
      "destination",
      "more",
    ]);
  });
});

describe("isDestinationActive", () => {
  it("matches the destination itself and nested paths", () => {
    expect(isDestinationActive("/tasks", "/tasks")).toBe(true);
    expect(isDestinationActive("/tasks", "/tasks/abc")).toBe(true);
  });

  it("does not match a longer sibling segment", () => {
    expect(isDestinationActive("/today", "/todayish")).toBe(false);
  });

  it("treats the root destination as exact", () => {
    expect(isDestinationActive("/", "/")).toBe(true);
    expect(isDestinationActive("/", "/tasks")).toBe(false);
  });
});

describe("activeDestinationHref", () => {
  const destinations = resolveMobilePrimaryDestinations(SHIPPED);

  it("returns exactly one active destination for a nested route", () => {
    expect(activeDestinationHref(destinations, "/tasks/abc")).toBe("/tasks");
  });

  it("returns null when the route is not a phone destination", () => {
    expect(activeDestinationHref(destinations, "/settings")).toBeNull();
  });

  it("prefers the longest match when destinations nest", () => {
    const nested = [
      item({ id: "a.index", href: "/today", mobilePrimaryOrder: 1 }),
      item({ id: "b.index", href: "/today/plan", mobilePrimaryOrder: 2 }),
    ];
    expect(
      activeDestinationHref(
        resolveMobilePrimaryDestinations(nested),
        "/today/plan",
      ),
    ).toBe("/today/plan");
  });
});
