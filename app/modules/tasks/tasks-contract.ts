/**
 * TASKS-01/TASKS-03 — the JSON contract between the `/tasks` loader/actions and the
 * module UI. Kept React-free so both the server routes and the pure view-model
 * share one shape.
 */

import type { TaskBulkResult } from "~/shared/task-record/contract";
import type { SerializedTaskListItem } from "~/shared/task-record/task-view";
import type { WorkspaceTaskGroupDimension } from "~/kernel/tasks";
import type { TaskViewConfig } from "~/kernel/task-views";

/** One server-grouped bucket of the collection. */
export interface TasksGroup {
  /** The bucket key, in the vocabulary of the grouping dimension. */
  readonly key: string;
  /** AUTHORITATIVE total in this bucket — independent of how many `items` loaded. */
  readonly count: number;
  /** A bounded, deterministically-sorted top slice of the bucket. */
  readonly items: readonly SerializedTaskListItem[];
  /** True when `count` exceeds the loaded `items` (reach the rest via the filtered view). */
  readonly hasMore: boolean;
  /** The server-resolved label for an open-ended bucket (parent, delegate). */
  readonly label: string | null;
}

/** The server-authoritative grouping a grouped view renders from. */
export interface TasksGrouping {
  readonly dimension: WorkspaceTaskGroupDimension;
  readonly groups: readonly TasksGroup[];
}

/**
 * A view offered in the Tasks view switcher. `kind` is what makes a system view
 * visually and semantically distinguishable from a user-created one WITHOUT relying
 * on colour: the switcher labels the two groups and marks system views as built-in.
 */
export interface TasksViewOption {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly kind: "system" | "user";
  /** The URL query string (without `?`) that applies this view. */
  readonly query: string;
  /** True when this view is the owner's chosen default for `/tasks`. */
  readonly isDefault: boolean;
}

/** The `/tasks` page loader payload. */
export interface TasksPageData {
  /** The resolved, validated configuration this page is rendering. */
  readonly config: TaskViewConfig;
  /** The saved/system view currently selected, or null for an ad-hoc configuration. */
  readonly activeViewId: string | null;
  /** True when the configuration differs from the selected saved view's. */
  readonly viewModified: boolean;
  /** Every view offered in the switcher — system views first, then the owner's. */
  readonly views: readonly TasksViewOption[];
  /** The distinct delegatees present in the workspace (a closed filter option set). */
  readonly delegates: readonly string[];
  /** The Projects and Areas offered as parent filters. */
  readonly parents: readonly {
    readonly id: string;
    readonly kind: "area" | "project";
    readonly title: string;
  }[];
  /**
   * V2.6 FIND-03 — the workspace tag vocabulary, as the closed option set the
   * ONE tag filter dimension offers. Read in the loader beside the delegate
   * options rather than fetched when a form mounts, because this list has to
   * exist for the CONTROL to be rendered at all.
   */
  readonly tags: readonly { readonly key: string; readonly label: string }[];
  /** The owner's calendar date `YYYY-MM-DD`. */
  readonly todayIso: string;
  readonly defaultCaptureParent: TaskParentOption | null;
  /**
   * The flat, cursor-paginated page. Empty for a grouped view, which renders from
   * `grouping` instead of a single global page.
   */
  readonly items: readonly SerializedTaskListItem[];
  /** Opaque cursor for the next page, or null. */
  readonly nextCursor: string | null;
  /**
   * The server-authoritative grouping — accurate per-bucket counts + bounded
   * per-bucket records — or null for a flat list (ADR-043 §11 / decision 12).
   */
  readonly grouping: TasksGrouping | null;
  /** True when the query failed — the UI renders a calm error state. */
  readonly failed: boolean;
}

/**
 * TASKS-04 — the Review Inbox loader payload: ONE bounded page of the built-in Inbox
 * query (active, unassigned Tasks) plus the owner's calendar day. No Inbox-specific
 * Task shape: these are the same serialised list items every other Tasks surface uses.
 */
export interface TasksReviewData {
  readonly items: readonly SerializedTaskListItem[];
  /** Opaque cursor for the next review page, or null when the Inbox is exhausted. */
  readonly nextCursor: string | null;
  readonly todayIso: string;
  /** True when the query failed — the surface renders a calm error state. */
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
  | {
      readonly kind: "create";
      readonly ok: true;
      readonly taskId: string;
      readonly title?: string;
    }
  | {
      readonly kind: "create";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Record<string, string>;
      readonly createdId?: string;
    };

/**
 * The discriminated result of a `/tasks/bulk` action.
 *
 * V2.8 CONV-01 — the SHAPE now lives in the shared task-record contract
 * (`TaskBulkResult`), because the bulk bar that consumes it is drawn on two
 * surfaces. Re-exported under the module's own name so the route and every
 * existing importer read as they did.
 */
export type TasksBulkResult = TaskBulkResult;

/** The discriminated result of a `/tasks/views` saved-view action. */
export type TasksViewResult =
  | {
      readonly kind: "view";
      readonly ok: true;
      /** The affected view's id, or null for a delete/clear-default. */
      readonly viewId: string | null;
      /** A short, human confirmation for the live region. */
      readonly message: string;
    }
  | { readonly kind: "view"; readonly ok: false; readonly formError: string };
