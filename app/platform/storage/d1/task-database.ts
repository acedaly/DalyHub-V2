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
} from "~/kernel/tasks";
import { CorruptTaskRecordError } from "~/kernel/tasks";
import { parseMarkdownSource, type MarkdownSource } from "~/kernel/markdown";

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
  readonly parent_id: string | null;
  readonly parent_link_type: string | null;
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
  td.description AS description`;

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
