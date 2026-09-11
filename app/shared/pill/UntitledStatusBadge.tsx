/**
 * UNTITLED-04 — the DalyHub status badge, drawn with the genuine Untitled
 * `base/badges` source.
 *
 * DalyHub speaks in TONES (`neutral`, `accent`, `success`, `warning`, `danger`,
 * `info`) because a status is a semantic role in this product, never a colour:
 * `danger` is a failure state, and an Area's identity accent is a different ramp
 * entirely (D21). Untitled's badges speak in COLOURS. This component is the one
 * place the two vocabularies meet, so a migrated surface reaches a real Untitled
 * badge without every module inventing its own mapping — and so the semantic
 * rule "purple is brand, green is positive, red is destructive, amber is
 * attention" is stated once.
 *
 * The label is always the meaning. The dot and the tint are reinforcement, which
 * is why `children` is required and why nothing here is conveyed by colour alone
 * (AGENTS.md §15).
 *
 * `StatusPill` (`~/shared/pill`) remains the legacy drawing for surfaces that
 * have not migrated; both read the same tone vocabulary, so a module swaps one
 * for the other without restating what its statuses mean.
 */

import type { ReactNode } from "react";

import {
  Badge as UntitledBadge,
  BadgeWithDot as UntitledBadgeWithDot,
} from "~/shared/ui/untitled/base/badges/badges";
import type { BadgeColors } from "~/shared/ui/untitled/base/badges/badge-types";

import type { BadgeTone } from "~/shared/ui/Badge";

/**
 * The tone → Untitled colour table.
 *
 * `accent` is the BRAND colour and nothing else is: Branded Plum is identity and
 * interaction, so a status badge only ever reaches for it when the status IS the
 * product's own accent state. Every other row is the ordinary semantic ramp.
 */
const TONE_COLOR: Record<BadgeTone, BadgeColors> = {
  neutral: "gray",
  accent: "brand",
  success: "success",
  warning: "warning",
  danger: "error",
  info: "blue",
};

export interface UntitledStatusBadgeProps {
  /** The status, in words. Required — a badge never means something by colour. */
  readonly children: ReactNode;
  readonly tone?: BadgeTone;
  /**
   * A leading dot, in the tone's own colour, for a status vocabulary the reader
   * already knows ("On hold", "At risk"). Decorative.
   */
  readonly dot?: boolean;
  readonly size?: "sm" | "md" | "lg";
  /**
   * `pill-color` is Untitled's default rounded tint. `modern` is the hairline
   * chip, for a run of several badges where a stripe of tints would read as
   * decoration rather than as state.
   */
  readonly type?: "pill-color" | "color" | "modern";
  readonly className?: string;
  readonly "data-testid"?: string;
}

export function UntitledStatusBadge({
  children,
  tone = "neutral",
  dot = false,
  size = "sm",
  type = "pill-color",
  className,
  "data-testid": testId,
}: UntitledStatusBadgeProps) {
  const color = TONE_COLOR[tone];
  /*
   * `className` goes on the BADGE, not on the wrapper.
   *
   * The wrapper is `display: contents` — it has no box, so a caller's class on
   * it can be neither measured nor positioned. `.record-status` on the record
   * header is exactly that case: `record-anatomy.spec.ts` asks whether the
   * status sits beside the title, and a zero-sized rect answers "no" whatever
   * the screen shows. Untitled's `Badge` takes `className`, so the class lands
   * on the drawn object where a caller means it to be.
   */
  const badge = dot ? (
    <UntitledBadgeWithDot
      type={type}
      size={size}
      color={color}
      className={className}
    >
      {children}
    </UntitledBadgeWithDot>
  ) : (
    <UntitledBadge type={type} size={size} color={color} className={className}>
      {children}
    </UntitledBadge>
  );

  /*
   * The wrapper carries DalyHub's own hook — `data-dh-badge` plus the tone —
   * which product tests and journeys address as the stable way to ask "what
   * state is this row in?". It is `display: contents`, so it adds no box and the
   * Untitled badge remains the drawn object; upstream's `Badge` takes a
   * `className` but spreads no arbitrary props, and editing the vendored file
   * would be undone by the next `scripts/vendor-untitled.mjs` run.
   *
   * Deliberately NOT `dh-badge`: `pill.css` is unlayered, so that class name
   * would paint the legacy chip's own background, ring and padding straight over
   * the Untitled badge — unlayered CSS beats a layered utility whatever their
   * specificity. A migrated component never borrows a legacy class that still
   * has rules attached to it.
   */
  return (
    <span
      className="contents"
      data-dh-badge="true"
      data-tone={tone}
      data-untitled-source="base/badges"
      {...(testId === undefined ? {} : { "data-testid": testId })}
    >
      {badge}
    </span>
  );
}
