/**
 * M3-01 — the STRUCTURAL tokens that survived the Material Design 3 overhaul,
 * under the names they survived it with.
 *
 * Spacing, sizing, z-index, breakpoints and the shell's own measurements
 * describe how much room a thing takes, not which design language it belongs
 * to, so M3 neither supplies nor constrains them. They kept their values and
 * moved from `--dh-*` to `--app-*` when the alias layer was deleted.
 *
 * Everything else the old system defined — every colour, every radius, every
 * duration, the whole density vocabulary — is gone rather than renamed, and
 * `tokens.test.ts` guards the zero.
 *
 * Three of the original 44 were renamed by the visual-polish work, because the
 * shell they measure changed shape and the old names described the old shape:
 *
 *   app-gutter               -> app-page-padding{,-desktop,-tablet,-mobile}
 *   app-shell-nav-width      -> app-shell-navigation-width
 *   app-shell-header-height  -> app-shell-topbar-height (the DESKTOP top app
 *                               bar, which did not exist before; the phone bar
 *                               it used to name is now
 *                               app-shell-mobilebar-height)
 *
 * They are removed from the list below rather than kept as aliases: this file
 * records what survived under its ORIGINAL name, and an alias layer is the
 * thing ADR-074 spent a milestone deleting.
 */

/** The 41 structural survivors, alphabetically. */
export const LEGACY_STRUCTURAL_TOKEN_NAMES: readonly string[] = [
  "app-border-width-thick",
  "app-border-width-thin",
  "app-bottomnav-bar-height",
  "app-bottomnav-height",
  "app-breakpoint-2xl",
  "app-breakpoint-lg",
  "app-breakpoint-md",
  "app-breakpoint-sm",
  "app-breakpoint-xl",
  "app-control-height-lg",
  "app-control-height-md",
  "app-control-height-sm",
  "app-inspector-width",
  "app-keyboard-inset",
  "app-space-0",
  "app-space-1",
  "app-space-10",
  "app-space-12",
  "app-space-16",
  "app-space-2",
  "app-space-3",
  "app-space-4",
  "app-space-5",
  "app-space-6",
  "app-space-8",
  "app-space-px",
  "app-touch-target-min",
  "app-width-content",
  "app-width-dashboard",
  "app-width-narrow",
  "app-width-prose",
  "app-width-wide",
  "app-z-base",
  "app-z-drawer",
  "app-z-dropdown",
  "app-z-modal",
  "app-z-overlay",
  "app-z-raised",
  "app-z-sticky",
  "app-z-toast",
  "app-z-tooltip",
];
