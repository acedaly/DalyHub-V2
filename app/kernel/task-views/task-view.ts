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
 *
 * **X-02 note.** The RECORD and the REPOSITORY are no longer Tasks-specific: they
 * are `~/kernel/views`' generic saved-view model bound to `TaskViewConfig`. The
 * names below are the same types under their original names, so every Tasks caller
 * is unchanged — what changed is that Tasks no longer OWNS the saved-view concept,
 * it is the first of two kinds that share it.
 */

import type {
  MAX_SAVED_VIEWS_PER_KIND,
  NewSavedView,
  SavedView,
  SavedViewChangeResult,
  SavedViewPatch,
  SavedViewRepository,
} from "~/kernel/views";
import {
  MAX_SAVED_VIEWS_PER_KIND as MAX_SAVED_VIEWS,
  SAVED_VIEW_NAME_MAX_LENGTH,
} from "~/kernel/views";

import type { TaskViewConfig } from "./task-view-config";

/** The maximum length of a saved view's name (mirrors the column CHECK). */
export const TASK_VIEW_NAME_MAX_LENGTH = SAVED_VIEW_NAME_MAX_LENGTH;

/** The maximum number of saved views one owner may hold in one workspace. */
export const MAX_TASK_SAVED_VIEWS: typeof MAX_SAVED_VIEWS_PER_KIND =
  MAX_SAVED_VIEWS;

/** A persisted, user-created Tasks view. */
export type TaskSavedView = SavedView<TaskViewConfig>;

/** Create a saved view from the current configuration. */
export type NewTaskSavedView = NewSavedView<TaskViewConfig>;

/** Patch an existing saved view. An omitted field is left unchanged. */
export type TaskSavedViewPatch = SavedViewPatch<TaskViewConfig>;

/** The outcome of a saved-view write: the fresh record and whether it changed. */
export type TaskSavedViewChangeResult = SavedViewChangeResult<TaskViewConfig>;

/**
 * The workspace-bound Tasks saved-view repository. Every method is scoped to the
 * bound workspace AND to the authenticated owner AND to the `tasks` kind — a view
 * saved by one owner in one workspace is invisible and unreachable from any other.
 */
export type TaskViewRepository = SavedViewRepository<TaskViewConfig>;
