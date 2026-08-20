import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import type { IdentityColourSlot } from "~/kernel/entities/identity-colour-slots";
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
  iconKey: null,
  colourSlot: null,
};
export type ProjectSettings = {
  readonly status: ProjectWorkflowStatus;
  readonly archivedAt: Date | null;
  /**
   * The icon its owner chose, or `null` for "no choice — use the Project
   * default". A KEY, never a glyph: the UI resolves it, which keeps the wire
   * format serialisable and lets the drawing change without the data changing.
   */
  readonly iconKey: EntityIconKey | null;
  /**
   * IDENTITY-01 — the identity colour its owner chose, or `null` for "no choice
   * — derive it from the Project's own stable rank". A controlled SLOT NAME,
   * never a hex, for the same reasons the icon is a key rather than a glyph.
   */
  readonly colourSlot: IdentityColourSlot | null;
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
/**
 * Archiving was refused because the Project still holds OUTSTANDING work.
 *
 * HARDEN-06C (F-08) — "outstanding" is the product's own vocabulary and not
 * merely "not completed": cancelled and Someday Tasks are parked or dropped
 * decisions, not commitments, and the guard now agrees with `listCarryOverTasks`,
 * the overdue rule and `countOverdueAtPeriodEnd` about that. The message names
 * what actually blocks it, so the owner is not sent to complete a Task they
 * deliberately did not do.
 */
export class ProjectArchiveBlockedError extends Error {
  readonly code = "archive_blocked" as const;
  constructor() {
    super(
      "This project still has open tasks. Complete, cancel or move them before archiving it.",
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
