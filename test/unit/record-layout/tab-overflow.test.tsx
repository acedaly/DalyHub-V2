/**
 * MOBILE-01 — Record Layout tab overflow.
 *
 * A record with more than four sections must stay usable on a phone without
 * turning the strip into a swipe-hunt. The answer is an ADDITIVE one: the strip
 * keeps every tab and scrolls, and a labelled "More sections" menu offers the ones
 * that are off-screen directly.
 *
 * The tests below pin the property that matters most and is easiest to lose:
 * **the set of tabs is identical at every viewport.** A record whose Settings tab
 * exists at 1440px but not at 375px would give the same product two different
 * keyboard models, two different arrow-key orders and two different sets of
 * addressable controls.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecordTabs } from "~/shared/record-layout/RecordTabs";
import {
  MAX_INLINE_TABS,
  tabsForOverflowMenu,
} from "~/shared/record-layout/RecordTabs";
import type { RecordTab } from "~/shared/record-layout/types";

function tabs(...labels: readonly string[]): RecordTab[] {
  return labels.map((label) => ({
    id: label.toLowerCase(),
    label,
    content: <p>{label} panel</p>,
  }));
}

/**
 * Drive the shared compact-viewport signal. The menu is PHONE behaviour: on a wide
 * viewport there is no menu at all, so the rendering tests state which viewport
 * they are exercising rather than relying on a default.
 */
function setCompactViewport(compact: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: compact,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => setCompactViewport(true));
afterEach(() => vi.unstubAllGlobals());

const SEVEN = tabs(
  "Summary",
  "Tasks",
  "Knowledge",
  "Links",
  "Timeline",
  "Activity",
  "Settings",
);

describe("tabsForOverflowMenu", () => {
  it("offers nothing for a short record", () => {
    const short = tabs("Summary", "Tasks", "Activity");
    expect(tabsForOverflowMenu(short, "summary")).toHaveLength(0);
  });

  it("offers nothing at the boundary", () => {
    const four = tabs("A", "B", "C", "D");
    expect(four).toHaveLength(MAX_INLINE_TABS);
    expect(tabsForOverflowMenu(four, "a")).toHaveLength(0);
  });

  it("offers the tabs past the boundary — the ones that need scrolling to", () => {
    expect(
      tabsForOverflowMenu(SEVEN, "summary").map((tab) => tab.label),
    ).toEqual(["Timeline", "Activity", "Settings"]);
  });

  it("never offers the active tab, which is not somewhere to go", () => {
    expect(
      tabsForOverflowMenu(SEVEN, "settings").map((tab) => tab.label),
    ).toEqual(["Timeline", "Activity"]);
  });
});

describe("RecordTabs overflow rendering", () => {
  it("renders every tab at a wide viewport, with no menu — desktop is unchanged", () => {
    setCompactViewport(false);
    render(<RecordTabs tabs={SEVEN} label="Sections" />);
    expect(screen.getAllByRole("tab")).toHaveLength(SEVEN.length);
    expect(screen.queryByTestId("record-tabs-more")).not.toBeInTheDocument();
  });

  it("renders EVERY tab at a compact viewport too — the menu adds, never removes", () => {
    render(<RecordTabs tabs={SEVEN} label="Sections" />);
    expect(screen.getAllByRole("tab")).toHaveLength(SEVEN.length);
    // The two a phone is most likely to need and most at risk of being dropped.
    expect(screen.getByRole("tab", { name: "Settings" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Activity" })).toBeVisible();
  });

  it("renders no menu for a short record", () => {
    render(<RecordTabs tabs={tabs("Summary", "Tasks")} label="Sections" />);
    expect(screen.queryByTestId("record-tabs-more")).not.toBeInTheDocument();
  });

  it("offers the off-screen sections through a labelled menu", () => {
    render(<RecordTabs tabs={SEVEN} label="Project sections" />);
    const trigger = within(screen.getByTestId("record-tabs-more")).getByRole(
      "button",
    );
    expect(trigger).toHaveAccessibleName(/more sections in project sections/i);

    fireEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Activity" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  });

  it("keeps the tablist free of non-tab children", () => {
    render(<RecordTabs tabs={SEVEN} label="Sections" />);
    const tablist = screen.getByRole("tablist");
    for (const child of Array.from(tablist.children)) {
      expect(child.getAttribute("role")).toBe("tab");
    }
  });

  it("selecting from the menu activates the tab and scrolls it into view", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<RecordTabs tabs={SEVEN} label="Sections" />);

    const trigger = within(screen.getByTestId("record-tabs-more")).getByRole(
      "button",
    );
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));

    const settings = screen.getByRole("tab", { name: "Settings" });
    expect(settings).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Settings panel")).toBeVisible();
    // Brought into view rather than focused: the shared DS-12 menu returns focus
    // to its own trigger, and this component does not race it for focus.
    expect(scrollIntoView).toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    vi.unstubAllGlobals();
  });

  it("keeps one arrow-key order at every viewport", () => {
    render(<RecordTabs tabs={SEVEN} label="Sections" />);
    const first = screen.getByRole("tab", { name: "Summary" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    // Wrapping backwards lands on the last tab of the record — the same tab it
    // would land on at 1440px, because the strip is the same strip.
    expect(screen.getByRole("tab", { name: "Settings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
