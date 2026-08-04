/**
 * IDENT-01 Identity kernel — the typed errors.
 *
 * Mirrors the other kernel slices: a validation error naming the offending field
 * (never echoing the value) and a non-disclosing storage error. Identity values
 * come from a verified credential, so a validation failure is a programming error
 * or a corrupted row, not user input — it stays loud but says nothing sensitive.
 */

/** The fields identity validation can reject. */
export type IdentityValidationField =
  "subject" | "email" | "displayName" | "authDisplayName" | "personEntityId";

export class IdentityValidationError extends Error {
  readonly code = "validation" as const;
  constructor(
    readonly field: IdentityValidationField,
    message: string,
  ) {
    super(message);
    this.name = "IdentityValidationError";
  }
}

export class IdentityStorageError extends Error {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("An identity storage error occurred.", options);
    this.name = "IdentityStorageError";
  }
}
