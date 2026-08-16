/**
 * Reading a chosen identity colour out of a submitted form, at the trusted
 * boundary.
 *
 * `entity-icon-field.ts`'s sibling, and deliberately identical in shape: the
 * argument for validating the vocabulary HERE, at the one place an untrusted
 * value crosses into the product, is the same argument, and two boundary readers
 * that behave differently would be worse than one that is duplicated.
 *
 * `colour_slot` is stored in an UNCONSTRAINED column (migration 0042) because
 * the authoritative vocabulary lives in `identity-colour-slots.ts` rather than
 * in a CHECK that would need a migration every time the ramp changes. The whole
 * bargain depends on this reader.
 *
 * The distinction it exists to preserve is "not chosen" versus "chosen badly".
 * `normaliseIdentityColourSlot` folds both to `null`, which is right for storage
 * and wrong for a form: a route that normalises a hostile value to `null` and
 * saves happily tells the owner their choice was accepted, then shows them the
 * derived colour. The owner concludes the feature is broken, and no test catches
 * it because nothing failed. So an unrecognised value is REFUSED and named, and
 * only a genuine absence becomes `null`.
 *
 * A field the form never submitted is also `null` — a create form without a
 * colour control, or an edit form saving unrelated fields, must not be read as
 * "clear the colour". Callers that need "clear it" send the field explicitly
 * empty, which is how the picker's Automatic option works.
 */

import {
  isRejectedIdentityColourSlot,
  normaliseIdentityColourSlot,
  type IdentityColourSlot,
} from "~/kernel/entities/identity-colour-slots";

/** The message an owner sees when a submitted slot is not one this build knows. */
export const IDENTITY_COLOUR_FIELD_ERROR =
  "That colour isn’t available. Choose one from the list.";

export type IdentityColourFieldResult =
  | { readonly ok: true; readonly colourSlot: IdentityColourSlot | null }
  | { readonly ok: false; readonly message: string };

/**
 * Read and validate the colour field of a submitted form.
 *
 * Returns `{ ok: true, colourSlot: null }` when the field is absent or empty
 * (Automatic / no choice), `{ ok: true, colourSlot }` for a slot in the
 * vocabulary, and `{ ok: false }` for anything else — never a silent `null`.
 */
export function readIdentityColourField(
  form: FormData,
  field = "colourSlot",
): IdentityColourFieldResult {
  const raw = form.get(field);

  // Absent entirely: this form does not carry a colour. Not a clear, not an
  // error.
  if (raw === null) return { ok: true, colourSlot: null };

  // A File would be an `<input type="file">` posing as the colour field. It is
  // not a slot, and `String(file)` would produce "[object File]" and then be
  // refused for the wrong reason — so reject it as what it is.
  if (typeof raw !== "string") {
    return { ok: false, message: IDENTITY_COLOUR_FIELD_ERROR };
  }

  if (isRejectedIdentityColourSlot(raw)) {
    return { ok: false, message: IDENTITY_COLOUR_FIELD_ERROR };
  }
  return { ok: true, colourSlot: normaliseIdentityColourSlot(raw) };
}
