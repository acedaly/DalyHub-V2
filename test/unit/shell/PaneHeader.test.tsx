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

  /*
   * UIX-06 — a COLLECTION header draws no glyph beside its title.
   *
   * The band used to resolve one from an `entityType` prop, which gave the
   * product three different page origins: a collection's title started 40px
   * right of Today's and Analytics', neither of which has an entity type to
   * badge. A RECORD still passes `icon`, because a record's mark carries its
   * Area's identity accent rather than repeating the sidebar's glyph.
   */
  it("renders a supplied identity node, and nothing when none is given", () => {
    const withIcon = render(
      <PaneHeader title="Kitchen fit-out" icon={<span data-testid="mark" />} />,
    );
    expect(withIcon.getByTestId("mark")).toBeInTheDocument();

    const plain = render(<PaneHeader title="Projects" />);
    expect(
      plain.container.querySelector(".dh-pane-header__lead .dh-entity-icon"),
    ).toBeNull();
  });

  it("is not a banner landmark (the sidebar owns banner)", () => {
    render(<PaneHeader title="Projects" />);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });
});
