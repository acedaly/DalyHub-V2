/**
 * MEET-02 — the pure Follow-up presentation view-model.
 *
 * Groups a meeting's follow-up Tasks into Open / Waiting-or-delegated / Completed
 * bands and resolves which structured meeting items are still unconverted. Every
 * derivation reads the CANONICAL Task display-state evaluator (`taskDisplayState`,
 * ADR-043 §6) — never a cached Meeting-side status — so the Follow-up surface can
 * never drift from the Task model. React-free and side-effect-free, so it is unit
 * tested directly.
 */

import {
  taskDisplayState,
  type SerializedTaskListItem,
  type SerializedTaskView,
} from "~/shared/task-record/task-view";
import type { MeetingItemKind } from "~/kernel/meetings";

/** One resolved follow-up: a canonical Task plus its meeting source item (or null). */
export interface FollowUpTaskEntry {
  readonly task: SerializedTaskView;
  /** The source `MeetingItem.id`, or `null` for a direct meeting follow-up. */
  readonly itemId: string | null;
}

export type FollowUpGroupKey = "open" | "waiting" | "done";

export interface FollowUpGroup {
  readonly key: FollowUpGroupKey;
  readonly label: string;
  readonly emptyHint: string;
  readonly entries: readonly FollowUpTaskEntry[];
}

/** The band a follow-up Task belongs to, from its canonical display state. */
export function followUpGroupOf(task: SerializedTaskView): FollowUpGroupKey {
  switch (taskDisplayState(task).kind) {
    case "completed":
    case "cancelled":
      return "done";
    case "waiting":
    case "on_hold":
      return "waiting";
    default:
      // in_progress, planned, inbox, someday — still open follow-up work.
      return "open";
  }
}

const GROUP_META: Record<
  FollowUpGroupKey,
  { readonly label: string; readonly emptyHint: string }
> = {
  open: {
    label: "Open",
    emptyHint: "No open follow-up tasks.",
  },
  waiting: {
    label: "Waiting or delegated",
    emptyHint: "Nothing is waiting on someone else.",
  },
  done: {
    label: "Completed",
    emptyHint: "Nothing completed yet.",
  },
};

const GROUP_ORDER: readonly FollowUpGroupKey[] = ["open", "waiting", "done"];

/** Group resolved follow-ups into the three ordered bands (each may be empty). */
export function groupFollowUps(
  entries: readonly FollowUpTaskEntry[],
): readonly FollowUpGroup[] {
  return GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_META[key].label,
    emptyHint: GROUP_META[key].emptyHint,
    entries: entries.filter((e) => followUpGroupOf(e.task) === key),
  }));
}

/** True when the meeting has no live follow-up Tasks at all. */
export function hasNoFollowUps(entries: readonly FollowUpTaskEntry[]): boolean {
  return entries.length === 0;
}

/** True when every follow-up Task is in the Completed band. */
export function allFollowUpsComplete(
  entries: readonly FollowUpTaskEntry[],
): boolean {
  return (
    entries.length > 0 &&
    entries.every((e) => followUpGroupOf(e.task) === "done")
  );
}

/** A structured meeting item and whether it has a live converted Task. */
export interface MeetingItemConversion {
  readonly itemId: string;
  readonly kind: MeetingItemKind;
  readonly bodyMarkdown: string;
  readonly position: number;
  /** The live converted Task id, or `null` when still unconverted. */
  readonly taskId: string | null;
  /** The canonical display-state label of the converted Task, when converted. */
  readonly taskStateLabel: string | null;
}

/** Human label for a meeting item's stable kind (never colour-only). */
export function meetingItemKindLabel(kind: MeetingItemKind): string {
  switch (kind) {
    case "agenda":
      return "Agenda item";
    case "decision":
      return "Decision";
    case "outcome":
      return "Outcome";
    case "action":
      return "Action item";
  }
}

/**
 * Resolve, for each structured meeting item, whether it has a LIVE converted Task
 * (a mapping whose Task still exists). `liveTaskByItem` maps a source item id to
 * its resolved Task; an item absent from the map is unconverted.
 */
export function resolveItemConversions(
  items: readonly {
    readonly id: string;
    readonly kind: MeetingItemKind;
    readonly bodyMarkdown: string;
    readonly position: number;
  }[],
  liveTaskByItem: ReadonlyMap<string, SerializedTaskView>,
): readonly MeetingItemConversion[] {
  return items.map((item) => {
    const task = liveTaskByItem.get(item.id) ?? null;
    return {
      itemId: item.id,
      kind: item.kind,
      bodyMarkdown: item.bodyMarkdown,
      position: item.position,
      taskId: task ? task.id : null,
      taskStateLabel: task ? taskDisplayState(task).label : null,
    };
  });
}

/**
 * UNTITLED-14 — one follow-up Task, in the shape the SHARED row reads.
 *
 * §K of the redesign brief: "Actions that are Tasks MUST use DalyHub's shared
 * Task system. Do not create another task UI." The Follow-up tab drew its own —
 * a title button and a state word — so a Task on a Meeting had no completion
 * control, no due date, no priority and no overflow, and looked nothing like the
 * same Task on `/tasks`, on Today or inside its Project.
 *
 * The only structural gap between the Meeting loader's `SerializedTaskView` and
 * the row's `SerializedTaskListItem` is the parent: the view carries the three
 * spine relations separately, the list item carries the ONE that parents the
 * Task. The spine is Area → Goal → Project → Task, so a Task's structural parent
 * is its Project where it has one and its Area otherwise — a Goal never parents a
 * Task directly (AGENTS.md §4). Nothing else is derived, renamed or invented.
 */
export function toFollowUpListItem(
  task: SerializedTaskView,
): SerializedTaskListItem {
  return {
    id: task.id,
    title: task.title,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    scheduledDate: task.scheduledDate,
    timeSector: task.timeSector,
    commitmentState: task.commitmentState,
    delegation: task.delegation,
    recurrence: task.recurrence,
    parent: task.project ?? task.area,
    waiting: task.waiting,
  };
}
