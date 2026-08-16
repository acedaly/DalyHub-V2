/**
 * The controlled vocabulary of identity colour SLOTS an Area, Project or Goal
 * may carry.
 *
 * This is `entity-icon-keys.ts`'s sibling, deliberately built to the same shape,
 * because it is the same kind of thing: a small closed list that a write
 * boundary validates, a nullable column stores, and the UI resolves to a
 * drawing. Everything that module's comment argues applies here unchanged — so
 * this one records only what is different.
 *
 * WHAT A SLOT IS. A stable NAME: `violet`, `teal`, `brown`. Never a hex, never
 * an `rgb()`, never a CSS colour keyword, never a number, never arbitrary text.
 *
 * WHY A NAME AND NOT A NUMBER. The ramp is a list, and a list gets reordered.
 * `"teal"` survives a reorder and an insertion; `7` silently becomes a different
 * colour on every record that stored it. A number would also invite the two
 * things this vocabulary exists to prevent — an out-of-range index, and the
 * assumption that the storage boundary and the CSS ramp are the same list in the
 * same order forever.
 *
 * WHY A NAME AND NOT A HEX. A hex is unbounded input painted straight onto a
 * page: there is no contrast guarantee for a colour nobody chose, no dark
 * counterpart, and no way to repaint the ramp later without rewriting every
 * stored row. The sixteen slots each publish four contrast-asserted roles in
 * both appearances (`IDENTITY_RAMP`); a stored hex would publish none of them.
 *
 * THE ORDER MATTERS FOR ONE THING ONLY. The first six slots are the DERIVED
 * ramp — what `identityForRank` folds an unchosen record's stable colour rank
 * over — and they are in the order the six shipped accents already used. That is
 * what makes IDENTITY-01 additive rather than a repaint: an Area that never
 * chose a colour keeps the colour it had. Slots 7–16 are reachable BY CHOICE
 * only. See `resolveIdentity` and ADR-097.
 *
 * Slots are append-only in practice, for exactly the reason keys are: removing
 * one does not corrupt anything (an unrecognised stored slot falls back in the
 * UI) but it does silently change what an owner chose.
 */

/** Every identity colour slot, in ramp order. */
export const IDENTITY_COLOUR_SLOTS = [
  // 1–6 — the DERIVED ramp, in the order the six shipped accents already used.
  "violet",
  "green",
  "red",
  "orange",
  "blue",
  "teal",
  // 7–16 — reachable by CHOICE only, so no unchosen record is ever reassigned.
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "amber",
  "lime",
  "emerald",
  "cyan",
  "sky",
  "brown",
] as const;

/** An identity colour slot an Area, Project or Goal may carry. */
export type IdentityColourSlot = (typeof IDENTITY_COLOUR_SLOTS)[number];

/**
 * How many slots the DERIVED fallback folds over.
 *
 * Deliberately six and not sixteen. Widening the fold would give every existing
 * unchosen Area and Project a different colour in one release — the owner's
 * recognition memory silently rewritten, for no gain they asked for. Sixteen
 * slots are reachable by CHOICE; six remain the deterministic default.
 */
export const DERIVED_IDENTITY_SLOT_COUNT = 6;

/** The slots the derived fallback folds over, in rank order. */
export const DERIVED_IDENTITY_SLOTS: readonly IdentityColourSlot[] =
  IDENTITY_COLOUR_SLOTS.slice(0, DERIVED_IDENTITY_SLOT_COUNT);

const IDENTITY_COLOUR_SLOT_SET: ReadonlySet<string> = new Set(
  IDENTITY_COLOUR_SLOTS,
);

/** True when `value` is a slot this build recognises. */
export function isIdentityColourSlot(
  value: unknown,
): value is IdentityColourSlot {
  return typeof value === "string" && IDENTITY_COLOUR_SLOT_SET.has(value);
}

/**
 * Normalise an identity colour slot arriving from an untrusted boundary — a
 * form field, an import, a snapshot.
 *
 * Returns the slot when it is recognised and `null` otherwise. `null` is the
 * meaningful value, not an error: it is what "no chosen colour, derive it from
 * the record's rank" is stored as, and it is what an empty form field means.
 *
 * An unrecognised slot is REJECTED here rather than stored. A slot already IN
 * the database that this build does not recognise is a different case and is
 * handled in the UI, where it falls back to the derived colour rather than
 * throwing — the same split `normaliseEntityIconKey` documents.
 */
export function normaliseIdentityColourSlot(
  value: unknown,
): IdentityColourSlot | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return isIdentityColourSlot(trimmed) ? trimmed : null;
}

/**
 * Whether a non-empty value was supplied that is NOT a valid slot.
 *
 * `normaliseIdentityColourSlot` folds "absent" and "invalid" together into
 * `null`, which is right for storage and wrong for validation: a form that
 * silently discards a bad value tells the owner their choice was saved when it
 * was not. A write path that wants to REFUSE a bad slot asks this first.
 */
export function isRejectedIdentityColourSlot(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value !== "string") {
    return true;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && !isIdentityColourSlot(trimmed);
}

/**
 * The DERIVED slot for a record's stable rank in its workspace (ADR-068 §5).
 *
 * Rank, not a hash of the id: with six slots and five Areas, hashing collides
 * about 91% of the time, and a mark whose colours collide almost always is not
 * carrying identity. Negative and non-integer ranks are folded rather than
 * trusted, so a bad caller cannot produce a slot the ramp has no value for.
 */
export function identityForRank(rank: number): IdentityColourSlot {
  if (!Number.isFinite(rank)) return DERIVED_IDENTITY_SLOTS[0];
  const whole = Math.trunc(rank);
  const folded =
    ((whole % DERIVED_IDENTITY_SLOT_COUNT) + DERIVED_IDENTITY_SLOT_COUNT) %
    DERIVED_IDENTITY_SLOT_COUNT;
  return DERIVED_IDENTITY_SLOTS[folded];
}
