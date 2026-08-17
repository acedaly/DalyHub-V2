/**
 * MOBILE-02 §4 — the Task row's swipe model, tested as pure decisions.
 *
 * The row's gesture commits rather than opening a tray, so the decisions worth
 * holding are different from the Card's: how far the row is DRAWN for a given
 * finger travel, whether a release fires anything, and which act it fires. Real
 * gesture geometry is covered end-to-end by Playwright, where a layout exists.
 *
 * The properties asserted here are the ones the audit's requirements name: "use
 * a deliberate threshold", "no accidental commit from tiny gesture", "horizontal
 * swipe must not interfere with ordinary vertical scrolling", and "both
 * directions".
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROW_SWIPE_THRESHOLDS as T,
  resolveSwipeIntent,
  rowSwipeArmed,
  rowSwipeCommit,
  rowSwipeOffset,
} from "~/shared/card/swipe-model";

describe("rowSwipeOffset", () => {
  it("follows the finger exactly up to the commit point", () => {
    expect(rowSwipeOffset(0)).toBe(0);
    expect(rowSwipeOffset(40)).toBe(40);
    expect(rowSwipeOffset(-40)).toBe(-40);
    expect(rowSwipeOffset(T.commit)).toBe(T.commit);
    expect(rowSwipeOffset(-T.commit)).toBe(-T.commit);
  });

  it("resists past the commit point, so a flick lands where a pull does", () => {
    // Past the threshold only about a third of further travel is spent. The row
    // visibly stops keeping up, which is the gesture saying it has ended.
    const pulled = rowSwipeOffset(T.commit + 100);
    expect(pulled).toBeGreaterThan(T.commit);
    expect(pulled).toBeLessThan(T.commit + 100);
    expect(rowSwipeOffset(T.commit + 1000)).toBe(T.max);
    expect(rowSwipeOffset(-(T.commit + 1000))).toBe(-T.max);
  });

  it("is symmetric — neither direction is easier to reach than the other", () => {
    for (const travel of [5, 30, 88, 150, 400]) {
      expect(rowSwipeOffset(-travel)).toBe(-rowSwipeOffset(travel));
    }
  });
});

describe("rowSwipeCommit", () => {
  it("fires NOTHING below the threshold — a tiny gesture is not an act", () => {
    // This gesture completes a task. An accidental 30px drag on a scrolling
    // list must never be a destructive surprise.
    expect(rowSwipeCommit(0)).toBeNull();
    expect(rowSwipeCommit(12)).toBeNull();
    expect(rowSwipeCommit(T.commit - 1)).toBeNull();
    expect(rowSwipeCommit(-(T.commit - 1))).toBeNull();
  });

  it("names the revealed EDGE, in both directions", () => {
    expect(rowSwipeCommit(T.commit)).toBe("start");
    expect(rowSwipeCommit(T.max)).toBe("start");
    expect(rowSwipeCommit(-T.commit)).toBe("end");
    expect(rowSwipeCommit(-T.max)).toBe("end");
  });

  it("reads the DRAWN offset, so what was seen is what commits", () => {
    // A release can only fire what the row visibly reached: the resistance
    // curve is applied before this decision, never after it.
    const drawn = rowSwipeOffset(T.commit - 10);
    expect(rowSwipeCommit(drawn)).toBeNull();
  });
});

describe("rowSwipeArmed", () => {
  it("arms at exactly the line the action fires on", () => {
    // The affordance changing and the action firing must be the same threshold,
    // or the row promises one thing and does another.
    for (const offset of [0, 40, T.commit - 1, T.commit, T.max, -T.commit]) {
      expect(rowSwipeArmed(offset)).toBe(rowSwipeCommit(offset) !== null);
    }
  });
});

describe("the row and the page never fight over one gesture", () => {
  it("yields the axis to a scroll, sharing the Card's one intent rule", () => {
    // Ties go to vertical, so a diagonal drag scrolls rather than swiping.
    expect(resolveSwipeIntent(20, 20, T.intent)).toBe("vertical");
    expect(resolveSwipeIntent(6, 40, T.intent)).toBe("vertical");
    expect(resolveSwipeIntent(40, 6, T.intent)).toBe("horizontal");
    // Below the deadzone in both axes nothing has been decided and nothing
    // moves — which is what makes a tap a tap.
    expect(resolveSwipeIntent(5, 5, T.intent)).toBe("pending");
  });
});
