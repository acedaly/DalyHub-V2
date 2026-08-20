/**
 * M3-01 — the shared CIRCULAR PROGRESS primitive.
 *
 * The circular half of M3's progress indicator, and the one the Today
 * dashboard's rings are built from: a 4px stroke, a `secondary-container`
 * track and a `primary` arc, both drawn with the same tokens as the linear
 * form in `progress.css` — so the two never drift apart.
 *
 * ── Why it is hand-rolled SVG ────────────────────────────────────────────────
 * A ring is two circles and one `stroke-dasharray`. That is less code than
 * configuring a charting library, it ships nothing to the browser beyond the
 * markup, and it keeps the product's zero-runtime-dependency posture. It also
 * means the ring is painted with design TOKENS rather than with a library's
 * palette, so it is correct in both appearances by construction.
 *
 * ── Accessibility ───────────────────────────────────────────────────────────
 * The SVG is `role="img"` with a generated text summary, because a ring genuinely
 * carries information (a proportion) rather than decorating a number stated
 * elsewhere. Anything rendered in the centre is `aria-hidden`: it repeats the
 * summary, and a screen reader should hear the proportion once.
 *
 * Motion: the arc animates its own length, which `prefers-reduced-motion`
 * disables through the global rule in `base.css` — the ring is still drawn, it
 * simply arrives at its value rather than sweeping to it.
 */

import type { ReactNode } from "react";

export interface ProgressRingProps {
  /** How much of the ring is filled, 0–1. Values outside the range are clamped. */
  readonly value: number;
  /** The accessible sentence describing what the ring shows. Required. */
  readonly label: string;
  /** Outer diameter in pixels. */
  readonly size?: number;
  /** Stroke width in pixels. Defaults to M3's 4px. */
  readonly thickness?: number;
  /**
   * The CSS colour the arc is painted with. Defaults to `primary`; a card that
   * means something else by "full" (a productivity score, an Area's own colour)
   * passes its own token reference.
   */
  readonly color?: string;
  /** Content rendered in the ring's centre. Decorative — it repeats `label`. */
  readonly children?: ReactNode;
}

/** Clamp to the 0–1 the geometry assumes, so bad data cannot draw a broken arc. */
function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function ProgressRing({
  value,
  label,
  size = 120,
  thickness = 4,
  color = "var(--dh-color-accent)",
  children,
}: ProgressRingProps) {
  const fraction = clampFraction(value);
  // The stroke is centred on the path, so the radius has to come in by half of
  // it or the ring is clipped by its own viewBox.
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;

  return (
    <div className="dh-ring" style={{ inlineSize: size, blockSize: size }}>
      <svg
        className="dh-ring__svg"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label={label}
        focusable="false"
      >
        <circle
          className="dh-ring__track"
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          strokeWidth={thickness}
        />
        <circle
          className="dh-ring__arc"
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          /* Start the arc at twelve o'clock rather than at three. */
          transform={`rotate(-90 ${centre} ${centre})`}
        />
      </svg>
      {children === undefined ? null : (
        <div className="dh-ring__centre" aria-hidden="true">
          {children}
        </div>
      )}
    </div>
  );
}
