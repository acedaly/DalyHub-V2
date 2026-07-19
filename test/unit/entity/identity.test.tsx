import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ENTITY_IDENTITY,
  ENTITY_TYPES,
  EntityIcon,
  entityAccent,
  entityAccentVar,
  getEntityIdentity,
  isEntityType,
} from "~/shared/entity";

describe("PX-02 entity identity map", () => {
  it("defines exactly one icon + accent per entity type", () => {
    for (const type of ENTITY_TYPES) {
      const identity = ENTITY_IDENTITY[type];
      expect(identity.type).toBe(type);
      expect(identity.label.length).toBeGreaterThan(0);
      expect(identity.pluralLabel.length).toBeGreaterThan(0);
      expect(typeof identity.Icon).toBe("function");
      expect(identity.accentVar).toBe(`--dh-entity-${type}-accent`);
    }
  });

  it("covers the documented entity types", () => {
    expect([...ENTITY_TYPES]).toEqual([
      "area",
      "goal",
      "project",
      "task",
      "note",
      "meeting",
      "person",
      "asset",
      "diary",
      "review",
    ]);
  });

  it("uses distinct icons and accents per type", () => {
    const icons = new Set(ENTITY_TYPES.map((t) => ENTITY_IDENTITY[t].Icon));
    const accents = new Set(
      ENTITY_TYPES.map((t) => ENTITY_IDENTITY[t].accentVar),
    );
    expect(icons.size).toBe(ENTITY_TYPES.length);
    expect(accents.size).toBe(ENTITY_TYPES.length);
  });

  it("resolves and guards types safely", () => {
    expect(isEntityType("project")).toBe(true);
    expect(isEntityType("nonsense")).toBe(false);
    expect(getEntityIdentity("task")?.label).toBe("Task");
    expect(getEntityIdentity("nonsense")).toBeNull();
    expect(entityAccentVar("goal")).toBe("--dh-entity-goal-accent");
    expect(entityAccent("goal")).toBe("var(--dh-entity-goal-accent)");
  });
});

describe("PX-02 EntityIcon", () => {
  it("renders the type's glyph in its accent, decorative by default", () => {
    const { container } = render(<EntityIcon type="project" />);
    const wrapper = container.querySelector(".dh-entity-icon");
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute("data-entity", "project");
    // Accent applied via inline colour so the SVG stroke follows it.
    expect((wrapper as HTMLElement).style.color).toContain(
      "--dh-entity-project-accent",
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("can carry its own accessible name when a title is supplied", () => {
    const { getByRole } = render(<EntityIcon type="task" title="Task" />);
    expect(getByRole("img", { name: "Task" })).toBeInTheDocument();
  });
});
