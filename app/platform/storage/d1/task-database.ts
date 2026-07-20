/**
 * TODAY-02 Tasks — D1 adapter boundary types and conversions.
 *
 * Owns the ONLY place the storage-facing `task_details` snake_case shape and the
 * joined task read-row exist, and converts raw rows into the domain detail/view
 * shapes, so those specifics never leak past the adapter into the kernel contract
 * (ADR-028; mirrors `spine-database.ts`).
 *
 * A task read joins `entities` (the shared header), `spine_records` (completion),
 * `task_details` (the additive fields, LEFT JOINed — an unedited task has none)
 * and, via a single active structural EntityLink, the task's parent. The
 * project/goal/area relationships are resolved by the repository walking the
 * hierarchy, not by this converter.
 */

import {
  DEFAULT_TASK_DETAILS,
  isTaskStatus,
  TASK_PRIORITIES,
  type TaskDetails,
  type TaskPriority,
  type TaskStatus,
  type TaskWaiting,
  type TaskWaitingSubject,
} from "~/kernel/tasks";
import { CorruptTaskRecordError } from "~/kernel/tasks";
import { parseMarkdownSource, type MarkdownSource } from "~/kernel/markdown";

import { fromStorageTimestamp } from "./database";

/** The raw `task_details` row, exactly as stored in D1. Never exposed outside the adapter. */
export interface TaskDetailsRow {
  readonly workspace_id: string;
  readonly entity_id: string;
  readonly entity_type: string;
  readonly status: string;
  readonly priority: string | null;
  readonly due_date: string | null;
  readonly scheduled_date: string | null;
  readonly description: string | null;
  readonly waiting_since: string | null;
  readonly waiting_note: string | null;
  readonly updated_at: string;
}

/**
 * The projected row of a task read: the entity header, spine completion, the
 * (possibly absent) additive details, and the task's single active structural
 * parent link (both parent columns null for an orphaned read). Column aliases keep
 * the join unambiguous.
 */
export interface TaskJoinedRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly completed_at: string | null;
  readonly status: string | null;
  readonly priority: string | null;
  readonly due_date: string | null;
  readonly scheduled_date: string | null;
  readonly description: string | null;
  readonly waiting_since: string | null;
  readonly waiting_note: string | null;
  readonly parent_id: string | null;
  readonly parent_link_type: string | null;
}

/**
 * The resolved `task.waiting_on` target columns a waiting read LEFT JOINs (the
 * active waiting link and its active counterpart entity). All null for a task with
 * no active waiting link, or whose entity target was soft-deleted (degrades
 * gracefully to an unresolved subject).
 */
export interface WaitingTargetColumns {
  readonly waiting_target_id: string | null;
  readonly waiting_target_type: string | null;
  readonly waiting_target_title: string | null;
}

/** The entity + spine + details columns a joined task read selects, aliased. */
export const TASK_DETAIL_COLUMNS = `
  e.id AS id,
  e.workspace_id AS workspace_id,
  e.title AS title,
  e.created_at AS created_at,
  e.updated_at AS updated_at,
  e.deleted_at AS deleted_at,
  sr.completed_at AS completed_at,
  td.status AS status,
  td.priority AS priority,
  td.due_date AS due_date,
  td.scheduled_date AS scheduled_date,
  td.description AS description,
  td.waiting_since AS waiting_since,
  td.waiting_note AS waiting_note`;

/**
 * The resolved `task.waiting_on` target columns, aliased. Joined via the active
 * waiting link (`wl`) and its active counterpart entity (`we`). Appended to a read
 * that needs the entity-backed waiting subject resolved live.
 */
export const WAITING_TARGET_COLUMNS = `
  we.id AS waiting_target_id,
  we.type AS waiting_target_type,
  we.title AS waiting_target_title`;

/** Validate a stored priority string (or null) into a domain value; defensive. */
function toPriority(value: string | null): TaskPriority | null {
  if (value === null) {
    return null;
  }
  if (!(TASK_PRIORITIES as readonly string[]).includes(value)) {
    throw new CorruptTaskRecordError();
  }
  return value as TaskPriority;
}

/** Validate a stored status string (or null → default) into a domain value; defensive. */
function toStatus(value: string | null): TaskStatus {
  if (value === null) {
    return DEFAULT_TASK_DETAILS.status;
  }
  if (!isTaskStatus(value)) {
    throw new CorruptTaskRecordError();
  }
  return value;
}

/** Re-brand a stored Markdown description (already validated on write); defensive. */
function toDescription(value: string | null): MarkdownSource | null {
  if (value === null) {
    return null;
  }
  try {
    return parseMarkdownSource(value);
  } catch {
    throw new CorruptTaskRecordError();
  }
}

/**
 * Convert the additive-detail columns of a joined task read into `TaskDetails`,
 * applying the documented defaults when the task has no `task_details` row yet.
 * Total but DEFENSIVE: a stored value outside its closed set surfaces as
 * `CorruptTaskRecordError` rather than being silently coerced.
 */
export function rowToTaskDetails(row: {
  readonly status: string | null;
  readonly priority: string | null;
  readonly due_date: string | null;
  readonly scheduled_date: string | null;
  readonly description: string | null;
}): TaskDetails {
  return {
    status: toStatus(row.status),
    priority: toPriority(row.priority),
    dueDate: row.due_date,
    scheduledDate: row.scheduled_date,
    description: toDescription(row.description),
  };
}

/**
 * Build a task's waiting state from its stored columns and the resolved
 * `task.waiting_on` target. Returns null when the task is not waiting
 * (`waiting_since IS NULL`). A free-text subject wins when `waiting_note` is set;
 * otherwise the subject is entity-backed — resolved to the joined target's current
 * type/title, or a null-field subject when the target was soft-deleted/unlinked
 * (a waiting record with a temporarily unresolved subject, which the UI degrades
 * gracefully). Defensive: an active waiting state with neither a note nor a
 * resolvable link surfaces as an unresolved entity subject, never a crash.
 */
export function rowToTaskWaiting(
  row: {
    readonly waiting_since: string | null;
    readonly waiting_note: string | null;
  } & Partial<WaitingTargetColumns>,
): TaskWaiting | null {
  if (row.waiting_since === null) {
    return null;
  }
  const since = fromStorageTimestamp(row.waiting_since);
  if (row.waiting_note !== null) {
    const subject: TaskWaitingSubject = {
      kind: "text",
      note: row.waiting_note,
    };
    return { since, subject };
  }
  const subject: TaskWaitingSubject = {
    kind: "entity",
    id: row.waiting_target_id ?? null,
    type: row.waiting_target_type ?? null,
    title: row.waiting_target_title ?? null,
  };
  return { since, subject };
}
