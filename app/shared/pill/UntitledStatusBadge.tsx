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

import type { BadgeTone } from "~/shared/ui/badge-tone";

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
   * `color` is a tinted container on a rounded RECTANGLE, and it is the default
   * because DalyHub decided that twice with a measurement behind it: a status
   * annotating a 36px row must not be as tall as the row, and at the product's
   * control height a fully-rounded chip is a lozenge. (`ui.css`'s badge block
   * and `~/shared/ui/Badge` both said so; upstream's own default is
   * `pill-color`, and taking it was how the stadium arrived here — by
   * inheritance rather than by a decision.)
   *
   * `modern` is the hairline chip, for a run of several badges where a stripe of
   * tints would read as decoration rather than as state. `pill-color` is
   * upstream's stadium, still available for a surface that genuinely wants one.
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
  type = "color",
  className,
  "data-testid": testId,
}: UntitledStatusBadgeProps) {
  /*
   * UNTITLED-19 — `modern` is a NEUTRAL chip, and upstream means it literally.
   *
   * Two tables back the three types, and they disagree about `modern` in a way
   * that matters:
   *
   *   `Badge`         → `withPillTypes.modern.styles` defines **only** `gray`
   *   `BadgeWithDot`  → `withBadgeTypes.modern.styles` defines every colour,
   *                     each with an EMPTY `root` and a coloured `addon`
   *
   * So the container is neutral in both cases — `bg-primary text-secondary
   * ring-primary` comes from the type's `common` — and colour only ever reaches
   * the DOT. Passing a non-gray colour to a dotless `modern` badge does not
   * produce a coloured one; it reads `styles[color].root` off an object that has
   * no such key and throws. Nothing in the product hit it because every existing
   * `type="modern"` call site happened to pass `tone="neutral"`, which is a
   * latent crash rather than a safe design.
   *
   * `soft`/`outline` mapping onto this is not a compromise: DalyHub's `outline`
   * is documented as "a hairline with no fill, for a run of several badges where
   * the tints would read as a stripe", which is the same sentence upstream's
   * `modern` exists to satisfy. The tone still travels as `data-tone`, and the
   * label still says the state in words (AGENTS.md §15).
   */
  const color = type === "modern" && !dot ? "gray" : TONE_COLOR[tone];
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
  /*
   * UNTITLED-19 — the forced-colours fallback, carried by the badge itself.
   *
   * Upstream draws the badge's boundary with `ring-1 ring-inset`, which Tailwind
   * emits as a `box-shadow` — and forced-colours mode discards box shadows along
   * with the authored tint. Without this the container vanishes entirely and the
   * label is left floating in the surrounding text.
   *
   * `pill.css` used to do this by naming `.dh-pill` in a forced-colours block.
   * That stopped working the moment the drawn object became Untitled's, because
   * the rule set `border-color` on an element with no border WIDTH. A real
   * border, declared where the component is, replaces it.
   */
  const forcedColors =
    "forced-colors:border forced-colors:border-solid forced-colors:border-[CanvasText]";
  const badgeClassName =
    className === undefined ? forcedColors : `${forcedColors} ${className}`;

  const badge = dot ? (
    <UntitledBadgeWithDot
      type={type}
      size={size}
      color={color}
      className={badgeClassName}
    >
      {children}
    </UntitledBadgeWithDot>
  ) : (
    <UntitledBadge
      type={type}
      size={size}
      color={color}
      className={badgeClassName}
    >
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
