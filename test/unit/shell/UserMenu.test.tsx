/**
 * DS-03 — the account menu, after it moved to the bottom of the rail.
 *
 * Two of these are regressions from the PR #176 review, and both are about the
 * COLLAPSED rail — the width band where CSS hides the trigger's name and leaves
 * two initials. That state is invisible to a component test unless the test
 * drives `matchMedia`, which is exactly why it shipped wrong.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";
import { COLLAPSED_RAIL_QUERY } from "~/shared/shell/collapsed-rail";
import { UserMenu } from "~/shared/shell/UserMenu";

/** Drive `matchMedia` so the component believes the rail is (or is not) collapsed. */
function withViewport(collapsed: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) =>
    ({
      matches: collapsed && query === COLLAPSED_RAIL_QUERY,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

function renderMenu(collapsible = true) {
  const Stub = createRoutesStub([
    {
      path: "*",
      // The panel's appearance control is a form that reports through the shared
      // feedback surface, which the real shell mounts around the whole frame.
      Component: () => (
        <FeedbackProvider>
          <UserMenu
            email="owner@example.invalid"
            appearance="system"
            settingsHref="/settings"
            collapsible={collapsible}
          />
        </FeedbackProvider>
      ),
    },
  ]);
  return render(<Stub initialEntries={["/today"]} />);
}

/** Hover the trigger and let the tooltip's intent delay elapse. */
function hover(element: HTMLElement) {
  fireEvent.pointerEnter(element, { pointerType: "mouse" });
  act(() => {
    vi.advanceTimersByTime(500);
  });
}

const trigger = () => screen.getByRole("button", { name: /^account —/i });

describe("DS-03 UserMenu on the rail", () => {
  it("names the trigger by what it is as well as by who", () => {
    // Its visible text is the display name and nothing else, so "Owner, button"
    // says who but not what, in a landmark otherwise full of destinations. The
    // name still CONTAINS the visible text (WCAG 2.5.3), so a voice-control user
    // can say what they can see.
    renderMenu();
    expect(trigger()).toHaveAccessibleName("Account — Owner");
    expect(trigger().textContent).toContain("Owner");
  });

  it("describes the trigger with the shared tooltip when the rail is collapsed", () => {
    /*
     * PR #176 review, P2. The same CSS that hides the fourteen destinations'
     * labels hides this one, leaving two initials — so a sighted pointer or
     * keyboard user got no explanation that they open the account menu, while
     * the destinations beside it all had one.
     */
    vi.useFakeTimers();
    const restore = withViewport(true);
    try {
      renderMenu();
      hover(trigger());
      expect(screen.getByRole("tooltip")).toHaveTextContent("Account — Owner");
      expect(trigger()).toHaveAttribute("aria-describedby");
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it("adds no tooltip while the name is visible", () => {
    // A tooltip repeating text the user can already read is noise, and the
    // expanded rail is the common case.
    vi.useFakeTimers();
    const restore = withViewport(false);
    try {
      renderMenu();
      hover(trigger());
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it("adds no tooltip in the phone's navigation sheet", () => {
    // The sheet is full-width at every viewport it exists at, so it opts out and
    // never installs the media listener.
    vi.useFakeTimers();
    const restore = withViewport(true);
    try {
      renderMenu(false);
      hover(trigger());
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it("suppresses the tooltip once the panel is open", () => {
    // The panel says far more than the trigger could; a tooltip over it would be
    // noise on top of an answer.
    vi.useFakeTimers();
    const restore = withViewport(true);
    try {
      renderMenu();
      fireEvent.click(trigger());
      expect(trigger()).toHaveAttribute("aria-expanded", "true");
      hover(trigger());
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it("keeps the whole panel reachable — appearance, Settings and Sign out", () => {
    /*
     * The CONTENT half of PR #176's P1. The clipping itself is a CSS property
     * (asserted in `shell-anatomy.test.ts`, which is where the cause lives), but
     * what the defect actually cost was these three controls: at 900px the panel
     * was cut to the rail's 68px and Settings and Sign out were single letters.
     */
    renderMenu();
    fireEvent.click(trigger());
    expect(screen.getByRole("group", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.getByRole("link", { name: /sign out/i })).toBeInTheDocument();
    for (const appearance of ["System", "Light", "Dark"]) {
      expect(
        screen.getByRole("radio", { name: appearance }),
      ).toBeInTheDocument();
    }
  });
});
