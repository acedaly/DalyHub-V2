/**
 * BRAND-01 — the sidebar's product identity.
 *
 * The defect this exists to stop coming back: the rail used to render the
 * WORKSPACE NAME and nothing else, so the product's own name in the frame was
 * whatever the workspace happened to be called. Renaming the workspace renamed
 * DalyHub. These tests pin the replacement — product first, workspace as
 * secondary context, and the mark decorative because the name is real text
 * beside it.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SidebarBrand } from "~/shared/shell/SidebarBrand";

describe("SidebarBrand", () => {
  it("always states the product name", () => {
    render(<SidebarBrand workspaceName="Aidan's things" />);
    const banner = screen.getByRole("banner");
    expect(within(banner).getByText("DalyHub")).toBeInTheDocument();
  });

  it("shows a differently-named workspace as SECONDARY context, not instead", () => {
    render(<SidebarBrand workspaceName="Aidan's things" />);
    const banner = screen.getByRole("banner");
    expect(within(banner).getByText("DalyHub")).toBeInTheDocument();
    const workspace = within(banner).getByText("Aidan's things");
    expect(workspace).toBeInTheDocument();
    // Subordinate by class, which is what carries the quieter token and the
    // smaller size in `shell.css`.
    expect(workspace).toHaveClass("dh-sidebar__brand-workspace");
  });

  it("does not repeat the name when the workspace IS DalyHub", () => {
    render(<SidebarBrand workspaceName="DalyHub" />);
    const banner = screen.getByRole("banner");
    expect(within(banner).getAllByText("DalyHub")).toHaveLength(1);
    expect(banner.querySelector(".dh-sidebar__brand-workspace")).toBeNull();
  });

  it("renders the brand mark, decoratively", () => {
    // The product name is written beside it as real text, so naming the mark as
    // well would make a screen reader announce "DalyHub DalyHub".
    const { container } = render(<SidebarBrand workspaceName="DalyHub" />);
    const mark = container.querySelector(".dh-brand-mark");
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".dh-sidebar__brand-mark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("keeps the tagline OUT of the navigation rail", () => {
    render(<SidebarBrand workspaceName="DalyHub" />);
    expect(screen.queryByText("Your life. Connected.")).toBeNull();
  });
});
