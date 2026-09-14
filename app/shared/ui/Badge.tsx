/**
 * DS-02 / UNTITLED-19 — the DalyHub Badge.
 *
 * The generic form of what the product has called a "status pill" since M3-01.
 * `StatusPill` (`~/shared/pill`) renders THIS, so the two names are one object.
 *
 * ── UNTITLED-19 — there is no second badge any more ──────────────────────────
 *
 * This component used to draw itself: `.dh-badge` plus `[data-tone]`, about a
 * hundred and forty lines of container/on-container pairs in `ui.css`. Beside it
 * the product also had `UntitledStatusBadge`, which draws Untitled's genuine
 * `base/badges`. Two generic badges, two paints, two APIs, thirty-nine consumer
 * files between them — the largest remaining place where an engineer could
 * reasonably pick either one and be right.
 *
 * The stated reason for keeping them apart was that "Untitled's badge is a
 * stadium and DalyHub's argument is that a status annotating a 36px row must not
 * be as tall as the row". That reason was WRONG, and checking it is what
 * unblocked this: upstream's `type` has three values, and only `pill-color` is a
 * stadium. `color` and `modern` are `rounded-md` at `py-0.5 px-1.5 text-xs` in
 * `sm` — which is the small, non-stadium chip this file's header has always
 * argued for. `TaskRow` had in fact been shipping `badgeModern` in production
 * the whole time.
 *
 * So the API below is unchanged and the paint underneath it is Untitled's:
 *
 *   variant="soft"     → type="color"   a tinted container, rounded rectangle
 *   variant="outline"  → type="modern"  a hairline with no fill
 *
 * `dh-badge` is GONE from the markup rather than kept as a hook. The rules it
 * named are deleted, but `pill.css` and `ui.css` are unlayered, so a class that
 * ever regains a rule would paint straight over the Untitled badge — and an
 * empty class name is an invitation to put a rule back. `StatusPill` still emits
 * `.dh-pill`, which several journeys assert the ABSENCE of, and that class keeps
 * no rules for the same reason.
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
 * ── Colour is never the signal ───────────────────────────────────────────────
 *
 * A badge always says its state in words (AGENTS.md §15). Upstream's colour
 * pairs carry the contrast guarantee now, and the product's own axe suite — 105
 * tests over rendered pages, in both appearances — is what holds them to it,
 * which is a stronger check than the token-level one it replaces because it
 * measures what the browser actually painted.
 *
 * ── The `icon` prop is gone ──────────────────────────────────────────────────
 *
 * It had zero call sites: `StatusPill` forwarded it and no `StatusPill` in the
 * product passed one. Upstream ships `BadgeWithIcon` for the day something
 * needs it, which is a better answer than a slot nothing filled.
 */

import type { ReactNode } from "react";

import { UntitledStatusBadge } from "~/shared/pill/UntitledStatusBadge";

import type { BadgeTone, BadgeVariant } from "./badge-tone";

export type { BadgeTone, BadgeVariant } from "./badge-tone";

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
  readonly className?: string;
  readonly "data-testid"?: string;
}

export function Badge({
  children,
  tone = "neutral",
  variant = "soft",
  dot = false,
  className,
  "data-testid": testId,
}: BadgeProps) {
  return (
    <UntitledStatusBadge
      tone={tone}
      dot={dot}
      size="sm"
      type={variant === "outline" ? "modern" : "color"}
      className={className}
      data-testid={testId}
    >
      {children}
    </UntitledStatusBadge>
  );
}
