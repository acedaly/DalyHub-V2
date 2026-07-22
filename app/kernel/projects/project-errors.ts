/**
 * PROJ-01 Projects kernel — typed errors for the read projection.
 *
 * The projection reuses the spine's identifier/limit validators (which throw
 * `SpineValidationError`) for input validation, so the only projection-specific error
 * is a storage failure wrapper — keeping raw D1/SQL errors from escaping the contract.
 */

/** A storage-layer failure while reading the project projection. */
export class ProjectStorageError extends Error {
  constructor(
    message = "A project storage error occurred.",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProjectStorageError";
  }
}
