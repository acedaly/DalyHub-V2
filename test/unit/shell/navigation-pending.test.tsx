/**
 * PERF-01 — a navigation acknowledges itself immediately.
 *
 * The rule is pure and lives in `navigation-pending.ts`, so most of this file
 * tests it directly: which destination is being navigated to, and — more
 * importantly — every case where the answer must be "none", because a row that
 * lights up for a Drawer, for a submission's revalidation, or for the page the
 * owner is already on is worse than no acknowledgement at all.
 *
 * The rendering half asserts what a screen reader and a forced-colours user get:
 * `aria-busy` on the destination, and `aria-current` still on the row the owner
 * has not left yet.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, type Navigation } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";
import { pendingNavigationHref } from "~/shared/shell/navigation-pending";

function item(label: string, order: number): NavigationItem {
  return {
    id: `${label.toLowerCase()}.index`,
    moduleId: label.toLowerCase() as never,
    label,
    href: `/${label.toLowerCase()}`,
    order,
  };
}

const ITEMS = [item("Today", 5), item("Tasks", 30), item("Projects", 60)];

/** A `useNavigation()` value, narrowed to the fields the rule reads. */
function nav(
  state: Navigation["state"],
  pathname?: string,
  formMethod?: string,
): Pick<Navigation, "state" | "location" | "formMethod"> {
  return {
    state,
    location:
      pathname === undefined
        ? undefined
        : ({ pathname, search: "", hash: "", state: null, key: "k" } as never),
    formMethod: formMethod as never,
  } as Pick<Navigation, "state" | "location" | "formMethod">;
}

describe("PERF-01 pendingNavigationHref", () => {
  it("names the destination while its loaders run", () => {
    expect(
      pendingNavigationHref(ITEMS, nav("loading", "/tasks"), "/today"),
    ).toBe("/tasks");
  });

  it("names the module for a record route under it", () => {
    // The same rule the current row uses: a record route keeps its module.
    expect(
      pendingNavigationHref(ITEMS, nav("loading", "/projects/pr-1"), "/today"),
    ).toBe("/projects");
  });

  it("says nothing when the router is idle", () => {
    expect(pendingNavigationHref(ITEMS, nav("idle"), "/today")).toBeNull();
  });

  it("says nothing for a same-route change", () => {
    /*
     * Opening a Drawer, applying a filter and loading another page are all
     * navigations to the pathname the owner is already on. The collection's own
     * skeleton reports those; lighting up the current row would say the owner
     * is going somewhere they are not.
     */
    expect(
      pendingNavigationHref(ITEMS, nav("loading", "/today"), "/today"),
    ).toBeNull();
  });

  it("says nothing for a submission's revalidation", () => {
    expect(
      pendingNavigationHref(ITEMS, nav("loading", "/tasks", "POST"), "/today"),
    ).toBeNull();
  });

  it("says nothing for a destination that is not a navigation entry", () => {
    expect(
      pendingNavigationHref(ITEMS, nav("loading", "/settings"), "/today"),
    ).toBeNull();
  });
});

describe("PERF-01 the rail marks the destination", () => {
  it("marks it busy while leaving the current row current", async () => {
    vi.resetModules();
    vi.doMock("react-router", async () => {
      const actual =
        await vi.importActual<typeof import("react-router")>("react-router");
      return {
        ...actual,
        useNavigation: () => nav("loading", "/tasks"),
      };
    });
    const { PrimaryNavigation } =
      await import("~/shared/shell/PrimaryNavigation");
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <PrimaryNavigation id="nav" items={ITEMS} />
      </MemoryRouter>,
    );
    const destination = screen.getByRole("link", { name: "Tasks" });
    const departure = screen.getByRole("link", { name: "Today" });
    expect(destination.getAttribute("aria-busy")).toBe("true");
    expect(destination.getAttribute("data-pending")).toBe("true");
    // The owner has not arrived yet, so the row they are ON is still current —
    // and it is NOT also marked pending.
    expect(departure.getAttribute("aria-current")).toBe("page");
    expect(departure.getAttribute("data-pending")).toBeNull();
    expect(destination.getAttribute("aria-current")).toBeNull();
    vi.doUnmock("react-router");
    vi.resetModules();
  });
});
