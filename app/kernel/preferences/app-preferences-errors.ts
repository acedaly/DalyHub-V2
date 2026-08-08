export class AppPreferencesValidationError extends Error {
  readonly code = "validation" as const;
  constructor(
    readonly field:
      | "ownerId"
      | "appearance"
      | "timezone"
      | "dateFormat"
      | "firstDayOfWeek"
      | "defaultLandingDestination"
      | "defaultTasksView"
      | "defaultTaskDestination"
      | "defaultTaskViewId"
      | "defaultTaskCaptureParentId"
      | "defaultTaskCaptureParentKind"
      | "defaultDiaryMode"
      | "navigation",
    message: string,
  ) {
    super(message);
    this.name = "AppPreferencesValidationError";
  }
}

/**
 * AUDIT-07 — the write was refused because the stored preferences moved on
 * since the caller read them.
 *
 * Raised ONLY when a caller quotes the `version` it edited
 * (`UpdateAppPreferencesOptions.expectedVersion`) and that version is no longer
 * current. It exists so a read-modify-write over a COMPOSITE preference (the
 * navigation set) can refuse a stale write and re-derive, instead of reporting
 * success while silently resetting a change made on another device. Callers
 * that patch independent fields never see it: those merge safely by writing
 * only the columns they name.
 */
export class AppPreferencesConflictError extends Error {
  readonly code = "conflict" as const;
  constructor() {
    super("These settings changed somewhere else. Try again.");
    this.name = "AppPreferencesConflictError";
  }
}

export class AppPreferencesStorageError extends Error {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("An application preferences storage error occurred.", options);
    this.name = "AppPreferencesStorageError";
  }
}
