import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { DrawerProvider } from "~/shared/drawer";
import { EntityLink, entityDestination } from "~/shared/entity";

/**
 * Deliverable 4 — the ONE shared entity-destination helper and the `EntityLink`
 * renderer: map an already-authorised entity type + id to its canonical
 * destination (or none), never inferring access and never leaking an id in text.
 */

describe("entityDestination", () => {
  it("maps record types to their canonical routes", () => {
    expect(entityDestination("area", "a1")).toEqual({
      kind: "route",
      to: "/areas/a1",
    });
    expect(entityDestination("goal", "g1")).toEqual({
      kind: "route",
      to: "/goals/g1",
    });
    expect(entityDestination("project", "p1")).toEqual({
      kind: "route",
      to: "/projects/p1",
    });
    expect(entityDestination("note", "n1")).toEqual({
      kind: "route",
      to: "/notes/n1",
    });
  });

  it("maps a Task to the shared Task Drawer, not a route", () => {
    expect(entityDestination("task", "t1")).toEqual({
      kind: "drawer",
      drawerKey: "task:t1",
    });
  });

  it("maps a Person to their canonical record route (PEOPLE-01)", () => {
    expect(entityDestination("person", "pe1")).toEqual({
      kind: "route",
      to: "/person/pe1",
    });
  });

  it("maps a Meeting to its canonical record route", () => {
    expect(entityDestination("meeting", "m1")).toEqual({
      kind: "route",
      to: "/meeting/m1",
    });
  });

  it("maps a Review to its canonical record route", () => {
    expect(entityDestination("review", "rv1")).toEqual({
      kind: "route",
      to: "/reviews/rv1",
    });
  });

  it("returns null for unsupported types and blank ids (degrades to text)", () => {
    for (const type of ["diary", "??"]) {
      expect(entityDestination(type, "x")).toBeNull();
    }
    expect(entityDestination("goal", "")).toBeNull();
  });

  it("encodes ids that need escaping", () => {
    expect(entityDestination("project", "a b/c")).toEqual({
      kind: "route",
      to: "/projects/a%20b%2Fc",
    });
  });
});

function renderLink(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <DrawerProvider renderDrawer={() => null}>{ui}</DrawerProvider>
    </MemoryRouter>,
  );
}

describe("EntityLink", () => {
  it("renders a route link with an accessible name carrying the record type", () => {
    renderLink(<EntityLink type="goal" id="g1" title="Ship v2" />);
    const link = screen.getByRole("link", { name: "Goal: Ship v2" });
    expect(link).toHaveAttribute("href", "/goals/g1");
  });

  it("renders a Task as a Drawer-opening link preserving the current context", () => {
    renderLink(<EntityLink type="task" id="t1" title="Write copy" />);
    const link = screen.getByRole("link", { name: "Task: Write copy" });
    expect(link.getAttribute("href")).toContain("drawer=task%3At1");
  });

  it("renders unsupported targets as plain, non-interactive text", () => {
    renderLink(<EntityLink type="diary" id="d1" title="Budget spreadsheet" />);
    expect(screen.getByText("Budget spreadsheet")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("never exposes the id in the visible text", () => {
    renderLink(<EntityLink type="goal" id="secret-id-123" title="Ship v2" />);
    expect(screen.queryByText(/secret-id-123/)).not.toBeInTheDocument();
  });
});
