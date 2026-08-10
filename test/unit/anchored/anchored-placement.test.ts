/**
 * EDIT-03 — the anchored overlay's geometry, as numbers.
 *
 * The component that consumes this measures the DOM and paints; every DECISION
 * it makes is here, which is why these assertions are plain arithmetic rather
 * than a rendered menu. What they guard is the promise the bug report made:
 * whatever the trigger's position, the whole surface ends up on screen, and
 * when it cannot, it is clamped to something that scrolls rather than being cut
 * off by whatever happens to be around it.
 */

import { describe, expect, it } from "vitest";

import {
  ANCHORED_MIN_CLAMP_PX,
  ANCHORED_VIEWPORT_MARGIN_PX,
  placeAnchoredBlock,
  placeAnchoredInline,
  placeAnchoredSurface,
} from "~/shared/anchored";

const VIEWPORT = { width: 1280, height: 800 };

/** A task row's inline editor, `top` px down a 1280×800 desktop viewport. */
function trigger(top: number, { left = 500, width = 60 } = {}) {
  return { top, bottom: top + 28, left, right: left + width };
}

describe("placeAnchoredBlock", () => {
  it("opens below the trigger when the surface fits there", () => {
    expect(
      placeAnchoredBlock({
        triggerTop: 100,
        triggerBottom: 128,
        surfaceHeight: 240,
        viewportHeight: 800,
        offset: 4,
      }),
    ).toEqual({ side: "below", maxHeight: null });
  });

  it("flips above rather than running off the bottom", () => {
    // A row near the foot of the list: 240px will not fit under it, and there
    // is plenty of room over it.
    expect(
      placeAnchoredBlock({
        triggerTop: 700,
        triggerBottom: 728,
        surfaceHeight: 240,
        viewportHeight: 800,
        offset: 4,
      }),
    ).toEqual({ side: "above", maxHeight: null });
  });

  it("clamps to the larger side when NEITHER can hold it", () => {
    // A 52-Project menu in the middle of the viewport fits nowhere whole. It is
    // not cut off — it takes the bigger side and scrolls internally.
    const placement = placeAnchoredBlock({
      triggerTop: 300,
      triggerBottom: 328,
      surfaceHeight: 900,
      viewportHeight: 800,
      offset: 4,
    });
    expect(placement.side).toBe("below");
    expect(placement.maxHeight).toBe(
      800 - ANCHORED_VIEWPORT_MARGIN_PX - (328 + 4),
    );
  });

  it("never clamps below the floor that keeps a surface operable", () => {
    // A pathologically short viewport (a phone with the keyboard up). The
    // margin yields before the surface becomes unusable.
    const placement = placeAnchoredBlock({
      triggerTop: 60,
      triggerBottom: 88,
      surfaceHeight: 400,
      viewportHeight: 160,
      offset: 4,
    });
    // 48px above and 60px below — both under the floor, so the floor wins and
    // the margin yields rather than the surface becoming unusable.
    expect(placement.maxHeight).toBe(ANCHORED_MIN_CLAMP_PX);
  });
});

describe("placeAnchoredInline", () => {
  const base = {
    anchorLeft: 500,
    anchorRight: 560,
    surfaceWidth: 240,
    viewportWidth: 1280,
    direction: "ltr" as const,
  };

  it("lines a start-aligned surface up with the anchor's leading edge", () => {
    expect(placeAnchoredInline({ ...base, align: "start" })).toBe(500);
  });

  it("lines an end-aligned surface up with the anchor's trailing edge", () => {
    expect(placeAnchoredInline({ ...base, align: "end" })).toBe(560 - 240);
  });

  it("slides back from the trailing edge instead of overflowing the page", () => {
    // The Project column sits at x≈1100 on a 1280 desktop; a 352px menu
    // start-aligned there would push the DOCUMENT wider and give the page a
    // horizontal scrollbar, which is the one thing no overlay may ever do.
    const left = placeAnchoredInline({
      anchorLeft: 1100,
      anchorRight: 1192,
      surfaceWidth: 352,
      viewportWidth: 1280,
      align: "start",
      direction: "ltr",
    });
    expect(left + 352).toBeLessThanOrEqual(1280 - ANCHORED_VIEWPORT_MARGIN_PX);
  });

  it("keeps the START edge visible when the surface cannot honour both", () => {
    // Wider than the viewport allows. The labels begin at the start edge, so
    // that is the edge that stays on screen.
    expect(
      placeAnchoredInline({
        anchorLeft: 40,
        anchorRight: 100,
        surfaceWidth: 1400,
        viewportWidth: 1280,
        align: "start",
        direction: "ltr",
      }),
    ).toBe(ANCHORED_VIEWPORT_MARGIN_PX);
  });

  it("reads `start` as the RIGHT edge in a right-to-left document", () => {
    expect(
      placeAnchoredInline({ ...base, align: "start", direction: "rtl" }),
    ).toBe(560 - 240);
    expect(
      placeAnchoredInline({ ...base, align: "end", direction: "rtl" }),
    ).toBe(500);
  });
});

describe("placeAnchoredSurface", () => {
  const surface = { width: 240, height: 300 };

  it("places a below-opening surface just under its trigger", () => {
    const placement = placeAnchoredSurface({
      anchor: trigger(100),
      surface,
      viewport: VIEWPORT,
      offset: 4,
      align: "start",
      direction: "ltr",
    });
    expect(placement).toMatchObject({
      side: "below",
      top: 132,
      left: 500,
      maxHeight: null,
    });
  });

  it("puts a flipped surface's BOTTOM against the trigger, not its top", () => {
    // The half of the flip that is easy to forget: an above-opening surface is
    // positioned by its top, so its own height has to come out of the anchor.
    const placement = placeAnchoredSurface({
      anchor: trigger(700),
      surface,
      viewport: VIEWPORT,
      offset: 4,
      align: "start",
      direction: "ltr",
    });
    expect(placement.side).toBe("above");
    expect(placement.top).toBe(700 - 4 - 300);
  });

  it("keeps a CLAMPED flipped surface inside the top margin", () => {
    // 900px of options above a trigger 400px down the page: clamped to the room
    // that exists, and started at the margin rather than at a negative `top`.
    const placement = placeAnchoredSurface({
      anchor: trigger(400),
      surface: { width: 352, height: 900 },
      viewport: VIEWPORT,
      offset: 4,
      align: "start",
      direction: "ltr",
    });
    expect(placement.maxHeight).not.toBeNull();
    expect(placement.top).toBeGreaterThanOrEqual(ANCHORED_VIEWPORT_MARGIN_PX);
    expect(placement.top + (placement.maxHeight ?? 0)).toBeLessThanOrEqual(
      VIEWPORT.height - ANCHORED_VIEWPORT_MARGIN_PX,
    );
  });

  it("holds the surface on screen even when the TRIGGER is not", () => {
    // Mid-scroll, or in a row that has been dragged: the trigger's rect can be
    // partly outside the viewport, and the surface must not follow it out.
    const placement = placeAnchoredSurface({
      anchor: trigger(-40, { left: -30 }),
      surface,
      viewport: VIEWPORT,
      offset: 4,
      align: "start",
      direction: "ltr",
    });
    expect(placement.top).toBeGreaterThanOrEqual(ANCHORED_VIEWPORT_MARGIN_PX);
    expect(placement.left).toBeGreaterThanOrEqual(ANCHORED_VIEWPORT_MARGIN_PX);
  });
});
