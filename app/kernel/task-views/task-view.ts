/**
 * TASKS-03 — persisted, workspace- and owner-scoped Tasks saved views.
 *
 * A saved view is a NAME plus a validated {@link TaskViewConfig}. It stores no
 * records, no query text and no cached result — re-selecting a saved view re-runs
 * the ordinary bounded workspace query, so a saved view can never drift from the
 * data or bypass a workspace boundary.
 *
 * The SYSTEM views (Inbox, Today, Upcoming, Overdue, Waiting, Delegated,
 * Someday/Maybe, Completed) are deliberately NOT rows in this table: they are
 * DERIVED from the kernel system views and this same config shape, so they cannot
 * be deleted, cannot silently mutate, and cost no storage. Only user-created views
 * are persisted here.
 */

import type { WorkspaceId } from "~/kernel/workspaces";

import type { TaskViewConfig } from "./task-view-config";

/** The maximum length of a saved view's name (mirrors the column CHECK). */
export const TASK_VIEW_NAME_MAX_LENGTH = 80;

/** The maximum number of saved views one owner may hold in one workspace. */
export const MAX_TASK_SAVED_VIEWS = 50;

/** A persisted, user-created Tasks view. */
export interface TaskSavedView {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly ownerId: string;
  readonly name: string;
  /** The format version the row was WRITTEN with (may exceed this build's). */
  readonly configVersion: number;
  readonly config: TaskViewConfig;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Create a saved view from the current configuration. */
export interface NewTaskSavedView {
  readonly name: string;
  readonly config: TaskViewConfig;
}

/** Patch an existing saved view. An omitted field is left unchanged. */
export interface TaskSavedViewPatch {
  readonly name?: string;
  readonly config?: TaskViewConfig;
}

/** The outcome of a saved-view write: the fresh record and whether it changed. */
export interface TaskSavedViewChangeResult {
  readonly view: TaskSavedView;
  readonly changed: boolean;
}

/**
 * The workspace-bound saved-view repository. Every method is scoped to the bound
 * workspace AND to the authenticated owner — a view saved by one owner in one
 * workspace is invisible and unreachable from any other.
 */
export interface TaskViewRepository {
  /** All of the owner's saved views, deterministically ordered by name then id. */
  readonly list: (ownerId: string) => Promise<readonly TaskSavedView[]>;
  /** One saved view, or null when it does not exist for this owner/workspace. */
  readonly get: (
    ownerId: string,
    viewId: string,
  ) => Promise<TaskSavedView | null>;
  readonly create: (
    ownerId: string,
    input: NewTaskSavedView,
  ) => Promise<TaskSavedView>;
  readonly update: (
    ownerId: string,
    viewId: string,
    patch: TaskSavedViewPatch,
  ) => Promise<TaskSavedViewChangeResult>;
  /** Copy a view under a new name. Fails if the source is missing. */
  readonly duplicate: (
    ownerId: string,
    viewId: string,
    name: string,
  ) => Promise<TaskSavedView>;
  /** Delete a view. Returns false when there was nothing to delete (idempotent). */
  readonly remove: (ownerId: string, viewId: string) => Promise<boolean>;
}
