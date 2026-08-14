/**
 * DS-03 — the desktop top bar, after search moved to the leading edge and the
 * account moved to the rail.
 *
 * These assert the CONTRACT rather than the layout: which controls the bar owns,
 * that each of them still opens what it always opened, and that the two things
 * the move could have broken — the single search landmark and the accessible
 * name on every icon-only control — did not.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CaptureProvider } from "~/shared/capture";
import { DesktopTopBar } from "~/shared/shell/DesktopTopBar";

function renderBar(
  props: Partial<React.ComponentProps<typeof DesktopTopBar>> = {},
) {
  return render(
    <CaptureProvider>
      <DesktopTopBar {...props} />
    </CaptureProvider>,
  );
}

describe("DS-03 DesktopTopBar", () => {
  it("is the desktop banner and owns exactly one search landmark", () => {
    renderBar();
    const banner = screen.getByRole("banner");
    const search = within(banner).getByRole("search", {
      name: "Search DalyHub",
    });
    expect(search).toBeInTheDocument();
    expect(screen.getAllByRole("search")).toHaveLength(1);
  });

  it("puts search FIRST in the bar's reading order", () => {
    /*
     * The DS-03 move, asserted as DOM order rather than as CSS.
     *
     * It matters beyond appearance: the bar is the first landmark on the page,
     * and a keyboard user tabbing into it should reach the control they use most
     * before the three they use least. Before this the tab order was
     * palette → help → account → search.
     */
    renderBar();
    const controls = within(screen.getByRole("banner")).getAllByRole(
      /* both buttons and the Help link */ "button",
    );
    expect(controls[0]).toHaveAccessibleName("Search DalyHub");
  });

  it("opens Search from the field, handing it the opener for focus return", () => {
    const onOpenSearch = vi.fn();
    renderBar({ onOpenSearch });
    const field = screen.getByRole("button", { name: "Search DalyHub" });
    fireEvent.click(field);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
    expect(onOpenSearch.mock.calls[0][0]).toBe(field);
  });

  it("opens the Command Palette from the utility cluster", () => {
    const onOpenCommand = vi.fn();
    renderBar({ onOpenCommand });
    const trigger = screen.getByRole("button", { name: "Command palette" });
    fireEvent.click(trigger);
    expect(onOpenCommand).toHaveBeenCalledTimes(1);
    expect(onOpenCommand.mock.calls[0][0]).toBe(trigger);
  });

  it("keeps Help a real link, not a button that navigates", () => {
    // Middle-click, "open in new tab" and the status-bar preview are all
    // behaviours a button would remove from a genuine destination.
    renderBar();
    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute(
      "href",
      "/help",
    );
  });

  it("no longer carries the account menu", () => {
    // It moved to the bottom of the rail (`Sidebar`), which is where both
    // concept references put it. Asserted here so a well-meaning restoration has
    // to reckon with the identity-versus-action reasoning first.
    renderBar();
    expect(
      screen.queryByRole("button", { name: /^account —/i }),
    ).not.toBeInTheDocument();
  });

  it("gives every icon-only control an accessible name", () => {
    // AGENTS.md §15. The utilities are `IconButton`, whose `label` is required
    // by the type — this proves the bar actually passes one, and covers the
    // Help anchor, which is not an `IconButton`.
    const { container } = renderBar();
    for (const control of container.querySelectorAll("button, a")) {
      expect(
        control.textContent?.trim() || control.getAttribute("aria-label") || "",
        `${control.outerHTML.slice(0, 80)} has no accessible name`,
      ).not.toBe("");
    }
  });
});
