/**
 * THEME-01 — the colour-scheme registry (owner-facing presentation).
 *
 * The persisted CONTRACT — which values are legal, how a stored or cookie value
 * is parsed, and how the first-paint cookie is serialised — lives in the kernel
 * (`app/kernel/preferences/color-scheme.ts`), because the colour scheme is a real
 * owner preference. This module adds the part that is a design-system concern:
 * what each scheme is CALLED and how it is described.
 *
 * Everything from the kernel contract is re-exported here, so Settings and the
 * tests have one import site and there is still exactly one scheme list in the
 * codebase.
 *
 * ── TERMINOLOGY IS FIXED ─────────────────────────────────────────────────────
 * The control is "Colour scheme". Not "Theme": a theme would reasonably be
 * expected to change typography, spacing, component shapes, layout or motion, and
 * a colour scheme changes none of those. Not "Palette" either — that is what the
 * generator produces, not what the owner picks. The choices are "Daly Violet",
 * "Electric", "Pulse", "Ocean" and "Graphite", and each is DalyHub's own name for
 * DalyHub's own palette.
 *
 * ── The preview is a token reference, never a hex ────────────────────────────
 * A descriptor does NOT carry colours. Settings has to preview a scheme it is not
 * currently painting, which no `var(--md-sys-color-primary)` can do, so the
 * generator emits every scheme's three preview colours into every block as
 * `--md-app-color-preview-<key>-{primary,secondary,tertiary}`. The picker reads
 * those, which keeps this module free of authored colour (AGENTS.md §9.8) and the
 * previews correct in light and dark alike.
 */

import {
  COLOR_SCHEMES,
  type ColorScheme,
} from "~/kernel/preferences/color-scheme";

export {
  COLOR_SCHEMES,
  COLOR_SCHEME_COOKIE_MAX_AGE,
  COLOR_SCHEME_COOKIE_NAME,
  DEFAULT_COLOR_SCHEME,
  isColorScheme,
  isSecureColorSchemeEnvironment,
  parseColorSchemePreference,
  readColorSchemePreference,
  serializeColorSchemeCookie,
  type ColorScheme,
} from "~/kernel/preferences/color-scheme";

/** The user-facing name of the setting itself. Used as the group/legend label. */
export const COLOR_SCHEME_LABEL = "Colour scheme";

/** One scheme's owner-facing presentation. */
export interface ColorSchemeDescriptor {
  /** The stored value, and the `<html data-color-scheme>` value. */
  readonly value: ColorScheme;
  /** The visible scheme name. */
  readonly label: string;
  /** One short sentence, in plain Australian English, for the Settings row. */
  readonly description: string;
}

/**
 * The five schemes, in presentation order: the default first, then the two
 * expressive schemes, then the cool one, then the quiet one.
 *
 * The descriptions say what the scheme FEELS like and, where it matters, where
 * its colour actually goes — an owner choosing between five swatch rows is
 * choosing a mood, and three dots cannot say "and the working surfaces stay
 * neutral".
 */
export const COLOR_SCHEME_OPTIONS: readonly ColorSchemeDescriptor[] = [
  {
    value: "violet",
    label: "Daly Violet",
    description:
      "DalyHub's own violet. Personal, warm and unmistakably this app.",
  },
  {
    value: "electric",
    label: "Electric",
    description:
      "Cobalt blue with violet and magenta accents, over a deep blue-black shell.",
  },
  {
    value: "pulse",
    label: "Pulse",
    description:
      "Magenta and plum over dark neutrals, with lime kept for small detail.",
  },
  {
    value: "ocean",
    label: "Ocean",
    description: "Royal blue, teal and cyan on cool slate. Calm and focused.",
  },
  {
    value: "graphite",
    label: "Graphite",
    description:
      "Charcoal and slate. The quietest scheme — statuses stay in full colour.",
  },
];

const OPTIONS_BY_VALUE: ReadonlyMap<ColorScheme, ColorSchemeDescriptor> =
  new Map(COLOR_SCHEME_OPTIONS.map((option) => [option.value, option]));

/**
 * The display name for a scheme. Used wherever the current choice is stated in
 * words rather than only shown as a selected control.
 */
export function colorSchemeLabel(scheme: ColorScheme): string {
  return OPTIONS_BY_VALUE.get(scheme)?.label ?? "Daly Violet";
}

/** The descriptor for a scheme. Total for a typed value. */
export function colorSchemeOption(scheme: ColorScheme): ColorSchemeDescriptor {
  const option = OPTIONS_BY_VALUE.get(scheme);
  if (option === undefined) {
    // Unreachable for a typed value; keeps the accessor total at runtime.
    throw new Error(`unknown colour scheme: ${scheme}`);
  }
  return option;
}

/**
 * The three roles a preview swatch shows, in order. They are the three colours a
 * scheme's personality actually lives in — what a button is, what a supporting
 * container is, and what the expressive accent is — rather than a strip of the
 * whole ramp, which would tell the owner nothing they can act on.
 */
export const COLOR_SCHEME_PREVIEW_SLOTS = [
  "primary",
  "secondary",
  "tertiary",
] as const;

/**
 * A guard the tests use to prove the presentation registry and the kernel value
 * set cannot drift: every legal scheme has exactly one descriptor.
 */
export const COLOR_SCHEME_OPTION_VALUES: readonly ColorScheme[] = COLOR_SCHEMES;
