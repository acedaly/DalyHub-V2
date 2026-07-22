import type { WorkspaceId } from "~/kernel/workspaces";
export const PROJECT_STATUS_CHANGED = "project.status_changed";
export const PROJECT_ARCHIVED = "project.archived";
export const PROJECT_RESTORED = "project.restored";

export const PROJECT_WORKFLOW_STATUSES = [
  "planned",
  "active",
  "on_hold",
] as const;
export type ProjectWorkflowStatus = (typeof PROJECT_WORKFLOW_STATUSES)[number];
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  status: "planned",
  archivedAt: null,
};
export type ProjectSettings = {
  readonly status: ProjectWorkflowStatus;
  readonly archivedAt: Date | null;
};
export type ProjectSettingsRecord = ProjectSettings & {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
};
export type ProjectSettingsChangeResult = {
  readonly settings: ProjectSettingsRecord;
  readonly changed: boolean;
};
export function parseProjectWorkflowStatus(
  value: string,
): ProjectWorkflowStatus {
  if ((PROJECT_WORKFLOW_STATUSES as readonly string[]).includes(value))
    return value as ProjectWorkflowStatus;
  throw new ProjectSettingsValidationError(
    "status",
    "Choose Planned, Active, or On hold.",
  );
}
export function projectWorkflowStatusLabel(
  status: ProjectWorkflowStatus,
): string {
  return status === "on_hold"
    ? "On hold"
    : status === "active"
      ? "Active"
      : "Planned";
}
export class ProjectSettingsValidationError extends Error {
  readonly code = "validation" as const;
  constructor(
    readonly field: "id" | "status",
    message: string,
  ) {
    super(message);
    this.name = "ProjectSettingsValidationError";
  }
}
export class ProjectSettingsNotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor() {
    super("Project not found");
    this.name = "ProjectSettingsNotFoundError";
  }
}
export class ProjectArchiveBlockedError extends Error {
  readonly code = "archive_blocked" as const;
  constructor() {
    super(
      "Complete or move the unfinished tasks before archiving this project.",
    );
    this.name = "ProjectArchiveBlockedError";
  }
}
export class ProjectSettingsStorageError extends Error {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("A project settings storage error occurred.", options);
    this.name = "ProjectSettingsStorageError";
  }
}
export class ProjectSettingsConflictError extends Error {
  readonly code = "conflict" as const;
  constructor() {
    super("That change couldn't be completed. Please try again.");
    this.name = "ProjectSettingsConflictError";
  }
}
/**
 * A Project is archived and therefore read-only until restored. Distinct from
 * `ProjectArchiveBlockedError` (which rejects the ARCHIVE transition itself) — this
 * error rejects a mutation ATTEMPTED AGAINST an already-archived Project (its own
 * settings, or one of its structural child Tasks).
 */
export class ProjectArchivedError extends Error {
  readonly code = "archived" as const;
  constructor() {
    super(
      "This project is archived and read-only. Restore it to make changes.",
    );
    this.name = "ProjectArchivedError";
  }
}
