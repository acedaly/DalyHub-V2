import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRoutesStub, Outlet } from "react-router";
import { describe, expect, it } from "vitest";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";
import { AppShell } from "~/shared/shell/AppShell";
import { ACCESS_LOGOUT_PATH } from "~/shared/shell/UserMenu";
import { ModulePlaceholder } from "~/shared/shell/ModulePlaceholder";

const NAVIGATION: readonly NavigationItem[] = [
  {
    id: "areas.index",
    moduleId: "areas" as never,
    label: "Areas",
    href: "/areas",
    order: 10,
  },
  {
    id: "goals.index",
    moduleId: "goals" as never,
    label: "Goals",
    href: "/goals",
    order: 20,
  },
  {
    id: "projects.index",
    moduleId: "projects" as never,
    label: "Projects",
    href: "/projects",
    order: 30,
  },
  {
    id: "tasks.index",
    moduleId: "tasks" as never,
    label: "Tasks",
    href: "/tasks",
    order: 40,
  },
];

function renderShell(initialPath = "/") {
  const Placeholder = () => (
    <ModulePlaceholder name="Areas" summary="Permanent domains of life." />
  );
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <AppShell
          email="owner@example.com"
          theme="system"
          navigation={NAVIGATION}
        >
          <Outlet />
        </AppShell>
      ),
      children: [
        { index: true, Component: Placeholder },
        { path: "areas", Component: Placeholder },
      ],
    },
  ]);
  return render(<Stub initialEntries={[initialPath]} />);
}

describe("AppShell accessibility & structure", () => {
  it("uses banner, navigation and main landmarks", () => {
    renderShell();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveAttribute("tabindex", "-1");
  });

  it("provides a skip link targeting the main content", () => {
    renderShell();
    const skip = screen.getByRole("link", { name: /skip to main content/i });
    expect(skip).toHaveAttribute("href", "#main-content");
  });

  it("shows the authenticated owner email and a logout link to Cloudflare Access", () => {
    renderShell();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    const logout = screen.getByRole("link", { name: /log out/i });
    expect(logout).toHaveAttribute("href", ACCESS_LOGOUT_PATH);
    expect(logout).toHaveAttribute("href", "/cdn-cgi/access/logout");
  });

  it("renders registry-driven navigation links with plain text labels", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const label of ["Areas", "Goals", "Projects", "Tasks"]) {
      expect(
        within(nav).getByRole("link", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("conveys the active route semantically with aria-current", () => {
    renderShell("/areas");
    const active = screen.getByRole("link", { name: "Areas" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Goals" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("exposes the mobile navigation toggle with an accessible name and expanded state", () => {
    renderShell();
    const toggle = screen.getByRole("button", { name: "Menu" });
    expect(toggle).toHaveAttribute("aria-controls", "primary-navigation");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("offers a theme control with an accessible group and pressed state", () => {
    renderShell();
    for (const label of ["System", "Light", "Dark"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // `system` is the active preference here.
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders the routed module placeholder content inside the shell main", () => {
    renderShell();
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { level: 1, name: "Areas" }),
    ).toBeInTheDocument();
    expect(within(main).getByText(/routing placeholder/i)).toBeInTheDocument();
  });

  it("has no icon-only (unlabelled) buttons or links", () => {
    renderShell();
    for (const control of [
      ...screen.getAllByRole("button"),
      ...screen.getAllByRole("link"),
    ]) {
      expect(control.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});
