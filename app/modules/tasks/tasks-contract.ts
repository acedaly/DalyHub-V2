/**
 * TASKS-01 — the JSON contract between the `/tasks` loader/actions and the module
 * UI. Kept React-free so both the server routes and the pure view-model share one
 * shape.
 */

import type { SerializedTaskListItem } from "~/shared/task-record/task-view";
import type { TaskSort, TaskSystemView } from "~/kernel/tasks";

import type { TasksPrimaryView } from "./tasks-view-model";

/** The applied filter state, mirrored from the URL (all optional). */
export interface TasksFilterState {
  readonly priority: string | null;
  readonly timeSector: string | null;
  readonly commitmentState: string | null;
  readonly status: string | null;
  readonly projectId: string | null;
  readonly goalId: string | null;
  readonly areaId: string | null;
  readonly delegatedOnly: boolean;
  readonly waitingOnly: boolean;
}

/** The `/tasks` page loader payload. */
export interface TasksPageData {
  readonly primaryView: TasksPrimaryView;
  readonly systemView: TaskSystemView;
  readonly sort: TaskSort;
  readonly filters: TasksFilterState;
  /** The owner's calendar date `YYYY-MM-DD`. */
  readonly todayIso: string;
  readonly items: readonly SerializedTaskListItem[];
  /** Opaque cursor for the next page, or null. */
  readonly nextCursor: string | null;
  /** True when the query failed — the UI renders a calm error state. */
  readonly failed: boolean;
}

/** A page fetched by "Load more" (same shape, minus the view chrome). */
export interface TasksCollectionPage {
  readonly items: readonly SerializedTaskListItem[];
  readonly nextCursor: string | null;
}

/** A parent option (Area or Project) for the create-task selector. */
export interface TaskParentOption {
  readonly id: string;
  readonly kind: "area" | "project";
  readonly title: string;
  readonly context: string | null;
}

/** The discriminated result of a `/tasks` create action. */
export type TasksCreateResult =
  | { readonly kind: "create"; readonly ok: true; readonly taskId: string }
  | {
      readonly kind: "create";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Record<string, string>;
    };

/** The discriminated result of a `/tasks/bulk` action. */
export type TasksBulkResult =
  | {
      readonly kind: "bulk";
      readonly ok: true;
      readonly changed: number;
      readonly unchanged: number;
    }
  | { readonly kind: "bulk"; readonly ok: false; readonly formError: string };
