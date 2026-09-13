/**
 * DS-10 Feedback platform — small decorative glyphs.
 *
 * UNTITLED-15 — these were six hand-drawn inline SVGs, kept in-house because
 * PX-02's in-house icon set was the product's answer at the time. They are the
 * most generic icons in the whole application — a tick in a circle, a warning
 * triangle, a cross in a circle, an "i" in a circle, a close ✕ and a spinner —
 * and `@untitledui/icons` draws every one of them. A generic UI icon with a
 * bespoke drawing is the definition of what the icon convergence exists to
 * remove.
 *
 * All are `aria-hidden` — tone is ALSO carried by text and shape, never by
 * colour alone, so a colour-blind or screen-reader user loses nothing. The sizes
 * (18px, and 16px for close) and the `className` contract are unchanged, so no
 * call site or stylesheet moved.
 */

import {
  AlertTriangle,
  CheckCircle,
  InfoCircle,
  Loading01,
  XCircle,
  XClose,
} from "@untitledui/icons";

import type { NotificationKind } from "./types";

type GlyphProps = { readonly className?: string };

const SIZE = 18;

export function KindIcon({
  kind,
  className,
}: {
  readonly kind: NotificationKind;
  readonly className?: string;
}) {
  const Glyph =
    kind === "success"
      ? CheckCircle
      : kind === "warning"
        ? AlertTriangle
        : kind === "error"
          ? XCircle
          : InfoCircle;
  return (
    <Glyph
      width={SIZE}
      height={SIZE}
      className={className}
      aria-hidden="true"
      focusable="false"
    />
  );
}

export function CloseGlyph({ className }: GlyphProps) {
  return (
    <XClose
      width={16}
      height={16}
      className={className}
      aria-hidden="true"
      focusable="false"
    />
  );
}

export function Spinner({ className }: GlyphProps) {
  // The visual spin is CSS (and is disabled under prefers-reduced-motion, where
  // the accompanying "Working…" text carries the meaning), so this is the static
  // arc upstream draws and the stylesheet turns it.
  return (
    <Loading01
      width={SIZE}
      height={SIZE}
      className={className}
      aria-hidden="true"
      focusable="false"
    />
  );
}
