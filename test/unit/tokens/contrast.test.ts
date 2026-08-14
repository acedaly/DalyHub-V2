/**
 * M3-01 / THEME-01 — WCAG 2.2 contrast over every generated scheme, in BOTH
 * appearances.
 *
 * The schemes are derived, not authored, so the interesting question is no longer
 * "did someone pick a readable grey?" but "does the algorithm's output clear AA
 * everywhere the product actually paints?". These tests answer it for every pair
 * that carries text or a meaningful UI boundary: 4.5:1 for text, 3:1 for
 * non-text UI (AGENTS.md §15).
 *
 * THEME-01 multiplied the surface being checked by five, and the multiplication
 * is the point rather than a chore. A scheme whose primary button passes and
 * whose selected navigation row does not is not "mostly fine" — it is a scheme
 * the owner can choose and then cannot read (THEME-01 §31), and the only cheap
 * way to know is to assert all ten combinations exhaustively.
 *
 * Values come from `app/shared/tokens/scheme.ts`, which the generator writes
 * alongside `tokens.css` and `tokens.test.ts` proves identical to it — so a pass
 * here is a statement about what the browser paints.
 */

import { describe, expect, it } from "vitest";

import {
  COLOR_SCHEME_PALETTES,
  COLOR_SCHEME_TINT_STRENGTHS,
  GENERATED_COLOR_SCHEMES,
  type GeneratedColorScheme,
  type SchemeColorMap,
  type SchemeRole,
} from "~/shared/tokens";

/** Parse a `#rrggbb` hex string to [r, g, b] in 0–255. */
function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance of an sRGB colour. */
function relativeLuminance(hex: string): number {
  const channels = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio between two colours (1–21). */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The system colour groups that emit a full `on-*` / container quartet. */
const SYSTEM_GROUPS = [
  "primary",
  "secondary",
  "tertiary",
  "error",
] as const satisfies readonly SchemeRole[];

/** Every custom colour, which emits the same quartet. */
const CUSTOM_GROUPS = [
  "success",
  "warning",
  "info",
  "priority-p1",
  "priority-p2",
  "priority-p3",
  "priority-p4",
  "state-overdue",
  "state-due-soon",
  "state-completed",
  "state-waiting",
  "state-on-hold",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "area-accent-1",
  "area-accent-2",
  "area-accent-3",
  "area-accent-4",
  "area-accent-5",
  "area-accent-6",
  "entity-area",
  "entity-goal",
  "entity-project",
  "entity-task",
  "entity-note",
  "entity-meeting",
  "entity-person",
  "entity-asset",
  "entity-diary",
  "entity-review",
  // UIX-01 — the widget accent ramp. Same quartet, same guarantees.
  "accent-coral",
  "accent-blue",
  "accent-violet",
  "accent-green",
  "accent-amber",
  "accent-teal",
  // UIX-02 — the sixth RANKED identity, added so record identity has a hue
  // clear of the scheme's alarm band. Same quartet, same guarantees.
  "accent-cyan",
] as const satisfies readonly SchemeRole[];

/** The decorative widget identities, on their own (UIX-01, +cyan in UIX-02). */
const WIDGET_ACCENTS = [
  "accent-coral",
  "accent-blue",
  "accent-violet",
  "accent-green",
  "accent-amber",
  "accent-teal",
  "accent-cyan",
] as const satisfies readonly SchemeRole[];

/** The seven surfaces the APPLICATION paints with, from the app-neutral palette. */
const APP_SURFACES = [
  "app-surface-page",
  "app-surface-navigation",
  "app-surface-app-bar",
  "app-surface-card",
  "app-surface-card-subtle",
  "app-surface-raised",
  "app-surface-sunken",
] as const satisfies readonly SchemeRole[];

/** Every surface text is rendered on — the system ramp plus every application surface. */
const TEXT_SURFACES = [
  "surface",
  "surface-dim",
  "surface-bright",
  "surface-container-lowest",
  "surface-container-low",
  "surface-container",
  "surface-container-high",
  "surface-container-highest",
  ...APP_SURFACES,
] as const satisfies readonly SchemeRole[];

/**
 * Every scheme in every appearance: `["electric/dark", scheme, "electric",
 * "dark"]`. The label leads so a failure message names the combination before it
 * names the roles.
 */
const SCHEMES = GENERATED_COLOR_SCHEMES.flatMap((scheme) =>
  (["light", "dark"] as const).map(
    (appearance) =>
      [
        `${scheme}/${appearance}`,
        COLOR_SCHEME_PALETTES[scheme][appearance],
        scheme,
        appearance,
      ] as const,
  ),
);

function expectRatio(
  scheme: SchemeColorMap,
  label: string,
  fg: SchemeRole,
  bg: SchemeRole,
  min: number,
) {
  const ratio = contrastRatio(scheme[fg], scheme[bg]);
  expect(
    ratio,
    `${label} — ${fg} (${scheme[fg]}) on ${bg} (${scheme[bg]}) = ${ratio.toFixed(2)}:1, needs ${min}:1`,
  ).toBeGreaterThanOrEqual(min);
}

describe.each(SCHEMES)(
  "M3-01 contrast — %s",
  (label, scheme, key, appearance) => {
    it("meets AA for every on-colour on its own colour", () => {
      for (const group of [...SYSTEM_GROUPS, ...CUSTOM_GROUPS]) {
        expectRatio(scheme, label, `on-${group}` as SchemeRole, group, 4.5);
      }
    });

    it("meets AA for every on-container on its own container", () => {
      for (const group of [...SYSTEM_GROUPS, ...CUSTOM_GROUPS]) {
        expectRatio(
          scheme,
          label,
          `on-${group}-container` as SchemeRole,
          `${group}-container` as SchemeRole,
          4.5,
        );
      }
    });

    it("meets AA for the text ramp on every surface", () => {
      for (const surface of TEXT_SURFACES) {
        expectRatio(scheme, label, "on-surface", surface, 4.5);
        expectRatio(scheme, label, "on-surface-variant", surface, 4.5);
      }
    });

    it("meets AA for the inverse pair a snackbar paints with", () => {
      expectRatio(scheme, label, "inverse-on-surface", "inverse-surface", 4.5);
    });

    it("meets 3:1 for the outline on every surface", () => {
      // `outline` is the boundary of a text field, a segmented button and an
      // outlined chip — a non-text UI component whose PRESENCE carries meaning.
      for (const surface of TEXT_SURFACES) {
        expectRatio(scheme, label, "outline", surface, 3);
      }
    });

    it("meets 3:1 for the focus ring on every surface it is drawn over", () => {
      // The focus indicator is `outline: 2px solid var(--md-sys-color-primary)`,
      // and it is drawn over EVERY application surface — a navigation row, a
      // control in the top app bar, a card, a field in a sunken filter bar.
      for (const surface of [...APP_SURFACES, "surface"] as const) {
        expectRatio(scheme, label, "primary", surface, 3);
      }
    });

    it("meets AA for the selected navigation pairing", () => {
      /*
       * Asserted BY NAME so the pairing cannot drift.
       *
       * M3X returned this to M3's own `secondary-container`; the previous
       * `primary-container` deviation was argued from the founding blue seed, and
       * the violet seed inverts every clause of it — see the full note in
       * `shell.css`.
       *
       * DH-DS then softened the FILL without changing the role: the container is
       * mixed toward the navigation surface, and the label takes the ordinary
       * `on-surface` rather than `on-secondary-container`, because the surface it
       * sits on is now a tinted neutral rather than a container. Both halves are
       * checked below against the mix the browser actually paints.
       *
       * Selection is never colour alone regardless: the pill is a SHAPE, the label
       * steps up a weight, the glyph takes `primary`, and `aria-current` carries it
       * semantically.
       */
      const strength = tintStrength(key, appearance, "selected");
      const selected = mixSrgb(
        scheme["secondary-container"],
        scheme["app-surface-navigation"],
        strength,
      );

      const text = contrastRatio(scheme["on-surface"], selected);
      expect(
        text,
        `${label} — on-surface on the selected row (${selected}) = ${text.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);

      // The glyph is `primary` and is a 24px non-text UI component.
      const glyph = contrastRatio(scheme.primary, selected);
      expect(
        glyph,
        `${label} — primary glyph on the selected row (${selected}) = ${glyph.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);

      // And the pill has to be visible as a shape against the drawer it sits in.
      const pill = contrastRatio(selected, scheme["app-surface-navigation"]);
      expect(
        pill,
        `${label} — the selected pill (${selected}) against the drawer = ${pill.toFixed(2)}:1`,
      ).toBeGreaterThan(1.04);
    });

    /*
     * DS-03 — THE RAIL, which is the one region whose value does not follow the
     * appearance.
     *
     * It is dark in light and dark alike, so nothing about it can be inferred
     * from "this is the light scheme, so text is dark". Every pair it paints is
     * therefore asserted explicitly, in both appearances, for all five schemes —
     * this is precisely the surface where an untested assumption ships as white
     * text on a white rail, or a violet block nobody can read a label on.
     */
    it("meets AA for the rail's own foregrounds", () => {
      const rail = scheme["app-surface-rail"];
      const text = contrastRatio(scheme["app-on-rail"], rail);
      expect(
        text,
        `${label} — on-rail on the rail (${rail}) = ${text.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);

      // The MUTED foreground is what an unselected destination is painted in —
      // thirteen of the fourteen rows, on every screen. It is body text, so it
      // takes the full 4.5 rather than the 3:1 a "secondary" label might be
      // argued into.
      const muted = contrastRatio(scheme["app-on-rail-muted"], rail);
      expect(
        muted,
        `${label} — on-rail-muted on the rail (${rail}) = ${muted.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps the rail DARK in both appearances", () => {
      // The claim the whole design rests on, stated as a number so a future
      // re-tone cannot quietly make the light rail light again. 0.15 relative
      // luminance is comfortably above any near-black and far below any surface
      // that would need dark text on it.
      const luminance = relativeLuminance(scheme["app-surface-rail"]);
      expect(
        luminance,
        `${label} — the rail (${scheme["app-surface-rail"]}) must be dark in EVERY appearance`,
      ).toBeLessThan(0.15);
    });

    it("meets AA for the rail's selected destination", () => {
      /*
       * The current destination is `rail-accent` mixed toward the rail — and
       * `rail-accent` is `primary` in light and `primary-container` in dark,
       * because M3 builds `primary` as a pale tone-80 in dark so that it works
       * as TEXT. Mixing that into a near-black rail produced a pale lavender
       * pill on the first build of this, which is why the role is chosen per
       * appearance in the generator rather than here.
       */
      const strength = tintStrength(key, appearance, "rail-selected");
      const selected = mixSrgb(
        scheme["app-rail-accent"],
        scheme["app-surface-rail"],
        strength,
      );

      const text = contrastRatio(scheme["app-on-rail"], selected);
      expect(
        text,
        `${label} — on-rail on the selected destination (${selected}) = ${text.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);

      /*
       * And it has to read as a BLOCK against the rail it sits in.
       *
       * The floor is 1.5:1 rather than WCAG 1.4.11's 3:1, for the same reason
       * the drawer's selected pill above is floored at 1.04 rather than 3: the
       * fill is not "required to understand the content", because selection is
       * carried FOUR ways and this is one of them — `aria-current` states it
       * semantically, the label steps up a weight, the foreground steps from
       * `on-rail-muted` to `on-rail`, and forced-colours mode replaces the block
       * with the system `Highlight` outright (asserted in `shell.css`).
       *
       * Demanding 3:1 of the fill would demand a selected row roughly as bright
       * as the label on it, which is the saturated slab DH-DS spent a milestone
       * removing from the drawer. 1.5 is well above the drawer's floor and is
       * what the shipped values (1.56–1.71) clear with margin.
       */
      const block = contrastRatio(selected, scheme["app-surface-rail"]);
      expect(
        block,
        `${label} — the selected block (${selected}) against the rail = ${block.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(1.5);
    });

    it("meets 3:1 for the focus ring on the rail, in the rail's own colour", () => {
      /*
       * The rail is NOT in `APP_SURFACES` above — that sweep is over the
       * appearance-following ladder — and it is the reason this test exists
       * separately rather than as one more entry in it.
       *
       * `primary` over the rail measures 2.40–2.42:1 in every scheme, so the
       * product's ONE focus colour fails WCAG 1.4.11 here. `shell.css` overrides
       * `outline-color` to `--dh-color-rail-focus` for the whole region; this
       * asserts the replacement clears 3:1 over BOTH surfaces the ring is drawn
       * over — the rail itself, and the selected block, since the current
       * destination is exactly the row a keyboard user lands on first.
       */
      expectRatio(scheme, label, "app-on-rail", "app-surface-rail", 3);

      const strength = tintStrength(key, appearance, "rail-selected");
      const selected = mixSrgb(
        scheme["app-rail-accent"],
        scheme["app-surface-rail"],
        strength,
      );
      const ring = contrastRatio(scheme["app-on-rail"], selected);
      expect(
        ring,
        `${label} — the rail focus ring on the selected block (${selected}) = ${ring.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    });

    it("meets 3:1 for progress fill against its track", () => {
      expectRatio(scheme, label, "primary", "secondary-container", 3);
      expectRatio(scheme, label, "success", "secondary-container", 3);
    });

    /*
     * M3X-02 — an entity card's bar is painted in the RECORD's own identity
     * accent, over the neutral `surface-sunken` track the gallery draws. Six new
     * fills, and a bar is a non-text UI component whose extent carries meaning, so
     * every one of them owes 3:1 against the track it sits in.
     *
     * The percentage beside the bar is the value in words either way — this is the
     * shape staying legible, not the shape carrying the meaning.
     */
    it("meets 3:1 for every identity progress fill against the gallery track", () => {
      for (const accent of CUSTOM_GROUPS.filter((name) =>
        name.startsWith("area-accent-"),
      )) {
        expectRatio(scheme, label, accent, "app-surface-sunken", 3);
      }
    });

    it("keeps every identity and series colour visible on card and page", () => {
      const marks = CUSTOM_GROUPS.filter(
        (name) =>
          name.startsWith("entity-") ||
          name.startsWith("area-accent-") ||
          name.startsWith("chart-") ||
          name.startsWith("priority-") ||
          name.startsWith("state-"),
      );
      for (const mark of marks) {
        expectRatio(scheme, label, mark, "app-surface-card", 3);
        expectRatio(scheme, label, mark, "app-surface-page", 3);
        // A chart or a progress bar is just as likely to sit inside a nested
        // panel as directly on a card, so the subtle rung is held to the same bar.
        expectRatio(scheme, label, mark, "app-surface-card-subtle", 3);
      }
    });

    it("keeps priority levels distinguishable from one another", () => {
      // Priority is never colour-only (the chip always carries a P1–P4 tag), but
      // when colour IS perceived it must not collapse into one hue.
      const levels = (["p1", "p2", "p3", "p4"] as const).map(
        (n) => scheme[`priority-${n}` as SchemeRole],
      );
      expect(new Set(levels).size).toBe(levels.length);
    });

    it("keeps the chart series distinguishable from one another", () => {
      // A legend is the ONE place in the product where colour genuinely is the
      // signal, so this is a stronger check than "the strings differ": no two
      // series may sit within 25° of hue, measured in HCT-comparable terms via
      // the sRGB hue angle, nor collapse to the same luminance.
      const series = ([1, 2, 3, 4, 5, 6] as const).map(
        (n) => scheme[`chart-${n}` as SchemeRole],
      );
      expect(new Set(series).size).toBe(series.length);
      const hues = series.map((hex) => {
        const [r, g, b] = parseHex(hex).map((v) => v / 255);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max === min) return 0;
        const d = max - min;
        const h =
          max === r
            ? ((g - b) / d) % 6
            : max === g
              ? (b - r) / d + 2
              : (r - g) / d + 4;
        return (((h * 60) % 360) + 360) % 360;
      });
      for (let i = 0; i < hues.length; i += 1) {
        for (let j = i + 1; j < hues.length; j += 1) {
          const raw = Math.abs(hues[i] - hues[j]);
          const separation = Math.min(raw, 360 - raw);
          expect(
            separation,
            `${label} — chart-${i + 1} (${series[i]}) and chart-${j + 1} (${series[j]}) are ${separation.toFixed(0)}° apart`,
          ).toBeGreaterThanOrEqual(25);
        }
      }
    });
  },
);

/* -------------------------------------------------------------------------- */
/* M3X-02 — the COMPOSED surfaces                                             */
/* -------------------------------------------------------------------------- */

/*
 * The expressive layer's tinted surfaces are `color-mix()` over generated roles
 * rather than roles of their own, so they never reach a scheme's colour map and
 * the sweep above cannot see them. They are still surfaces the product paints
 * text on, in every scheme, in both appearances, at strengths that differ by
 * appearance AND (for Pulse) by scheme — which is precisely the combination that
 * produces an unreadable surface if nobody checks. So the mix is reproduced here
 * from its two real inputs: the generated roles, and the generated STRENGTHS.
 *
 * The strengths come from `COLOR_SCHEME_TINT_STRENGTHS`, the same generated
 * mirror the stylesheet's `--app-tint-strength-*` values are written from, rather
 * than from a regex over `tokens.css`. With one scheme, scraping the stylesheet
 * proved the test was reading what the browser reads; with five schemes and
 * fifteen blocks, "the first match is light and the last is dark" stopped being
 * true, and the mirror is proved identical to the stylesheet by `scheme:check`
 * anyway.
 */

/** The generated tint strength for one scheme, appearance and surface. */
function tintStrength(
  scheme: GeneratedColorScheme,
  appearance: "light" | "dark",
  name: string,
): number {
  const value = COLOR_SCHEME_TINT_STRENGTHS[scheme][appearance][name];
  expect(
    value,
    `--app-tint-strength-${name} should be generated for ${scheme}/${appearance}`,
  ).toBeTypeOf("number");
  return value;
}

/** `color-mix(in srgb, top P%, bottom)` — the same operation the browser runs. */
function mixSrgb(top: string, bottom: string, percent: number): string {
  const a = parseHex(top);
  const b = parseHex(bottom);
  const ratio = percent / 100;
  const channel = (index: number) =>
    Math.round(a[index]! * ratio + b[index]! * (1 - ratio))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

describe.each(SCHEMES)(
  "M3X composed surfaces — %s",
  (label, scheme, key, appearance) => {
    it("meets AA for the hero's own text colour on the hero surface", () => {
      const strength = tintStrength(key, appearance, "expressive");
      const surface = mixSrgb(
        scheme["primary-container"],
        scheme["app-surface-card"],
        strength,
      );
      // `--md-app-color-on-surface-expressive` is `on-primary-container`.
      const ratio = contrastRatio(scheme["on-primary-container"], surface);
      expect(
        ratio,
        `${label} — on-primary-container on surface-expressive (${surface}) = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });

    /*
     * UIX-01 — the WASHED widget surface, and the tonal tile on it.
     *
     * A glance widget paints `accent-*-container` at the generated `wash`
     * strength over the card and then prints ordinary neutral text on it, and
     * holds a tile that paints the same container at the `identity` strength with
     * the accent itself as its glyph. None of that is a role pair the palette
     * guarantees, and all of it is composed — the same reason the hero and the
     * identity mark are checked here rather than assumed.
     */
    it("meets AA for ordinary text on every washed widget surface", () => {
      const strength = tintStrength(key, appearance, "wash");
      for (const accent of WIDGET_ACCENTS) {
        const surface = mixSrgb(
          scheme[`${accent}-container` as SchemeRole],
          scheme["app-surface-card"],
          strength,
        );
        for (const role of ["on-surface", "on-surface-variant"] as const) {
          const ratio = contrastRatio(scheme[role], surface);
          expect(
            ratio,
            `${label} — ${role} on the ${accent} wash (${surface}) = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it("keeps every tonal tile's glyph readable on its own tile", () => {
      const strength = tintStrength(key, appearance, "identity");
      for (const accent of WIDGET_ACCENTS) {
        const tile = mixSrgb(
          scheme[`${accent}-container` as SchemeRole],
          scheme["app-surface-card"],
          strength,
        );
        // A glyph is a non-text UI component: WCAG 1.4.11's 3:1, not 4.5:1.
        const ratio = contrastRatio(scheme[accent], tile);
        expect(
          ratio,
          `${label} — ${accent} glyph on its tile (${tile}) = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(3);
      }
    });

    it("meets AA for ordinary text on a supporting surface", () => {
      const strength = tintStrength(key, appearance, "supporting");
      const surface = mixSrgb(
        scheme["primary-container"],
        scheme["app-surface-card"],
        strength,
      );
      // A supporting surface is a tinted NEUTRAL, so it carries the ordinary text
      // ramp — both ends of it, since its eyebrow and supporting line take the
      // variant.
      for (const role of ["on-surface", "on-surface-variant"] as const) {
        const ratio = contrastRatio(scheme[role], surface);
        expect(
          ratio,
          `${label} — ${role} on surface-supporting (${surface}) = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    /*
     * VIS-01 — the identity MARK is composed the same way, and must clear the
     * same bar.
     *
     * `.dh-accent-icon[data-accent]` mixes the Area accent's container toward the
     * card by `--app-tint-strength-identity`, so a gallery of identity marks in
     * DARK is a soft palette rather than a rainbow of saturated rectangles (the
     * design system's Part 2, item A7). The glyph inside keeps the container's own
     * `on-` role, and the whole argument for one mix serving all six ramps is that
     * moving a container toward the card always moves it AWAY from that role.
     * "Always" is a claim, so it is asserted — over every ramp, in both
     * appearances.
     */
    it("meets AA for every identity glyph on its composed identity mark", () => {
      const strength = tintStrength(key, appearance, "identity");
      for (const rank of [1, 2, 3, 4, 5, 6] as const) {
        const surface = mixSrgb(
          scheme[`area-accent-${rank}-container` as SchemeRole],
          scheme["app-surface-card"],
          strength,
        );
        const ratio = contrastRatio(
          scheme[`on-area-accent-${rank}-container` as SchemeRole],
          surface,
        );
        expect(
          ratio,
          `${label} — on-area-accent-${rank}-container on its mark (${surface}) = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("keeps a supporting surface distinguishable from the page behind it", () => {
      // Colour is not the only signal on these surfaces — each carries an eyebrow
      // naming what it is — but a surface whose boundary is invisible has stopped
      // being a level in the hierarchy, which is the whole point of the token.
      const strength = tintStrength(key, appearance, "supporting");
      const surface = mixSrgb(
        scheme["primary-container"],
        scheme["app-surface-card"],
        strength,
      );
      const ratio = contrastRatio(surface, scheme["app-surface-page"]);
      expect(
        ratio,
        `${label} — surface-supporting (${surface}) against the page (${scheme["app-surface-page"]}) = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThan(1.04);
    });
  },
);

describe("contrast helper self-check", () => {
  it("computes the canonical black/white ratio as 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
});
