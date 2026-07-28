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

  // PEOPLE-03 — DIARY-01A shipped `/diary/:entryId` but never registered it here,
  // so a diary entry referenced from a Person's relationship timeline degraded to
  // plain text even though its record page existed.
  it("maps a Diary entry to its canonical record route", () => {
    expect(entityDestination("diary", "d1")).toEqual({
      kind: "route",
      to: "/diary/d1",
    });
  });

  it("returns null for unsupported types and blank ids (degrades to text)", () => {
    // Every REGISTERED entity type now has a genuine destination, so the
    // no-destination case is an unregistered type (a future module's) or a blank id.
    for (const type of ["widget", "??"]) {
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
    renderLink(<EntityLink type="widget" id="d1" title="Budget spreadsheet" />);
    expect(screen.getByText("Budget spreadsheet")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("never exposes the id in the visible text", () => {
    renderLink(<EntityLink type="goal" id="secret-id-123" title="Ship v2" />);
    expect(screen.queryByText(/secret-id-123/)).not.toBeInTheDocument();
  });

  // PX-05 — the icon lives in the SHARED link now, so related-record rows can no
  // longer drift between iconned (a Links tab that hand-composed one) and bare
  // text (a record summary that didn't).
  it("carries the entity-identity glyph by default", () => {
    const { container } = renderLink(
      <EntityLink type="goal" id="g1" title="Ship v2" />,
    );
    expect(container.querySelector('[data-entity="goal"]')).toBeInTheDocument();
    // Decorative: the accessible name still comes from the type + title alone.
    expect(
      screen.getByRole("link", { name: "Goal: Ship v2" }),
    ).toBeInTheDocument();
  });

  it("omits the glyph where the surrounding row already shows the type", () => {
    const { container } = renderLink(
      <EntityLink type="goal" id="g1" title="Ship v2" showIcon={false} />,
    );
    expect(container.querySelector('[data-entity="goal"]')).toBeNull();
  });

  it("keeps the glyph on a target with no destination, so identity never depends on navigability", () => {
    // A registered type whose id is missing: identity (the glyph) is still shown,
    // but there is nothing to navigate to.
    const { container } = renderLink(
      <EntityLink type="diary" id="" title="Monday" />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-entity="diary"]'),
    ).toBeInTheDocument();
  });
});
