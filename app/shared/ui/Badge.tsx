/**
 * DS-02 — the DalyHub Badge.
 *
 * The generic form of what the product has called a "status pill" since M3-01.
 * `StatusPill` (`~/shared/pill`) keeps working and now renders THIS — one
 * object, one stylesheet, two names during the migration.
 *
 * ── What a badge is for, and what it is not ──────────────────────────────────
 *
 * A badge is a small, semantic label for a value drawn from a SMALL CLOSED SET
 * the reader is expected to recognise: a priority, a status, a category, a
 * count. That is the whole list, and it is short on purpose.
 *
 * It is NOT a way to draw attention to ordinary text. A due date, a project
 * name, an owner and a duration are metadata; putting each in a tinted
 * container gives a row six competing objects and no hierarchy — which is what
 * "restrained surfaces" in the DS-02 direction is a reaction to. If the value
 * is free text, or if every row has a different one, it is not a badge.
 *
 * ── Shape ────────────────────────────────────────────────────────────────────
 *
 * Small, `--dh-radius-sm`, `meta` type, and NOT a stadium. A fully-rounded chip
 * at `label-large` inside a 36px row is nearly as tall as the row it annotates;
 * the concept direction draws these at roughly two-thirds that. D13's stadium
 * is reserved for a control, and a badge is not one.
 *
 * ── Colour is never the signal ───────────────────────────────────────────────
 *
 * A badge always says its state in words (AGENTS.md §15), and every tone is a
 * generated container / on-container pair the contrast suite holds at 4.5:1 in
 * both appearances — so a badge cannot exist in a state where its own label is
 * unreadable on it.
 */

import type { ReactNode } from "react";

/**
 * The tones. `neutral` is the default and the absence state — a value that is
 * present but unremarkable. The rest are the semantic roles, and they are the
 * ONLY thing they mean: `danger` is a failure state, not "red", and an Area's
 * identity accent is a different ramp entirely (D21).
 */
export type BadgeTone =
  "neutral" | "accent" | "success" | "warning" | "danger" | "info";

/**
 * `soft` (the default) is a tinted container. `outline` is a hairline with no
 * fill, for a run of several badges where the tints would read as a stripe.
 * There is no `solid`: a filled, saturated badge competes with the one primary
 * action on the surface, which is the thing the accent is spent on.
 */
export type BadgeVariant = "soft" | "outline";

export interface BadgeProps {
  /** The value, in words. Required — a badge never means something by colour. */
  readonly children: ReactNode;
  readonly tone?: BadgeTone;
  readonly variant?: BadgeVariant;
  /**
   * A leading dot, in the tone's own colour. For a status whose vocabulary the
   * reader already knows ("In progress", "On hold"), where the dot is a faster
   * second cue than the tint. Decorative: the label still says it.
   */
  readonly dot?: boolean;
  /** A leading glyph. Decorative. */
  readonly icon?: ReactNode;
  readonly className?: string;
  readonly "data-testid"?: string;
}

export function Badge({
  children,
  tone = "neutral",
  variant = "soft",
  dot,
  icon,
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={["dh-badge", `dh-badge--${variant}`, className]
        .filter(Boolean)
        .join(" ")}
      data-tone={tone}
      {...rest}
    >
      {dot ? <span className="dh-badge__dot" aria-hidden="true" /> : null}
      {icon ? (
        <span className="dh-badge__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
