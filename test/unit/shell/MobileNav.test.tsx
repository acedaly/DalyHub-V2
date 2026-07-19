import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";
import { MobileNav } from "~/shared/shell/MobileNav";

const NAVIGATION: readonly NavigationItem[] = [
  {
    id: "areas.index",
    moduleId: "areas" as never,
    label: "Areas",
    href: "/areas",
    order: 10,
    entityType: "area",
  },
];

function renderMobileNav(onClose = vi.fn()) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <div>
          <div data-testid="background">Background content</div>
          <MobileNav
            workspaceName="DalyHub"
            email="owner@example.com"
            theme="system"
            navigation={NAVIGATION}
            opener={null}
            onClose={onClose}
          />
        </div>
      ),
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
  return { onClose };
}

describe("PX-02 MobileNav overlay", () => {
  it("renders a modal dialog containing the navigation", () => {
    renderMobileNav();
    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      within(dialog).getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Areas" }),
    ).toBeInTheDocument();
  });

  it("has an accessible close control", () => {
    renderMobileNav();
    expect(
      screen.getByRole("button", { name: /close navigation/i }),
    ).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const { onClose } = renderMobileNav();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the close control is activated", () => {
    const { onClose } = renderMobileNav();
    fireEvent.click(screen.getByRole("button", { name: /close navigation/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("makes the background inert while open", () => {
    renderMobileNav();
    expect(screen.getByTestId("background")).toHaveAttribute("inert");
  });
});
