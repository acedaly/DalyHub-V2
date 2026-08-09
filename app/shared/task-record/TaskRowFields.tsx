/**
 * TASKS-05 — the Task fields that edit IN PLACE on an ordinary list row, plus the
 * read-only recurrence signal.
 *
 * The V2.2 target interaction is "see Task → act on Task", not "see Task → open
 * record → find Edit → modify field → save → close". These four components are how a
 * row gets there without becoming a form: each is a DS-16 inline field whose READ
 * state is the value the row would have shown anyway (a `PriorityIndicator`, a
 * formatted date, the parent's name), and whose EDIT state is the shared anchored
 * menu, date popover or combobox. Nothing new appears on the row until it is used —
 * no pencil icons, no extra chrome, no second column of controls (see
 * `InlineEditShell`'s discoverability rule).
 *
 * They are SHARED, not Tasks-only, for the same reason `TaskQuickEditPanel` is: the
 * `/tasks` list, a Project's task list and Today all show task rows, and "change the
 * priority here" must not mean three different things.
 *
 * Every save posts to a canonical route through `task-inline-edit.ts` and reports the
 * SERVER's answer. A refusal keeps the previous value with the server's message beside
 * it; the caller revalidates on success. There is no list-only mutation here.
 *
 * TASKS-09 widened what a save REPORTS, not what it does. `onSaved` now carries the
 * announcement, the canonical intent that produced it, and the {@link TaskListItemPatch}
 * describing the change, so a host can paint the accepted value immediately and decide
 * — from the intent — whether the list needs re-reading at all (ADR-086). It still
 * fires only after the server has said yes.
 */

import { useCallback } from "react";

import type { InlineSaveOutcome } from "~/shared/inline-edit";
import { InlineDateField, InlineSelectField } from "~/shared/inline-edit";
import { RepeatIcon } from "~/shared/icons";
import { TASK_PRIORITIES, type TaskPriority } from "~/kernel/tasks";

import { PriorityIndicator } from "./PriorityIndicator";
import { saveTaskBulkField, saveTaskRecordField } from "./task-inline-edit";
import {
  formatCalendarDate,
  taskPriorityLabel,
  taskRecurrenceLabel,
} from "./task-view";
import type { SerializedTaskListItem, TaskListItemPatch } from "./task-view";

/**
 * The REAL priority values only. The unset state is the shell's quiet empty label and
 * clearing is the separated command at the end of the menu (EDIT-02), so an untriaged
 * task never reads as "set to No priority".
 */
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((priority) => ({
  value: priority,
  label: taskPriorityLabel(priority),
}));

/**
 * What an accepted inline row edit reports back. Everything in it is a FACT about a
 * write the server has already accepted: the sentence to announce, the canonical
 * intent that carried it, and the change itself.
 */
export interface TaskRowFieldSave {
  readonly taskId: string;
  /** The announcement, in the same past tense every other row mutation uses. */
  readonly message: string;
  /** The canonical intent posted — `set_priority`, `set_due`, `plan`, … */
  readonly intent: string;
  /** The accepted change, for a host that paints it without waiting for a re-read. */
  readonly patch: TaskListItemPatch;
}

export interface TaskRowFieldProps {
  readonly taskId: string;
  /** Called after the SERVER accepted the change. Never called for a refusal. */
  readonly onSaved?: (save: TaskRowFieldSave) => void;
  /** The task's title, used in the announcement so a row change is identifiable. */
  readonly title: string;
  readonly disabled?: boolean;
}

/** Priority, editable from the row through the canonical single-id bulk field path. */
export function InlineTaskPriority({
  taskId,
  title,
  priority,
  onSaved,
  disabled = false,
}: TaskRowFieldProps & { readonly priority: TaskPriority | null }) {
  const save = useCallback(
    async (next: string): Promise<InlineSaveOutcome> => {
      const outcome = await saveTaskBulkField(taskId, {
        intent: "set_priority",
        priority: next,
      });
      if (outcome.ok) {
        onSaved?.({
          taskId,
          intent: "set_priority",
          message:
            next.length === 0
              ? `Cleared the priority on ${title}.`
              : `${title} set to ${taskPriorityLabel(next as TaskPriority)}.`,
          patch: {
            priority: next.length === 0 ? null : (next as TaskPriority),
          },
        });
      }
      return outcome;
    },
    [onSaved, taskId, title],
  );
  return (
    <InlineSelectField
      label="Priority"
      value={priority ?? ""}
      options={PRIORITY_OPTIONS}
      onSave={save}
      emptyLabel="No priority"
      clearable
      clearLabel="Clear priority"
      readOnly={disabled}
      renderValue={(option) =>
        option ? (
          <PriorityIndicator priority={option.value as TaskPriority} />
        ) : null
      }
      data-testid="task-row-priority"
    />
  );
}

/**
 * A planning date, editable from the row.
 *
 * The two dates stay STRICTLY separate (ADR-043 §3): the due date is a deadline and
 * goes through `set_due`; the scheduled date is the owner's committed day and goes
 * through `plan` / `clear_plan`. Neither route can touch the other's column, so
 * editing one from a row can never silently move the other.
 */
export function InlineTaskDate({
  taskId,
  title,
  kind,
  value,
  onSaved,
  disabled = false,
}: TaskRowFieldProps & {
  readonly kind: "due" | "scheduled";
  readonly value: string | null;
}) {
  const label = kind === "due" ? "Due date" : "Planned date";
  const save = useCallback(
    async (next: string | null): Promise<InlineSaveOutcome> => {
      const outcome =
        kind === "due"
          ? await saveTaskBulkField(taskId, {
              intent: "set_due",
              dueDate: next ?? "",
            })
          : next === null
            ? await saveTaskRecordField(taskId, { intent: "clear_plan" })
            : await saveTaskRecordField(taskId, {
                intent: "plan",
                scheduledDate: next,
              });
      if (outcome.ok) {
        onSaved?.({
          taskId,
          intent:
            kind === "due" ? "set_due" : next === null ? "clear_plan" : "plan",
          message:
            next === null
              ? `Cleared the ${kind === "due" ? "due" : "planned"} date on ${title}.`
              : kind === "due"
                ? `${title} is due ${formatCalendarDate(next) ?? next}.`
                : `Planned ${title} for ${formatCalendarDate(next) ?? next}.`,
          patch: kind === "due" ? { dueDate: next } : { scheduledDate: next },
        });
      }
      return outcome;
    },
    [kind, onSaved, taskId, title],
  );
  return (
    <InlineDateField
      label={label}
      value={value}
      onSave={save}
      format={(iso) => formatCalendarDate(iso) ?? iso}
      emptyLabel={kind === "due" ? "No due date" : "Not planned"}
      readOnly={disabled}
      clearable
      data-testid={`task-row-${kind}-date`}
    />
  );
}

/** A candidate structural parent, from the loader's ONE bounded option query. */
export interface TaskParentOption {
  readonly id: string;
  readonly kind: "project" | "area";
  readonly title: string;
}

/**
 * The structural parent — Project, Area, or NONE (the Inbox) — editable from the row.
 *
 * Three rules the brief is explicit about, all enforced here:
 *
 *   - a parent is OPTIONAL. Clearing is a first-class command ("Move to Inbox"), not
 *     an error state, and an unparented task reads "Unassigned" rather than blank;
 *   - ONE selection REPLACES the previous value. There is no clear-then-save-then-
 *     reopen-then-choose sequence, because `setTaskParent` unlinks and relinks in one
 *     atomic mutation;
 *   - EntityLinks are never touched from UI code. `intent=set_parent` is the one
 *     authority, and it re-validates the destination inside the workspace.
 *
 * The options are the loader's existing BOUNDED parent set — the same list the filter
 * controls offer — so opening the menu costs no request and a long-lived workspace
 * cannot turn a row into an unbounded query. When that set is truncated the row's
 * overflow still offers "Move to Project or Area…", which opens the shared searchable
 * picker over the whole collection; the inline menu says so rather than pretending the
 * list is complete.
 */
export function InlineTaskParent({
  taskId,
  title,
  parent,
  options,
  onSaved,
  disabled = false,
}: TaskRowFieldProps & {
  readonly parent: { readonly id: string; readonly title: string } | null;
  readonly options: readonly TaskParentOption[];
}) {
  const save = useCallback(
    async (next: string): Promise<InlineSaveOutcome> => {
      if (next.length === 0) {
        const outcome = await saveTaskRecordField(
          taskId,
          { intent: "set_parent", parentId: "", parentKind: "" },
          { field: "parentId" },
        );
        if (outcome.ok) {
          onSaved?.({
            taskId,
            intent: "set_parent",
            message: `${title} moved to Inbox.`,
            patch: { parent: null },
          });
        }
        return outcome;
      }
      const chosen = options.find((option) => option.id === next);
      if (chosen === undefined) {
        return {
          ok: false,
          message: "Choose a Project or an Area from the list.",
        };
      }
      const outcome = await saveTaskRecordField(
        taskId,
        { intent: "set_parent", parentId: next, parentKind: chosen.kind },
        { field: "parentId" },
      );
      if (outcome.ok) {
        onSaved?.({
          taskId,
          intent: "set_parent",
          message: `${title} filed under ${chosen.title}.`,
          patch: {
            parent: {
              kind: chosen.kind,
              id: chosen.id,
              title: chosen.title,
            },
          },
        });
      }
      return outcome;
    },
    [onSaved, options, taskId, title],
  );

  // The task's CURRENT parent is always offered, even when it falls outside the
  // bounded option page, so the menu can never fail to show what the row already says.
  const selectOptions = [
    ...options.map((option) => ({
      value: option.id,
      label: option.title,
      description: option.kind === "project" ? "Project" : "Area",
    })),
    ...(parent !== null && !options.some((option) => option.id === parent.id)
      ? [{ value: parent.id, label: parent.title }]
      : []),
  ];

  return (
    <InlineSelectField
      label="Project or Area"
      value={parent?.id ?? ""}
      options={selectOptions}
      onSave={save}
      emptyLabel="Unassigned"
      clearable
      clearLabel="Move to Inbox"
      readOnly={disabled}
      data-testid="task-row-parent"
    />
  );
}

/**
 * The recurrence SIGNAL on a row: an icon plus the ONE shared `taskRecurrenceLabel`.
 *
 * Read-only by design. Authoring a rule needs the frequency, the interval, the
 * weekdays and the scheduling MODE together — that is a composition, not a value, and
 * it belongs in the recurrence editor. What a row owes the owner is recognition:
 * "Every Mon, Thu", "Every 3 months", "14 days after completion". Never raw rule
 * syntax, and never a different wording from the editor that produced it.
 */
export function RecurrenceChip({
  recurrence,
}: {
  readonly recurrence: SerializedTaskListItem["recurrence"];
}) {
  const label = taskRecurrenceLabel(recurrence ?? null);
  if (label === null) return null;
  return (
    <span className="dh-task-repeat" data-testid="task-row-repeat">
      <RepeatIcon className="dh-task-repeat__icon" aria-hidden="true" />
      <span className="dh-task-repeat__label">{label}</span>
    </span>
  );
}
