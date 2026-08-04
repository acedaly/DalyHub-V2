/**
 * BRAND-01 — the DalyHub brand mark.
 *
 * A standalone module, deliberately. Every glyph in `icons.tsx` is produced by a
 * top-level `createIcon(...)` call, which a bundler cannot prove is side-effect
 * free, so importing one icon from that module pulls all ninety into the chunk.
 * The offline shell — the one document that has to work with no connection —
 * needs the brand mark and nothing else, so the mark lives here and costs what
 * the mark costs. `icons.tsx` re-exports it, so `~/shared/icons` still answers
 * "where is the brand mark" and no existing import path changed.
 *
 * ── What it draws ────────────────────────────────────────────────────────────
 * The white "D" with its connected three-node network, in the approved
 * blue-to-teal gradient. The geometry is GENERATED from
 * `scripts/icons/geometry.mjs` — the same source the favicon, the Apple touch
 * icon and every PWA icon are rasterised from — so the sidebar glyph and the
 * home-screen icon are the same drawing rather than two drawings that resemble
 * each other. `pnpm run icons:check` fails if they drift.
 *
 * The TILE is omitted. A 22%-rounded square at the rail's 28 px reads as a
 * smudge, with the mark inside it barely a few pixels across; the bare glyph on
 * the page canvas stays legible. `/design/app-icon` renders it at 20, 28, 48 and
 * 96 px so that claim is looked at rather than assumed.
 *
 * ── Why it does not take `currentColor` ──────────────────────────────────────
 * It is the one mark in the product that must look the SAME on every theme. The
 * gradient is a fixed brand value; both of its ends clear 3:1 against the
 * lightest and darkest page canvases DalyHub ships, which
 * `test/unit/pwa/manifest-and-icons.test.ts` measures.
 *
 * Decorative by default, exactly like the rest of the icon set: every surface
 * that shows it also writes "DalyHub" beside it, so an accessible name here
 * would make a screen reader say the product name twice. Pass `title` on the
 * rare surface where the mark stands alone.
 */

import { useId } from "react";

import {
  BRAND_GRADIENT,
  BRAND_MARK_SHAPES,
  BRAND_MARK_VIEWBOX,
} from "./brand-mark.generated";
import type { IconProps } from "./Icon";

export function BrandMark({ size = "1em", title, ...rest }: IconProps) {
  // One gradient definition per instance. `useId` keeps two marks on the same
  // document from colliding on a hard-coded id, which would make the second one
  // silently reference the first one's paint server — and break the moment that
  // first one unmounts.
  const gradientId = `dh-brand-mark-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const accessible = title !== undefined;
  return (
    <svg
      viewBox={BRAND_MARK_VIEWBOX}
      width={size}
      height={size}
      className="dh-icon dh-brand-mark"
      role={accessible ? "img" : undefined}
      aria-hidden={accessible ? undefined : true}
      aria-label={accessible ? title : undefined}
      focusable="false"
      {...rest}
    >
      {accessible ? <title>{title}</title> : null}
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={BRAND_GRADIENT.x1}
          y1={BRAND_GRADIENT.y1}
          x2={BRAND_GRADIENT.x2}
          y2={BRAND_GRADIENT.y2}
        >
          {BRAND_GRADIENT.stops.map((stop) => (
            <stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={stop.colour}
            />
          ))}
        </linearGradient>
      </defs>
      {BRAND_MARK_SHAPES.map((shape, index) =>
        shape.kind === "disc" ? (
          <circle
            key={index}
            cx={shape.cx}
            cy={shape.cy}
            r={shape.r}
            fill={`url(#${gradientId})`}
          />
        ) : (
          <path
            key={index}
            d={shape.d}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={shape.width}
            strokeLinecap="round"
          />
        ),
      )}
    </svg>
  );
}
BrandMark.displayName = "BrandMark";
