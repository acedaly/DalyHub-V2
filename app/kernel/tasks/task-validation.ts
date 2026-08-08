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

import { TaskValidationError, type TaskValidationField } from "./task-errors";
import {
  COMMITMENT_STATES,
  TASK_COMPLETED_VISIBILITIES,
  TASK_DUE_STATES,
  TASK_PARENT_KINDS,
  TASK_PLANNED_STATES,
  TASK_PRIORITIES,
  TASK_RECENCY_WINDOWS,
  TASK_RECENCY_WINDOW_DAYS,
  TASK_SERIES_EDIT_SCOPES,
  TASK_SORTS,
  TASK_SORT_DIRECTIONS,
  TASK_STATUSES,
  TASK_SYSTEM_VIEWS,
  TIME_SECTORS,
  WORKSPACE_TASK_GROUP_DIMENSIONS,
  type CommitmentState,
  type TaskCompletedVisibility,
  type TaskDelegation,
  type TaskDelegationInput,
  type TaskDueState,
  type TaskParentKind,
  type TaskPlannedState,
  type TaskPriority,
  type TaskRecencyWindow,
  type TaskSeriesEditScope,
  type TaskSort,
  type TaskSortDirection,
  type TaskStatus,
  type TaskSystemView,
  type TimeSector,
  type WorkspaceTaskGroupDimension,
} from "./task";
import {
  DELEGATE_TO_MAX_LENGTH,
  DELEGATION_NOTE_MAX_LENGTH,
  MAX_PLAN_BATCH_SIZE,
  WAITING_NOTE_MAX_LENGTH,
} from "./task-identifiers";
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
      'must be one of "todo", "in_progress", "on_hold" or "cancelled"',
    );
  }
  return value;
}

/** Validate a nullable priority. `null` is a valid "no priority" (untriaged). */
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
      'must be null or one of "p1", "p2", "p3" or "p4"',
    );
  }
  return value as TaskPriority;
}

/** Validate a nullable Time Sector. `null`/empty means "no sector" (Inbox). */
export function validateTimeSector(value: unknown): TimeSector | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (
    typeof value !== "string" ||
    !(TIME_SECTORS as readonly string[]).includes(value)
  ) {
    throw new TaskValidationError(
      "timeSector",
      "must be null or a valid time sector",
    );
  }
  return value as TimeSector;
}

/** Validate a commitment state. Defaults to `active` for null/undefined. */
export function validateCommitmentState(value: unknown): CommitmentState {
  if (value === null || value === undefined || value === "") {
    return "active";
  }
  if (
    typeof value !== "string" ||
    !(COMMITMENT_STATES as readonly string[]).includes(value)
  ) {
    throw new TaskValidationError(
      "commitmentState",
      'must be "active" or "someday"',
    );
  }
  return value as CommitmentState;
}

/**
 * Validate a delegatee label: required, non-empty after trimming, bounded, no
 * control characters (a single-line plain-text label, never HTML/Markdown). Returns
 * the trimmed value stored verbatim.
 */
export function validateDelegateTo(value: unknown): string {
  if (typeof value !== "string") {
    throw new TaskValidationError("delegateTo", "must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TaskValidationError(
      "delegateTo",
      "enter who this is delegated to",
    );
  }
  if (codePointLength(trimmed) > DELEGATE_TO_MAX_LENGTH) {
    throw new TaskValidationError(
      "delegateTo",
      `must be at most ${DELEGATE_TO_MAX_LENGTH} characters`,
    );
  }
  // eslint-disable-next-line no-control-regex -- reject C0/C1 control characters.
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) {
    throw new TaskValidationError(
      "delegateTo",
      "must not contain control characters",
    );
  }
  return trimmed;
}

/** Validate a nullable delegation note (plain text, bounded). */
export function validateDelegationNote(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new TaskValidationError("delegationNote", "must be a string or null");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (codePointLength(trimmed) > DELEGATION_NOTE_MAX_LENGTH) {
    throw new TaskValidationError(
      "delegationNote",
      `must be at most ${DELEGATION_NOTE_MAX_LENGTH} characters`,
    );
  }
  // eslint-disable-next-line no-control-regex -- reject C0/C1 control characters.
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) {
    throw new TaskValidationError(
      "delegationNote",
      "must not contain control characters",
    );
  }
  return trimmed;
}

/**
 * Validate and normalise a nullable delegation input. `null` clears delegation. A
 * present value REQUIRES a non-empty `to`; the two optional dates are validated as
 * date-only values and the note as bounded plain text. Returns the normalised
 * {@link TaskDelegation} the repository stores.
 */
export function validateDelegationInput(
  value: TaskDelegationInput | null | undefined,
): TaskDelegation | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object") {
    throw new TaskValidationError("delegateTo", "must be a delegation record");
  }
  const to = validateDelegateTo((value as { to?: unknown }).to);
  const delegatedOn = validateDelegationDate(
    (value as { delegatedOn?: unknown }).delegatedOn,
    "delegatedOn",
  );
  const followUpOn = validateDelegationDate(
    (value as { followUpOn?: unknown }).followUpOn,
    "followUpOn",
  );
  const note = validateDelegationNote((value as { note?: unknown }).note);
  return { to, delegatedOn, followUpOn, note };
}

/** Validate a nullable delegation date-only value against a specific field. */
function validateDelegationDate(
  value: unknown,
  field: "delegatedOn" | "followUpOn",
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

/** Validate a workspace-wide system view identifier. Defaults to `all`. */
export function validateTaskSystemView(value: unknown): TaskSystemView {
  if (value === null || value === undefined || value === "") {
    return "all";
  }
  if (
    typeof value !== "string" ||
    !(TASK_SYSTEM_VIEWS as readonly string[]).includes(value)
  ) {
    throw new TaskValidationError("view", "is not a known task view");
  }
  return value as TaskSystemView;
}

/** Validate a workspace-wide sort identifier. Defaults to `smart`. */
export function validateTaskSort(value: unknown): TaskSort {
  if (value === null || value === undefined || value === "") {
    return "smart";
  }
  if (
    typeof value !== "string" ||
    !(TASK_SORTS as readonly string[]).includes(value)
  ) {
    throw new TaskValidationError("sort", "is not a known sort order");
  }
  return value as TaskSort;
}

/**
 * TASKS-03 — one generic closed-set validator, so every new filter dimension is
 * checked the SAME way instead of growing a hand-written function per value type.
 * An absent/empty value means "no filter" and returns `undefined`; anything not in
 * the closed set throws, so a hostile URL or a stale saved view can never reach SQL
 * with an unrecognised token.
 */
function validateClosedSet<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: TaskValidationField,
  description: string,
): T | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    throw new TaskValidationError(field, description);
  }
  return value as T;
}

/** Validate the sort DIRECTION. Defaults to each sort's natural direction. */
export function validateTaskSortDirection(value: unknown): TaskSortDirection {
  return (
    validateClosedSet(
      value,
      TASK_SORT_DIRECTIONS,
      "direction",
      "is not a known sort direction",
    ) ?? "natural"
  );
}

/** Validate a derived due-state filter (`undefined` = no filter). */
export function validateTaskDueState(value: unknown): TaskDueState | undefined {
  return validateClosedSet(
    value,
    TASK_DUE_STATES,
    "dueState",
    "is not a known due state",
  );
}

/** Validate a derived planned-state filter (`undefined` = no filter). */
export function validateTaskPlannedState(
  value: unknown,
): TaskPlannedState | undefined {
  return validateClosedSet(
    value,
    TASK_PLANNED_STATES,
    "plannedState",
    "is not a known planned state",
  );
}

/** Validate a structural parent-kind filter (`undefined` = no filter). */
export function validateTaskParentKind(
  value: unknown,
): TaskParentKind | undefined {
  return validateClosedSet(
    value,
    TASK_PARENT_KINDS,
    "parentKind",
    "is not a known parent kind",
  );
}

/** Validate a created/updated recency window (`undefined` = no filter). */
export function validateTaskRecencyWindow(
  value: unknown,
): TaskRecencyWindow | undefined {
  return validateClosedSet(
    value,
    TASK_RECENCY_WINDOWS,
    "recencyWindow",
    "is not a known recency window",
  );
}

/** Validate completed/terminal visibility. Defaults to the system view's own rule. */
export function validateTaskCompletedVisibility(
  value: unknown,
): TaskCompletedVisibility {
  return (
    validateClosedSet(
      value,
      TASK_COMPLETED_VISIBILITIES,
      "completedVisibility",
      "is not a known completed visibility",
    ) ?? "default"
  );
}

/** Validate a server-side grouping dimension. */
export function validateTaskGroupDimension(
  value: unknown,
): WorkspaceTaskGroupDimension {
  const dimension = validateClosedSet(
    value,
    WORKSPACE_TASK_GROUP_DIMENSIONS,
    "dimension",
    "is not a known grouping",
  );
  if (dimension === undefined) {
    throw new TaskValidationError("dimension", "is not a known grouping");
  }
  return dimension;
}

/**
 * TASKS-07 — validate the SCOPE a recurrence-sensitive date change applies at. A
 * missing or unrecognised scope is refused rather than defaulted: guessing between
 * "this occurrence" and "the whole routine" is exactly the mistake the scope exists
 * to prevent.
 */
export function validateTaskSeriesEditScope(
  value: unknown,
): TaskSeriesEditScope {
  const scope = validateClosedSet(
    value,
    TASK_SERIES_EDIT_SCOPES,
    "recurrence",
    "must say whether the change applies to this occurrence or to this and future occurrences",
  );
  if (scope === undefined) {
    throw new TaskValidationError(
      "recurrence",
      "must say whether the change applies to this occurrence or to this and future occurrences",
    );
  }
  return scope;
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
 * Validate the date a plan commits to (TODAY-04). Reuses the shared date-only rule
 * but REQUIRES a real calendar date — planning always sets a scheduled date;
 * removing a plan is a separate `clearPlan`, never a null here. Returns the exact
 * `YYYY-MM-DD` string stored.
 */
export function validatePlanDate(value: unknown): string {
  const date = validateTaskDate(value, "scheduledDate");
  if (date === null) {
    throw new TaskValidationError(
      "scheduledDate",
      "a date is required to plan a task",
    );
  }
  return date;
}

/**
 * Validate a bulk-planning id list (TODAY-04): a non-empty, deduplicated set of
 * valid task-id SHAPES, bounded by `MAX_PLAN_BATCH_SIZE`. Existence, type and
 * workspace are checked against storage by the repository. Deduplication keeps a
 * bulk operation's per-task Activity one-event-per-task even if the caller repeats
 * an id. Order is preserved (first occurrence wins).
 */
export function validateTaskIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new TaskValidationError("id", "must be a list of task ids");
  }
  if (value.length === 0) {
    throw new TaskValidationError("id", "select at least one task");
  }
  if (value.length > MAX_PLAN_BATCH_SIZE) {
    throw new TaskValidationError(
      "limit",
      `at most ${MAX_PLAN_BATCH_SIZE} tasks can be planned at once`,
    );
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const id = validateTaskId(entry);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
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

/* -------------------------------------------------------------------------- */
/* TASKS-03 — pure calendar-window arithmetic                                  */
/* -------------------------------------------------------------------------- */

/**
 * Shift a date-only `YYYY-MM-DD` by whole days, returning date-only text.
 *
 * Deliberately computed through UTC midnight and re-formatted by hand: a date-only
 * value is a CALENDAR day, never an instant, so it must never be routed through a
 * timezone (ADR-022). The owner's calendar day is already resolved server-side
 * before it reaches here; this only moves it along the calendar.
 */
export function shiftCalendarDate(isoDate: string, days: number): string {
  const match = DATE_ONLY_PATTERN.exec(isoDate);
  if (!match) {
    throw new TaskValidationError("scheduledDate", "must be a YYYY-MM-DD date");
  }
  const base = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  const shifted = new Date(base + days * 86_400_000);
  const year = String(shifted.getUTCFullYear()).padStart(4, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The inclusive END of the rolling "this week" window: `todayIso + 6` days.
 *
 * A ROLLING seven-day window (rather than "until Sunday") is deliberate: it needs
 * no first-day-of-week preference, so a shared `/tasks` link means the same thing
 * to any viewer, and "due this week" never collapses to "due today" on a Saturday.
 */
export function weekWindowEnd(todayIso: string): string {
  return shiftCalendarDate(todayIso, 6);
}

/**
 * The INCLUSIVE start of a recency window — the earliest calendar day a task may
 * have been created/updated on to still count as recent. `1d` is today alone.
 */
export function recencyWindowStart(
  todayIso: string,
  window: TaskRecencyWindow,
): string {
  return shiftCalendarDate(todayIso, -(TASK_RECENCY_WINDOW_DAYS[window] - 1));
}
