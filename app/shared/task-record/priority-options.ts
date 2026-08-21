/**
 * DHDS-09 — the ONE priority option set.
 *
 * Priority is the product's highest-frequency contextual choice: a Task row, the
 * Task record, Quick Capture, the bulk bar, a Project template's task list, a
 * Meeting's follow-up form and two collections' filters all offer it. Before
 * this module, SEVEN of them built the option list independently:
 *
 *   TaskRowFields · TaskRecordDrawer · TaskQuickEditPanel · NewTaskForm ·
 *   MeetingFollowUpForm · TaskCapturePanel · ProjectTemplateRecord ·
 *   TasksWorkspace (bulk)
 *
 * Most derived their labels from `taskPriorityLabel`, so the WORDS mostly
 * agreed. What did not agree was everything around them, and the divergence was
 * visible in the product:
 *
 *   - `views-controls.ts` offered the bare codes `P1`/`P2`/`P3`/`P4` where every
 *     other picker offered `Priority 1`…`Priority 4` — a code where the rest of
 *     the product uses a name;
 *   - `TaskCapturePanel` put the P4 option at the TOP under the empty value, so
 *     Quick Capture's priority list ran P4, P1, P2, P3;
 *   - two surfaces drew a coloured flag beside the label and four drew nothing,
 *     so the same four choices were a colour-coded list on a row and a plain one
 *     in a form;
 *   - the surfaces that DID draw a flag replaced the whole option row with it,
 *     which took the current-value check mark away with the rest of the anatomy.
 *
 * ── The canonical meaning ───────────────────────────────────────────────────
 * | Value | Label      | Tag  | Means                        | Colour  |
 * |-------|------------|------|------------------------------|---------|
 * | `p1`  | Priority 1 | `P1` | Urgent — the highest priority | red     |
 * | `p2`  | Priority 2 | `P2` | High                         | orange  |
 * | `p3`  | Priority 3 | `P3` | Medium                       | blue    |
 * | `p4`  | Priority 4 | `P4` | Normal — the default          | neutral |
 *
 * The colour lives with the mark (`PriorityIndicator.tsx` → `data-priority`), so
 * there is exactly one place a priority's colour is decided and this module does
 * not restate it.
 *
 * A stored `null` IS Priority 4 everywhere the product draws it, so there are
 * FOUR options and never five: a fifth "No priority" row reads as a selected
 * default for a task nobody has triaged, and it competes with the real values
 * for the first position — which is where both the eye and the keyboard start.
 */

import { TASK_PRIORITIES, type TaskPriority } from "~/kernel/tasks";

import { taskPriorityLabel, taskPriorityTag } from "./task-view";

/** One priority, in every form a control needs it. */
export interface TaskPriorityOption {
  readonly value: TaskPriority;
  /** The full name — "Priority 2". What a picker, a filter or a menu says. */
  readonly label: string;
  /** The short tag — "P2". What a dense row or an applied filter chip says. */
  readonly tag: string;
}

/**
 * The four priorities, in their meaningful order: most urgent first.
 *
 * The order is a product fact rather than a rendering preference — the same one
 * `/tasks` sorts by and the same one the grouped view walks — so a picker that
 * reordered them would disagree with the list behind it.
 */
export const TASK_PRIORITY_OPTIONS: readonly TaskPriorityOption[] =
  TASK_PRIORITIES.map((value) => ({
    value,
    label: taskPriorityLabel(value),
    tag: taskPriorityTag(value),
  }));

/**
 * The same four as `{ value, label }`, for a control that takes plain options
 * (the shared `SelectField`, a `<select>`, a filter group).
 *
 * A separate export rather than a mapping at each call site, because "map the
 * canonical list into the shape my control wants" written eight times is how
 * the eight lists drifted in the first place.
 */
export const TASK_PRIORITY_SELECT_OPTIONS: readonly {
  readonly value: string;
  readonly label: string;
}[] = TASK_PRIORITY_OPTIONS.map(({ value, label }) => ({ value, label }));

/**
 * The priority a surface should offer as the current value for a stored `null`.
 *
 * Not a synonym for "the default a new task gets" — the kernel decides that.
 * This is the UI's answer to "which option is checked when nothing is stored",
 * and it is `p4` because `null` and `p4` are the same state to a reader.
 */
export const UNTRIAGED_PRIORITY: TaskPriority = "p4";
