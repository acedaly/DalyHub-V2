/**
 * THEME-01 — the theme preview swatch.
 *
 * A small, purely decorative rendering of what a theme looks like: its page
 * background, an elevated card on it, the accent, the text ramp, and a progress
 * sample. Settings shows one per option so the owner picks a LOOK rather than a
 * name.
 *
 * ── Why this component reads theme colours as DATA ────────────────────────────
 * Everywhere else in DalyHub, a component consumes semantic tokens and inherits
 * whichever theme is active — that is the whole point of the token layer. A preview
 * is the one genuine exception: it must paint the COASTAL palette while DALY DARK is
 * the active theme, and CSS custom properties cascade from `:root[data-theme]`, so
 * there is no way to inherit a theme you are not in.
 *
 * So the preview writes a handful of `--dh-preview-*` custom properties inline, read
 * from `THEME_COLOR_MAPS` (the same data a sync test pins to `tokens.css`). This is
 * NOT theme-conditional rendering: the markup and the class names are identical for
 * every theme, only the six property values differ, and no other component may do
 * this. If a preview colour ever disagrees with the stylesheet, the token sync test
 * fails.
 *
 * The swatch is `aria-hidden`: it carries no information the option's own name and
 * description do not already state in text, which keeps the picker usable when
 * colour is unavailable (screen reader, forced colours, monochrome).
 */

import type { CSSProperties } from "react";

import { THEME_COLOR_MAPS } from "~/shared/tokens";

import { resolveThemeId, type ThemePreference } from "./theme";

/** The colours a preview needs, as CSS custom properties for one theme. */
function previewStyle(preference: ThemePreference): CSSProperties {
  // `system` has no palette of its own; preview the theme it resolves to in light
  // appearance, which is what the option's description already says it does.
  const colors = THEME_COLOR_MAPS[resolveThemeId(preference)];
  return {
    "--dh-preview-bg": colors.bg,
    "--dh-preview-card": colors["surface-card"],
    "--dh-preview-border": colors.border,
    "--dh-preview-accent": colors.accent,
    "--dh-preview-text": colors.text,
    "--dh-preview-muted": colors["text-muted"],
    "--dh-preview-track": colors["progress-track"],
    "--dh-preview-fill": colors["progress-fill"],
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
