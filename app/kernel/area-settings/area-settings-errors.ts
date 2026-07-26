/**
 * AREA-05 Area Settings — typed domain errors.
 *
 * Every error carries a stable `code` discriminator so route actions branch on
 * `error.code` without `instanceof`, exactly like `project-settings` and the
 * spine. Raw D1 failures never escape the adapter: they are re-raised as
 * `AreaSettingsStorageError` with the original attached as `cause` (server logging
 * only), so a client never sees a leaked SQL error.
 */

export type AreaSettingsErrorCode =
  "not_found" | "archived" | "conflict" | "storage";

export class AreaSettingsNotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor() {
    super("Area not found");
    this.name = "AreaSettingsNotFoundError";
  }
}

/**
 * A mutation was attempted against an already-archived Area (other than restore).
 * Distinct from a blocked transition — this rejects a change made WHILE archived,
 * so the Area record's non-lifecycle mutations stay guarded until it is restored.
 */
export class AreaArchivedError extends Error {
  readonly code = "archived" as const;
  constructor() {
    super("This area is archived and read-only. Restore it to make changes.");
    this.name = "AreaArchivedError";
  }
}

export class AreaSettingsConflictError extends Error {
  readonly code = "conflict" as const;
  constructor() {
    super("That change couldn't be completed. Please try again.");
    this.name = "AreaSettingsConflictError";
  }
}

export class AreaSettingsStorageError extends Error {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("An area settings storage error occurred.", options);
    this.name = "AreaSettingsStorageError";
  }
}
