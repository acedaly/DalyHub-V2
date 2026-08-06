/**
 * THEME-01 — the theme preview swatch.
 *
 * A small, purely decorative rendering of what a theme looks like: its page
 * background, an elevated card on it, the accent, the text ramp, and a progress
 * sample. Settings shows one per option so the owner picks a LOOK rather than a
 * name.
 *
 * ── M3-01: this component is on its way out ───────────────────────────────────
 * DalyHub now ships ONE generated light/dark pair and no theme feature
 * (ADR-074), so there is no longer a palette per option to preview. The
 * component is kept compiling for one more step — the picker is removed from the
 * Settings UI in step 3 and both components are deleted in step 6 — and it now
 * paints the only two schemes that exist: a dark theme id previews the dark
 * scheme, everything else previews the light one.
 *
 * It writes a handful of `--dh-preview-*` custom properties inline because a
 * preview must paint a scheme it is not IN, and custom properties cascade. No
 * other component may do this.
 *
 * The swatch is `aria-hidden`: it carries no information the option's own name and
 * description do not already state in text, which keeps the picker usable when
 * colour is unavailable (screen reader, forced colours, monochrome).
 */

import type { CSSProperties } from "react";

import { DARK_SCHEME, LIGHT_SCHEME } from "~/shared/tokens";

import { resolveThemeId, themeById, type ThemePreference } from "./theme";

/** The colours a preview needs, as CSS custom properties. */
function previewStyle(preference: ThemePreference): CSSProperties {
  const appearance = themeById(resolveThemeId(preference)).appearance;
  const colors = appearance === "dark" ? DARK_SCHEME : LIGHT_SCHEME;
  return {
    "--dh-preview-bg": colors["app-surface-page"],
    "--dh-preview-card": colors["app-surface-card"],
    "--dh-preview-border": colors["outline-variant"],
    "--dh-preview-accent": colors.primary,
    "--dh-preview-text": colors["on-surface"],
    "--dh-preview-muted": colors["on-surface-variant"],
    "--dh-preview-track": colors["secondary-container"],
    "--dh-preview-fill": colors.primary,
  } as CSSProperties;
}

export interface ThemePreviewProps {
  /** The theme (or `system`) this swatch illustrates. */
  readonly preference: ThemePreference;
}

export function ThemePreview({ preference }: ThemePreviewProps) {
  return (
    <span
      className="dh-theme-preview"
      style={previewStyle(preference)}
      aria-hidden="true"
    >
      <span className="dh-theme-preview__nav" />
      <span className="dh-theme-preview__body">
        <span className="dh-theme-preview__card">
          <span className="dh-theme-preview__line dh-theme-preview__line--title" />
          <span className="dh-theme-preview__line dh-theme-preview__line--meta" />
          <span className="dh-theme-preview__progress">
            <span className="dh-theme-preview__progress-fill" />
          </span>
        </span>
        <span className="dh-theme-preview__accent" />
      </span>
    </span>
  );
}
