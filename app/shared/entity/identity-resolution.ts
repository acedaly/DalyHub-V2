/**
 * IDENTITY-01 — the ONE identity resolver.
 *
 * A record's identity is a colour SLOT and an icon KEY, and until this module
 * existed each surface worked them out for itself: the gallery card folded a
 * rank one way, the tile's docstring described a different rule, and a Goal had
 * no identity of its own at all. Two surfaces disagreeing about what colour a
 * Project is is not a styling bug — it is the product telling the owner two
 * different things about the same record.
 *
 * So every surface that paints identity — the tile, the progress bar, the chart
 * line, the Area pill and dot, the entity chip — resolves through here and
 * nowhere else.
 *
 * ── The precedence, for every entity type ───────────────────────────────────
 *
 *   1. the record's OWN stored choice          (`colourSlot` / `iconKey`)
 *   2. the record's OWN derived colour         (`colourRank`, folded over six)
 *   3. the identity it INHERITS                (a Goal's Area)
 *   4. the neutral container / the entity's default glyph
 *
 * Colour and icon walk that ladder INDEPENDENTLY: a Goal that chose a heart but
 * no colour keeps the heart and takes its Area's colour, which is the
 * combination the reference actually draws.
 *
 * ── Two rules that are decisions, not implementation details ────────────────
 *
 * **A Project uses its OWN rank, never its Area's.** REDESIGN-03/#130 decided
 * this for the progress bar; the tile's docstring still described Area
 * inheritance, so a Project could sit a red flame above a violet bar. The
 * disagreement is fixed HERE rather than in either component, which is the only
 * way it cannot come back.
 *
 * **The derived fallback folds over SIX slots, not sixteen.** Widening it would
 * repaint every existing unchosen Area and Project in one release. Sixteen slots
 * are reachable by choice; six remain the deterministic default
 * (`DERIVED_IDENTITY_SLOTS`).
 *
 * ── Unrecognised stored values fall back; they never throw ──────────────────
 * A slot or a key this build does not know renders as though nothing was chosen.
 * That case is real rather than theoretical — a row restored from an older
 * export, a slot retired in a later release — and a record that will not render
 * is far worse than one wearing its default.
 */

import {
  identityForRank,
  isIdentityColourSlot,
  type IdentityColourSlot,
} from "~/kernel/entities/identity-colour-slots";

import type { EntityType } from "./identity";

/** What a caller knows about one record's identity, straight from the loader. */
export type IdentitySource = {
  /** The record's own stored colour slot, or `null` for "no choice". */
  readonly colourSlot?: string | null;
  /** The record's own stored icon key, or `null` for "no choice". */
  readonly iconKey?: string | null;
  /**
   * The record's own stable 0-based rank in its workspace (ADR-068 §5), or
   * `null` when it has none — which is what a Goal has, and what a Project with
   * no Area used to be given.
   */
  readonly colourRank?: number | null;
  /**
   * The identity this record INHERITS when it has none of its own — a Goal's
   * Area. Resolved recursively, so an Area's own choice reaches its Goals.
   */
  readonly inherited?: IdentitySource | null;
};

/** A record's resolved identity: one slot, one glyph, for every surface. */
export type ResolvedIdentity = {
  /**
   * The colour slot every surface paints from, or `null` for the NEUTRAL
   * container. Neutral is a real outcome, not a failure: a Project with no Area
   * and no choice gets a colour that means nothing rather than a colour that
   * means something it does not mean.
   */
  readonly slot: IdentityColourSlot | null;
  /**
   * The chosen icon key, or `null` for the entity's default glyph. Passed
   * through unvalidated: `RecordIcon` owns the key→drawing fallback, and
   * duplicating that decision here would give the product two of them.
   */
  readonly iconKey: string | null;
};

/** The colour half of the ladder. */
function resolveSlot(source: IdentitySource): IdentityColourSlot | null {
  if (isIdentityColourSlot(source.colourSlot)) {
    return source.colourSlot;
  }
  if (source.colourRank !== null && source.colourRank !== undefined) {
    return identityForRank(source.colourRank);
  }
  return source.inherited ? resolveSlot(source.inherited) : null;
}

/** The glyph half of the ladder, walked independently of the colour. */
function resolveIconKey(source: IdentitySource): string | null {
  if (typeof source.iconKey === "string" && source.iconKey.length > 0) {
    return source.iconKey;
  }
  return source.inherited ? resolveIconKey(source.inherited) : null;
}

/** Resolve one record's identity. The only place this decision is made. */
export function resolveIdentity(source: IdentitySource): ResolvedIdentity {
  return { slot: resolveSlot(source), iconKey: resolveIconKey(source) };
}

/**
 * The DOM attribute that carries a resolved slot to the stylesheet.
 *
 * `data-identity` is set ONCE, on the outermost element that owns the record —
 * the card, the row, the tile — and the four role custom properties
 * (`--dh-identity`, `-tint`, `-edge`, `-soft`) are inherited by everything
 * inside it. That is what makes "one hue per record" structural rather than a
 * convention every component has to remember: a card's bar and its tile CANNOT
 * disagree, because they read the same inherited properties.
 *
 * A `null` slot emits no attribute at all, so the element keeps the neutral
 * defaults `:root` publishes.
 */
export function identityAttribute(
  slot: IdentityColourSlot | null,
): { readonly "data-identity"?: IdentityColourSlot } {
  return slot === null ? {} : { "data-identity": slot };
}
