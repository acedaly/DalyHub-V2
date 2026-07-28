/**
 * MOBILE-01 — the keyboard-inset arithmetic.
 *
 * This is the number every keyboard-aware surface in the product is positioned
 * against, so its clamping and its noise threshold are asserted directly rather
 * than inferred from a browser test.
 */

import { describe, expect, it } from "vitest";

import {
  KEYBOARD_INSET_NOISE_THRESHOLD,
  resolveKeyboardInset,
} from "~/shared/viewport/keyboard-inset";

describe("resolveKeyboardInset", () => {
  it("is zero when the visual viewport matches the layout viewport", () => {
    expect(
      resolveKeyboardInset({
        layoutHeight: 844,
        visualHeight: 844,
        offsetTop: 0,
      }),
    ).toBe(0);
  });

  it("reports the covered height when a keyboard is up", () => {
    expect(
      resolveKeyboardInset({
        layoutHeight: 844,
        visualHeight: 508,
        offsetTop: 0,
      }),
    ).toBe(336);
  });

  it("ignores small differences so a collapsing URL bar never moves sticky controls", () => {
    const small = KEYBOARD_INSET_NOISE_THRESHOLD - 1;
    expect(
      resolveKeyboardInset({
        layoutHeight: 844,
        visualHeight: 844 - small,
        offsetTop: 0,
      }),
    ).toBe(0);
  });

  it("accounts for a pinch-scrolled viewport offset", () => {
    expect(
      resolveKeyboardInset({
        layoutHeight: 844,
        visualHeight: 508,
        offsetTop: 100,
      }),
    ).toBe(236);
  });

  it("never returns a negative inset, which would pull controls off-screen", () => {
    expect(
      resolveKeyboardInset({
        layoutHeight: 844,
        visualHeight: 900,
        offsetTop: 0,
      }),
    ).toBe(0);
  });

  it("never returns more than the viewport, which would collapse every sheet", () => {
    expect(
      resolveKeyboardInset({
        layoutHeight: 844,
        visualHeight: -5000,
        offsetTop: 0,
      }),
    ).toBe(844);
  });

  it("degrades to zero for non-finite or impossible readings", () => {
    expect(
      resolveKeyboardInset({
        layoutHeight: Number.NaN,
        visualHeight: 500,
        offsetTop: 0,
      }),
    ).toBe(0);
    expect(
      resolveKeyboardInset({ layoutHeight: 0, visualHeight: 0, offsetTop: 0 }),
    ).toBe(0);
  });
});
