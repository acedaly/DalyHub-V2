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
  groupVisibleWidgets,
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
    layout = togglePinned(layout, "notes");
    layout = togglePinned(layout, "insights");
    const visible = resolveVisibleWidgets(layout);
    // Insights precedes Notes in canonical order, so pinned-lead preserves that.
    expect(visible[0]!.definition.id).toBe("insights");
    expect(visible[1]!.definition.id).toBe("notes");
    expect(visible[0]!.pinned).toBe(true);
    expect(visible[0]!.isFirst).toBe(true);
    expect(visible.at(-1)!.isLast).toBe(true);
  });

  it("hiding a widget removes it from the visible set and lists it as hidden", () => {
    const layout = toggleHidden(defaultTodayLayout(), "meetings");
    expect(
      resolveVisibleWidgets(layout).some((w) => w.definition.id === "meetings"),
    ).toBe(false);
    expect(resolveHiddenWidgets(layout).map((w) => w.id)).toEqual(["meetings"]);
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

  it("moves a widget up and down within its column, clamped at the ends", () => {
    const layout = defaultTodayLayout();
    const primary = groupVisibleWidgets(layout).primary.map(
      (w) => w.definition.id,
    );
    const first = primary[0]!;
    // Moving the column's first widget up is a no-op (clamped).
    expect(moveWidget(layout, first, "up").order).toEqual(layout.order);
    const moved = groupVisibleWidgets(
      moveWidget(layout, first, "down"),
    ).primary;
    expect(moved[0]!.definition.id).toBe(primary[1]);
    expect(moved[1]!.definition.id).toBe(first);
  });

  it("move controls and moves operate on the RENDERED sequence, not raw order", () => {
    // Pin a secondary widget that is NOT first in its column: it floats to the top
    // of that column. The first UNPINNED widget in the same column must then report
    // isFirst (its "Move up" is a boundary no-op — it cannot cross the pin
    // boundary), even though it leads the column in raw order.
    const layout = togglePinned(defaultTodayLayout(), "goals");
    const secondary = groupVisibleWidgets(layout).secondary;
    expect(secondary[0]!.definition.id).toBe("goals");
    expect(secondary[0]!.isFirst).toBe(true); // first (only) pinned widget
    const firstUnpinned = secondary[1]!;
    expect(firstUnpinned.pinned).toBe(false);
    expect(firstUnpinned.isFirst).toBe(true); // first in the unpinned group

    // Moving the first unpinned widget "up" is a clamped no-op (can't pass the pin).
    expect(moveWidget(layout, firstUnpinned.definition.id, "up")).toEqual(
      layout,
    );

    // Moving it "down" swaps it with the NEXT unpinned widget — a real change.
    const moved = moveWidget(layout, firstUnpinned.definition.id, "down");
    const movedSecondary = groupVisibleWidgets(moved).secondary;
    expect(movedSecondary[1]!.definition.id).not.toBe(
      firstUnpinned.definition.id,
    );
    expect(movedSecondary[2]!.definition.id).toBe(firstUnpinned.definition.id);
  });

  it("moving skips hidden widgets (swaps the adjacent VISIBLE neighbour)", () => {
    let layout = defaultTodayLayout();
    // Primary column order: my-day, [meetings hidden], projects, recent-activity.
    layout = toggleHidden(layout, "meetings");
    // Moving my-day down swaps it past the hidden meetings with projects.
    const moved = moveWidget(layout, "my-day", "down");
    const primary = groupVisibleWidgets(moved).primary.map(
      (w) => w.definition.id,
    );
    expect(primary[0]).toBe("projects");
    expect(primary[1]).toBe("my-day");
  });

  it("a move never crosses a column boundary", () => {
    const layout = defaultTodayLayout();
    const primary = groupVisibleWidgets(layout).primary;
    const last = primary.at(-1)!;
    // The last primary widget is followed in RAW order by the first secondary one.
    // Moving it down must be a clamped no-op rather than a jump between columns.
    expect(last.isLast).toBe(true);
    expect(moveWidget(layout, last.definition.id, "down")).toEqual(layout);
  });

  it("groups the visible widgets into the three rendered regions", () => {
    const regions = groupVisibleWidgets(defaultTodayLayout());
    // M3-01 put the day's task summary beside the brief: the hero answers "how
    // is today shaped?" in words and in one figure (ADR-074).
    expect(regions.hero.map((w) => w.definition.id)).toEqual([
      "morning-brief",
      "task-summary",
    ]);
    // The primary column leads with the day's work; the secondary carries
    // reference material. Every widget lands in exactly one region.
    expect(regions.primary[0]!.definition.id).toBe("my-day");
    expect(
      regions.hero.length + regions.primary.length + regions.secondary.length,
    ).toBe(TODAY_WIDGET_IDS.length);
    for (const region of ["hero", "primary", "secondary"] as const) {
      for (const widget of regions[region]) {
        expect(widget.definition.column).toBe(region);
      }
    }
  });

  it("omits a hidden widget from its region", () => {
    const layout = toggleHidden(defaultTodayLayout(), "my-day");
    expect(
      groupVisibleWidgets(layout).primary.map((w) => w.definition.id),
    ).not.toContain("my-day");
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
    layout = toggleHidden(layout, "meetings");
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
