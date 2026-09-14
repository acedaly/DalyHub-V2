import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";

import { SettingsNav } from "~/shared/settings";

/**
 * UNTITLED-18 — the Settings rail's CURRENT state, which is two questions.
 *
 * The rail draws its selected tint per width, because at a bare `/settings` a
 * desktop shows the default section beside the rail while a phone shows the
 * rail INSTEAD of a section. `aria-current` cannot be drawn per width — it is
 * one attribute in one document — so the two can disagree, and did: review on
 * PR #295 found the default row claiming `aria-current="page"` on a screen the
 * owner had not navigated to, announced to precisely the people who cannot see
 * that a list rather than a section is in front of them.
 *
 * These tests pin the rule that resolves it: the SEMANTIC current state
 * follows `sectionChosen`, so the rail is unmarked until the URL names a
 * section. An absent current marker is an omission; a wrong one is a lie about
 * where you are.
 */

const GROUPS = [
  {
    id: "your-data",
    label: "Your data",
    items: [
      {
        id: "account-security",
        label: "Account & security",
        summary: "Sessions, sign-in and recovery.",
        href: "/settings?section=account-security",
        current: true,
      },
      {
        id: "backups",
        label: "Backups",
        summary: "Export and restore.",
        href: "/settings?section=backups",
        current: false,
      },
    ],
  },
];

function renderRail(node: ReactElement) {
  const router = createMemoryRouter([{ path: "/", element: node }], {
    initialEntries: ["/"],
  });
  return render(<RouterProvider router={router} />);
}

describe("UNTITLED-18 SettingsNav", () => {
  it("marks the current section when the URL names one", () => {
    renderRail(
      <SettingsNav groups={GROUPS} aria-label="Settings" sectionChosen />,
    );

    expect(
      screen.getByRole("link", { name: "Account & security" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Backups" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks NOTHING current while the list itself is the screen", () => {
    renderRail(
      <SettingsNav
        groups={GROUPS}
        aria-label="Settings"
        sectionChosen={false}
      />,
    );

    /*
     * The default row is still the one a desktop would render beside — that is
     * what `current: true` means — but no section has been chosen, so no link
     * may claim to be the page the owner is on.
     */
    expect(
      screen.getByRole("link", { name: "Account & security" }),
    ).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Backups" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("names each row by its label alone, and describes it by its summary", () => {
    renderRail(
      <SettingsNav groups={GROUPS} aria-label="Settings" sectionChosen />,
    );

    /*
     * The accessible NAME is the label, never label + summary: a rail read as
     * "Account & security Sessions, sign-in and recovery, link" is a sentence,
     * not a destination.
     */
    const link = screen.getByRole("link", { name: "Account & security" });
    const describedBy = link.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "Sessions, sign-in and recovery.",
    );
  });
});
