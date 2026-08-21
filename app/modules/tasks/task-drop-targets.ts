/**
 * DHDS-11 — which Task drop destinations exist, and what each one CHANGES.
 *
 * Pure, React-free, and the single answer to the question the phase brief makes
 * the entrance exam for every cross-context drag:
 *
 *   > For every drag between groups, answer: what field does this drop change?
 *   > If the answer is unclear, the drag interaction should not exist.
 *
 * A grouped Tasks view already draws its destinations: each bucket is a
 * server-authoritative group of one dimension. Some of those dimensions are a
 * STORED FIELD whose bucket key IS a value of that field — dropping into the
 * bucket sets the field to the key, and reload proves it. Others are DERIVED
 * ranges, and a drop into them has no single meaning at all.
 *
 * This module is where the difference is written down. Nothing else in the
 * product decides it.
 *
 * ── The four that qualify ───────────────────────────────────────────────────
 *
 * | Dimension  | Bucket key IS                | The drop writes            |
 * |------------|------------------------------|----------------------------|
 * | `parent`   | the Project/Area entity id   | `set_parent`               |
 * | `priority` | `p1`…`p4`                    | `set_priority`             |
 * | `status`   | `todo`/`in_progress`/…       | `set_status`               |
 * | `sector`   | a Time Sector, or `__none`   | `set_sector`               |
 *
 * Each posts the SAME `/tasks/bulk` intent the bulk bar and the row's own
 * DHDS-10 control post. There is no drag mutation, no drag endpoint and no
 * second validation — which is the hard architectural requirement of §42 of the
 * brief, and the reason a Project assigned by dragging and a Project assigned by
 * the picker are indistinguishable afterwards.
 *
 * ── The three that do NOT, and why ──────────────────────────────────────────
 *
 * **`due_state` and `planned`** bucket by a DERIVED range: `due_this_week`,
 * `planned_later`, `overdue`. There is no date those keys name. "Make this due
 * later" is not an operation, and inventing one — the Friday of the current
 * week, say — would be the product guessing at intent. The row's own
 * `DateChoice` says a date in one press, which is both faster and true.
 *
 * **`delegate`** buckets by who a Task is delegated to. Delegation in DalyHub
 * carries a note and a follow-up date and is an act rather than a metadata
 * choice; DHDS-10 kept it off the row for the same reason. A drop cannot supply
 * the other half of it.
 *
 * **The `completed` bucket of `status`** is not a value of `task_details.status`
 * at all — it is derived from spine completion. Dropping there would be a
 * LIFECYCLE change wearing a re-bucket's clothes, and completion has a control
 * of its own on every row, an Undo, and a recurrence consequence. It is refused
 * by the same rule that admits the rest: the key must be a value of the field.
 */

import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TIME_SECTORS,
  type WorkspaceTaskGroupDimension,
} from "~/kernel/tasks";
import type { TaskListItemPatch } from "~/shared/task-record/task-view";

/** The grouping dimensions a Task may be dragged between. */
export const TASK_DROP_DIMENSIONS = [
  "parent",
  "priority",
  "status",
  "sector",
] as const;

export type TaskDropDimension = (typeof TASK_DROP_DIMENSIONS)[number];

export function isTaskDropDimension(
  dimension: WorkspaceTaskGroupDimension,
): dimension is TaskDropDimension {
  return (TASK_DROP_DIMENSIONS as readonly string[]).includes(dimension);
}

/** What a bucket a Task is dropped into asks the server to do. */
export interface TaskDropSubmission {
  /** The `/tasks/bulk` form fields, `intent` included. */
  readonly fields: Readonly<Record<string, string>>;
  /** The optimistic paint, applied while the write is in flight (ADR-086). */
  readonly patch: TaskListItemPatch;
}

/** The bucket key that means "this field is empty" in the server's grouping. */
export const TASK_DROP_NONE = "__none";

/**
 * Resolve the submission a drop into `bucketKey` of `dimension` should make, or
 * null when the bucket is not a destination at all.
 *
 * `destinationKind` is required for a `parent` bucket and comes from the tasks
 * ALREADY in it — a Project and an Area are two different spine links and the
 * server never guesses which one a destination wants. An open-ended bucket is
 * only ever rendered when it has at least one task, so the kind is always
 * available where it is needed.
 */
export function taskDropSubmission(
  dimension: TaskDropDimension,
  bucketKey: string,
  destinationKind?: "area" | "project" | null,
): TaskDropSubmission | null {
  switch (dimension) {
    case "parent": {
      if (bucketKey === TASK_DROP_NONE) {
        // Inbox: a Task with no structural parent. An empty id IS the explicit
        // "Move to Inbox" the bulk route already documents.
        return {
          fields: { intent: "set_parent", parentKind: "", parentId: "" },
          patch: { parent: null },
        };
      }
      if (destinationKind !== "area" && destinationKind !== "project") {
        return null;
      }
      return {
        fields: {
          intent: "set_parent",
          parentKind: destinationKind,
          parentId: bucketKey,
        },
        // The TITLE is filled in by the caller, which knows the bucket's label.
        patch: { parent: { kind: destinationKind, id: bucketKey, title: "" } },
      };
    }
    case "priority": {
      if (!(TASK_PRIORITIES as readonly string[]).includes(bucketKey)) {
        return null;
      }
      return {
        fields: { intent: "set_priority", priority: bucketKey },
        patch: { priority: bucketKey as TaskListItemPatch["priority"] },
      };
    }
    case "status": {
      // `completed` is derived from spine completion, not from this field.
      if (!(TASK_STATUSES as readonly string[]).includes(bucketKey)) {
        return null;
      }
      return {
        fields: { intent: "set_status", status: bucketKey },
        patch: { status: bucketKey as TaskListItemPatch["status"] },
      };
    }
    case "sector": {
      if (
        bucketKey !== TASK_DROP_NONE &&
        !(TIME_SECTORS as readonly string[]).includes(bucketKey)
      ) {
        return null;
      }
      const sector = bucketKey === TASK_DROP_NONE ? "" : bucketKey;
      return {
        fields: { intent: "set_sector", sector },
        patch: {
          timeSector: (sector === ""
            ? null
            : sector) as TaskListItemPatch["timeSector"],
        },
      };
    }
  }
}

/**
 * The drag payload key carrying the bucket a Task was lifted OUT of.
 *
 * The check that keeps a destination the Task already belongs to dark, and it is
 * deliberately the server's own answer rather than a second derivation of it: a
 * grouped view is server-authoritative, so the bucket a row is rendered in IS
 * the value of that field. Re-deriving "is this Task already in Personal?" from
 * the row's projection would be a second opinion that can disagree — and it
 * would have to special-case that a stored `null` priority IS P4, which the
 * grouping already folds.
 *
 * §37 of the brief: "Do not let the owner drag over a surface that lights up and
 * then refuses the drop." This is what keeps the surface it came from quiet.
 */
export const TASK_DROP_SOURCE_BUCKET = "sourceBucket";

/**
 * The past-tense sentence the Undo toast leads with.
 *
 * "Moved to Personal", never "Drag operation successful": the toast names the
 * DESTINATION, because that is the fact the owner needs in order to decide
 * whether to undo. The Task's own title is not repeated — the owner is looking
 * at the list they just moved it in.
 */
export function taskDropUndoLabel(
  dimension: TaskDropDimension,
  destinationLabel: string,
): string {
  switch (dimension) {
    case "parent":
      return `Moved to ${destinationLabel}`;
    case "priority":
      return `Set to ${destinationLabel}`;
    case "status":
      return `Marked ${destinationLabel}`;
    case "sector":
      return `Moved to ${destinationLabel}`;
  }
}
