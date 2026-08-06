/**
 * Reading a chosen entity icon out of a submitted form, at the trusted boundary.
 *
 * `icon_key` is stored in an UNCONSTRAINED column (migration 0032) because the
 * authoritative vocabulary lives in `entity-icon-keys.ts` rather than in a CHECK
 * that would need a migration every time the catalogue gains a glyph. The whole
 * bargain depends on this: the vocabulary has to be enforced HERE, at the one
 * place an untrusted value crosses into the product, and every create/edit route
 * for an icon-bearing entity has to do it the same way.
 *
 * The distinction this exists to preserve is "not chosen" versus "chosen badly".
 * `normaliseEntityIconKey` folds both to `null`, which is right for storage and
 * wrong for a form: a route that normalises a hostile value to `null` and saves
 * happily tells the owner their choice was accepted, then shows them a default
 * icon. The owner concludes the feature is broken, and no test catches it because
 * nothing failed. So an unrecognised value is REFUSED and named, and only a
 * genuine absence becomes `null`.
 *
 * A field the form never submitted is also `null` — a create form without an
 * icon control, or an edit form saving unrelated fields, must not be read as
 * "clear the icon". Callers that need "clear it" send the field explicitly
 * empty, which is how the picker's reset-to-default works.
 */

import {
  isRejectedEntityIconKey,
  normaliseEntityIconKey,
  type EntityIconKey,
} from "~/kernel/entities/entity-icon-keys";

/** The message an owner sees when a submitted key is not one this build knows. */
export const ENTITY_ICON_FIELD_ERROR =
  "That icon isn’t available. Choose one from the list.";

export type EntityIconFieldResult =
  | { readonly ok: true; readonly iconKey: EntityIconKey | null }
  | { readonly ok: false; readonly message: string };

/**
 * Read and validate the icon field of a submitted form.
 *
 * Returns `{ ok: true, iconKey: null }` when the field is absent or empty (no
 * choice / reset to default), `{ ok: true, iconKey }` for a key in the
 * vocabulary, and `{ ok: false }` for anything else — never a silent `null`.
 */
export function readEntityIconField(
  form: FormData,
  field = "iconKey",
): EntityIconFieldResult {
  const raw = form.get(field);

  // Absent entirely: this form does not carry an icon. Not a clear, not an error.
  if (raw === null) return { ok: true, iconKey: null };

  // A File would be a `<input type="file">` posing as the icon field. It is not
  // a key, and `String(file)` would produce "[object File]" and then be refused
  // for the wrong reason — so reject it as what it is.
  if (typeof raw !== "string") {
    return { ok: false, message: ENTITY_ICON_FIELD_ERROR };
  }

  if (isRejectedEntityIconKey(raw)) {
    return { ok: false, message: ENTITY_ICON_FIELD_ERROR };
  }
  return { ok: true, iconKey: normaliseEntityIconKey(raw) };
}
