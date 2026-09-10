/**
 * BRAND-01 — the sidebar's product identity.
 *
 * The defect this exists to stop coming back: the rail used to render the
 * WORKSPACE NAME and nothing else, so the product's own name in the frame was
 * whatever the workspace happened to be called. Renaming the workspace renamed
 * DalyHub. These tests pin the replacement — product first, workspace as
 * secondary context, and the mark decorative because the name is real text
 * beside it.
 *
 * The block is no longer the `banner` landmark — the desktop top app bar is,
 * which is what a top app bar is, and the drawer that contains this block is a
 * `navigation` landmark. So these assertions are scoped to the block itself
 * rather than to a role it no longer claims; what they guarantee is unchanged.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SidebarBrand } from "~/shared/shell/SidebarBrand";

/**
 * The brand block itself, which is what these assertions are about.
 *
 * UNTITLED-02 — found by `data-testid` rather than by class name. These tests
 * used to key off `.dh-sidebar__brand*`, which meant the migration to Untitled
 * UI broke four assertions that had nothing to say about what changed. A
 * `data-testid` names the thing; a class name names its paint.
 */
function brandBlock(container: HTMLElement): HTMLElement {
  const brand = container.querySelector<HTMLElement>(
    "[data-testid='sidebar-brand']",
  );
  if (!brand) throw new Error("the brand block did not render");
  return brand;
}

describe("SidebarBrand", () => {
  it("always states the product name", () => {
    const { container } = render(
      <SidebarBrand workspaceName="Aidan's things" />,
    );
    const brand = brandBlock(container);
    expect(within(brand).getByText("DalyHub")).toBeInTheDocument();
  });

  it("shows a differently-named workspace as SECONDARY context, not instead", () => {
    const { container } = render(
      <SidebarBrand workspaceName="Aidan's things" />,
    );
    const brand = brandBlock(container);
    expect(within(brand).getByText("DalyHub")).toBeInTheDocument();
    const workspace = within(brand).getByText("Aidan's things");
    expect(workspace).toBeInTheDocument();
    // Subordinate, and it is the SECOND line: the product name comes first in
    // document order, which is what "secondary context, not instead" means to a
    // screen reader as well as to the eye.
    expect(workspace).toHaveAttribute("data-testid", "sidebar-workspace");
    const productName = within(brand).getByTestId("sidebar-product-name");
    expect(
      productName.compareDocumentPosition(workspace) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not repeat the name when the workspace IS DalyHub", () => {
    const { container } = render(<SidebarBrand workspaceName="DalyHub" />);
    const brand = brandBlock(container);
    expect(within(brand).getAllByText("DalyHub")).toHaveLength(1);
    expect(brand.querySelector("[data-testid='sidebar-workspace']")).toBeNull();
  });

  it("renders the brand mark, decoratively", () => {
    // The product name is written beside it as real text, so naming the mark as
    // well would make a screen reader announce "DalyHub DalyHub".
    const { container } = render(<SidebarBrand workspaceName="DalyHub" />);
    const mark = container.querySelector(".dh-brand-mark");
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(
      container.querySelector("[data-testid='sidebar-brand-mark']"),
    ).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the tagline OUT of the navigation rail", () => {
    render(<SidebarBrand workspaceName="DalyHub" />);
    expect(screen.queryByText("Your life. Connected.")).toBeNull();
  });
});
