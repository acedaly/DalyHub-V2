export class AppPreferencesValidationError extends Error {
  readonly code = "validation" as const;
  constructor(
    readonly field:
      | "ownerId"
      | "timezone"
      | "dateFormat"
      | "firstDayOfWeek"
      | "defaultLandingDestination"
      | "defaultTasksView"
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

export class AppPreferencesStorageError extends Error {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("An application preferences storage error occurred.", options);
    this.name = "AppPreferencesStorageError";
  }
}
