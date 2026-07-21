import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRoutesStub, Outlet } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    entityType: "area",
  },
  {
    id: "goals.index",
    moduleId: "goals" as never,
    label: "Goals",
    href: "/goals",
    order: 20,
    entityType: "goal",
  },
  {
    id: "projects.index",
    moduleId: "projects" as never,
    label: "Projects",
    href: "/projects",
    order: 30,
    entityType: "project",
  },
  {
    id: "tasks.index",
    moduleId: "tasks" as never,
    label: "Tasks",
    href: "/tasks",
    order: 40,
    entityType: "task",
  },
];

// The shell installs CommandShortcutLayer, which fetches the `/commands` catalogue
// on mount. Stub it with an empty catalogue so tests never touch a real socket.
let originalFetch: typeof globalThis.fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ commands: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ) as typeof globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function renderShell(initialPath = "/") {
  const Placeholder = () => (
    <ModulePlaceholder
      name="Areas"
      entityType="area"
      summary="Permanent domains of life."
    />
  );
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <AppShell
          workspaceName="DalyHub"
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

describe("PX-02 AppShell — frame & landmarks", () => {
  it("uses banner (sidebar brand), primary navigation and main landmarks", () => {
    renderShell();
    // The rail sidebar owns the desktop banner; the mobile bar owns the mobile
    // banner (only one is visible per viewport — the other is display:none). Both
    // exist in the DOM here (jsdom ignores CSS visibility).
    expect(screen.getAllByRole("banner").length).toBeGreaterThanOrEqual(1);
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

  it("renders the workspace brand name", () => {
    renderShell();
    // The brand appears in a banner landmark (the rail on desktop, the mobile bar
    // on mobile — both present in the DOM here).
    const banners = screen.getAllByRole("banner");
    expect(
      banners.some((banner) => within(banner).queryByText("DalyHub") !== null),
    ).toBe(true);
  });

  it("renders registry-driven navigation as icon + label rows", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const label of ["Areas", "Goals", "Projects", "Tasks"]) {
      const link = within(nav).getByRole("link", { name: label });
      expect(link).toBeInTheDocument();
      // Icon + label: the row carries an inline SVG glyph alongside the label.
      expect(link.querySelector("svg")).not.toBeNull();
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

  it("offers Search and Command Palette entries in the sidebar", () => {
    renderShell();
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /command palette/i }),
    ).toBeInTheDocument();
  });

  it("exposes a mobile navigation toggle with accessible name and expanded state", () => {
    renderShell();
    const toggle = screen.getByRole("button", { name: /open navigation/i });
    expect(toggle).toHaveAttribute(
      "aria-controls",
      "primary-navigation-mobile",
    );
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("renders the routed module placeholder content inside the pane", () => {
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
      const name =
        control.getAttribute("aria-label") ?? control.textContent ?? "";
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("PX-02 AppShell — user menu relocation", () => {
  it("keeps identity, theme and sign-out behind the user menu (not in the header)", () => {
    renderShell();
    // The email/theme/logout are NOT in permanent chrome — hidden until opened.
    expect(screen.queryByText("owner@example.com")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /sign out/i }),
    ).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", {
      name: /account|owner|dalyhub/i,
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the user menu to reveal email, theme and sign out", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: /owner|account/i });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();

    // Theme control relocated here (reused unchanged).
    for (const label of ["System", "Light", "Dark"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const signOut = screen.getByRole("link", { name: /sign out/i });
    expect(signOut).toHaveAttribute("href", ACCESS_LOGOUT_PATH);
    expect(signOut).toHaveAttribute("href", "/cdn-cgi/access/logout");

    // Settings is NOT wired yet (SET-01) — the frame never renders a dead link
    // that would land on the 404 page (AGENTS.md §6 — no dead ends).
    expect(
      screen.queryByRole("link", { name: /settings/i }),
    ).not.toBeInTheDocument();
  });

  it("closes the user menu on Escape", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: /owner|account/i });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
