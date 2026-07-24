/**
 * AREA-03 Alignment kernel — typed errors for the read-only Alignment facts
 * projection (mirrors `~/kernel/goals/goal-errors.ts` / `~/kernel/project-health`).
 */

/** A storage-layer failure while reading Alignment facts or evidence. */
export class AlignmentStorageError extends Error {
  constructor(
    message = "An alignment storage error occurred.",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AlignmentStorageError";
  }
}
