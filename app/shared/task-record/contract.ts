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

import type { SerializedTaskView } from "./task-view";

/** The loader payload for a task Drawer: the task and its related-record links. */
export interface TaskDetailData {
  readonly task: SerializedTaskView;
  readonly links: readonly EntityLinkSelection[];
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
    };

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
