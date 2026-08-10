import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRoutesStub, Outlet } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";
import { AppShell } from "~/shared/shell/AppShell";
import { ACCESS_LOGOUT_PATH } from "~/shared/shell/UserMenu";
import { PaneHeader } from "~/shared/shell/PaneHeader";

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
  // A minimal pane body. AUDIT-16 deleted `ModulePlaceholder`, which this test
  // used only as "something with a Pane Header to render inside the shell"; the
  // shell contract under test is unchanged.
  const Placeholder = () => (
    <div>
      <PaneHeader title="Areas" subtitle="Permanent domains of life." />
      <div className="dh-pane-body" />
    </div>
  );
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <AppShell
          workspaceName="DalyHub"
          email="owner@example.com"
          appearance="system"
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

  it("renders the workspace brand name inside the primary navigation landmark", () => {
    const { container } = renderShell();
    // The brand block is no longer a landmark of its own — the top app bar is the
    // banner now. It has to stay INSIDE one, though: axe's `region` rule wants
    // all page content contained, and an uncontained brand block is exactly the
    // kind of gap that produced the Help/About scan failures.
    const rail = container.querySelector(".dh-sidebar--rail");
    expect(rail).not.toBeNull();
    expect(rail).toHaveAttribute("aria-label", "Primary");
    expect(
      within(rail as HTMLElement).getByText("DalyHub"),
    ).toBeInTheDocument();
  });

  it("keeps exactly one banner per viewport, and it is the top app bar", () => {
    const { container } = renderShell();
    // Both bars are in the DOM; CSS shows one per viewport, and axe only ever
    // sees the visible one. What must never happen is a THIRD claimant, or the
    // drawer quietly taking the role back.
    const banners = [...container.querySelectorAll("header")];
    expect(banners).toHaveLength(2);
    expect(banners[0]).toHaveClass("dh-topbar");
    expect(banners[1]).toHaveClass("dh-mobilebar");
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

  it("offers Search and Command Palette entries in the desktop top app bar", () => {
    const { container } = renderShell();
    // Both affordances moved OUT of the navigation drawer and into the top app
    // bar. The drawer used to open with a 56px Search pill and a 56px Command
    // palette pill — 112px before its first destination, and a second control
    // as prominent as the primary one. They are still real, labelled controls
    // opening the same surfaces; they are just no longer in the rail.
    const topBar = container.querySelector(".dh-topbar");
    expect(topBar).not.toBeNull();
    expect(
      within(topBar as HTMLElement).getByRole("button", {
        name: /search dalyhub/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(topBar as HTMLElement).getByRole("button", {
        name: /command palette/i,
      }),
    ).toBeInTheDocument();

    // And the rail no longer carries a duplicate of either.
    const rail = container.querySelector(".dh-sidebar--rail");
    expect(rail).not.toBeNull();
    expect(
      within(rail as HTMLElement).queryByRole("button", { name: /search/i }),
    ).toBeNull();
    expect(
      within(rail as HTMLElement).queryByRole("button", {
        name: /command palette/i,
      }),
    ).toBeNull();
  });

  it("keeps exactly one search landmark in the desktop shell", () => {
    // Two `role="search"` regions (the rail's and the bar's) would be a
    // duplicate-landmark violation, and would make "where do I search?" a
    // question. The bar's is now the only one.
    const { container } = renderShell();
    expect(container.querySelectorAll('[role="search"]')).toHaveLength(1);
  });

  it("exposes the phone navigation sheet toggle with accessible name and expanded state", () => {
    renderShell();
    // MOBILE-01 moved the complete-navigation toggle from a top-left hamburger to
    // the bottom bar's "More" control — reachable one-handed. The sheet it opens,
    // and therefore this control's `aria-controls` target, is unchanged.
    const toggle = screen.getByRole("button", { name: /more/i });
    expect(toggle).toHaveAttribute(
      "aria-controls",
      "primary-navigation-mobile",
    );
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("renders the phone quick-navigation bar as a distinct landmark", () => {
    renderShell();
    const quick = screen.getByRole("navigation", { name: "Quick navigation" });
    // Capture and More are always present; registry destinations appear only for
    // modules that declare `meta.mobilePrimaryOrder` (none in this fixture).
    expect(
      within(quick).getByRole("button", { name: /capture/i }),
    ).toBeInTheDocument();
    expect(
      within(quick).getByRole("button", { name: /more/i }),
    ).toBeInTheDocument();
  });

  it("renders the routed module placeholder content inside the pane", () => {
    renderShell();
    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { level: 1, name: "Areas" }),
    ).toBeInTheDocument();
    expect(
      within(main).getByText("Permanent domains of life."),
    ).toBeInTheDocument();
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
  it("keeps identity and sign-out behind the user menu (not in the header)", () => {
    renderShell();
    // The email and logout are NOT in permanent chrome — hidden until opened.
    expect(screen.queryByText("owner@example.com")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /sign out/i }),
    ).not.toBeInTheDocument();

    // Scoped to the account control itself. A loose `/dalyhub/i` now also
    // matches the top bar's "Search DalyHub…" button, which is a different
    // control with a different job.
    const trigger = screen.getByRole("button", { name: /^account —/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the user menu to reveal email, settings and sign out", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: /^account —/i });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();

    // M3-01 — there is no theme quick-switch here any more: DalyHub ships one
    // generated light/dark pair and follows the operating system (ADR-074).
    for (const option of ["Match system", "Daly Dark", "Eucalypt"]) {
      expect(
        screen.queryByRole("button", { name: option }),
      ).not.toBeInTheDocument();
    }

    const signOut = screen.getByRole("link", { name: /sign out/i });
    expect(signOut).toHaveAttribute("href", ACCESS_LOGOUT_PATH);
    expect(signOut).toHaveAttribute("href", "/cdn-cgi/access/logout");

    const settings = screen.getByRole("link", { name: /settings/i });
    expect(settings).toHaveAttribute("href", "/settings");
  });

  it("closes the user menu on Escape", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: /^account —/i });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});

/**
 * UX-01 — the keyboard reference is available from every surface.
 *
 * Before UX-01 `?` opened the reference only on Today, while the reference's own
 * first group told the owner it worked "Anywhere". The shell now provides it as a
 * lowest-precedence FALLBACK binding, so it covers every other surface without
 * taking the key away from a surface that hosts its own (Today's drawer stack).
 */
describe("UX-01 AppShell — app-wide keyboard reference", () => {
  it("opens the shared shortcuts reference on ? from an ordinary surface", async () => {
    renderShell();
    expect(
      screen.queryByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeNull();

    fireEvent.keyDown(document, { key: "?", shiftKey: true });

    const dialog = await screen.findByRole("dialog", {
      name: "Keyboard shortcuts",
    });
    // The ONE shared catalogue, not a shell-local copy.
    expect(
      within(dialog).getByText(/fully operable from the keyboard/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Open the Command Palette")).toBeVisible();
  });

  it("closes the reference on Escape", async () => {
    renderShell();
    fireEvent.keyDown(document, { key: "?", shiftKey: true });
    await screen.findByRole("dialog", { name: "Keyboard shortcuts" });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeNull();
  });

  it("does not fire while the owner is typing in a field", () => {
    renderShell();
    // `?` is an ordinary character shortcut, so the shared dispatcher must
    // suppress it while a text field has focus — otherwise typing a question mark
    // into a note or a task title would open a modal.
    const field = document.createElement("input");
    document.body.appendChild(field);
    fireEvent.keyDown(field, { key: "?", shiftKey: true });
    expect(
      screen.queryByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeNull();
    field.remove();
  });
});
