/**
 * MEET-02 — the meeting follow-up / Task-conversion orchestration.
 *
 * Turning a meeting item (or a direct meeting follow-up) into a canonical DalyHub
 * Task spans four writes across three repositories: the Task (the spine + task
 * detail authority), the durable source-item mapping (Meetings), the navigable
 * `task.relates_to` EntityLink, and the structural Activity event. The FND-07 Task
 * `createTask` encapsulates its OWN atomic `D1Database.batch()`, so these writes
 * cannot be fused into a single cross-repository transaction through the public
 * contracts. This module is therefore the explicit orchestration boundary the
 * prompt calls for, with:
 *
 *   - **A clear commit point** — `meetings.linkFollowUpTask` (the mapping row +
 *     its structural Activity, written in ONE batch). The conversion is "official"
 *     only once this commits.
 *   - **Idempotency** — the mapping is keyed on the source item (a unique index),
 *     so a retry of an already-converted item returns the SAME Task, never a
 *     second one.
 *   - **Recovery** — if the commit is lost to a concurrent winner
 *     (`MeetingFollowUpConflictError`) the just-created Task is compensated
 *     (soft-deleted) and the winning Task is returned; any other pre-commit failure
 *     soft-deletes the Task so the UI's "it failed" is truthful and a retry is
 *     clean.
 *   - **Truthful response semantics** — success is reported only after the commit
 *     point; the navigable EntityLink is a post-commit, self-healing step (a retry
 *     of an already-converted item re-asserts it via the idempotent link create).
 *
 * Task authority is never duplicated: every Task field flows through
 * `scope.tasks.createTask` / `updateTask`. This module writes no Task rows and
 * invents no status/priority vocabulary.
 *
 * Residual window (documented, not hidden): a hard process crash in the gap between
 * `createTask` committing and the mapping committing can leave one Task with no
 * mapping. Because that Task is invisible to the mapping-backed Follow-up surface, a
 * retry would create a second Task. This is the one state a single D1 batch would
 * remove; the encapsulated `createTask` batch is why it cannot be, and it is called
 * out in MEETINGS_MODULE.md.
 */

import {
  MeetingFollowUpConflictError,
  type MeetingItemKind,
} from "~/kernel/meetings";
import type {
  CommitmentState,
  TaskPriority,
  TaskStatus,
  TaskView,
  TimeSector,
} from "~/kernel/tasks";
import type { WorkspaceScope } from "~/platform/workspaces";
import { TASK_RELATES_TO } from "~/shared/task-record/task-view";

/** The Task planning fields a conversion/follow-up form may supply. */
export interface FollowUpTaskFields {
  readonly title: string;
  readonly parentId: string;
  readonly parentKind: "area" | "project";
  readonly priority?: TaskPriority | null;
  readonly dueDate?: string | null;
  readonly scheduledDate?: string | null;
  readonly timeSector?: TimeSector | null;
  readonly commitmentState?: CommitmentState;
  readonly status?: TaskStatus;
}

export interface ConvertResult {
  readonly taskId: string;
  /** `false` when an existing conversion was returned idempotently. */
  readonly created: boolean;
}

export class MeetingNotFoundError extends Error {
  constructor() {
    super("Meeting not found.");
    this.name = "MeetingNotFoundError";
  }
}

export class MeetingArchivedError extends Error {
  constructor() {
    super("This meeting is archived — restore it to create follow-up tasks.");
    this.name = "MeetingArchivedError";
  }
}

export class MeetingItemNotFoundError extends Error {
  constructor() {
    super("That meeting item no longer exists.");
    this.name = "MeetingItemNotFoundError";
  }
}

/**
 * Create the navigable Meeting↔Task relationship: a `task.relates_to` EntityLink
 * with the Task as source and the Meeting as target. Idempotent (a repeat returns
 * `already_exists`), so it is safe to re-assert on the idempotent conversion path.
 * Surfacing follows requirement 5: outgoing `task.relates_to` shows the Meeting in
 * the Task Drawer's Linked section, and the same link shows the Task (read-only) in
 * the Meeting's universal Linked Items — one row, navigable both ways.
 */
async function ensureRelatesLink(
  scope: WorkspaceScope,
  taskId: string,
  meetingId: string,
): Promise<void> {
  await scope.entityLinks.create({
    sourceEntityId: taskId,
    targetEntityId: meetingId,
    type: TASK_RELATES_TO,
  });
}

/** Create the base canonical Task through the Task authority (status applied later,
 * inside the compensated region — see `convert`). */
async function createBaseTask(
  scope: WorkspaceScope,
  fields: FollowUpTaskFields,
): Promise<TaskView> {
  return scope.tasks.createTask({
    title: fields.title,
    parent: { kind: fields.parentKind, id: fields.parentId },
    priority: fields.priority ?? null,
    dueDate: fields.dueDate ?? null,
    scheduledDate: fields.scheduledDate ?? null,
    timeSector: fields.timeSector ?? null,
    commitmentState: fields.commitmentState ?? "active",
  });
}

async function loadWritableMeeting(scope: WorkspaceScope, meetingId: string) {
  const meeting = await scope.meetings.get(meetingId);
  if (!meeting) throw new MeetingNotFoundError();
  if (meeting.archivedAt) throw new MeetingArchivedError();
  return meeting;
}

/**
 * Convert a specific agenda item / decision / outcome into a Task. Idempotent per
 * source item; safe against concurrent double-conversion.
 */
export async function convertMeetingItemToTask(
  scope: WorkspaceScope,
  meetingId: string,
  itemId: string,
  fields: FollowUpTaskFields,
): Promise<ConvertResult> {
  const meeting = await loadWritableMeeting(scope, meetingId);
  const item = meeting.items.find((i) => i.id === itemId);
  if (!item) throw new MeetingItemNotFoundError();

  // Idempotency: a live conversion for this item short-circuits — no second Task.
  const existing = await scope.meetings.getFollowUpForItem(itemId);
  if (existing) {
    const existingTask = await scope.tasks.getTask(existing.taskId);
    if (existingTask) {
      await ensureRelatesLink(scope, existingTask.id, meetingId);
      return { taskId: existingTask.id, created: false };
    }
    // The converted Task was deleted (canonical Task lifecycle) — the item is
    // convertible again. Drop the stale mapping before re-converting.
    await scope.meetings.removeFollowUpTask(existing.taskId);
  }

  return convert(scope, meetingId, itemId, item.kind, fields);
}

/** Create a Task that is a direct meeting follow-up (not tied to a specific item). */
export async function createMeetingFollowUpTask(
  scope: WorkspaceScope,
  meetingId: string,
  fields: FollowUpTaskFields,
): Promise<ConvertResult> {
  await loadWritableMeeting(scope, meetingId);
  return convert(scope, meetingId, null, undefined, fields);
}

async function convert(
  scope: WorkspaceScope,
  meetingId: string,
  itemId: string | null,
  itemKind: MeetingItemKind | undefined,
  fields: FollowUpTaskFields,
): Promise<ConvertResult> {
  const task = await createBaseTask(scope, fields);
  try {
    // `createTask` forces `status='todo'`; a non-default status is applied through
    // the Task authority INSIDE this compensated region, so an invalid/failed status
    // update (like any pre-commit failure) rolls the Task back — never an orphan.
    if (fields.status && fields.status !== "todo") {
      await scope.tasks.updateTask(task.id, { status: fields.status });
    }
    // COMMIT POINT: the mapping row + its structural Activity, in one batch.
    await scope.meetings.linkFollowUpTask({
      meetingId,
      itemId,
      taskId: task.id,
      itemKind,
    });
  } catch (cause) {
    // Compensate the just-created Task so a reported failure is truthful. Tasks are
    // a reserved spine type, so deletion goes through the spine (the Task authority).
    await scope.spine.softDelete(task.id);
    if (cause instanceof MeetingFollowUpConflictError && itemId !== null) {
      const winner = await scope.meetings.getFollowUpForItem(itemId);
      const winnerTask = winner
        ? await scope.tasks.getTask(winner.taskId)
        : null;
      if (winnerTask) {
        await ensureRelatesLink(scope, winnerTask.id, meetingId);
        return { taskId: winnerTask.id, created: false };
      }
    }
    throw cause;
  }
  // Post-commit, self-healing: a repeat conversion re-asserts this idempotently.
  await ensureRelatesLink(scope, task.id, meetingId);
  return { taskId: task.id, created: true };
}
