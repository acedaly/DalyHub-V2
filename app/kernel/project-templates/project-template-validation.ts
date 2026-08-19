/**
 * PROJECT-02 Project templates — input validation.
 *
 * Every value that reaches storage passes through here first, so the D1
 * adapter's CHECK constraints are a last line of defence rather than the thing
 * that produces the message an owner reads.
 *
 * The rules are borrowed rather than invented wherever an equivalent already
 * exists: a template task's title obeys the single-line normalisation a Task
 * title and a checklist title already use, and a template task's description is
 * parsed by the ONE shared Markdown source parser (ADR-015 / FND-08).
 * PROJECT-02 adds no second policy for either.
 */

import { MarkdownError, parseMarkdownSource } from "~/kernel/markdown";
import { TASK_PRIORITIES, type TaskPriority } from "~/kernel/tasks";

import { ProjectTemplateValidationError } from "./project-template-errors";
import {
  MAX_TEMPLATE_PAGE_SIZE,
  DEFAULT_TEMPLATE_PAGE_SIZE,
  TEMPLATE_DESCRIPTION_MAX_LENGTH,
  TEMPLATE_NAME_MAX_LENGTH,
  TEMPLATE_TASK_TITLE_MAX_LENGTH,
} from "./project-template";

/**
 * Every character a single-line template value may not contain: the C0 and C1
 * control ranges, which include the newline and tab a paste can carry in. The
 * same rule, and the same reasoning, as `validateChecklistTitle`.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]+/g;

function normaliseSingleLine(value: string): string {
  return value
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Validate an id used verbatim as a lookup key. */
export function validateTemplateId(value: unknown, field: "id" = "id"): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProjectTemplateValidationError(field, "must be an id");
  }
  if (value.length > 64) {
    throw new ProjectTemplateValidationError(field, "is not a valid id");
  }
  return value;
}

/** Validate a template name: trimmed, non-empty, bounded, single-line. */
export function validateTemplateName(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProjectTemplateValidationError("name", "must be text");
  }
  const normalised = normaliseSingleLine(value);
  if (normalised.length === 0) {
    throw new ProjectTemplateValidationError(
      "name",
      "Give the template a name",
    );
  }
  if ([...normalised].length > TEMPLATE_NAME_MAX_LENGTH) {
    throw new ProjectTemplateValidationError(
      "name",
      `must be ${TEMPLATE_NAME_MAX_LENGTH} characters or fewer`,
    );
  }
  return normalised;
}

/**
 * Validate a template description. Optional; an empty or whitespace-only value
 * is `null` (absence), never an empty string, so "has no description" has ONE
 * representation.
 *
 * Plain text rather than Markdown, because it is read in a list beside a name
 * and a count. Newlines collapse for the same reason a checklist title's do:
 * the value is a summary line, not a document.
 */
export function validateTemplateDescription(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new ProjectTemplateValidationError(
      "description",
      "must be text or nothing",
    );
  }
  const normalised = normaliseSingleLine(value);
  if (normalised.length === 0) return null;
  if ([...normalised].length > TEMPLATE_DESCRIPTION_MAX_LENGTH) {
    throw new ProjectTemplateValidationError(
      "description",
      `must be ${TEMPLATE_DESCRIPTION_MAX_LENGTH} characters or fewer`,
    );
  }
  return normalised;
}

/** Validate a template task's title, by the Task title rules. */
export function validateTemplateTaskTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProjectTemplateValidationError("taskTitle", "must be text");
  }
  const normalised = normaliseSingleLine(value);
  if (normalised.length === 0) {
    throw new ProjectTemplateValidationError("taskTitle", "enter the task");
  }
  if ([...normalised].length > TEMPLATE_TASK_TITLE_MAX_LENGTH) {
    throw new ProjectTemplateValidationError(
      "taskTitle",
      `must be ${TEMPLATE_TASK_TITLE_MAX_LENGTH} characters or fewer`,
    );
  }
  return normalised;
}

/**
 * The longest a template task's description may be, in Unicode code points.
 *
 * Far below the 1 MiB the shared Markdown source parser allows, because a
 * template is duplicated wholesale into a new Project and forty megabyte-sized
 * descriptions is not a shape, it is a payload. Twenty thousand characters is
 * several pages of prose per step.
 */
export const TEMPLATE_TASK_DESCRIPTION_MAX_LENGTH = 20_000;

/**
 * Validate a template task's description as Markdown SOURCE, through the one
 * shared parser. Empty/whitespace-only is `null`.
 */
export function validateTemplateTaskDescription(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new ProjectTemplateValidationError(
      "taskDescription",
      "must be text or nothing",
    );
  }
  if (value.trim().length === 0) return null;
  if ([...value].length > TEMPLATE_TASK_DESCRIPTION_MAX_LENGTH) {
    throw new ProjectTemplateValidationError(
      "taskDescription",
      `must be ${TEMPLATE_TASK_DESCRIPTION_MAX_LENGTH} characters or fewer`,
    );
  }
  try {
    return String(parseMarkdownSource(value));
  } catch (cause) {
    if (cause instanceof MarkdownError) {
      throw new ProjectTemplateValidationError(
        "taskDescription",
        cause.message,
      );
    }
    throw cause;
  }
}

/** Validate a priority against the closed Task set. `null` is untriaged. */
export function validateTemplatePriority(value: unknown): TaskPriority | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "string" ||
    !(TASK_PRIORITIES as readonly string[]).includes(value)
  ) {
    throw new ProjectTemplateValidationError("priority", "is not a priority");
  }
  return value as TaskPriority;
}

/** Clamp a requested page size into `[1, MAX_TEMPLATE_PAGE_SIZE]`. */
export function validateTemplateLimit(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_TEMPLATE_PAGE_SIZE;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ProjectTemplateValidationError("limit", "must be a whole number");
  }
  return Math.min(value, MAX_TEMPLATE_PAGE_SIZE);
}

/**
 * Validate the id list a reorder submits.
 *
 * Bounded, non-empty and DE-DUPLICATED — a list naming the same row twice
 * describes no order at all. Whether the list is the COMPLETE set is a question
 * only the repository can answer, and it answers it inside the same transaction
 * that writes the new order (the TASKS-13 rule, unchanged).
 */
export function validateTemplateOrder(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) {
    throw new ProjectTemplateValidationError("order", "must be a list of ids");
  }
  if (value.length === 0) {
    throw new ProjectTemplateValidationError("order", "name at least one item");
  }
  if (value.length > max) {
    throw new ProjectTemplateValidationError(
      "order",
      `names more than the ${max} allowed`,
    );
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const id = validateTemplateId(entry, "id");
    if (seen.has(id)) {
      throw new ProjectTemplateValidationError(
        "order",
        "names the same item more than once",
      );
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}
