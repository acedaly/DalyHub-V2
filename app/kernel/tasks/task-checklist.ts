/**
 * TASKS-13 Task checklists — the domain model for the ordered steps inside ONE
 * Task.
 *
 * ── A checklist item is NOT a Task ───────────────────────────────────────────
 * This is the load-bearing decision of TASKS-13, and everything below follows
 * from it. A Task is a COMMITMENT: it has a due date, a plan, a priority, a
 * parent, a workflow status, a waiting state, recurrence and a place in every
 * count, filter and view the product has. A checklist item is a STEP inside one
 * of those commitments. It has a title, an order and a tick — and nothing else,
 * ever.
 *
 * The shape of this file is the argument. There is no status, no priority, no
 * date, no assignee, no parent, no recurrence and no `parentItemId`, so a
 * checklist item cannot drift into being a Task by accretion: adding any of them
 * would be a visible, deliberate change to a domain type that says in its own
 * doc comment why it does not have them.
 *
 * ── One level ────────────────────────────────────────────────────────────────
 * A checklist item belongs to a Task. It cannot contain a checklist item, a
 * Task, a Note or another checklist. The absence of a parent-item field is the
 * whole of that rule, in the schema (migration 0045) and here.
 *
 * ── Ordering ─────────────────────────────────────────────────────────────────
 * `position` is a plain integer and the canonical read order is
 * `(position, createdAt, id)` — a TOTAL order, so the list is deterministic even
 * if two items ever share a position. Positions are dense (0..n-1) after every
 * mutation, because a whole-list renumber of at most {@link MAX_CHECKLIST_ITEMS}
 * rows is one statement and a rebalance that never has to happen cannot go
 * wrong.
 */

import { TaskValidationError } from "./task-errors";

/**
 * The most items ONE Task's checklist may hold.
 *
 * Chosen against what a checklist IS rather than as a token limit: a hundred
 * steps is already far past the point where the work should have been a Project,
 * and the bound is what keeps every checklist operation — the ordered read, the
 * whole-list renumber, the recurrence clone — provably small. When it is
 * reached, DalyHub refuses the next item and says so; it never silently drops
 * one.
 */
export const MAX_CHECKLIST_ITEMS = 100;

/**
 * The longest a checklist item's title may be, in Unicode code points.
 *
 * Generous enough for a real sentence ("Confirm that the camper registration and
 * roadside assistance are both current") and bounded so the row stays a LABEL.
 * Long-form writing belongs in the Task's description or in a linked Note.
 */
export const CHECKLIST_TITLE_MAX_LENGTH = 500;

/** One step inside one Task. */
export interface TaskChecklistItem {
  readonly id: string;
  readonly taskId: string;
  /** Plain text — never Markdown. A checklist row is a label beside a checkbox. */
  readonly title: string;
  /** The owner's order. Dense (0..n-1) after every mutation. */
  readonly position: number;
  readonly completed: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * A Task's checklist reduced to the two numbers a row or a record header shows.
 *
 * `total: 0` is a real, meaningful value — it means "this Task has no checklist"
 * — so progress is never inferred from the absence of a record.
 */
export interface TaskChecklistProgress {
  readonly total: number;
  readonly completed: number;
}

/** The progress of a Task with no checklist. Shared so no caller invents it. */
export const EMPTY_CHECKLIST_PROGRESS: TaskChecklistProgress = {
  total: 0,
  completed: 0,
};

/** Compute progress from a list of items. Pure; the one definition. */
export function checklistProgress(
  items: readonly TaskChecklistItem[],
): TaskChecklistProgress {
  let completed = 0;
  for (const item of items) {
    if (item.completed) completed += 1;
  }
  return { total: items.length, completed };
}

/**
 * "3 of 5" — the ONE wording DalyHub uses for checklist progress, wherever it
 * appears.
 *
 * Deliberately not a percentage and deliberately not a ratio glyph: the two
 * numbers are the truth, and "60%" is a derived figure that reads like a
 * performance score. Returns null when there is nothing to describe, so a
 * surface never has to decide what "0 of 0" means.
 */
export function checklistProgressLabel(
  progress: TaskChecklistProgress | null | undefined,
): string | null {
  if (!progress || progress.total === 0) return null;
  return `${progress.completed} of ${progress.total}`;
}

/** True when every item of a non-empty checklist is complete. */
export function checklistIsComplete(
  progress: TaskChecklistProgress | null | undefined,
): boolean {
  return (
    progress !== null &&
    progress !== undefined &&
    progress.total > 0 &&
    progress.completed === progress.total
  );
}

/**
 * Every character a checklist title may not contain: the C0 and C1 control
 * ranges, which include the newline and tab a paste can carry in.
 *
 * A checklist item is ONE line. Without this, pasting a paragraph would make one
 * row as tall as the rest of the list, and pasting a tab-separated cell would
 * put invisible structure into a label.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]+/g;

/**
 * Validate a checklist item title.
 *
 * Trimmed, non-empty, bounded, and stripped of control characters. Internal runs
 * of whitespace collapse to a single space for the same reason: the stored value
 * is a label, and it is the value every later comparison is made against.
 */
export function validateChecklistTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new TaskValidationError("checklistTitle", "must be text");
  }
  const normalised = value
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (normalised.length === 0) {
    throw new TaskValidationError("checklistTitle", "enter the step");
  }
  if ([...normalised].length > CHECKLIST_TITLE_MAX_LENGTH) {
    throw new TaskValidationError(
      "checklistTitle",
      `must be ${CHECKLIST_TITLE_MAX_LENGTH} characters or fewer`,
    );
  }
  return normalised;
}

/** Validate a checklist item id used verbatim as a lookup key. */
export function validateChecklistItemId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TaskValidationError("checklistItem", "must be an item id");
  }
  if (value.length > 64) {
    throw new TaskValidationError("checklistItem", "is not a valid item id");
  }
  return value;
}

/**
 * Validate the id list a reorder submits.
 *
 * Bounded, non-empty and DE-DUPLICATED — a list naming the same item twice
 * describes no order at all. Whether the list is the COMPLETE set of the Task's
 * items is a question only the repository can answer, and it answers it inside
 * the same transaction that writes the new order.
 */
export function validateChecklistOrder(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new TaskValidationError(
      "checklistOrder",
      "must be a list of item ids",
    );
  }
  if (value.length === 0) {
    throw new TaskValidationError("checklistOrder", "name at least one item");
  }
  if (value.length > MAX_CHECKLIST_ITEMS) {
    throw new TaskValidationError(
      "checklistOrder",
      `a checklist holds at most ${MAX_CHECKLIST_ITEMS} items`,
    );
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const id = validateChecklistItemId(entry);
    if (seen.has(id)) {
      throw new TaskValidationError(
        "checklistOrder",
        "names the same item more than once",
      );
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Move one item within an ordered id list by `delta` places, clamped at both
 * ends.
 *
 * Pure, and shared by the keyboard reorder command and the item menu's
 * "Move up" / "Move down" so those two can never disagree about what a move
 * means. Returns the SAME array when the move is a no-op (the item is already at
 * that end), so a caller can skip the write without comparing element by
 * element.
 */
export function moveChecklistOrder(
  order: readonly string[],
  id: string,
  delta: number,
): readonly string[] {
  const from = order.indexOf(id);
  if (from < 0 || delta === 0) return order;
  const to = Math.min(Math.max(from + delta, 0), order.length - 1);
  if (to === from) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
