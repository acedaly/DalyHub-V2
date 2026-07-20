/**
 * TODAY-02 Tasks kernel — boundary validation.
 *
 * Pure, storage-independent validation of everything that crosses the task
 * boundary. Every repository entry point validates its inputs here BEFORE
 * touching storage, so invalid input can never write data (AGENTS.md §17).
 * Validators return the normalised value or throw `TaskValidationError`.
 *
 * Title validation reuses the shared entity title rules (trimmed, non-empty,
 * bounded by `TITLE_MAX_LENGTH`) — the task domain does not invent its own title
 * semantics — but raises a task-typed error so callers see one consistent error
 * family. The Markdown description is validated as SOURCE through the ONE shared
 * FND-08 parser (`parseMarkdownSource`); TODAY-02 adds no second parser or policy.
 */

import { ID_MAX_LENGTH, TITLE_MAX_LENGTH } from "~/kernel/entities";
import {
  MarkdownError,
  parseMarkdownSource,
  type MarkdownSource,
} from "~/kernel/markdown";

import { TaskValidationError } from "./task-errors";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "./task";
import { WAITING_NOTE_MAX_LENGTH } from "./task-identifiers";
import type { SetWaitingInput } from "./task";

/** Default number of task summaries returned by `listTasks` when no limit is given. */
export const DEFAULT_TASK_PAGE_SIZE = 50;

/** Hard upper bound on a single task list page — the safe maximum page size. */
export const MAX_TASK_PAGE_SIZE = 100;

/** Count Unicode code points, so validation matches user-perceived length. */
function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * Validate a non-empty identifier used verbatim as a lookup key. Not trimmed — a
 * surrounding-whitespace id is a caller bug, not something to silently "fix".
 */
export function validateTaskId(value: unknown): string {
  if (typeof value !== "string") {
    throw new TaskValidationError("id", "must be a string");
  }
  if (value.length === 0) {
    throw new TaskValidationError("id", "must not be empty");
  }
  if (value.length > ID_MAX_LENGTH) {
    throw new TaskValidationError(
      "id",
      `must be at most ${ID_MAX_LENGTH} characters`,
    );
  }
  return value;
}

/**
 * Validate and normalise a `title` using the shared entity title rules: required,
 * non-empty after trimming, within `TITLE_MAX_LENGTH` code points. Returns the
 * trimmed value, which is what gets stored.
 */
export function validateTaskTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new TaskValidationError("title", "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TaskValidationError("title", "must not be empty");
  }
  if (codePointLength(trimmed) > TITLE_MAX_LENGTH) {
    throw new TaskValidationError(
      "title",
      `must be at most ${TITLE_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

/** True when `value` is one of the open-state workflow positions. */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" &&
    (TASK_STATUSES as readonly string[]).includes(value)
  );
}

/** Validate a value as a `TaskStatus`. */
export function validateTaskStatus(value: unknown): TaskStatus {
  if (!isTaskStatus(value)) {
    throw new TaskValidationError(
      "status",
      'must be one of "todo" or "in_progress"',
    );
  }
  return value;
}

/** Validate a nullable priority. `null` is a valid "no priority". */
export function validateTaskPriority(value: unknown): TaskPriority | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value !== "string" ||
    !(TASK_PRIORITIES as readonly string[]).includes(value)
  ) {
    throw new TaskValidationError(
      "priority",
      'must be null or one of "low", "medium" or "high"',
    );
  }
  return value as TaskPriority;
}

/** A strict date-only `YYYY-MM-DD` shape, validated further for calendar validity. */
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Validate a nullable date-only value. `null`/empty clears it. A present value
 * must be a real calendar date in `YYYY-MM-DD` form — validated by integer
 * component ranges (with leap years), never routed through `Date` so it cannot
 * shift by timezone (ADR-022 dates rule). Returns the exact string stored.
 */
export function validateTaskDate(
  value: unknown,
  field: "dueDate" | "scheduledDate",
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new TaskValidationError(field, "must be a date string or null");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const match = DATE_ONLY_PATTERN.exec(trimmed);
  if (!match) {
    throw new TaskValidationError(field, "must be a YYYY-MM-DD date");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) {
    throw new TaskValidationError(field, "month must be between 01 and 12");
  }
  const maxDay =
    month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1]!;
  if (day < 1 || day > maxDay) {
    throw new TaskValidationError(field, "day is out of range for the month");
  }
  return trimmed;
}

/**
 * Validate a nullable Markdown description. `null` or an empty/whitespace-only
 * string clears it; otherwise the ORIGINAL source is preserved byte-for-byte and
 * validated by the shared FND-08 parser (size limit, control-character rules).
 * A Markdown validation failure is re-typed as a task validation error so the
 * error family stays consistent; other Markdown errors propagate.
 */
export function validateTaskDescription(value: unknown): MarkdownSource | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new TaskValidationError("description", "must be a string or null");
  }
  if (value.trim().length === 0) {
    return null;
  }
  try {
    return parseMarkdownSource(value);
  } catch (cause) {
    if (cause instanceof MarkdownError) {
      throw new TaskValidationError("description", cause.message);
    }
    throw cause;
  }
}

/**
 * Validate a free-text waiting subject: required, non-empty after trimming, within
 * `WAITING_NOTE_MAX_LENGTH` code points. Returns the TRIMMED value, which is what
 * gets stored — as PLAIN TEXT (rendered escaped, never HTML/Markdown). Control
 * characters are rejected so a subject stays a single-line label.
 */
export function validateWaitingNote(value: unknown): string {
  if (typeof value !== "string") {
    throw new TaskValidationError("waitingNote", "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TaskValidationError(
      "waitingNote",
      "enter what or whom this task is waiting on",
    );
  }
  if (codePointLength(trimmed) > WAITING_NOTE_MAX_LENGTH) {
    throw new TaskValidationError(
      "waitingNote",
      `must be at most ${WAITING_NOTE_MAX_LENGTH} characters`,
    );
  }
  // eslint-disable-next-line no-control-regex -- reject C0/C1 control characters.
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) {
    throw new TaskValidationError(
      "waitingNote",
      "must not contain control characters",
    );
  }
  return trimmed;
}

/**
 * Validate a waiting-target entity id used to activate an entity-backed waiting
 * state. Same rules as a task id (non-empty, bounded, not trimmed). The target's
 * existence, workspace, type and self-reference are checked against storage by the
 * repository — this only validates the id's SHAPE.
 */
export function validateWaitingTargetId(value: unknown): string {
  if (typeof value !== "string") {
    throw new TaskValidationError("waitingTargetId", "must be a string");
  }
  if (value.length === 0) {
    throw new TaskValidationError("waitingTargetId", "must not be empty");
  }
  if (value.length > ID_MAX_LENGTH) {
    throw new TaskValidationError(
      "waitingTargetId",
      `must be at most ${ID_MAX_LENGTH} characters`,
    );
  }
  return value;
}

/**
 * Validate and normalise a {@link SetWaitingInput}: EXACTLY ONE subject — an entity
 * target id or a free-text note — must be supplied. A malformed shape, or one that
 * supplies neither/both, is rejected before any storage access. Returns the
 * normalised discriminated subject the repository writes.
 */
export function validateSetWaitingInput(
  input: SetWaitingInput,
):
  | { readonly kind: "entity"; readonly targetId: string }
  | { readonly kind: "text"; readonly note: string } {
  const target = (input as { target?: unknown }).target;
  if (target === null || typeof target !== "object") {
    throw new TaskValidationError(
      "waitingTarget",
      "a waiting subject is required",
    );
  }
  const kind = (target as { kind?: unknown }).kind;
  if (kind === "entity") {
    const targetId = validateWaitingTargetId(
      (target as { targetId?: unknown }).targetId,
    );
    return { kind: "entity", targetId };
  }
  if (kind === "text") {
    const note = validateWaitingNote((target as { note?: unknown }).note);
    return { kind: "text", note };
  }
  throw new TaskValidationError(
    "waitingTarget",
    "must wait on an entity or a free-text subject",
  );
}

/**
 * Validate and clamp a requested page limit to `[1, MAX_TASK_PAGE_SIZE]`. A
 * missing limit yields `DEFAULT_TASK_PAGE_SIZE`. A non-integer or non-positive
 * limit is a caller error and is rejected rather than silently coerced.
 */
export function validateTaskLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_TASK_PAGE_SIZE;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TaskValidationError("limit", "must be an integer");
  }
  if (value < 1) {
    throw new TaskValidationError("limit", "must be at least 1");
  }
  return Math.min(value, MAX_TASK_PAGE_SIZE);
}
