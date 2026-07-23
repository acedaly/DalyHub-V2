/**
 * AREA-01 Areas kernel — typed errors for the read projection.
 *
 * The projection reuses the spine validators for identifier and limit validation;
 * its own error surface is only a storage failure wrapper so D1/SQL details never
 * escape into route code or UI copy.
 */

/** A storage-layer failure while reading the Area projection. */
export class AreaStorageError extends Error {
  constructor(
    message = "An area storage error occurred.",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AreaStorageError";
  }
}
