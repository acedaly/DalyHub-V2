/**
 * AUDIT-13 — Meeting → Task conversion as ONE domain operation.
 *
 * Turning a meeting item (or a direct meeting follow-up) into a canonical DalyHub
 * Task is one thing the owner asked for, and it touches four places: the Task
 * itself, the durable source-item mapping, the navigable `task.relates_to`
 * EntityLink and the structural Activity event. Before this port, route code
 * orchestrated those through separate public repository methods — `createTask`,
 * then `linkFollowUpTask`, then `entityLinks.create` — each with its own
 * transaction, and a failure between them left an orphan Task that a retry would
 * duplicate. Compensation (soft-deleting the just-created Task) narrowed the
 * window; it did not close it.
 *
 * So the sequence is not a thing a caller can get wrong any more: there is ONE
 * method, the implementation commits every write in a single storage transaction,
 * and there is no public API left that performs half of it.
 *
 * The port is storage-independent by construction — it names domain values only.
 */

import type {
  TaskPriority,
  TaskStatus,
  TimeSector,
  CommitmentState,
} from "../tasks";

/** The Task planning fields a conversion or follow-up form may supply. */
export interface MeetingTaskFields {
  readonly title: string;
  /**
   * The structural parent, or `null` for an intentionally unassigned (Inbox)
   * Task. TASKS-04 permits a parentless Task, and the AI acceptance path needs
   * it: the owner may accept a proposed follow-up without choosing a Project.
   */
  readonly parent: {
    readonly kind: "area" | "project";
    readonly id: string;
  } | null;
  readonly priority?: TaskPriority | null;
  readonly dueDate?: string | null;
  readonly scheduledDate?: string | null;
  readonly timeSector?: TimeSector | null;
  readonly commitmentState?: CommitmentState;
  readonly status?: TaskStatus;
  /** The Task's Markdown description. Written in the same transaction. */
  readonly description?: string | null;
}

export interface MeetingTaskConversionInput {
  readonly meetingId: string;
  /** The source item, or `null` for a direct meeting follow-up. */
  readonly itemId: string | null;
  readonly task: MeetingTaskFields;
}

export interface MeetingTaskConversionResult {
  readonly taskId: string;
  /** `false` when an existing conversion was returned idempotently. */
  readonly created: boolean;
}

/**
 * The one authority for converting a Meeting's work into a Task.
 *
 * Contract:
 *   - **Atomic.** The Task (entity, spine record, planning slice, its `entity.created`
 *     and structural-link Activity), the `meeting_item_tasks` mapping and its
 *     `meeting.item_converted_to_task` / `meeting.follow_up_created` event, and the
 *     navigable `task.relates_to` EntityLink with its own event, all commit in ONE
 *     storage transaction. A failure anywhere leaves no Task, no mapping, no link
 *     and no Activity.
 *   - **Idempotent per source item.** A second conversion of an item that already
 *     has a live Task returns THAT Task with `created: false` and writes nothing.
 *     A double-click, a browser retry and a replayed request all converge on one
 *     Task; the guarantee is the `(workspace_id, item_id)` unique index, never a
 *     swallowed constraint error.
 *   - **Concurrency-safe.** Two simultaneous conversions of one item race on that
 *     index; the loser's whole transaction rolls back and it returns the winner's
 *     Task. There is no window in which the loser's Task exists.
 *   - **Workspace-bound.** Every statement is scoped to the repository's own
 *     workspace, so no meeting, item, parent or Task from another workspace can
 *     take part.
 *
 * Throws `MeetingNotFoundError` (missing / deleted / wrong type / cross-workspace),
 * `MeetingArchivedError`, `MeetingItemNotFoundError`, and the Task repository's own
 * typed errors for an invalid title, parent or description.
 */
export interface MeetingTaskConversionRepository {
  convert(
    input: MeetingTaskConversionInput,
  ): Promise<MeetingTaskConversionResult>;
}

/** The source item named by a conversion no longer exists on that meeting. */
export class MeetingItemNotFoundError extends Error {
  constructor() {
    super("That meeting item no longer exists.");
    this.name = "MeetingItemNotFoundError";
  }
}
