/**
 * The shared task-record wire contract.
 *
 * The JSON shapes exchanged between the task resource routes (owned by the Tasks
 * module) and the shared `TaskRecordDrawer` / `TaskTimelineTab` (consumed by any
 * module — Today, Projects, …). Promoted to a shared surface in PROJ-01 (ADR-033) so
 * the reusable drawer and the module-owned routes agree on one contract WITHOUT the
 * drawer importing a product module (the module import boundary forbids that). It
 * imports only shared + kernel-facing view types.
 */

import type { ActivityItem } from "~/shared/activity-feed/model";
import type { EntityLinkSelection } from "~/shared/forms/model";

import type {
  SerializedChecklistItem,
  SerializedTaskDependencies,
  SerializedTaskView,
} from "./task-view";

/** The loader payload for a task Drawer: the task and its related-record links. */
export interface TaskDetailData {
  readonly task: SerializedTaskView;
  readonly links: readonly EntityLinkSelection[];
  /**
   * TASKS-13 — this Task's checklist, in the owner's order.
   *
   * Sent WHOLE with the record rather than fetched by a second request: it is at
   * most {@link MAX_CHECKLIST_ITEMS} short strings, the record cannot be drawn
   * without it, and a separate round trip would mean the checklist arriving after
   * the panel it lives in. An empty array is a Task with no checklist, which is
   * the ordinary case.
   */
  readonly checklist: readonly SerializedChecklistItem[];
  /**
   * TASKS-12 — this Task's dependencies, in both directions.
   *
   * Sent WHOLE with the record for the same reason the checklist is: it is at
   * most forty short rows, the record cannot draw its Dependencies section
   * without it, and a second round trip would mean the section arriving after the
   * panel it lives in. Two empty arrays is a Task with no dependencies, which is
   * the ordinary case.
   */
  readonly dependencies: SerializedTaskDependencies;
  /**
   * The owner's current calendar date `YYYY-MM-DD`, resolved server-side (ADR-022)
   * so the Drawer's urgency chip ("Overdue" / "Due today") never derives the date in
   * browser-local time. TASKS-02.
   */
  readonly todayIso: string;
}

/**
 * TASKS-04 — the recurrence consequence of a completion or its undo.
 *
 *   - `created` — completing a repeating occurrence created exactly one successor;
 *   - `removed` — undoing that completion withdrew the untouched successor;
 *   - `retained` — the successor had already been changed, so undo KEPT it and the
 *     user must be told (never a silent destruction, never a silent duplicate).
 */
export type TaskRecurrenceOutcome =
  | {
      readonly outcome: "created";
      readonly taskId: string;
      readonly scheduledDate: string | null;
      readonly dueDate: string | null;
    }
  | { readonly outcome: "removed" | "retained" };

/** The discriminated action outcomes the Drawer client consumes. */
export type TaskActionData =
  | {
      readonly kind: "update";
      readonly status: "success";
      readonly task: SerializedTaskView;
    }
  | {
      readonly kind: "update";
      readonly status: "error";
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "completion";
      readonly ok: true;
      readonly task: SerializedTaskView;
      /**
       * TASKS-04 — what happened to the recurrence series, so the surface can say so
       * honestly instead of leaving a new (or surviving) occurrence unexplained.
       * Absent for a one-off task.
       */
      readonly recurrence?: TaskRecurrenceOutcome;
    }
  | {
      readonly kind: "completion";
      readonly ok: false;
      readonly message: string;
    }
  | { readonly kind: "link"; readonly ok: boolean; readonly message?: string }
  | {
      readonly kind: "unlink";
      readonly ok: boolean;
      readonly message?: string;
    }
  | {
      readonly kind: "waiting";
      readonly status: "success";
      readonly task: SerializedTaskView;
    }
  | {
      readonly kind: "waiting";
      readonly status: "error";
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "planning";
      readonly status: "success";
      readonly task: SerializedTaskView;
    }
  | {
      readonly kind: "planning";
      readonly status: "error";
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  /**
   * TASKS-13 — the outcome of any checklist mutation.
   *
   * ONE result kind for all five operations, and it always carries the WHOLE
   * checklist as the server now holds it. That is what makes the section
   * self-correcting: an add, a rename, a tick, a delete and a reorder all
   * reconcile the same way, and a client that had drifted (a stale order, an item
   * another device removed) is corrected by the next answer rather than
   * accumulating a second opinion.
   */
  | {
      readonly kind: "checklist";
      readonly status: "success";
      readonly checklist: readonly SerializedChecklistItem[];
      /** The item this mutation addressed, when it still exists. */
      readonly item?: SerializedChecklistItem;
    }
  /**
   * TASKS-12 — the outcome of any dependency mutation.
   *
   * ONE result kind for both operations, and it always carries the WHOLE
   * dependency set as the server now holds it. That is what makes the section
   * self-correcting: an add and a remove reconcile the same way, and a client
   * that had drifted (an edge another device removed) is corrected by the next
   * answer rather than accumulating a second opinion.
   */
  | {
      readonly kind: "dependency";
      readonly status: "success";
      readonly dependencies: SerializedTaskDependencies;
    }
  | {
      readonly kind: "dependency";
      readonly status: "error";
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "checklist";
      readonly status: "error";
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
      /**
       * The checklist as the server holds it, when the refusal came from a
       * conflict the surface should re-read rather than retry (a stale reorder, a
       * deleted item). Absent for an ordinary validation refusal, where nothing
       * moved and the owner's draft is still the only thing to fix.
       */
      readonly checklist?: readonly SerializedChecklistItem[];
    };

/**
 * The discriminated result of the canonical `/tasks/bulk` action.
 *
 * V2.8 CONV-01 moved it here from the Tasks module's own contract, because the
 * shared `TaskBulkActionBar` — drawn on `/tasks` AND on a Project's Tasks tab —
 * reads it, and a shared component may not import a module. The route that
 * produces it is still the Tasks module's (`routes/bulk.tsx`); only the SHAPE is
 * shared, exactly as `TaskActionData` above is the shape of `/tasks/:id`.
 */
export type TaskBulkResult =
  | {
      readonly kind: "bulk";
      readonly ok: true;
      readonly changed: number;
      readonly unchanged: number;
    }
  | { readonly kind: "bulk"; readonly ok: false; readonly formError: string };

/** The JSON-safe shape of an `ActivityItem` (its only `Date` → ISO string). */
export type SerializedActivityItem = Omit<ActivityItem, "occurredAt"> & {
  readonly occurredAt: string;
};

/** One bounded page of a task's Activity Timeline. */
export interface TaskActivityPage {
  readonly items: readonly SerializedActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
