/**
 * TODAY-08 — the Today landing personalisation model (pure).
 *
 * Exercises the widget catalogue and the pure state transitions: reorder, hide,
 * pin, collapse, normalisation of stale snapshots, pinned-lead resolution, and the
 * serialise/parse round trip. No React, no storage, no DOM.
 */

import { describe, expect, it } from "vitest";

import {
  defaultTodayLayout,
  moveWidget,
  normaliseTodayLayout,
  parseTodayLayout,
  resolveHiddenWidgets,
  resolveVisibleWidgets,
  serialiseTodayLayout,
  toggleCollapsed,
  toggleHidden,
  togglePinned,
  TODAY_WIDGET_IDS,
  TODAY_WIDGETS,
} from "~/modules/today/landing/layout";

describe("TODAY-08 landing layout model", () => {
  it("the default layout lists every widget once, all visible", () => {
    const layout = defaultTodayLayout();
    expect(layout.order).toEqual(TODAY_WIDGETS.map((w) => w.id));
    expect(layout.order.length).toBe(TODAY_WIDGET_IDS.length);
    expect(layout.hidden).toEqual([]);
    expect(layout.pinned).toEqual([]);
    expect(layout.collapsed).toEqual([]);
  });

  it("resolves visible widgets with pinned ones leading, in relative order", () => {
    let layout = defaultTodayLayout();
    layout = togglePinned(layout, "insights");
    layout = togglePinned(layout, "notes");
    const visible = resolveVisibleWidgets(layout);
    // Notes precedes Insights in canonical order, so pinned-lead preserves that.
    expect(visible[0]!.definition.id).toBe("notes");
    expect(visible[1]!.definition.id).toBe("insights");
    expect(visible[0]!.pinned).toBe(true);
    expect(visible[0]!.isFirst).toBe(true);
    expect(visible.at(-1)!.isLast).toBe(true);
  });

  it("hiding a widget removes it from the visible set and lists it as hidden", () => {
    const layout = toggleHidden(defaultTodayLayout(), "focus");
    expect(
      resolveVisibleWidgets(layout).some((w) => w.definition.id === "focus"),
    ).toBe(false);
    expect(resolveHiddenWidgets(layout).map((w) => w.id)).toEqual(["focus"]);
  });

  it("hiding a pinned widget also unpins it", () => {
    let layout = togglePinned(defaultTodayLayout(), "diary");
    layout = toggleHidden(layout, "diary");
    expect(layout.pinned).not.toContain("diary");
    expect(layout.hidden).toContain("diary");
  });

  it("pinning a hidden widget shows it again", () => {
    let layout = toggleHidden(defaultTodayLayout(), "goals");
    layout = togglePinned(layout, "goals");
    expect(layout.hidden).not.toContain("goals");
    expect(layout.pinned).toContain("goals");
  });

  it("collapse is independent of visibility and pinning", () => {
    const layout = toggleCollapsed(defaultTodayLayout(), "areas");
    expect(layout.collapsed).toContain("areas");
    expect(
      resolveVisibleWidgets(layout).find((w) => w.definition.id === "areas")!
        .collapsed,
    ).toBe(true);
  });

  it("moves a widget up and down within the order, clamped at the ends", () => {
    const layout = defaultTodayLayout();
    const first = layout.order[0]!;
    // Moving the first widget up is a no-op (clamped).
    expect(moveWidget(layout, first, "up").order).toEqual(layout.order);
    const moved = moveWidget(layout, first, "down");
    expect(moved.order[0]).not.toBe(first);
    expect(moved.order[1]).toBe(first);
  });

  it("normalises a stale snapshot: drops unknown ids and appends new widgets", () => {
    const normalised = normaliseTodayLayout({
      order: ["notes", "notes", "ghost-widget", "insights"] as never,
      hidden: ["ghost-widget"] as never,
      collapsed: [],
      pinned: [],
    });
    // Unknown "ghost-widget" dropped; "notes" de-duplicated; every real widget present.
    expect(normalised.order).toContain("notes");
    expect(normalised.order).not.toContain("ghost-widget");
    expect(new Set(normalised.order).size).toBe(normalised.order.length);
    expect(normalised.order.length).toBe(TODAY_WIDGET_IDS.length);
    expect(normalised.hidden).toEqual([]);
  });

  it("survives a serialise → parse round trip", () => {
    let layout = defaultTodayLayout();
    layout = togglePinned(layout, "morning-brief");
    layout = toggleHidden(layout, "focus");
    layout = moveWidget(layout, "insights", "up");
    expect(parseTodayLayout(serialiseTodayLayout(layout))).toEqual(layout);
  });

  it("parses malformed/absent snapshots to the default (never throws)", () => {
    expect(parseTodayLayout(null)).toEqual(defaultTodayLayout());
    expect(parseTodayLayout("not json")).toEqual(defaultTodayLayout());
    expect(parseTodayLayout(JSON.stringify({ version: 999 }))).toEqual(
      defaultTodayLayout(),
    );
  });
});
