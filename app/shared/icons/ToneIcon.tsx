/**
 * UIX-01 — the tonal icon TILE.
 *
 * The reference design's most recognisable device: a small rounded square in a
 * soft accent, holding one line glyph in that accent's own colour. It is what
 * makes a row of glance widgets, a run of compact Goal cards or a list of
 * Projects readable before a single word of it is.
 *
 * ── Why this is not `AccentIcon` ─────────────────────────────────────────────
 *
 * `AccentIcon` (`~/shared/entity`) is the ENTITY identity mark: it draws a
 * record's own glyph inside the colour of the Area it belongs to, and its
 * accent is inherited from stored data — never chosen at the call site. That
 * rule is what stops entity colour becoming decoration, and it is unchanged.
 *
 * This tile is the other half: a surface that is not a record — the day's
 * progress, "tasks due today", a Goal's measurement — and therefore has no
 * Area to inherit from. Its tone is a DECLARED identity from the fixed
 * vocabulary below, so a call site still cannot invent a colour; it can only
 * pick one of six names whose meaning the design system publishes.
 *
 * Both draw the same geometry at the same generated strength (see
 * `icons.css`), so a Project mark and a widget tile read as the same object.
 *
 * The tile is DECORATIVE and `aria-hidden`: nothing in DalyHub is conveyed by
 * icon or colour alone (AGENTS.md §15), so every surface that uses one also
 * carries the label in text.
 */

import type { ReactNode } from "react";

/**
 * The widget accent vocabulary, mirroring the generated `accent-*` ramp.
 *
 * The names are hues rather than meanings on purpose. A meaning-named token
 * ("progress", "attention") drifts the moment a second surface wants the same
 * colour for a different reason, and it invites the one confusion the design
 * system most wants to prevent: identity read as status.
 */
export const TONE_NAMES = [
  "coral",
  "blue",
  "violet",
  "green",
  "amber",
  "teal",
  // UIX-02 — added with the record-identity ramp, which needed a sixth hue
  // clear of the scheme's alarm band (see `IDENTITY_HUES` in the generator).
  // A widget may declare it like any other.
  "cyan",
] as const;

export type ToneName = (typeof TONE_NAMES)[number];

/**
 * A stable tone for an arbitrary key, so a surface with no stored identity is
 * still consistent between renders, sessions and devices.
 *
 * Deterministic from the id, never random and never derived from a title's
 * WORDS — "Weight loss" must not be green because it says "weight". A record
 * that HAS a stored identity (an Area's colour rank) uses that instead and
 * never comes here.
 */
export function toneForKey(key: string): ToneName {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 100_000;
  }
  return TONE_NAMES[hash % TONE_NAMES.length]!;
}

export type ToneIconProps = {
  /** The declared identity. Omitted paints the product's own violet. */
  readonly tone?: ToneName;
  /** `md` (40px, the default) or `sm` (32px, for a compact row). */
  readonly size?: "sm" | "md";
  /** The glyph — any shared icon. */
  readonly children: ReactNode;
  readonly className?: string;
};

export function ToneIcon({
  tone,
  size = "md",
  children,
  className,
}: ToneIconProps) {
  return (
    <span
      className={["dh-tone dh-tone-icon", className].filter(Boolean).join(" ")}
      data-tone={tone}
      data-size={size}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}
