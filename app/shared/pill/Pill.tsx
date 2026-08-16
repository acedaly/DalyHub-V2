/**
 * DS-14 §1.2/§1.6/§8 — the one pill vocabulary, and the Area identity dot.
 *
 * Two related primitives, in one place because they share a shape and must never
 * drift apart:
 *
 *   StatusPill  a small, fully-rounded label that STATES something in words. Its
 *               `neutral` tone is the ABSENCE state — "No date", "No progress
 *               metric", "Not linked" — which is why absence is a designed
 *               rendering rather than an empty slot, a zeroed bar or a hyphen
 *               (brief §8).
 *
 *   AreaPill    Area identity, carried by a small colour dot (or a dot beside the
 *               Area's name). NEVER a filled card background and never a tinted
 *               row (brief §1.2): identity is a mark on the surface, not the
 *               surface itself.
 *
 * Colour is never the sole carrier of meaning (brief §10). A status pill always
 * says its state in text. An Area dot always has an accessible name, and in every
 * shipped use it sits beside the Area's own title, so the colour is a shortcut
 * for a reader who has seen it before rather than the only way to tell two Areas
 * apart.
 *
 * ROLE COLOURS ARE NOT AREA COLOURS (brief §2). `danger`, `success` and `warning`
 * are reserved for state; the six Area accents are their own ramp and are the
 * only thing an Area is ever painted with.
 */

import type { ReactNode } from "react";

import {
  DERIVED_IDENTITY_SLOTS,
  DERIVED_IDENTITY_SLOT_COUNT,
  identityForRank,
} from "~/kernel/entities/identity-colour-slots";
import {
  identityAttribute,
  resolveIdentity,
} from "~/shared/entity/identity-resolution";
import { Badge, type BadgeTone } from "~/shared/ui/Badge";

/**
 * The pill tones. `neutral` is the absence state and is deliberately first: it is
 * the default a field falls back to when it has no value, not an afterthought.
 *
 * DS-02: this is `BadgeTone`. The alias is kept so the ~40 call sites that
 * annotate a variable with `PillTone` do not all have to change in the PR that
 * introduces the generic name.
 */
export type PillTone = BadgeTone;

export interface StatusPillProps {
  /** The state, in words. Required: a pill never conveys meaning by colour. */
  readonly children: ReactNode;
  /** Defaults to `neutral`, the absence state. */
  readonly tone?: PillTone;
  /**
   * Rendered before the label, for a pill that also carries a glyph. The icon is
   * decorative — the label is what is read.
   */
  readonly icon?: ReactNode;
  readonly className?: string;
}

/**
 * A status pill. Always says its state; `neutral` states an absence.
 *
 * ── DS-02 — this IS the `Badge` ──────────────────────────────────────────────
 *
 * It renders `~/shared/ui`'s `Badge` and keeps `.dh-pill` in the class list, so
 * every existing stylesheet selector, test query and e2e locator that names the
 * pill keeps matching while the product's own surfaces migrate to `Badge`
 * directly. There is one implementation and one set of visual rules; what is
 * left here is a name.
 *
 * New code should import `Badge` from `~/shared/ui`.
 */
export function StatusPill({
  children,
  tone = "neutral",
  icon,
  className,
}: StatusPillProps) {
  return (
    <Badge
      tone={tone}
      icon={icon}
      className={className ? `dh-pill ${className}` : "dh-pill"}
    >
      {children}
    </Badge>
  );
}

/**
 * How many slots the DERIVED identity ramp folds over. Beyond this it wraps
 * (ADR-068 §5).
 *
 * The number itself now lives in the kernel beside the slot vocabulary
 * (`DERIVED_IDENTITY_SLOT_COUNT`); this is the name the ~30 existing call sites
 * and tests already import, re-exported so IDENTITY-01 does not have to move
 * them in the same change that moves the colours.
 */
export const AREA_ACCENT_COUNT = DERIVED_IDENTITY_SLOT_COUNT;

/**
 * The NUMBERED Area accent for a stable rank — 1 to 6.
 *
 * ── IDENTITY-01: this is now a legacy shim, deliberately kept ────────────────
 * Record identity resolves through `resolveIdentity` and is carried by a slot
 * NAME (`data-identity="teal"`), not by an index. What is left reading a number
 * is the set of surfaces IDENTITY-01 was not scoped to convert — the person
 * avatar's ramp, the analytics split bars, the schedule row's source mark — all
 * of which still paint from `--md-sys-color-area-accent-N`. Deleting this would
 * either break them or force a conversion the pass deliberately did not take on
 * (see `docs/md3-inventory.md`).
 *
 * It resolves through `identityForRank`, so the number and the name can never
 * disagree about which slot a rank lands on. Rank, not a hash of the id: with
 * six slots and five Areas, hashing collides about 91% of the time, and a mark
 * whose colours collide almost always is not carrying identity (ADR-068
 * decision 5).
 *
 * Returns 1–6. Negative and non-integer ranks are folded rather than trusted, so
 * a bad caller cannot produce an accent the token layer has no value for.
 */
export function areaAccentForRank(rank: number): number {
  return DERIVED_IDENTITY_SLOTS.indexOf(identityForRank(rank)) + 1;
}

export interface AreaDotProps {
  /** The Area's stable rank in its workspace (0-based). */
  readonly rank: number;
  /** The Area's own chosen colour slot, when it has one. Beats the rank. */
  readonly colourSlot?: string | null;
  /**
   * The Area's name. Used as the dot's accessible name so the mark is never
   * colour-only — pass `decorative` when the name is already adjacent in the
   * same sentence and repeating it would only add noise for a screen reader.
   */
  readonly name: string;
  readonly decorative?: boolean;
  readonly className?: string;
}

/** The Area identity dot. A mark on the surface, never a filled background. */
export function AreaDot({
  rank,
  colourSlot = null,
  name,
  decorative,
  className,
}: AreaDotProps) {
  const { slot } = resolveIdentity({ colourSlot, colourRank: rank });
  return (
    <span
      className={className ? `dh-area-dot ${className}` : "dh-area-dot"}
      {...identityAttribute(slot)}
      {...(decorative
        ? { "aria-hidden": true as const }
        : { role: "img", "aria-label": `Area: ${name}` })}
    />
  );
}

export interface AreaPillProps {
  readonly rank: number;
  /** The Area's own chosen colour slot, when it has one. Beats the rank. */
  readonly colourSlot?: string | null;
  readonly name: string;
  readonly className?: string;
}

/** An Area's name in its own identity hue, on that hue's soft fill. */
export function AreaPill({
  rank,
  colourSlot = null,
  name,
  className,
}: AreaPillProps) {
  const { slot } = resolveIdentity({ colourSlot, colourRank: rank });
  return (
    <span
      className={className ? `dh-area-pill ${className}` : "dh-area-pill"}
      {...identityAttribute(slot)}
    >
      <AreaDot rank={rank} colourSlot={colourSlot} name={name} decorative />
      {name}
    </span>
  );
}
