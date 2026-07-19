import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PaneHeader } from "~/shared/shell/PaneHeader";

describe("PX-02 PaneHeader", () => {
  it("renders the title as a heading with the given level", () => {
    render(<PaneHeader title="Projects" headingLevel={2} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Projects" }),
    ).toBeInTheDocument();
  });

  it("renders subtitle, view switcher and primary action slots when provided", () => {
    render(
      <PaneHeader
        title="Today"
        subtitle="12 tasks · 3 done"
        viewSwitcher={<button type="button">List</button>}
        primaryAction={<button type="button">Plan day</button>}
      />,
    );
    expect(screen.getByText("12 tasks · 3 done")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Plan day" }),
    ).toBeInTheDocument();
  });

  it("shows an entity identity glyph when an entity type is given", () => {
    const { container } = render(
      <PaneHeader title="Projects" entityType="project" />,
    );
    const icon = container.querySelector(
      '.dh-entity-icon[data-entity="project"]',
    );
    expect(icon).not.toBeNull();
  });

  it("is not a banner landmark (the sidebar owns banner)", () => {
    render(<PaneHeader title="Projects" />);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });
});
