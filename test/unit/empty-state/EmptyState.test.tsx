import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "~/shared/empty-state";

describe("PX-02 EmptyState", () => {
  it("renders a heading, description and actions", () => {
    render(
      <EmptyState
        title="Nothing in Today yet"
        description="Tasks you schedule will show up here."
        primaryAction={<button type="button">Plan your day</button>}
        secondaryAction={<button type="button">Learn more</button>}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Nothing in Today yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Tasks you schedule will show up here."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Plan your day" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Learn more" }),
    ).toBeInTheDocument();
  });

  it("renders a decorative icon (aria-hidden), not an accessible image", () => {
    const { container } = render(
      <EmptyState icon={<svg data-testid="glyph" />} title="Empty" />,
    );
    const iconWrap = container.querySelector(".dh-empty-state__icon");
    expect(iconWrap).toHaveAttribute("aria-hidden", "true");
  });

  it("prefers an illustration over an icon when both are given", () => {
    const { container } = render(
      <EmptyState
        icon={<svg />}
        illustration={<img alt="" data-testid="illus" />}
        title="Empty"
      />,
    );
    expect(
      container.querySelector(".dh-empty-state__illustration"),
    ).not.toBeNull();
    expect(container.querySelector(".dh-empty-state__icon")).toBeNull();
  });

  it("respects a custom heading level", () => {
    render(<EmptyState title="No matches" headingLevel={3} />);
    expect(
      screen.getByRole("heading", { level: 3, name: "No matches" }),
    ).toBeInTheDocument();
  });
});
