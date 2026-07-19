import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import {
  UserMenu,
  displayNameFromEmail,
  initialsFromName,
} from "~/shared/shell/UserMenu";

function renderMenu(props: Partial<Parameters<typeof UserMenu>[0]> = {}) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <UserMenu email="owner@example.com" theme="system" {...props} />
      ),
    },
    { path: "/settings", Component: () => <div>Settings page</div> },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("PX-02 UserMenu — disclosure semantics (FIX 2)", () => {
  it("is a disclosure, not a menu (no aria-haspopup='menu')", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: /owner/i });
    expect(trigger).not.toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).not.toHaveAttribute("aria-haspopup");
  });

  it("exposes correct expanded/collapsed state on the trigger", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: /owner/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("controls the disclosure panel (aria-controls) while open, and labels it as an Account group", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: /owner/i });
    // Closed: nothing is controlled.
    expect(trigger).not.toHaveAttribute("aria-controls");

    fireEvent.click(trigger);
    const panel = screen.getByRole("group", { name: "Account" });
    expect(panel.id).toBeTruthy();
    expect(trigger).toHaveAttribute("aria-controls", panel.id);
  });

  it("closes on Escape and restores focus to the trigger", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: /owner/i });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes on an outside click", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: /owner/i });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps every panel control keyboard reachable (native, non -1 tabindex)", () => {
    renderMenu({ settingsHref: "/settings" });
    fireEvent.click(screen.getByRole("button", { name: /owner/i }));
    const panel = screen.getByRole("group", { name: "Account" });

    const controls = [
      ...within(panel).getAllByRole("button"),
      ...within(panel).getAllByRole("link"),
    ];
    // Theme (System/Light/Dark) + Settings + Sign out are all reachable.
    expect(controls.length).toBeGreaterThanOrEqual(5);
    for (const control of controls) {
      expect(control).not.toHaveAttribute("tabindex", "-1");
      control.focus();
      expect(control).toHaveFocus();
    }
  });
});

describe("PX-02 UserMenu — Settings destination (FIX 1)", () => {
  it("does not render a Settings action by default", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /owner/i }));
    expect(
      screen.queryByRole("link", { name: /settings/i }),
    ).not.toBeInTheDocument();
    // Sign out is always available.
    expect(screen.getByRole("link", { name: /sign out/i })).toHaveAttribute(
      "href",
      "/cdn-cgi/access/logout",
    );
  });

  it("renders Settings pointing at the supplied route when explicitly provided", () => {
    renderMenu({ settingsHref: "/settings" });
    fireEvent.click(screen.getByRole("button", { name: /owner/i }));
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("closes the disclosure when an explicitly supplied Settings destination is selected", () => {
    renderMenu({ settingsHref: "/settings" });
    const trigger = screen.getByRole("button", { name: /owner/i });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("link", { name: /settings/i }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("group", { name: "Account" }),
    ).not.toBeInTheDocument();
  });
});

describe("PX-02 UserMenu — identity helpers", () => {
  it("derives a friendly display name and initials from an email", () => {
    expect(displayNameFromEmail("aidan.daly@example.com")).toBe("Aidan Daly");
    expect(displayNameFromEmail("owner@example.com")).toBe("Owner");
    expect(initialsFromName("Aidan Daly")).toBe("AD");
    expect(initialsFromName("Owner")).toBe("OW");
  });
});
