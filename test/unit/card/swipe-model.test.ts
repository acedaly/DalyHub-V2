/**
 * DS-04 (TODAY-06) — pure swipe-gesture model tests.
 *
 * The gesture DECISION logic is pure and testable in isolation (the roving-model /
 * reorder-math precedent): direction intent, offset projection, boundary clamping,
 * the open/closed snap decision, and the single-open-tray registry. Real gesture
 * geometry is covered end-to-end by Playwright, where a real layout exists.
 */

import { describe, expect, it, vi } from "vitest";

import {
  clampOffset,
  createSwipeRegistry,
  DEFAULT_SWIPE_THRESHOLDS,
  projectOffset,
  resolveRelease,
  resolveSwipeIntent,
  type SwipeTrayHandle,
} from "~/shared/card/swipe-model";

const TRAY = 180;

describe("resolveSwipeIntent", () => {
  it("stays pending while movement is below threshold in both axes", () => {
    expect(resolveSwipeIntent(4, 3, 12)).toBe("pending");
    expect(resolveSwipeIntent(-11, -11, 12)).toBe("pending");
    expect(resolveSwipeIntent(0, 0, 12)).toBe("pending");
  });

  it("claims a clear horizontal drag once it passes the threshold", () => {
    expect(resolveSwipeIntent(-40, 5, 12)).toBe("horizontal");
    expect(resolveSwipeIntent(30, -8, 12)).toBe("horizontal");
  });

  it("yields to a vertical scroll (equal or greater vertical does NOT claim)", () => {
    expect(resolveSwipeIntent(5, -40, 12)).toBe("vertical");
    // A diagonal drag with equal axes favours the page scroll, not the swipe.
    expect(resolveSwipeIntent(-30, 30, 12)).toBe("vertical");
    expect(resolveSwipeIntent(-30, -31, 12)).toBe("vertical");
  });

  it("uses the calm default threshold when none is given", () => {
    expect(resolveSwipeIntent(DEFAULT_SWIPE_THRESHOLDS.intent - 1, 0)).toBe(
      "pending",
    );
    expect(resolveSwipeIntent(-(DEFAULT_SWIPE_THRESHOLDS.intent + 1), 0)).toBe(
      "horizontal",
    );
  });
});

describe("clampOffset", () => {
  it("clamps to the [0, trayWidth] boundaries", () => {
    expect(clampOffset(-50, TRAY)).toBe(0);
    expect(clampOffset(0, TRAY)).toBe(0);
    expect(clampOffset(90, TRAY)).toBe(90);
    expect(clampOffset(TRAY, TRAY)).toBe(TRAY);
    expect(clampOffset(TRAY + 100, TRAY)).toBe(TRAY);
  });

  it("returns 0 for a non-positive or non-finite tray width", () => {
    expect(clampOffset(50, 0)).toBe(0);
    expect(clampOffset(50, -10)).toBe(0);
    expect(clampOffset(Number.NaN, TRAY)).toBe(0);
  });
});

describe("projectOffset", () => {
  it("reveals the tray when dragging toward the inline-start (dx < 0)", () => {
    // From fully closed, a 60px left drag reveals 60px.
    expect(projectOffset(0, -60, TRAY)).toBe(60);
  });

  it("hides the tray when dragging back (dx > 0) from an open committed state", () => {
    // From fully open, a 50px right drag reduces the reveal by 50.
    expect(projectOffset(TRAY, 50, TRAY)).toBe(TRAY - 50);
  });

  it("never exceeds the boundaries however far the finger travels", () => {
    expect(projectOffset(0, -10_000, TRAY)).toBe(TRAY); // can't over-reveal
    expect(projectOffset(TRAY, 10_000, TRAY)).toBe(0); // can't over-close
  });
});

describe("resolveRelease", () => {
  it("snaps closed below the open ratio and open at/above it", () => {
    // openRatio 0.4 of 180 = 72px.
    expect(resolveRelease(71, TRAY, 0.4)).toBe("closed");
    expect(resolveRelease(72, TRAY, 0.4)).toBe("open");
    expect(resolveRelease(TRAY, TRAY, 0.4)).toBe("open");
    expect(resolveRelease(0, TRAY, 0.4)).toBe("closed");
  });

  it("cannot open when the tray has no width", () => {
    expect(resolveRelease(100, 0, 0.4)).toBe("closed");
  });
});

describe("createSwipeRegistry — one open tray at a time", () => {
  const makeHandle = (): { handle: SwipeTrayHandle; close: () => void } => {
    const close = vi.fn();
    return { handle: { close }, close };
  };

  it("closes the previously-open tray when another opens", () => {
    const registry = createSwipeRegistry();
    const a = makeHandle();
    const b = makeHandle();

    registry.open(a.handle);
    expect(registry.active()).toBe(a.handle);

    registry.open(b.handle);
    expect(a.close).toHaveBeenCalledTimes(1); // the first tray was closed
    expect(b.close).not.toHaveBeenCalled();
    expect(registry.active()).toBe(b.handle);
  });

  it("re-opening the already-open tray does not close it", () => {
    const registry = createSwipeRegistry();
    const a = makeHandle();
    registry.open(a.handle);
    registry.open(a.handle);
    expect(a.close).not.toHaveBeenCalled();
    expect(registry.active()).toBe(a.handle);
  });

  it("release clears only the active handle", () => {
    const registry = createSwipeRegistry();
    const a = makeHandle();
    const b = makeHandle();
    registry.open(a.handle);
    // Releasing a non-active handle is a no-op.
    registry.release(b.handle);
    expect(registry.active()).toBe(a.handle);
    registry.release(a.handle);
    expect(registry.active()).toBeNull();
  });

  it("closeActive closes and clears the open tray", () => {
    const registry = createSwipeRegistry();
    const a = makeHandle();
    registry.open(a.handle);
    registry.closeActive();
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(registry.active()).toBeNull();
    // Safe to call again with nothing open.
    expect(() => registry.closeActive()).not.toThrow();
  });
});
