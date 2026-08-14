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
import { EntityIcon } from "~/shared/entity";
import { RepeatIcon } from "~/shared/icons";
import { TASK_PRIORITIES, type TaskPriority } from "~/kernel/tasks";

import { PriorityIndicator } from "./PriorityIndicator";
import { taskDateShortcuts } from "./plan-targets";
import { saveTaskBulkField, saveTaskRecordField } from "./task-inline-edit";
import {
  formatCalendarDate,
  relativeCalendarDate,
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
      const outcome = await saveTaskBulkField(
        taskId,
        { intent: "set_priority", priority: next },
        // PWA-12 — the SAME control, offline. Nothing about the interaction
        // changes: there is no "offline editor", no second field and no mode.
        // If the request cannot reach DalyHub the intent is queued instead, and
        // the row's pending indication (not this outcome) is what says so.
        {
          offline: {
            operation: "set_priority",
            value: next.length === 0 ? null : next,
            baseValue: priority,
          },
        },
      );
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
    [onSaved, priority, taskId, title],
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
  todayIso,
}: TaskRowFieldProps & {
  readonly kind: "due" | "scheduled";
  readonly value: string | null;
  /**
   * UIX-01 — the OWNER's calendar day, which turns the field's absolute date
   * into the relative words a list is actually scanned by.
   *
   * Optional, and the absolute format is the fallback: a surface that has no
   * honest "today" (a record header rendered from a stored snapshot, say) must
   * not guess one from the browser clock — the owner's day is a server fact
   * (ADR-022), and a wrong "Today" on a date field is worse than a right
   * "9 Aug 2026".
   */
  readonly todayIso?: string;
}) {
  const label = kind === "due" ? "Due date" : "Planned date";
  /*
   * The list row's date reads "Yesterday", "Today", "Tomorrow" or "Thu, 12 Jun"
   * — and takes the overdue colour when it has slipped.
   *
   * This is what let UIX-01 delete the urgency CHIP from every task row. A bare
   * "7 Aug 2026" cannot say that a date has passed, so the row needed a second
   * element beside it that could; a date that says "Yesterday" says it itself,
   * in words, which is also what keeps the colour from being the only signal.
   */
  const relative =
    todayIso === undefined ? null : relativeCalendarDate(value, todayIso);
  const save = useCallback(
    async (next: string | null): Promise<InlineSaveOutcome> => {
      // PWA-12 — `next` is ALREADY the canonical `YYYY-MM-DD` the owner chose,
      // resolved against the owner's server-derived calendar day before it
      // reaches here (`plan-targets.ts`). That is what makes a date queued on the
      // 12th still mean the 13th when it replays on the 14th: there is no
      // relative phrase left in the queue to re-interpret (§12).
      const offline = {
        operation:
          kind === "due" ? ("set_due" as const) : ("set_planned" as const),
        value: next,
        baseValue: value,
      };
      const outcome =
        kind === "due"
          ? await saveTaskBulkField(
              taskId,
              { intent: "set_due", dueDate: next ?? "" },
              { offline },
            )
          : next === null
            ? await saveTaskRecordField(
                taskId,
                { intent: "clear_plan" },
                { offline },
              )
            : await saveTaskRecordField(
                taskId,
                { intent: "plan", scheduledDate: next },
                { offline },
              );
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
    [kind, onSaved, taskId, title, value],
  );
  return (
    <InlineDateField
      label={label}
      value={value}
      onSave={save}
      format={(iso) =>
        (todayIso === undefined
          ? formatCalendarDate(iso)
          : relativeCalendarDate(iso, todayIso)?.label) ?? iso
      }
      emptyLabel={kind === "due" ? "No due date" : "Not planned"}
      readOnly={disabled}
      clearable
      // EDIT-03 — the row's date editor offers the SAME one-press dates the Task
      // record's planning section does, from the same derivation. Only where the
      // owner's day is known: a surface with no honest "today" shows the input
      // and the commands alone rather than guessing from the browser clock.
      {...(todayIso === undefined
        ? {}
        : { shortcuts: taskDateShortcuts(todayIso) })}
      className={
        // Only a DUE date carries urgency: a planned date is the owner's own
        // intention about when to work on something, and being "late" against
        // your own plan is not a state the product judges.
        kind === "due" && relative !== null
          ? `dh-task-date dh-task-date--${relative.urgency}`
          : "dh-task-date"
      }
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
  onSearchAll,
  disabled = false,
}: TaskRowFieldProps & {
  readonly parent: {
    readonly kind: "project" | "goal" | "area";
    readonly id: string;
    readonly title: string;
  } | null;
  readonly options: readonly TaskParentOption[];
  /**
   * DS-04 — open the shared searchable picker over the WHOLE workspace.
   *
   * The inline menu offers the loader's bounded candidates, which for a small
   * workspace is every Project and Area and for a large one is a page of them.
   * The row's overflow has always carried "Move to Project or Area…" for the
   * rest; putting it at the foot of the menu ITSELF is what makes it findable
   * from the control the owner is already looking at, which is what §16's
   * "compact and searchable" actually asks for. A caller that has no picker
   * passes nothing and the menu is exactly the bounded set.
   */
  readonly onSearchAll?: () => void;
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
    /*
     * UIX-01 — the parent's ENTITY MARK, beside its name.
     *
     * The redesign reference draws a task's Project as a small tinted tile and a
     * short name, which is what makes a mixed list scannable by context without
     * reading it. The mark is the shared `EntityIcon` badge in the entity type's
     * own generated identity colour — a Project and an Area are visibly
     * different — so it is the SAME mark the record, the gallery and search
     * draw, not a colour invented for a row.
     *
     * It is `aria-hidden` by construction (`EntityIcon` is decorative) and it is
     * outside the control, so the editor's accessible name, its keyboard
     * behaviour and its test id are untouched. An unassigned task gets no mark
     * — "Unassigned" is an absence, and an absence does not have an identity.
     */
    <span className="dh-task-parent">
      {parent ? (
        <EntityIcon
          type={parent.kind}
          variant="badge"
          className="dh-task-parent__mark"
        />
      ) : null}
      <InlineSelectField
        label="Project or Area"
        value={parent?.id ?? ""}
        options={selectOptions}
        onSave={save}
        emptyLabel="Unassigned"
        clearable
        clearLabel="Move to Inbox"
        readOnly={disabled}
        {...(onSearchAll
          ? {
              searchAction: {
                label: "Search all Projects and Areas…",
                onSelect: onSearchAll,
              },
            }
          : {})}
        data-testid="task-row-parent"
      />
    </span>
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
