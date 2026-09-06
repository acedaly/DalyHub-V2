/**
 * DS-01 — the DalyHub semantic token registry.
 *
 * `app/styles/tokens.css` holds the authoritative VALUES; this module publishes
 * the NAMES, so TypeScript can reference them and so the test suite has a list
 * to check the stylesheet against in both directions.
 *
 * Both directions matter, and the second one is the point. Checking that every
 * published name is defined catches a typo. Checking that every `--dh-` name
 * defined in the stylesheet is PUBLISHED is what stops the layer growing an
 * unpublished vocabulary — which is precisely how the token system this
 * replaces (ADR-074 Decision 8) turned into 219 names nobody had agreed to.
 *
 * The layering, from the bottom up:
 *
 *   --md-sys-*   Material's machinery: generated colour, typescale, shape,
 *   --md-app-*   elevation, state, motion, and the application surface ramp.
 *   --app-*      Structural values M3 does not own: spacing, sizing, z-index,
 *                breakpoints, shell measurements.
 *   --dh-*       THE DALYHUB DESIGN SYSTEM. What a component reaches for.
 *
 * A component written from DS-02 onward consumes the top layer. The layers
 * below it are implementation, and DS-08 is the stage that decides how much of
 * them is left.
 */

/** The colour vocabulary — surfaces, text, borders, accent, status. */
export const DALYHUB_COLOR_TOKEN_NAMES = [
  "dh-color-bg",
  "dh-color-bg-sunken",
  "dh-color-surface",
  "dh-color-surface-subtle",
  "dh-color-surface-raised",
  "dh-color-surface-quiet",
  "dh-color-surface-nav",
  "dh-color-surface-bar",
  "dh-color-surface-selected",
  "dh-color-surface-expressive",
  "dh-color-text-on-expressive",
  "dh-color-surface-supporting",
  /*
   * The rail's own seven. FINAL-UI made the rail near-white in light (the three
   * approved concepts draw it that way) and it stays near-black in dark, so its
   * foregrounds are chosen against ITS surface rather than borrowed from the
   * appearance around it — which is what lets a component paint on the rail and
   * be right in both without knowing which one it is in.
   */
  "dh-color-rail",
  "dh-color-rail-text",
  "dh-color-rail-text-muted",
  "dh-color-rail-text-selected",
  "dh-color-rail-border",
  "dh-color-rail-selected",
  "dh-color-rail-focus",
  "dh-color-text",
  "dh-color-text-muted",
  "dh-color-text-on-accent",
  "dh-color-text-on-accent-subtle",
  "dh-color-text-on-danger",
  "dh-color-overlay",
  "dh-color-text-on-overlay",
  "dh-color-border",
  "dh-color-border-strong",
  "dh-color-divider",
  "dh-color-accent",
  "dh-color-accent-subtle",
  "dh-color-danger",
  "dh-color-success",
  "dh-color-warning",
  "dh-color-info",
  "dh-color-overdue",
  "dh-color-danger-subtle",
  "dh-color-text-on-danger-subtle",
  "dh-color-warning-subtle",
  "dh-color-text-on-warning-subtle",
  "dh-color-success-subtle",
  "dh-color-text-on-success-subtle",
  "dh-color-info-subtle",
  "dh-color-text-on-info-subtle",
  "dh-color-state-completed",
  "dh-color-state-completed-subtle",
  "dh-color-text-on-completed-subtle",
  "dh-color-state-waiting",
  "dh-color-state-waiting-subtle",
  "dh-color-text-on-waiting-subtle",
  "dh-color-state-on-hold",
  "dh-color-state-on-hold-subtle",
  "dh-color-text-on-hold-subtle",
  "dh-color-state-due-soon",
  "dh-color-state-due-soon-subtle",
  "dh-color-state-overdue-subtle",
  "dh-color-entity-meeting",
  "dh-color-entity-area",
  "dh-color-entity-goal",
  "dh-color-entity-habit",
  "dh-color-entity-project",
  "dh-color-entity-task",
  "dh-color-entity-note",
  "dh-color-entity-asset",
  "dh-color-entity-obligation",
  "dh-color-entity-review",
  "dh-color-entity-person",
  "dh-color-entity-diary",
  /*
   * V2.12 — ONE Finance accent. `finance_transaction` has no token of its own
   * and borrows this one (ADR-120 decision 2): the accent space is held to a
   * ΔE 10 perceptibility floor in both appearances, and the lightest entity in
   * the product is the last thing that should spend a hue.
   */
  "dh-color-entity-finance_account",
  "dh-color-accent-violet",
  "dh-color-accent-blue",
  "dh-color-accent-green",
  "dh-color-accent-amber",
  "dh-color-accent-teal",
  "dh-color-accent-coral",
  "dh-color-area-1",
  "dh-color-area-2",
  "dh-color-area-3",
  "dh-color-area-4",
  "dh-color-area-5",
  "dh-color-area-6",
  "dh-color-area-1-subtle",
  "dh-color-area-2-subtle",
  "dh-color-area-3-subtle",
  "dh-color-area-4-subtle",
  "dh-color-area-5-subtle",
  "dh-color-area-6-subtle",
  "dh-color-text-on-area-1-subtle",
  "dh-color-text-on-area-2-subtle",
  "dh-color-text-on-area-3-subtle",
  "dh-color-text-on-area-4-subtle",
  "dh-color-text-on-area-5-subtle",
  "dh-color-text-on-area-6-subtle",
  /*
   * POLISH-01 — the meter pair. A progress fill answers "how is this going?",
   * so it is painted from the STATUS ramp rather than from the record's
   * identity; see `~/shared/progress/meter-status`.
   */
  "dh-color-meter-track",
  "dh-color-meter-neutral",
  "dh-color-meter-success",
  "dh-color-meter-info",
  "dh-color-meter-warning",
  "dh-color-meter-danger",
  /**
   * MOBILE-02 §4 — the Task row's swipe affordance. Named apart from the meter
   * ramp because it states what releasing WILL DO rather than how something is
   * going; see the block in `tokens.css`.
   */
  "dh-color-swipe-rest",
  "dh-color-swipe-complete",
  "dh-color-swipe-schedule",
  "dh-color-focus",
  "dh-color-scrim",
] as const;

/**
 * IDENTITY-01 — a record's identity, as four inherited roles.
 *
 * Four names, not sixty-four. The sixteen SLOTS are attribute values
 * (`data-identity="teal"`), and `tokens.css` maps the chosen slot onto these
 * four properties once, on the element that owns the record. Everything inside
 * it inherits them, so a card's tile and its progress bar read the same colour
 * by construction rather than by convention.
 *
 * With no `data-identity` in scope these resolve to the NEUTRAL container — a
 * designed outcome for a record that has no identity to show, not a missing
 * value.
 */
export const DALYHUB_IDENTITY_TOKEN_NAMES = [
  /** The hue itself: glyph, progress fill, chart line, chip icon. */
  "dh-identity",
  /** The identity tile's fill — a whisper of the hue over the card. */
  "dh-identity-tint",
  /** The tile's 1px border. */
  "dh-identity-edge",
  /** Pill fills and progress tracks. */
  "dh-identity-soft",
] as const;

/** The 4px spacing scale, under DalyHub's own name. */
export const DALYHUB_SPACE_TOKEN_NAMES = [
  "dh-space-0",
  "dh-space-px",
  "dh-space-1",
  "dh-space-2",
  "dh-space-3",
  "dh-space-4",
  "dh-space-5",
  "dh-space-6",
  "dh-space-8",
  "dh-space-10",
  "dh-space-12",
  "dh-space-16",
] as const;

/** Corner radii, ordered by how much a surface is allowed to say. */
export const DALYHUB_RADIUS_TOKEN_NAMES = [
  "dh-radius-sm",
  "dh-radius-control",
  "dh-radius-md",
  "dh-radius-lg",
  "dh-radius-xl",
  "dh-radius-pill",
] as const;

/**
 * Overlay geometry — the sizes of the layers that float above a page.
 *
 * One member so far: the width of a contextual detail panel. It is a design
 * value in its own right rather than a reuse of a page-width token, because the
 * two answer different questions and drifted apart the moment either was
 * measured against the references.
 */
export const DALYHUB_OVERLAY_TOKEN_NAMES = ["dh-detail-panel-width"] as const;

/**
 * DHDS-09 — the LAYER vocabulary: which floating surfaces speak over which.
 *
 * Six names ordered by authority, aliasing the `--app-z-*` machinery scale. A
 * floating surface names one of these; it never reaches for the scale beneath,
 * and it never writes a bare number. The full taxonomy the ordering expresses
 * lives in `docs/design/DHDS_09_FLOATING_SURFACES_AND_CONTEXTUAL_CHOICE_2026_08.md`.
 */
export const DALYHUB_LAYER_TOKEN_NAMES = [
  "dh-layer-sticky",
  "dh-layer-scrim",
  "dh-layer-drawer",
  "dh-layer-modal",
  "dh-layer-anchored",
  "dh-layer-toast",
  "dh-layer-tooltip",
] as const;

/** Borders, depth and the focus indicator. */
export const DALYHUB_SURFACE_TOKEN_NAMES = [
  "dh-border-width",
  "dh-border-width-strong",
  "dh-elevation-flat",
  "dh-elevation-raised",
  "dh-elevation-overlay",
  "dh-elevation-modal",
  "dh-focus-width",
  "dh-focus-offset",
  "dh-focus-color",
] as const;

/**
 * The type ROLES, each a size / line-height / weight triple.
 *
 * REDESIGN-03 added the two the ladder was missing, and their absence is why
 * the card families were still reading Material's typescale directly: a card
 * TITLE and a METRIC are both real jobs in this product, neither had a DalyHub
 * role, and `--md-sys-typescale-title-medium-*` / `-headline-small-*` were
 * filling the gap on `.dh-pcard`, `.dh-acard` and every stat tile.
 *
 *   card-title  a record card's name — 15px/600, one rung under a section
 *               heading. Material's `title-medium` is 16px, and that extra
 *               pixel is what wrapped "Consolidate every household…" onto a
 *               second line in the Projects gallery and left the grid's rows
 *               ragged.
 *   metric      a figure meant to be read as a figure — 24px/600, tabular.
 *               Replaces a mix of `title-large` (22px) and `headline-small`
 *               (24px) that differed by surface rather than by meaning.
 */
export const DALYHUB_TEXT_ROLES = [
  "page-title",
  "record-title",
  "section-title",
  "card-title",
  "metric",
  "display",
  "lead",
  "compact-title",
  "body",
  "row",
  "meta",
  "label",
] as const;

/** A DalyHub type role. */
export type DalyhubTextRole = (typeof DALYHUB_TEXT_ROLES)[number];

/** The three facets every type role defines. */
export const DALYHUB_TEXT_FACETS = ["size", "line-height", "weight"] as const;

/** Typography: the two families, the seven roles, and the numeric request. */
export const DALYHUB_TYPOGRAPHY_TOKEN_NAMES = [
  "dh-font-family",
  "dh-font-family-mono",
  "dh-font-numeric",
  ...DALYHUB_TEXT_ROLES.flatMap((role) =>
    DALYHUB_TEXT_FACETS.map((facet) => `dh-text-${role}-${facet}`),
  ),
  "dh-text-body-tracking",
  "dh-text-meta-tracking",
  "dh-text-label-tracking",
  "dh-text-display-tracking",
  "dh-text-label-strong-weight",
] as const;

/** Interaction-state opacity roles shared by every interactive surface. */
export const DALYHUB_STATE_TOKEN_NAMES = [
  "dh-state-hover-opacity",
  "dh-state-focus-opacity",
  "dh-state-pressed-opacity",
  "dh-state-disabled-content-opacity",
  "dh-state-disabled-container-opacity",
] as const;

/**
 * DHDS-08 — durations, periods and easings, named for what they are FOR.
 *
 * Five transition rungs, all inside 90–260ms; two loop PERIODS, which are a
 * different quantity from a transition length and are deliberately kept out of
 * the ramp; four curves that genuinely differ from one another. The full
 * rationale and the motion hierarchy the rungs serve live in
 * `docs/design/DHDS_08_MOTION_AND_INTERACTION_GRAMMAR_2026_08.md`.
 */
export const DALYHUB_MOTION_TOKEN_NAMES = [
  "dh-motion-none",
  "dh-motion-instant",
  "dh-motion-fast",
  "dh-motion-base",
  "dh-motion-deliberate",
  "dh-motion-exit",
  "dh-motion-spinner",
  "dh-motion-shimmer",
  "dh-motion-travel",
  "dh-motion-travel-modal",
  "dh-motion-scale",
  "dh-ease-standard",
  "dh-ease-enter",
  "dh-ease-exit",
  "dh-ease-emphasized",
] as const;

/**
 * The density-dependent tokens — and the WHOLE of them.
 *
 * Every preset defines exactly this set: no more (a token only some presets
 * define is a token only some components can rely on) and no fewer (a preset
 * that omits one inherits the previous rung's value, which is a preset that
 * silently is not one). Both halves are asserted.
 */
export const DALYHUB_DENSITY_TOKEN_NAMES = [
  "dh-control-height",
  "dh-menu-item-height",
  "dh-row-height",
  "dh-inset-inline",
  "dh-inset-block",
  "dh-surface-padding",
  "dh-control-gap",
  "dh-icon-size",
] as const;

/**
 * The three densities, in order from tightest to loosest.
 *
 * `default` is what a document gets with no `data-dh-density` attribute at all,
 * it is both a named preset and the base. `compact` is desktop-only in effect:
 * on a coarse pointer its hit areas are floored back to the touch minimum by
 * `tokens.css`, unconditionally.
 */
export const DALYHUB_DENSITIES = ["compact", "default", "touch"] as const;

/**
 * DS-03 — the SHELL's own measurements.
 *
 * Deliberately a separate list from the density tokens above, and the separation
 * is the contract rather than filing. A density token is a preference: three
 * presets define all eight of them and a region may declare its own. A shell
 * measurement is a product decision about the one frame the application has, so
 * it belongs to nobody's preset — asserted by `dalyhub-tokens.test.ts`, which
 * requires each density block to define exactly the eight names above.
 */
export const DALYHUB_SHELL_TOKEN_NAMES = [
  "dh-shell-rail-width",
  "dh-shell-rail-width-collapsed",
  "dh-shell-bar-height",
  "dh-shell-mobile-bar-height",
  "dh-shell-nav-row-height",
  "dh-shell-gutter",
  "dh-shell-content-max-width",
] as const;

/**
 * DS-03 — the display cutout insets.
 *
 * The one definition MOBILE-01 consolidated 53 scattered `env()` calls into,
 * published in the vocabulary a component reaches for. Each is always a length
 * (the `0px` fallback is inherited from `--app-safe-area-*`), so they compose
 * inside `calc()` and `max()` on every browser — including the desktop ones
 * where the environment variable does not exist at all.
 */
export const DALYHUB_SAFE_AREA_TOKEN_NAMES = [
  "dh-safe-top",
  "dh-safe-right",
  "dh-safe-bottom",
  "dh-safe-left",
] as const;

/** A DalyHub density name. */
export type DalyhubDensity = (typeof DALYHUB_DENSITIES)[number];

/** The density a document has when it declares none. */
export const DEFAULT_DENSITY: DalyhubDensity = "default";

/** Every published `--dh-*` token name, without the leading `--`. */
export const DALYHUB_TOKEN_NAMES: readonly string[] = [
  ...DALYHUB_COLOR_TOKEN_NAMES,
  ...DALYHUB_IDENTITY_TOKEN_NAMES,
  ...DALYHUB_SPACE_TOKEN_NAMES,
  ...DALYHUB_RADIUS_TOKEN_NAMES,
  ...DALYHUB_OVERLAY_TOKEN_NAMES,
  ...DALYHUB_LAYER_TOKEN_NAMES,
  ...DALYHUB_SURFACE_TOKEN_NAMES,
  ...DALYHUB_TYPOGRAPHY_TOKEN_NAMES,
  ...DALYHUB_STATE_TOKEN_NAMES,
  ...DALYHUB_MOTION_TOKEN_NAMES,
  ...DALYHUB_DENSITY_TOKEN_NAMES,
  ...DALYHUB_SHELL_TOKEN_NAMES,
  ...DALYHUB_SAFE_AREA_TOKEN_NAMES,
];

/**
 * Build a `var(--dh-…)` reference for a DalyHub token.
 *
 * The name is given without the leading `--`, e.g. `dhVar("dh-space-4")`. Use
 * this rather than a string literal wherever a component genuinely needs an
 * inline token reference, so the name is greppable and checked.
 */
export function dhVar(name: (typeof DALYHUB_TOKEN_NAMES)[number]): string {
  return `var(--${name})`;
}
