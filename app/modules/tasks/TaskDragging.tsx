/**
 * DHDS-11 — everything on `/tasks` that knows a bucket is a DESTINATION.
 *
 * The Tasks workspace owns the collection, the configuration and the mutation
 * host. This owns the spatial half, and it is a separate file for a reason the
 * grammar test enforces: the translation from "a bucket of a grouped view" to
 * "a canonical Task intent" must exist in exactly one place, and a 2,600-line
 * surface that also posts those intents from a bulk bar and from a row's own
 * controls cannot be that place.
 *
 * Four things live here:
 *
 *   - `useTaskDropHandler` — what a committed drop DOES;
 *   - `useTaskBucketDrop`  — a grouped bucket, registered as a destination;
 *   - `DraggableTaskRow`   — a row that can be lifted out of the bucket it is in;
 *   - `TaskDragPreview`    — the floating Task.
 *
 * Nothing here mutates. The handler builds a submission from
 * `taskDropSubmission` — the one place that decides what a bucket means — and
 * posts it through the surface's own `moveTask`, which is `/tasks/bulk`: the
 * same route, the same intents and the same validation the bulk bar and the
 * row's DHDS-10 controls use. There is no drag mutation path in DalyHub.
 */

import { useCallback } from "react";

import { DragHandle, useDragHandle, useDropTarget } from "~/shared/drag";
import type { DragPayload } from "~/shared/drag";
import { PriorityGlyph } from "~/shared/task-record/PriorityIndicator";
import { TaskRow, type TaskRowProps } from "~/shared/task-record/TaskRow";
import type { TaskListItemPatch } from "~/shared/task-record/task-view";

import {
  taskDropSubmission,
  taskDropUndoLabel,
  TASK_DROP_SOURCE_BUCKET,
  type TaskDropDimension,
} from "./task-drop-targets";
import type { GroupedSection, TaskCardData } from "./tasks-view-model";

/** What the surface's mutation host needs in order to perform a move. */
export interface TaskMoveRequest {
  readonly fields: Readonly<Record<string, string>>;
  readonly patch: TaskListItemPatch;
  /** "Moved to Personal" — the destination, never "Drag successful". */
  readonly label: string;
  /** How to put it back, or null when the source cannot be restated. */
  readonly undo: {
    readonly fields: Readonly<Record<string, string>>;
    readonly patch: TaskListItemPatch;
  } | null;
}

export type TaskMover = (taskId: string, move: TaskMoveRequest) => void;

/** What a bucket calls when an object is released on it. */
export type TaskBucketDrop = (
  dimension: TaskDropDimension,
  section: GroupedSection,
  destinationKind: "area" | "project" | null,
  payload: DragPayload,
) => void;

/**
 * Commit a Task dropped into a bucket.
 *
 * Everything domain-shaped is decided by `taskDropSubmission`; this resolves the
 * two things only the SURFACE knows — the destination's words, and how to get
 * back — and hands them to the shared move.
 *
 * The reverse submission is the SAME function computed for the bucket the Task
 * came from, so a move and its undo cannot be different operations.
 */
export function useTaskDropHandler(move: TaskMover): TaskBucketDrop {
  return useCallback<TaskBucketDrop>(
    (dimension, section, destinationKind, payload) => {
      const submission = taskDropSubmission(
        dimension,
        section.key,
        destinationKind,
      );
      if (submission === null) return;
      const sourceBucket = payload.data?.[TASK_DROP_SOURCE_BUCKET] ?? null;
      const sourceKind = payload.data?.sourceKind ?? null;
      const sourceLabel = payload.data?.sourceLabel ?? "";
      const back =
        sourceBucket === null
          ? null
          : taskDropSubmission(
              dimension,
              sourceBucket,
              sourceKind === "area" || sourceKind === "project"
                ? sourceKind
                : null,
            );
      move(payload.id, {
        fields: submission.fields,
        patch: namedParentPatch(submission.patch, section.title),
        label: taskDropUndoLabel(dimension, section.title),
        undo:
          back === null
            ? null
            : {
                fields: back.fields,
                patch: namedParentPatch(back.patch, sourceLabel),
              },
      });
    },
    [move],
  );
}

/**
 * A grouped bucket, as a destination.
 *
 * The KIND of a parent bucket comes from the tasks already in it: a Project and
 * an Area are two different spine links, the grouping's key is only an entity
 * id, and the server never guesses which one a destination wants. An
 * open-ended bucket is only ever rendered when it holds at least one task, so
 * the answer is always available where it is needed.
 */
export function useTaskBucketDrop(
  section: GroupedSection,
  dimension: TaskDropDimension | null,
  onDropTask: TaskBucketDrop,
) {
  const parentKind = section.cards[0]?.parent?.kind ?? null;
  /*
   * `TaskRelationKind` includes `goal`, which a TASK's structural parent never
   * is — the spine puts a Task under a Project or an Area, and `setTaskParent`
   * accepts exactly those two. Narrowing rather than casting means a relation
   * kind that is not a valid Task parent yields NO destination at all, which is
   * the correct answer for a bucket the server could not accept.
   */
  const destinationKind =
    parentKind === "area" || parentKind === "project" ? parentKind : null;
  const submission =
    dimension === null
      ? null
      : taskDropSubmission(dimension, section.key, destinationKind);

  return useDropTarget({
    id: `task-bucket:${section.key}`,
    label: section.title,
    /*
     * A bucket that is not a destination registers NOTHING — there is no
     * element to hit-test and no state to draw. That is what §37 means by an
     * invalid target staying quiet: it never becomes a target at all.
     */
    disabled: dimension === null || submission === null,
    accepts: (payload) =>
      payload.kind === "task" &&
      payload.data?.[TASK_DROP_SOURCE_BUCKET] !== section.key,
    onDrop: (payload) => {
      if (dimension === null) return;
      onDropTask(dimension, section, destinationKind, payload);
    },
  });
}

/**
 * A Task row that can be lifted out of the bucket it is in.
 *
 * A COMPONENT rather than a prop on the row, because the grip needs a hook and
 * the row must stay the shared, drag-free object six surfaces draw. The payload
 * carries the bucket the row came from, so the bucket it came from can refuse
 * the drop and stay dark (§37), and carries the source's kind and words, so Undo
 * can restate the destination it is putting the Task back into.
 */
export function DraggableTaskRow({
  card,
  rowProps,
  bucketKey,
}: {
  readonly card: TaskCardData;
  readonly rowProps: TaskRowProps;
  readonly bucketKey: string;
}) {
  const renderPreview = useCallback(
    () => <TaskDragPreview card={card} />,
    [card],
  );
  const { handleProps, isGrabbed } = useDragHandle({
    payload: {
      kind: "task",
      id: card.id,
      label: card.title,
      data: {
        [TASK_DROP_SOURCE_BUCKET]: bucketKey,
        sourceKind: card.parent?.kind ?? null,
        sourceLabel: card.parentLabel ?? "",
      },
    },
    renderPreview,
    /*
     * No `home`: a Task list has no manual order to move WITHIN, so there is
     * nothing for a keyboard pick-up to do here. The keyboard equivalent of
     * this drag is the row's own DHDS-10 control, six pixels away, which
     * changes the same field by choosing (§30 of the brief).
     */
    label: `Move ${card.title}`,
  });
  return (
    <TaskRow
      {...rowProps}
      dragging={isGrabbed}
      dragHandle={
        <DragHandle
          {...handleProps}
          className="dh-action-reveal dh-taskrow__handle"
        />
      }
    />
  );
}

/**
 * The floating Task.
 *
 * Enough to recognise the object and no more: whether it is done, what it is
 * called, where it lives and how important it is — the same facts the row leads
 * with. Deliberately NOT a clone of the row: no columns, no editable fields, no
 * overflow, no dates. A preview is a picture of what is moving.
 */
function TaskDragPreview({ card }: { readonly card: TaskCardData }) {
  return (
    <span className="dh-taskrow__preview">
      <PriorityGlyph priority={card.priority} />
      <span
        className="dh-taskrow__preview-title"
        data-completed={card.completed ? "true" : undefined}
      >
        {card.title}
      </span>
      {card.parentLabel ? (
        <span className="dh-taskrow__preview-parent">{card.parentLabel}</span>
      ) : null}
    </span>
  );
}

/**
 * Fill in a parent patch's TITLE, which only the surface knows.
 *
 * `taskDropSubmission` is pure and knows a destination's id and kind; the word
 * on the bucket's heading is the surface's. Every other dimension's patch
 * passes through untouched.
 */
function namedParentPatch(
  patch: TaskListItemPatch,
  title: string,
): TaskListItemPatch {
  return patch.parent
    ? { ...patch, parent: { ...patch.parent, title } }
    : patch;
}
