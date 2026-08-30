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
  COMMITMENT_STATES,
  DEFAULT_TASK_DETAILS,
  DEFAULT_TASK_RECURRENCE_MODE,
  DEFAULT_TASK_RECURRENCE_WEEKEND_RULE,
  isTaskStatus,
  TASK_PRIORITIES,
  TIME_SECTORS,
  validateTaskRecurrenceRule,
  type CommitmentState,
  type TaskDelegation,
  type TaskDetails,
  type TaskPriority,
  type TaskRecurrenceRule,
  type TaskRecurrenceSeries,
  type TaskStatus,
  type TaskWaiting,
  type TaskChecklistItem,
  type TaskWaitingSubject,
  type TimeSector,
} from "~/kernel/tasks";
import { CorruptTaskRecordError } from "~/kernel/tasks";
import { parseMarkdownSource, type MarkdownSource } from "~/kernel/markdown";

import { fromStorageTimestamp } from "./database";
import { entityTagsProjection, parseTagProjection } from "./d1-entity-tags";

/** The raw `task_details` row, exactly as stored in D1. Never exposed outside the adapter. */
export interface TaskDetailsRow {
  readonly workspace_id: string;
  readonly entity_id: string;
  readonly entity_type: string;
  readonly status: string;
  readonly priority: string | null;
  readonly due_date: string | null;
  readonly scheduled_date: string | null;
  readonly time_sector: string | null;
  readonly commitment_state: string;
  readonly delegate_to: string | null;
  readonly delegated_on: string | null;
  readonly follow_up_on: string | null;
  readonly delegate_note: string | null;
  readonly description: string | null;
  readonly waiting_since: string | null;
  readonly waiting_note: string | null;
  readonly recurrence_frequency: string | null;
  readonly recurrence_interval: number | null;
  readonly recurrence_weekdays: string | null;
  readonly recurrence_date_kind: string | null;
  readonly recurrence_anchor_day: number | null;
  readonly recurrence_anchor_month: number | null;
  readonly recurrence_series_id: string | null;
  readonly recurrence_sequence: number | null;
  readonly recurrence_mode: string | null;
  readonly recurrence_series_anchor_date: string | null;
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
  readonly time_sector: string | null;
  readonly commitment_state: string | null;
  readonly delegate_to: string | null;
  readonly delegated_on: string | null;
  readonly follow_up_on: string | null;
  readonly delegate_note: string | null;
  readonly description: string | null;
  readonly waiting_since: string | null;
  readonly waiting_note: string | null;
  readonly recurrence_frequency: string | null;
  readonly recurrence_interval: number | null;
  readonly recurrence_weekdays: string | null;
  readonly recurrence_date_kind: string | null;
  readonly recurrence_anchor_day: number | null;
  readonly recurrence_anchor_month: number | null;
  readonly recurrence_series_id: string | null;
  readonly recurrence_sequence: number | null;
  readonly recurrence_mode: string | null;
  readonly recurrence_series_anchor_date: string | null;
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
  td.time_sector AS time_sector,
  td.commitment_state AS commitment_state,
  td.delegate_to AS delegate_to,
  td.delegated_on AS delegated_on,
  td.follow_up_on AS follow_up_on,
  td.delegate_note AS delegate_note,
  td.description AS description,
  td.waiting_since AS waiting_since,
  td.waiting_note AS waiting_note,
  rr.frequency AS recurrence_frequency,
  rr.interval AS recurrence_interval,
  rr.weekdays AS recurrence_weekdays,
  rr.date_kind AS recurrence_date_kind,
  rr.anchor_day AS recurrence_anchor_day,
  rr.anchor_month AS recurrence_anchor_month,
  rr.series_id AS recurrence_series_id,
  rr.sequence AS recurrence_sequence,
  rr.mode AS recurrence_mode,
  rr.series_anchor_date AS recurrence_series_anchor_date,
  rr.ordinal AS recurrence_ordinal,
  rr.weekend_rule AS recurrence_weekend_rule,
  rr.ends_after_count AS recurrence_ends_after_count,
  rr.ends_on_date AS recurrence_ends_on_date,
  ${entityTagsProjection("e", "id")} AS tags`;

/**
 * RECALL-01 — the same columns for the SEARCH projection, with the Task's
 * DESCRIPTION dropped.
 *
 * A search row never renders a description: `#toTaskListItem` builds a
 * `TaskListItem`, which has no such field. Selecting it anyway meant a Task with
 * a 100 KiB description shipped all 100 KiB from D1 into the Worker on every
 * search that matched it, only to be discarded — which is exactly what the
 * excerpt contract exists to prevent. The bounded excerpt window is projected
 * separately (`search-excerpt.ts`); this is the only read that needs the column
 * gone, so the shared list columns are left alone.
 */
export const TASK_SEARCH_DETAIL_COLUMNS = TASK_DETAIL_COLUMNS.replace(
  "td.description AS description,",
  "NULL AS description,",
);

/**
 * The `task_recurrence_rules` join every task read uses. Declared HERE, next to the
 * aliased columns it feeds, so a query can never select the recurrence columns
 * without the join that supplies them.
 */
export const TASK_RECURRENCE_JOIN = `LEFT JOIN task_recurrence_rules rr
           ON rr.workspace_id = e.workspace_id AND rr.entity_id = e.id`;

/**
 * The resolved `task.waiting_on` target columns, aliased. Joined via the active
 * waiting link (`wl`) and its active counterpart entity (`we`). Appended to a read
 * that needs the entity-backed waiting subject resolved live.
 */
export const WAITING_TARGET_COLUMNS = `
  we.id AS waiting_target_id,
  we.type AS waiting_target_type,
  we.title AS waiting_target_title`;

/**
 * TASKS-13 — the raw `task_checklist_items` row, exactly as stored in D1.
 *
 * `completed` is SQLite's 0/1 integer, never a boolean, and the conversion lives
 * in {@link rowToChecklistItem} so no query result reaches the domain with a
 * truthy number standing in for a flag.
 */
export interface TaskChecklistItemRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly task_id: string;
  readonly title: string;
  readonly position: number;
  readonly completed: number;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * The columns a checklist read selects, aliased. Declared here beside the row
 * type so a query cannot select a shape the converter does not expect.
 */
export const TASK_CHECKLIST_COLUMNS = `ci.id AS id,
  ci.workspace_id AS workspace_id,
  ci.task_id AS task_id,
  ci.title AS title,
  ci.position AS position,
  ci.completed AS completed,
  ci.created_at AS created_at,
  ci.updated_at AS updated_at`;

/**
 * The ORDER the whole product reads a checklist in.
 *
 * A TOTAL order: `position` is the owner's choice, and `created_at, id` break a
 * tie that a reorder interrupted mid-flight could otherwise leave. Declared once
 * so the record, the recurrence clone and every test agree by construction.
 */
export const TASK_CHECKLIST_ORDER = `ci.position ASC, ci.created_at ASC, ci.id ASC`;

/** Convert a stored checklist row into the domain item. Total and defensive. */
export function rowToChecklistItem(
  row: TaskChecklistItemRow,
): TaskChecklistItem {
  if (!Number.isInteger(row.position) || row.position < 0) {
    throw new CorruptTaskRecordError();
  }
  if (row.completed !== 0 && row.completed !== 1) {
    throw new CorruptTaskRecordError();
  }
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    position: row.position,
    completed: row.completed === 1,
    createdAt: fromStorageTimestamp(row.created_at),
    updatedAt: fromStorageTimestamp(row.updated_at),
  };
}

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

/** Validate a stored time-sector string (or null) into a domain value; defensive. */
function toTimeSector(value: string | null): TimeSector | null {
  if (value === null) {
    return null;
  }
  if (!(TIME_SECTORS as readonly string[]).includes(value)) {
    throw new CorruptTaskRecordError();
  }
  return value as TimeSector;
}

/** Validate a stored commitment-state string (or null → default); defensive. */
function toCommitmentState(value: string | null): CommitmentState {
  if (value === null) {
    return DEFAULT_TASK_DETAILS.commitmentState;
  }
  if (!(COMMITMENT_STATES as readonly string[]).includes(value)) {
    throw new CorruptTaskRecordError();
  }
  return value as CommitmentState;
}

/** Build a `TaskDelegation` from the stored columns; null when not delegated. */
function toDelegation(row: {
  readonly delegate_to: string | null;
  readonly delegated_on: string | null;
  readonly follow_up_on: string | null;
  readonly delegate_note: string | null;
}): TaskDelegation | null {
  if (row.delegate_to === null) {
    return null;
  }
  return {
    to: row.delegate_to,
    delegatedOn: row.delegated_on,
    followUpOn: row.follow_up_on,
    note: row.delegate_note,
  };
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

function toRecurrence(row: {
  readonly recurrence_frequency?: string | null;
  readonly recurrence_interval?: number | null;
  readonly recurrence_weekdays?: string | null;
  readonly recurrence_date_kind?: string | null;
  readonly recurrence_anchor_day?: number | null;
  readonly recurrence_anchor_month?: number | null;
  readonly recurrence_mode?: string | null;
  readonly recurrence_ordinal?: string | null;
  readonly recurrence_weekend_rule?: string | null;
  readonly recurrence_ends_after_count?: number | null;
  readonly recurrence_ends_on_date?: string | null;
}): TaskRecurrenceRule | null {
  if (
    row.recurrence_frequency === null ||
    row.recurrence_frequency === undefined
  ) {
    return null;
  }
  const weekdays =
    row.recurrence_weekdays === null || row.recurrence_weekdays === undefined
      ? []
      : row.recurrence_weekdays
          .split(",")
          .filter((part) => part.length > 0)
          .map((part) => Number(part));
  try {
    return validateTaskRecurrenceRule({
      frequency: row.recurrence_frequency as TaskRecurrenceRule["frequency"],
      interval: row.recurrence_interval ?? 1,
      dateKind: row.recurrence_date_kind as TaskRecurrenceRule["dateKind"],
      weekdays,
      mode: (row.recurrence_mode ??
        DEFAULT_TASK_RECURRENCE_MODE) as TaskRecurrenceRule["mode"],
      anchorDay: row.recurrence_anchor_day ?? null,
      anchorMonth: row.recurrence_anchor_month ?? null,
      // TASKS-12 — the four advanced fields. Each has a documented absent value
      // that reproduces the pre-TASKS-12 rule exactly, so a row written before
      // migration 0047 reads back as the rule it has always been.
      ordinal: (row.recurrence_ordinal ??
        null) as TaskRecurrenceRule["ordinal"],
      weekendRule: (row.recurrence_weekend_rule ??
        DEFAULT_TASK_RECURRENCE_WEEKEND_RULE) as TaskRecurrenceRule["weekendRule"],
      endsAfterCount: row.recurrence_ends_after_count ?? null,
      endsOnDate: row.recurrence_ends_on_date ?? null,
    });
  } catch {
    throw new CorruptTaskRecordError();
  }
}

/**
 * The persisted series identity of a recurring occurrence. Present exactly when the
 * recurrence row is — the two are one row, so they can never disagree.
 */
function toRecurrenceSeries(row: {
  readonly recurrence_series_id?: string | null;
  readonly recurrence_sequence?: number | null;
  readonly recurrence_mode?: string | null;
  readonly recurrence_series_anchor_date?: string | null;
}): TaskRecurrenceSeries | null {
  const seriesId = row.recurrence_series_id;
  if (seriesId === null || seriesId === undefined || seriesId.length === 0) {
    return null;
  }
  const sequence = row.recurrence_sequence;
  if (
    sequence === null ||
    sequence === undefined ||
    !Number.isInteger(sequence) ||
    sequence < 0
  ) {
    throw new CorruptTaskRecordError();
  }
  return {
    seriesId,
    sequence,
    // TASKS-07: the grid this SERIES is stepped from, when the current occurrence was
    // deliberately moved off it ("change this occurrence"). NULL — the ordinary case,
    // and every row written before TASKS-07 — means the occurrence's own date IS the
    // grid, which is the behaviour the series always had.
    scheduleAnchorDate: row.recurrence_series_anchor_date ?? null,
  };
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
  readonly time_sector?: string | null;
  readonly commitment_state?: string | null;
  readonly delegate_to?: string | null;
  readonly delegated_on?: string | null;
  readonly follow_up_on?: string | null;
  readonly delegate_note?: string | null;
  readonly recurrence_frequency?: string | null;
  readonly recurrence_interval?: number | null;
  readonly recurrence_weekdays?: string | null;
  readonly recurrence_date_kind?: string | null;
  readonly recurrence_anchor_day?: number | null;
  readonly recurrence_anchor_month?: number | null;
  readonly recurrence_series_id?: string | null;
  readonly recurrence_sequence?: number | null;
  readonly recurrence_mode?: string | null;
  readonly recurrence_series_anchor_date?: string | null;
  readonly description: string | null;
  /**
   * V2.6 FIND-03 — the `char(31)`-delimited tag labels the shared projection
   * adds to a read. Optional so a caller that does not project them (a write's
   * `RETURNING`, which cannot correlate a sub-select) still builds a valid
   * record, with no tags rather than a wrong answer.
   */
  readonly tags?: string | null;
}): TaskDetails {
  return {
    status: toStatus(row.status),
    priority: toPriority(row.priority),
    dueDate: row.due_date,
    scheduledDate: row.scheduled_date,
    timeSector: toTimeSector(row.time_sector ?? null),
    commitmentState: toCommitmentState(row.commitment_state ?? null),
    delegation: toDelegation({
      delegate_to: row.delegate_to ?? null,
      delegated_on: row.delegated_on ?? null,
      follow_up_on: row.follow_up_on ?? null,
      delegate_note: row.delegate_note ?? null,
    }),
    recurrence: toRecurrence(row),
    recurrenceSeries: toRecurrenceSeries(row),
    description: toDescription(row.description),
    tags: parseTagProjection(row.tags ?? null),
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
