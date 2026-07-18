/**
 * DS-02 — RecordTabs keyboard, selection and accessibility contract.
 *
 * Proves the WAI-ARIA Tabs pattern: roles, roving tabindex, arrow/Home/End
 * navigation that skips disabled tabs, click selection, hidden/disabled handling,
 * and the accessible active-state signalling that does not depend on colour
 * (aria-selected + a non-colour data hook).
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RecordTabs } from "~/shared/record-layout";
import type { RecordTab } from "~/shared/record-layout";

const TABS: RecordTab[] = [
  { id: "overview", label: "Overview", content: <p>Overview panel</p> },
  { id: "tasks", label: "Tasks", content: <p>Tasks panel</p> },
  {
    id: "settings",
    label: "Settings",
    disabled: true,
    content: <p>Settings panel</p>,
  },
  { id: "hidden", label: "Hidden", hidden: true, content: <p>Hidden panel</p> },
];

function getTab(name: string) {
  return screen.getByRole("tab", { name: new RegExp(name) });
}

describe("RecordTabs — structure", () => {
  it("exposes a labelled tablist and a tab per visible tab", () => {
    render(<RecordTabs tabs={TABS} label="Record sections" />);
    const tablist = screen.getByRole("tablist", { name: "Record sections" });
    // Hidden tab is omitted; disabled tab is present.
    expect(within(tablist).getAllByRole("tab")).toHaveLength(3);
    expect(screen.queryByRole("tab", { name: /Hidden/ })).toBeNull();
  });

  it("selects the first tab by default and links panel to tab", () => {
    render(<RecordTabs tabs={TABS} />);
    const overview = getTab("Overview");
    expect(overview).toHaveAttribute("aria-selected", "true");
    expect(overview).toHaveAttribute("tabindex", "0");
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute(
      "aria-labelledby",
      overview.getAttribute("id"),
    );
    expect(panel).toHaveTextContent("Overview panel");
  });

  it("communicates the active tab without relying on colour", () => {
    render(<RecordTabs tabs={TABS} />);
    // aria-selected + a non-colour data hook the stylesheet keys the underline
    // and weight off — not colour alone.
    expect(getTab("Overview")).toHaveAttribute("data-active", "true");
    expect(getTab("Tasks")).toHaveAttribute("data-active", "false");
    expect(getTab("Tasks")).toHaveAttribute("tabindex", "-1");
  });
});

describe("RecordTabs — selection", () => {
  it("selects a tab on click and switches the panel", () => {
    const onTabChange = vi.fn();
    render(<RecordTabs tabs={TABS} onTabChange={onTabChange} />);
    fireEvent.click(getTab("Tasks"));
    expect(onTabChange).toHaveBeenCalledWith("tasks");
    expect(getTab("Tasks")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Tasks panel");
  });

  it("does not select a disabled tab on click", () => {
    const onTabChange = vi.fn();
    render(<RecordTabs tabs={TABS} onTabChange={onTabChange} />);
    fireEvent.click(getTab("Settings"));
    expect(onTabChange).not.toHaveBeenCalled();
    expect(getTab("Overview")).toHaveAttribute("aria-selected", "true");
  });

  it("respects a controlled activeTabId", () => {
    render(<RecordTabs tabs={TABS} activeTabId="tasks" />);
    expect(getTab("Tasks")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Tasks panel");
  });
});

describe("RecordTabs — keyboard navigation", () => {
  it("moves with ArrowRight/ArrowLeft and wraps", () => {
    render(<RecordTabs tabs={TABS} />);
    const overview = getTab("Overview");
    overview.focus();

    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(getTab("Tasks")).toHaveAttribute("aria-selected", "true");
    expect(getTab("Tasks")).toHaveFocus();

    // ArrowRight again skips the disabled Settings tab and wraps to Overview.
    fireEvent.keyDown(getTab("Tasks"), { key: "ArrowRight" });
    expect(getTab("Overview")).toHaveAttribute("aria-selected", "true");
    expect(getTab("Overview")).toHaveFocus();

    fireEvent.keyDown(getTab("Overview"), { key: "ArrowLeft" });
    expect(getTab("Tasks")).toHaveAttribute("aria-selected", "true");
  });

  it("jumps to first/last selectable tab with Home/End", () => {
    render(
      <RecordTabs tabs={TABS} activeTabId="tasks" onTabChange={() => {}} />,
    );
    const tasks = getTab("Tasks");
    tasks.focus();
    // End goes to the last SELECTABLE tab (Settings is disabled, so Tasks).
    fireEvent.keyDown(tasks, { key: "End" });
    expect(getTab("Tasks")).toHaveFocus();
    // Home goes to the first tab.
    fireEvent.keyDown(getTab("Tasks"), { key: "Home" });
    expect(getTab("Overview")).toHaveFocus();
  });

  it("ignores navigation when there are no selectable tabs beyond the current", () => {
    const single: RecordTab[] = [
      { id: "only", label: "Only", content: <p>Only</p> },
    ];
    render(<RecordTabs tabs={single} />);
    const only = getTab("Only");
    only.focus();
    fireEvent.keyDown(only, { key: "ArrowRight" });
    expect(getTab("Only")).toHaveFocus();
    expect(getTab("Only")).toHaveAttribute("aria-selected", "true");
  });
});
