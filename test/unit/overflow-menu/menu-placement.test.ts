import { describe, expect, it } from "vitest";

import {
  MENU_MIN_CLAMP_PX,
  MENU_VIEWPORT_MARGIN_PX,
  clampMenuInline,
  placeMenu,
} from "~/shared/overflow-menu/menu-placement";

/**
 * UIQ-021 — the shared menu's placement DECISION, as plain numbers.
 *
 * The geometry that matters is proven twice: here, exhaustively and cheaply,
 * over the cases a browser test would need a contrived page to produce; and in
 * `e2e/collection-header.spec.ts` against real layout, which is where a
 * measurement bug would actually live. This file owns the rules; the browser
 * owns the measuring.
 */

const OFFSET = 4;
const VIEWPORT = 800;

describe("placeMenu", () => {
  it("keeps the ordinary below-trigger placement when the menu fits", () => {
    expect(
      placeMenu({
        triggerTop: 100,
        triggerBottom: 140,
        menuHeight: 300,
        viewportHeight: VIEWPORT,
        offset: OFFSET,
      }),
    ).toEqual({ side: "below", maxHeight: null });
  });

  it("flips above when below cannot hold the menu but above can", () => {
    // A trigger low on the screen with a long menu: 800 - 8 - (700 + 4) = 88px
    // below, 700 - 4 - 8 = 688px above.
    expect(
      placeMenu({
        triggerTop: 700,
        triggerBottom: 740,
        menuHeight: 600,
        viewportHeight: VIEWPORT,
        offset: OFFSET,
      }),
    ).toEqual({ side: "above", maxHeight: null });
  });

  it("prefers below when both sides fit — flipping is a fallback, not a habit", () => {
    expect(
      placeMenu({
        triggerTop: 380,
        triggerBottom: 420,
        menuHeight: 200,
        viewportHeight: VIEWPORT,
        offset: OFFSET,
      }).side,
    ).toBe("below");
  });

  it("clamps to the larger side when neither can contain the whole menu", () => {
    // A trigger in the middle with a menu taller than either side: 800 - 8 -
    // (420 + 4) = 368 below, 380 - 4 - 8 = 368 above… so bias below, and clamp.
    const middle = placeMenu({
      triggerTop: 380,
      triggerBottom: 420,
      menuHeight: 700,
      viewportHeight: VIEWPORT,
      offset: OFFSET,
    });
    expect(middle.side).toBe("below");
    expect(middle.maxHeight).toBe(368);

    // Slightly higher trigger: more room below, so below wins on merit.
    const higher = placeMenu({
      triggerTop: 300,
      triggerBottom: 340,
      menuHeight: 700,
      viewportHeight: VIEWPORT,
      offset: OFFSET,
    });
    expect(higher.side).toBe("below");
    expect(higher.maxHeight).toBe(448);

    // Trigger near the bottom: above has the room, so above is clamped instead.
    const lower = placeMenu({
      triggerTop: 620,
      triggerBottom: 660,
      menuHeight: 700,
      viewportHeight: VIEWPORT,
      offset: OFFSET,
    });
    expect(lower.side).toBe("above");
    expect(lower.maxHeight).toBe(608);
  });

  it("never clamps below a usable height, even on a very short viewport", () => {
    // A 200px viewport with a trigger in the middle leaves under 100px either
    // way. A menu clamped to that is a menu nobody can use, so the floor wins
    // and the panel scrolls internally instead.
    const cramped = placeMenu({
      triggerTop: 90,
      triggerBottom: 130,
      menuHeight: 600,
      viewportHeight: 200,
      offset: OFFSET,
    });
    expect(cramped.maxHeight).toBe(MENU_MIN_CLAMP_PX);
  });

  it("leaves the viewport margin intact on the side it chooses", () => {
    const placement = placeMenu({
      triggerTop: 300,
      triggerBottom: 340,
      menuHeight: 700,
      viewportHeight: VIEWPORT,
      offset: OFFSET,
    });
    // Panel top + clamped height must stop short of the viewport edge.
    const panelTop = 340 + OFFSET;
    expect(panelTop + (placement.maxHeight ?? 0)).toBeLessThanOrEqual(
      VIEWPORT - MENU_VIEWPORT_MARGIN_PX,
    );
  });
});

describe("clampMenuInline", () => {
  it("does not move a panel that already fits", () => {
    expect(
      clampMenuInline({ panelLeft: 200, panelRight: 400, viewportWidth: 1280 }),
    ).toBe(0);
  });

  it("pulls a panel back from the trailing edge", () => {
    // A ⋯ near the right edge, panel running 40px past it.
    expect(
      clampMenuInline({
        panelLeft: 1100,
        panelRight: 1320,
        viewportWidth: 1280,
      }),
    ).toBe(-48);
  });

  it("pushes a panel off the leading edge", () => {
    expect(
      clampMenuInline({ panelLeft: -30, panelRight: 190, viewportWidth: 1280 }),
    ).toBe(MENU_VIEWPORT_MARGIN_PX + 30);
  });

  it("prefers the leading edge when the panel cannot honour both", () => {
    // Wider than the viewport allows: the labels stay readable from the start
    // edge rather than the panel being pinned by its trailing one.
    expect(
      clampMenuInline({ panelLeft: 4, panelRight: 340, viewportWidth: 320 }),
    ).toBe(MENU_VIEWPORT_MARGIN_PX - 4);
  });
});
