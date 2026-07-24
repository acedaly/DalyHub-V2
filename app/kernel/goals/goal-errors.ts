/**
 * AREA-02 Goals kernel — typed errors for the read-only Goal projection.
 *
 * The projection reuses the spine validators for identifier/limit validation;
 * its own error surface is only a storage-failure wrapper so D1/SQL details
 * never escape into route code or UI copy (mirrors `~/kernel/areas`).
 */

/** A storage-layer failure while reading the Goal projection. */
export class GoalStorageError extends Error {
  constructor(
    message = "A goal storage error occurred.",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GoalStorageError";
  }
}
