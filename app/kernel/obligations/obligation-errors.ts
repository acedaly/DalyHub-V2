/**
 * V2.10 LIFE-00 Obligations kernel — the domain's own validation error.
 *
 * The obligation domain moved out of `app/kernel/assets` so that a commitment
 * which is not about an Asset can use it (ADR-116 decision 1). It therefore
 * cannot throw `AssetValidationError`: a tax return has no Asset for the error
 * to be about, and importing the Assets kernel here would put the Asset
 * assumption straight back into the arithmetic this item exists to free.
 *
 * The shape is deliberately identical to `AssetValidationError`'s — a field
 * name and a message — so a route boundary maps both to the same field-level
 * refusal rather than to two different responses.
 */

/** Which obligation field a refusal is about. Kept open: callers name their own. */
export type ObligationValidationField = string;

/** A value crossing the obligation domain boundary was malformed. */
export class ObligationValidationError extends Error {
  readonly code = "obligation_validation" as const;

  constructor(
    readonly field: ObligationValidationField,
    message: string,
  ) {
    super(message);
    this.name = "ObligationValidationError";
  }
}
