import { fireEvent, render, screen } from "@testing-library/react";
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
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("PX-02 UserMenu — disclosure semantics", () => {
  it("is a disclosure, not a menu (no aria-haspopup='menu')", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: /owner/i });
    expect(trigger).not.toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    // The panel is a labelled group, not a menu.
    expect(screen.getByRole("group", { name: "Account" })).toBeInTheDocument();
  });

  it("does not render a Settings action until a destination is supplied", () => {
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

  it("renders Settings pointing at the supplied route when provided (SET-01)", () => {
    renderMenu({ settingsHref: "/settings" });
    fireEvent.click(screen.getByRole("button", { name: /owner/i }));
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute(
      "href",
      "/settings",
    );
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
