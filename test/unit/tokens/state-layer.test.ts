import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * M3-INT — the state layer stays ONE implementation.
 *
 * The August 2026 interaction audit's finding 3 was not that the hand-rolled
 * hover fills looked wrong. They looked right, because their authors all read
 * the same rule. It was that the rule was enforced by CONVENTION, so the next
 * divergence would be silent: a surface using 12% instead of 8%, or tinting its
 * container instead of layering, would look almost correct and would never fail
 * anything. (The editor toolbar had already drifted to a 12% pressed fill.)
 *
 * ── What this test deliberately does NOT do ──────────────────────────────────
 * It does not ban `:hover`, `background` or `color-mix()`. A hover rule that
 * lifts a content colour, firms a border or swaps a SELECTED container is
 * correct M3 and there are dozens of them. Banning the primitives would produce
 * a noisy test that the next author routes around, which is worse than no test.
 *
 * It bans exactly one shape: a rule that paints a translucent fill AT ONE OF
 * M3'S OWN STATE OPACITIES on hover, focus or press — i.e. a hand-rolled copy of
 * the shared layer. That is narrow enough to have no false positives today and
 * specific enough that re-introducing the divergence trips it.
 */

const STYLES_DIR = join(process.cwd(), "app", "styles");

/** The percentages M3 assigns to hover (8%), focus/pressed (10%) and drag (16%). */
const STATE_LAYER_PERCENTAGES = ["8%", "10%", "12%", "16%"];

/**
 * The hand-rolled layers PR #127 did NOT convert, frozen as a baseline.
 *
 * The audit's own instruction was "not convert all 107" but the reusable
 * PRIMITIVES — buttons, icon buttons, menus, navigation items, chips, segmented
 * controls, card actions, the inline-edit trigger, the editor toolbar and record
 * actions. Those are done and are hosts of the shared implementation. What is
 * left is module-level chrome: a Diary date-stepper, a Today widget control, a
 * Search clear button. Each is a small, local conversion with a small, local
 * payoff, and doing thirty-eight of them inside a PR that also moved the record
 * header and the writing surface would have made all three unreviewable.
 *
 * This list is the honest record of that, and it is a RATCHET: the test fails if
 * it grows (a new bespoke layer) and fails if an entry goes stale (a converted
 * one left behind). It may only shrink. Tracked in `PRODUCT_DEBT.md`.
 */
const KNOWN_HAND_ROLLED: readonly string[] = [
  /*
   * DEBT-99, closed down to ONE entry on 2026-08-25.
   *
   * The twenty-six module-level chrome controls this list used to carry are
   * now hosts of the one implementation — twenty-five by carrying
   * `md-state-layer` in their own markup (route (a)) and one,
   * `.dh-filter-btn--ghost`, by joining the host list in `base.css` (route
   * (b), because it is a literal string at a dozen call sites). Each gained a
   * FOCUS and a PRESSED state it did not have: the hand-rolled rules were
   * hover-only, which AGENTS.md §15 rules out and which was M3-INT finding 3's
   * second half.
   */
  /*
   * The one that stays, and the reason is not "it is hard".
   *
   * `.dh-card-collection--list .dh-card:hover` is not a translucent LAYER. It
   * paints an OPAQUE row band — `color-mix(… 8%, var(--dh-color-surface))`, a
   * mix with the surface rather than with transparency — and then extends that
   * exact colour past the card's own box with two bleed `box-shadow`s, so the
   * hover reads as a full-width row in a list that has side padding. The
   * shared layer is `inset: 0` on the element and cannot bleed, and it sits
   * ABOVE the content rather than behind it — which on the product's
   * most-rendered surface would wash every status chip and identity dot on the
   * card with 8% of the text colour.
   *
   * Converting it is therefore a Card change with a visual consequence, not a
   * mechanical one, and it belongs with whoever next owns the row band. It
   * trips the detector because the detector is deliberately crude about
   * `background` + `color-mix` + a state percentage, and being crude is what
   * makes it have no false negatives.
   */
  "card.css: .dh-card-collection--list .dh-card:hover",
];

function stylesheets(): readonly { name: string; text: string }[] {
  return readdirSync(STYLES_DIR)
    .filter((name) => name.endsWith(".css"))
    .map((name) => ({
      name,
      text: readFileSync(join(STYLES_DIR, name), "utf8"),
    }));
}

/**
 * Split a stylesheet into `selector { declarations }` rules, comments stripped.
 * Crude on purpose — it only has to be good enough to attribute a declaration to
 * the selector above it.
 */
function rules(css: string): readonly { selector: string; body: string }[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(withoutComments)) !== null) {
    out.push({
      selector: match[1]!.trim().replace(/\s+/g, " "),
      body: match[2]!,
    });
  }
  return out;
}

describe("M3-INT — no bespoke state layers", () => {
  it("only base.css implements the hover/focus/pressed state-layer fill", () => {
    const offenders: string[] = [];

    for (const { name, text } of stylesheets()) {
      // `base.css` IS the implementation. The `*-demo.css` fixtures style
      // development-only routes and never ship.
      if (name === "base.css" || name.endsWith("-demo.css")) continue;

      for (const { selector, body } of rules(text)) {
        const isStateSelector = /:(hover|focus-visible|active)\b/.test(
          selector,
        );
        if (!isStateSelector) continue;

        // A translucent fill at one of M3's state-layer opacities, applied to
        // the element's own background on a state selector, is the shared
        // layer being reimplemented.
        const paintsTranslucentFill =
          /\bbackground(-color)?\s*:/.test(body) &&
          /color-mix\s*\(/.test(body) &&
          STATE_LAYER_PERCENTAGES.some((percentage) =>
            body.includes(percentage),
          );

        if (paintsTranslucentFill) {
          offenders.push(`${name}: ${selector}`);
        }
      }
    }

    const introduced = offenders.filter(
      (offender) => !KNOWN_HAND_ROLLED.includes(offender),
    );
    expect(
      introduced,
      `NEW hand-rolled state layer(s). Add the selector to the host list in ` +
        `base.css instead of re-implementing the fill:\n${introduced.join("\n")}`,
    ).toEqual([]);

    const converted = KNOWN_HAND_ROLLED.filter(
      (known) => !offenders.includes(known),
    );
    expect(
      converted,
      `these baseline entries no longer exist — delete them from ` +
        `KNOWN_HAND_ROLLED so the list keeps meaning what it says:\n` +
        converted.join("\n"),
    ).toEqual([]);
  });

  it("base.css states every state in the contract exactly once", () => {
    const text = readFileSync(join(STYLES_DIR, "base.css"), "utf8");

    // Hover, focus and pressed each resolve to their DalyHub semantic role, and
    // each token is referenced exactly once — one implementation, not several.
    for (const token of [
      "--dh-state-hover-opacity",
      "--dh-state-focus-opacity",
      "--dh-state-pressed-opacity",
    ]) {
      const uses = text.split(`var(${token})`).length - 1;
      expect(uses, `${token} is used ${uses}× in base.css`).toBe(1);
    }

    // Disabled has no layer at all — the shared disabled treatment replaces it.
    expect(text).toContain('[aria-disabled="true"]');
  });

  it("every host in the list is a real class used by the product", () => {
    const base = readFileSync(join(STYLES_DIR, "base.css"), "utf8");
    const block = base.slice(
      base.indexOf("/* The M3 state layer"),
      base.indexOf("SELECTED is not an opacity"),
    );
    const hosts = [...new Set(block.match(/\.[a-z][\w-]*(?:__[\w-]+)?/g) ?? [])]
      // `.md-state-layer` is the class route and needs no other stylesheet.
      .filter((host) => host !== ".md-state-layer");

    expect(hosts.length).toBeGreaterThan(5);

    const allCss = stylesheets()
      .filter(({ name }) => name !== "base.css")
      .map(({ text }) => text)
      .join("\n");

    for (const host of hosts) {
      expect(
        allCss.includes(host),
        `${host} is a state-layer host but no stylesheet defines it — a renamed ` +
          `or deleted component leaves a dead selector that silently stops ` +
          `receiving states`,
      ).toBe(true);
    }
  });
});
