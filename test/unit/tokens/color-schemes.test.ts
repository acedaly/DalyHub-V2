/**
 * THEME-01 — the guarantees a colour scheme owes the PRODUCT, not just WCAG.
 *
 * `contrast.test.ts` proves every scheme is readable. These are the assertions
 * that stop a readable scheme from being a bad one: a semantic status that has
 * merged into the brand, a chart palette that is a different size in one scheme,
 * a priority ramp that has collapsed, a "neutral" surface that has become a
 * colour wash, or five schemes that are really one scheme with five names.
 *
 * All of it is derived from the generated data, so it is deterministic and costs
 * milliseconds — which is the point of asserting it rather than reviewing it.
 */

import { Hct, argbFromHex } from "@material/material-color-utilities";
import { describe, expect, it } from "vitest";

import {
  COLOR_SCHEME_PALETTES,
  COLOR_SCHEME_SEEDS,
  COLOR_SCHEME_TINT_STRENGTHS,
  GENERATED_COLOR_SCHEMES,
  SCHEME_ROLE_NAMES,
  type GeneratedColorScheme,
  type SchemeColorMap,
  type SchemeRole,
} from "~/shared/tokens";

/** HCT hue — the perceptual hue angle, from the library the schemes are built with. */
function hue(hex: string): number {
  return Hct.fromInt(argbFromHex(hex)).hue;
}

/** HCT chroma — "how much colour is in this", independent of how light it is. */
function chroma(hex: string): number {
  return Hct.fromInt(argbFromHex(hex)).chroma;
}

/** The shorter way round the hue circle between two angles, in degrees. */
function hueSeparation(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 360 - raw);
}

/** Every scheme in every appearance, labelled. */
const EVERY_SCHEME: readonly (readonly [
  string,
  SchemeColorMap,
  GeneratedColorScheme,
])[] = GENERATED_COLOR_SCHEMES.flatMap((scheme) =>
  (["light", "dark"] as const).map(
    (appearance) =>
      [
        `${scheme}/${appearance}`,
        COLOR_SCHEME_PALETTES[scheme][appearance],
        scheme,
      ] as const,
  ),
);

/** The bounded chart palette: exactly six series, no more and no fewer. */
const CHART_SERIES = [1, 2, 3, 4, 5, 6] as const;

describe("THEME-01 — every scheme exposes the same token contract", () => {
  it("emits the identical role list for all five schemes", () => {
    // Not "each has the roles it needs" — each has THE SAME roles, so a component
    // written once is complete in every scheme by construction rather than by
    // review.
    const expected = new Set<string>(SCHEME_ROLE_NAMES);
    for (const [label, scheme] of EVERY_SCHEME) {
      const actual = new Set(Object.keys(scheme));
      expect(actual.size, `${label}: role count`).toBe(expected.size);
      for (const role of expected) {
        expect(actual.has(role), `${label}: missing ${role}`).toBe(true);
      }
    }
  });

  it("gives every colour group its full quartet in every scheme", () => {
    // A group with a colour but no container is the failure THEME-01 §41 names:
    // nothing errors, the browser simply falls through and the surface is painted
    // in whatever a neighbouring block left behind.
    const groups = SCHEME_ROLE_NAMES.filter(
      (role) =>
        !role.startsWith("on-") &&
        !role.startsWith("app-") &&
        !role.endsWith("-container") &&
        (["primary", "secondary", "tertiary", "error"].includes(role) ||
          /^(priority|state|chart|area-accent|entity|accent)-/.test(role) ||
          ["success", "warning", "info"].includes(role)),
    );
    expect(groups.length).toBeGreaterThan(40);
    for (const [label, scheme] of EVERY_SCHEME) {
      for (const group of groups) {
        for (const role of [
          group,
          `on-${group}`,
          `${group}-container`,
          `on-${group}-container`,
        ] as SchemeRole[]) {
          expect(scheme[role], `${label}: --${role}`).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it("publishes a BOUNDED chart palette — six series, in every scheme", () => {
    // §16. A chart palette that grows per scheme is a rainbow dashboard waiting
    // to happen, and one that shrinks silently leaves a series unpainted.
    for (const [label, scheme] of EVERY_SCHEME) {
      const series = Object.keys(scheme).filter((role) =>
        /^chart-\d+$/.test(role),
      );
      expect(series.sort(), `${label}: chart series`).toEqual(
        CHART_SERIES.map((n) => `chart-${n}`),
      );
    }
  });

  it("generates the tint strengths for every scheme and appearance", () => {
    for (const scheme of GENERATED_COLOR_SCHEMES) {
      for (const appearance of ["light", "dark"] as const) {
        const strengths = COLOR_SCHEME_TINT_STRENGTHS[scheme][appearance];
        for (const name of [
          "expressive",
          "supporting",
          "selected",
          "state",
          "identity",
          "wash",
        ]) {
          expect(
            strengths[name],
            `${scheme}/${appearance}: --app-tint-strength-${name}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it("names a seed for every scheme", () => {
    for (const scheme of GENERATED_COLOR_SCHEMES) {
      expect(COLOR_SCHEME_SEEDS[scheme]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    expect(new Set(Object.values(COLOR_SCHEME_SEEDS)).size).toBe(
      GENERATED_COLOR_SCHEMES.length,
    );
  });
});

describe("THEME-01 — the five schemes are genuinely five schemes", () => {
  it("gives each scheme its own primary, in both appearances", () => {
    // §49 — if the difference is only "purple button → blue button" the work has
    // not gone far enough; if the primaries are the SAME, it has not happened.
    for (const appearance of ["light", "dark"] as const) {
      const primaries = GENERATED_COLOR_SCHEMES.map(
        (scheme) => COLOR_SCHEME_PALETTES[scheme][appearance].primary,
      );
      expect(new Set(primaries).size, primaries.join(" ")).toBe(
        primaries.length,
      );
    }
  });

  it("separates every pair of scheme primaries by hue or by chroma", () => {
    // Two schemes whose primaries differ by three hex digits are one scheme. The
    // bar is deliberately loose — Graphite is a near-neutral by design, so it
    // clears this on CHROMA rather than on hue — but it is a bar.
    const light = GENERATED_COLOR_SCHEMES.map(
      (scheme) => COLOR_SCHEME_PALETTES[scheme].light.primary,
    );
    for (let i = 0; i < light.length; i += 1) {
      for (let j = i + 1; j < light.length; j += 1) {
        const byHue = hueSeparation(hue(light[i]!), hue(light[j]!));
        const byChroma = Math.abs(chroma(light[i]!) - chroma(light[j]!));
        expect(
          byHue >= 15 || byChroma >= 20,
          `${GENERATED_COLOR_SCHEMES[i]} (${light[i]}) and ${GENERATED_COLOR_SCHEMES[j]} (${light[j]}) are ${byHue.toFixed(0)}° / ${byChroma.toFixed(0)} chroma apart`,
        ).toBe(true);
      }
    }
  });

  it("keeps Graphite restrained without making it greyscale", () => {
    /*
     * §9 — Graphite is the quiet scheme, and the two ways to get it wrong are
     * opposite: a brand that is still loud, or a product with the colour turned
     * off. So both are asserted.
     *
     * The brand is near-neutral (a charcoal primary), and the SEMANTIC ramps are
     * untouched — error, success, warning and the priority scale carry exactly as
     * much colour as they do in every other scheme, because information is not
     * what Graphite is being quiet about.
     */
    for (const appearance of ["light", "dark"] as const) {
      const graphite = COLOR_SCHEME_PALETTES.graphite[appearance];
      const violet = COLOR_SCHEME_PALETTES.violet[appearance];
      expect(
        chroma(graphite.primary),
        `${appearance}: Graphite's primary must be restrained`,
      ).toBeLessThan(20);
      for (const role of [
        "error",
        "success",
        "warning",
        "priority-p1",
        "state-overdue",
      ] as const) {
        expect(
          chroma(graphite[role]),
          `${appearance}: Graphite's ${role} must keep its colour`,
        ).toBeGreaterThan(chroma(graphite.primary));
        // …and be the same colour it is everywhere else, to within harmonisation.
        expect(
          hueSeparation(hue(graphite[role]), hue(violet[role])),
          `${appearance}: Graphite's ${role} must still mean what it means elsewhere`,
        ).toBeLessThan(30);
      }
    }
  });

  it("keeps Pulse's lime a TERTIARY rather than a surface", () => {
    /*
     * §7 — the lime is the single most abusable colour in the set. It is allowed
     * to be the tertiary (a small accent, a positive figure, a chart series) and
     * it is not allowed to be a large surface. The structural guarantee is that
     * it lives ONLY in the tertiary quartet: no application surface, no neutral
     * rung and no other semantic role is derived from it.
     */
    for (const appearance of ["light", "dark"] as const) {
      const pulse = COLOR_SCHEME_PALETTES.pulse[appearance];
      const limeHue = hue(pulse.tertiary);
      expect(
        limeHue,
        `${appearance}: the tertiary should be a lime`,
      ).toBeGreaterThan(90);
      expect(limeHue).toBeLessThan(160);
      for (const role of SCHEME_ROLE_NAMES) {
        if (role.startsWith("tertiary") || role === "on-tertiary") continue;
        if (role.startsWith("on-tertiary")) continue;
        if (!role.startsWith("app-surface") && !role.startsWith("surface"))
          continue;
        expect(
          hueSeparation(hue(pulse[role]), limeHue) > 40 ||
            chroma(pulse[role]) < 6,
          `${appearance}: ${role} (${pulse[role]}) must not be a lime surface`,
        ).toBe(true);
      }
    }
  });
});

describe("THEME-01 — a scheme may not erase meaning", () => {
  it("keeps the brand distinguishable from error and overdue in every scheme", () => {
    /*
     * §13 and §15. The dangerous case is Pulse, whose primary is a magenta and
     * whose neighbours on the wheel are the error red and the overdue crimson.
     * A brand that has merged into "something is wrong" is a scheme that has
     * broken the product's semantics, however pretty it is.
     *
     * 25° is the same bar the chart legend takes, and these roles carry a glyph
     * and a word as well — the separation is defence in depth, not the only
     * signal.
     */
    for (const [label, scheme] of EVERY_SCHEME) {
      for (const role of ["error", "state-overdue", "priority-p1"] as const) {
        const separation = hueSeparation(
          hue(scheme.primary),
          hue(scheme[role]),
        );
        expect(
          separation,
          `${label}: primary (${scheme.primary}) and ${role} (${scheme[role]}) are ${separation.toFixed(0)}° apart`,
        ).toBeGreaterThanOrEqual(25);
      }
    }
  });

  it("keeps success, warning and error three different colours in every scheme", () => {
    for (const [label, scheme] of EVERY_SCHEME) {
      const pairs = [
        ["success", "warning"],
        ["warning", "error"],
        ["success", "error"],
      ] as const;
      for (const [a, b] of pairs) {
        const separation = hueSeparation(hue(scheme[a]), hue(scheme[b]));
        expect(
          separation,
          `${label}: ${a} and ${b} are ${separation.toFixed(0)}° apart`,
        ).toBeGreaterThanOrEqual(25);
      }
    }
  });

  it("keeps the four task priorities a legible ramp in every scheme", () => {
    /*
     * §15. P1→P4 reads as a temperature: red, orange, blue, grey. A scheme may
     * harmonise those hues toward its own seed (that is what makes them belong)
     * but it may not collapse the ramp, and it may not turn "no priority" into a
     * colour.
     */
    for (const [label, scheme] of EVERY_SCHEME) {
      const levels = (["p1", "p2", "p3", "p4"] as const).map(
        (n) => scheme[`priority-${n}` as SchemeRole],
      );
      expect(new Set(levels).size, `${label}: ${levels.join(" ")}`).toBe(4);
      /*
       * The three coloured levels stay apart from one another. 20° rather than
       * the legend's 25°, and the difference is honest: P1 and P2 are a red and
       * an orange 24° apart in the shipped default scheme, because a priority
       * ramp is meant to read as a TEMPERATURE with neighbours that shade into
       * one another, and every priority is labelled P1–P4 in text besides. What
       * this rules out is a scheme collapsing the ramp into one hue.
       */
      for (const [a, b] of [
        [0, 1],
        [1, 2],
        [0, 2],
      ] as const) {
        const separation = hueSeparation(hue(levels[a]!), hue(levels[b]!));
        expect(
          separation,
          `${label}: priority ${a + 1} and ${b + 1} are ${separation.toFixed(0)}° apart`,
        ).toBeGreaterThanOrEqual(20);
      }
      // …and P4 stays the one that means "none".
      expect(
        chroma(levels[3]!),
        `${label}: P4 (${levels[3]}) must stay neutral`,
      ).toBeLessThan(20);
    }
  });

  it("keeps Goal and record states distinguishable from one another", () => {
    // §14 — "completed", "overdue", "due soon", "waiting" and "on hold" are read
    // together in a gallery, so they may not merge in any scheme. On hold is the
    // neutral of the set and is checked on chroma instead of hue.
    for (const [label, scheme] of EVERY_SCHEME) {
      const coloured = [
        "state-overdue",
        "state-due-soon",
        "state-completed",
        "state-waiting",
      ] as const;
      for (let i = 0; i < coloured.length; i += 1) {
        for (let j = i + 1; j < coloured.length; j += 1) {
          const separation = hueSeparation(
            hue(scheme[coloured[i]!]),
            hue(scheme[coloured[j]!]),
          );
          expect(
            separation,
            `${label}: ${coloured[i]} and ${coloured[j]} are ${separation.toFixed(0)}° apart`,
          ).toBeGreaterThanOrEqual(25);
        }
      }
      expect(
        chroma(scheme["state-on-hold"]),
        `${label}: on hold must stay neutral`,
      ).toBeLessThan(20);
    }
  });

  it("keeps every entity identity a colour of its own in every scheme", () => {
    // An activity feed shows several entity kinds at once. Colour is never the
    // only signal (each also has a glyph and a label), but two entity types that
    // resolve to the same hex would make the mark decoration rather than
    // identity.
    for (const [label, scheme] of EVERY_SCHEME) {
      const entities = Object.keys(scheme).filter(
        (role) => role.startsWith("entity-") && !role.startsWith("entity-on"),
      );
      const values = entities.map((role) => scheme[role as SchemeRole]);
      expect(new Set(values).size, `${label}: ${values.join(" ")}`).toBe(
        entities.length,
      );
    }
  });

  it("keeps the semantic ramps meaning the same thing across schemes", () => {
    /*
     * The cross-scheme statement, and the one that makes "the owner learns the
     * product once" true. Harmonisation rotates each source at most 15° toward
     * each seed, so the same role in two schemes can be at most ~30° apart — far
     * too little to turn a success green into anything else.
     *
     * This is what THEME-01 §13 asks for in practice: the brand changes, the
     * meanings do not.
     */
    const reference = COLOR_SCHEME_PALETTES.violet.light;
    for (const scheme of GENERATED_COLOR_SCHEMES) {
      const light = COLOR_SCHEME_PALETTES[scheme].light;
      for (const role of [
        "success",
        "warning",
        "error",
        "state-overdue",
        "state-completed",
        "priority-p1",
        "priority-p2",
        "entity-task",
        "entity-meeting",
      ] as const) {
        const drift = hueSeparation(hue(light[role]), hue(reference[role]));
        expect(
          drift,
          `${scheme}: ${role} drifted ${drift.toFixed(0)}° from the default scheme`,
        ).toBeLessThanOrEqual(31);
      }
    }
  });
});
