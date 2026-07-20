/**
 * DS-10 Feedback platform — small decorative glyphs.
 *
 * In-house inline SVGs (no icon dependency, consistent with the PX-02 in-house
 * icon set). All are `aria-hidden` — tone is ALSO carried by text and shape, never
 * by colour alone, so a colour-blind or screen-reader user loses nothing.
 */

import type { NotificationKind } from "./types";

type GlyphProps = { readonly className?: string };

const BASE_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export function KindIcon({
  kind,
  className,
}: {
  readonly kind: NotificationKind;
  readonly className?: string;
}) {
  switch (kind) {
    case "success":
      return (
        <svg {...BASE_PROPS} className={className}>
          <circle cx="10" cy="10" r="7.5" />
          <path d="m6.7 10.2 2.2 2.2 4.4-4.8" />
        </svg>
      );
    case "warning":
      return (
        <svg {...BASE_PROPS} className={className}>
          <path d="M10 2.6 18 16.4H2z" />
          <path d="M10 8v3.4" />
          <path d="M10 14h.01" />
        </svg>
      );
    case "error":
      return (
        <svg {...BASE_PROPS} className={className}>
          <circle cx="10" cy="10" r="7.5" />
          <path d="M12.4 7.6 7.6 12.4" />
          <path d="m7.6 7.6 4.8 4.8" />
        </svg>
      );
    case "info":
    default:
      return (
        <svg {...BASE_PROPS} className={className}>
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 9v4.2" />
          <path d="M10 6.6h.01" />
        </svg>
      );
  }
}

export function CloseGlyph({ className }: GlyphProps) {
  return (
    <svg {...BASE_PROPS} width={16} height={16} className={className}>
      <path d="M5 5l10 10" />
      <path d="M15 5 5 15" />
    </svg>
  );
}

export function Spinner({ className }: GlyphProps) {
  // The visual spin is CSS (and is disabled under prefers-reduced-motion, where
  // the accompanying "Working…" text carries the meaning).
  return (
    <svg {...BASE_PROPS} className={className}>
      <circle cx="10" cy="10" r="7.5" opacity="0.25" />
      <path d="M10 2.5a7.5 7.5 0 0 1 7.5 7.5" />
    </svg>
  );
}
