/**
 * MOBILE-01 — Record Layout tab overflow.
 *
 * A record with more than four sections must stay usable on a phone WITHOUT
 * hiding anything: the important tabs stay inline, the rest move into a labelled
 * "More sections" menu, and the ACTIVE tab is always visible so the user can see
 * where they are.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RecordTabs } from "~/shared/record-layout/RecordTabs";
import {
  MAX_INLINE_TABS,
  splitTabsForOverflow,
} from "~/shared/record-layout/RecordTabs";
import type { RecordTab } from "~/shared/record-layout/types";

function tabs(...labels: readonly string[]): RecordTab[] {
  return labels.map((label) => ({
    id: label.toLowerCase(),
    label,
    content: <p>{label} panel</p>,
  }));
}

const SEVEN = tabs(
  "Summary",
  "Tasks",
  "Knowledge",
  "Links",
  "Timeline",
  "Activity",
  "Settings",
);

describe("splitTabsForOverflow", () => {
  it("leaves a short record entirely inline", () => {
    const short = tabs("Summary", "Tasks", "Activity");
    const split = splitTabsForOverflow(short, "summary");
    expect(split.inline).toHaveLength(3);
    expect(split.overflow).toHaveLength(0);
  });

  it("keeps exactly MAX_INLINE_TABS inline at the boundary", () => {
    const four = tabs("A", "B", "C", "D");
    expect(four).toHaveLength(MAX_INLINE_TABS);
    expect(splitTabsForOverflow(four, "a").overflow).toHaveLength(0);
  });

  it("moves the surplus into the overflow beyond the boundary", () => {
    const split = splitTabsForOverflow(SEVEN, "summary");
    expect(split.inline.map((tab) => tab.label)).toEqual([
      "Summary",
      "Tasks",
      "Knowledge",
      "Links",
    ]);
    expect(split.overflow.map((tab) => tab.label)).toEqual([
      "Timeline",
      "Activity",
      "Settings",
    ]);
  });

  it("swaps an active overflow tab into the inline strip", () => {
    const split = splitTabsForOverflow(SEVEN, "settings");
    expect(split.inline.map((tab) => tab.label)).toEqual([
      "Summary",
      "Tasks",
      "Knowledge",
      "Settings",
    ]);
    // Nothing is lost by the swap — the displaced tab moves to the overflow.
    expect(split.overflow.map((tab) => tab.label)).toEqual([
      "Links",
      "Timeline",
      "Activity",
    ]);
  });

  it("never loses or duplicates a tab", () => {
    for (const active of SEVEN.map((tab) => tab.id)) {
      const split = splitTabsForOverflow(SEVEN, active);
      const ids = [...split.inline, ...split.overflow].map((tab) => tab.id);
      expect(new Set(ids).size).toBe(SEVEN.length);
    }
  });
});

describe("RecordTabs overflow rendering", () => {
  it("renders no overflow trigger for a short record", () => {
    render(<RecordTabs tabs={tabs("Summary", "Tasks")} label="Sections" />);
    expect(screen.queryByTestId("record-tabs-more")).not.toBeInTheDocument();
  });

  it("exposes overflow tabs through a labelled menu, not by hiding them", () => {
    render(<RecordTabs tabs={SEVEN} label="Project sections" />);
    const trigger = within(screen.getByTestId("record-tabs-more")).getByRole(
      "button",
    );
    expect(trigger).toHaveAccessibleName(/more sections in project sections/i);

    fireEvent.click(trigger);
    // Activity and Settings are reachable in one tap — never permanently hidden.
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

  it("selecting from the menu activates the tab and shows it inline", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    render(<RecordTabs tabs={SEVEN} label="Sections" />);

    fireEvent.click(
      within(screen.getByTestId("record-tabs-more")).getByRole("button"),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));

    const settings = screen.getByRole("tab", { name: "Settings" });
    expect(settings).toHaveAttribute("aria-selected", "true");
    // It is now part of the inline strip, so the user can see where they are.
    expect(
      within(screen.getByRole("tablist")).getByRole("tab", {
        name: "Settings",
      }),
    ).toBe(settings);
    expect(screen.getByText("Settings panel")).toBeVisible();
    vi.unstubAllGlobals();
  });

  it("arrow keys move within the inline strip without reaching a hidden tab", () => {
    render(<RecordTabs tabs={SEVEN} label="Sections" />);
    const first = screen.getByRole("tab", { name: "Summary" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    // Wrapping backwards lands on the LAST inline tab, never on an overflow tab
    // the user cannot see.
    expect(screen.getByRole("tab", { name: "Links" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
