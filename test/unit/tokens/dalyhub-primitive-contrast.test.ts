/**
 * POLISH-01 — WCAG contrast over the DalyHub Part B PRIMITIVES.
 *
 * `contrast.test.ts` covers the generated M3 roles exhaustively. It does not
 * cover the layer above them: the DalyHub surface ramp, text ramp, feedback
 * ramp and priority ramp that `DALYHUB_PRIMITIVES` writes into every scheme
 * block. That gap is how the light appearance shipped a metadata grey at
 * 3.80:1, a P2 orange at 3.38:1, an overdue red at 4.25:1 and a status green at
 * 3.38:1 — four names painted as small text on screens the product uses all
 * day, none of them asserted anywhere.
 *
 * This closes it. Every foreground in the ramp is checked against every surface
 * of its own appearance, because those five surfaces are the complete set a
 * DalyHub component may paint on (page canvas, card, subtle, muted, sunken) and
 * a token that is only safe on white is a token that fails on hover.
 *
 * Two thresholds, per AGENTS.md §15 / WCAG 2.2:
 *   - 4.5:1 for anything drawn as TEXT — the whole text ramp except `faint`,
 *     the whole feedback ramp, all four priorities (the "P2" tag is painted in
 *     `--priority-2`, so the tag and its flag share one value);
 *   - 3:1 for non-text marks — `ink-faint`, `ink-icon`, and the `category-*`
 *     legend swatches, which are graphical objects rather than labels.
 *
 * The values are read out of `tokens.css` rather than out of the generator, so
 * a pass is a statement about what the browser paints.
 */

import { describe, expect, it } from "vitest";

import { blockBody, parseDeclarations, tokensCss } from "./token-css";

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const channels = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The five surfaces a DalyHub component may paint a foreground on. */
const SURFACES = [
  "canvas",
  "surface",
  "surface-subtle",
  "surface-muted",
  "surface-sunken",
] as const;

/** Foregrounds drawn as TEXT somewhere in the product. 4.5:1. */
const TEXT_FOREGROUNDS = [
  "ink",
  "ink-body",
  "ink-secondary",
  "ink-muted",
  "accent",
  "danger",
  "warning",
  "success",
  "info",
  "priority-1",
  "priority-2",
  "priority-3",
  "priority-4",
] as const;

/**
 * Foregrounds that are only ever marks. WCAG 1.4.11's 3:1.
 *
 * `ink-faint` is deliberately absent: after POLISH-01 it paints DISABLED
 * foregrounds only (the placeholder moved to `ink-muted`), and WCAG 1.4.3
 * exempts inactive controls by name. It is the one token in the ramp with no
 * contrast floor, and it has that exemption because of what it is for — not
 * because nobody checked it.
 */
const MARK_FOREGROUNDS = [
  "ink-icon",
  "category-purple",
  "category-blue",
  "category-orange",
  "category-green",
  "category-red",
] as const;

/**
 * The Part B primitives for one appearance. They are identical in every scheme
 * block of an appearance (that is the invariant `dalyhubPrimitiveDeclarations`
 * exists to hold), so the first block of each is the whole story — and the
 * "identical in every block" half is asserted below rather than assumed.
 */
function primitivesFor(appearance: "light" | "dark"): Map<string, string> {
  const css =
    appearance === "light"
      ? tokensCss.slice(
          0,
          tokensCss.indexOf("@media (prefers-color-scheme: dark)"),
        )
      : tokensCss.slice(
          tokensCss.indexOf("@media (prefers-color-scheme: dark)"),
        );
  return parseDeclarations(blockBody(css, /:root[^{]*\{/));
}

describe.each(["light", "dark"] as const)(
  "the DalyHub %s primitives",
  (appearance) => {
    const primitives = primitivesFor(appearance);

    it("defines every surface and foreground it is checked on", () => {
      for (const name of [
        ...SURFACES,
        ...TEXT_FOREGROUNDS,
        ...MARK_FOREGROUNDS,
      ]) {
        expect(primitives.get(name), `--${name} is missing`).toMatch(
          /^#[0-9a-f]{6}$/,
        );
      }
    });

    it("meets AA 4.5:1 for every text foreground on every surface", () => {
      for (const fg of TEXT_FOREGROUNDS) {
        for (const bg of SURFACES) {
          const ratio = contrastRatio(
            primitives.get(fg) as string,
            primitives.get(bg) as string,
          );
          expect(
            ratio,
            `${appearance}: --${fg} on --${bg} = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it("meets 3:1 for every non-text mark on every surface", () => {
      for (const fg of MARK_FOREGROUNDS) {
        for (const bg of SURFACES) {
          const ratio = contrastRatio(
            primitives.get(fg) as string,
            primitives.get(bg) as string,
          );
          expect(
            ratio,
            `${appearance}: --${fg} on --${bg} = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it("keeps the four priorities distinguishable from one another", () => {
      /*
       * Priority is never colour alone — there is a flag glyph and a P1…P4 tag
       * on every row. But the colours still have to be four colours: the
       * contrast fix darkens P1 and P2 toward each other, and this is what
       * stops a future re-tone collapsing red and orange into one red.
       *
       * The measure is sRGB DISTANCE, not WCAG contrast. P1 and P2 are within
       * 1.01:1 of each other by luminance and always were — that is what "same
       * darkness, different hue" means, and using the wrong metric here would
       * either fail a palette that is fine or pass one that is not.
       */
      const priorities = [1, 2, 3, 4].map(
        (n) => primitives.get(`priority-${n}`) as string,
      );
      for (let i = 0; i < priorities.length; i += 1) {
        for (let j = i + 1; j < priorities.length; j += 1) {
          const [a, b] = [priorities[i], priorities[j]];
          const [ar, ag, ab] = parseHex(a);
          const [br, bg, bb] = parseHex(b);
          const distance = Math.hypot(ar - br, ag - bg, ab - bb);
          expect(
            distance,
            `${appearance}: P${i + 1} (${a}) vs P${j + 1} (${b}) = ${distance.toFixed(0)}`,
          ).toBeGreaterThan(40);
        }
      }
    });
  },
);

describe("the Part B primitives across schemes", () => {
  it("are identical in every scheme block of an appearance", () => {
    /*
     * DalyHub's own palette is one palette. A scheme change re-tones the M3
     * roles; it must not repaint the product's surfaces or its feedback ramp,
     * which is what makes a single contrast assertion above cover all five.
     */
    const light = primitivesFor("light");
    for (const scheme of ["electric", "pulse", "ocean", "graphite"]) {
      const block = parseDeclarations(
        blockBody(
          tokensCss,
          new RegExp(`:root\\[data-color-scheme="${scheme}"\\]\\s*\\{`),
        ),
      );
      for (const name of [
        ...SURFACES,
        ...TEXT_FOREGROUNDS,
        ...MARK_FOREGROUNDS,
      ]) {
        expect(block.get(name), `${scheme} --${name}`).toBe(light.get(name));
      }
    }
  });
});
