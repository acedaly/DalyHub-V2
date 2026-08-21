/**
 * DHDS-09 — a Task's common metadata, as CONTEXTUAL CHOICES over a value.
 *
 * `TaskRowFields` is the same three fields over a SERVER SAVE: it posts each
 * change through a canonical intent and reports the server's answer. These are
 * the same three fields over a VALUE the caller already holds — a form's state,
 * before anything has been created at all.
 *
 * They exist because Quick Capture had the opposite of a contextual choice. Due
 * date, Priority and Project were three stacked `SelectField` rows under the
 * title, which is a form: three labels, three closed controls, a fixed order,
 * and — for the due date — three hard-coded days with no way to say "the 14th".
 * The reference behaviour is one line of metadata under the title where each
 * value opens the same picker the Task row opens:
 *
 *     What needs doing?
 *     Prepare the OPPO brief
 *
 *     Today      Inbox      Priority 2
 *
 * ── What is shared, and what is deliberately not ────────────────────────────
 * SHARED: the surfaces (`Popover`, `Menu`, `Picker`), the option anatomy, the
 * date choice, the priority vocabulary, the trigger's read affordance
 * (`InlineEditShell` — a value that looks like metadata and becomes interactive
 * on hover AND focus, never a pill), and the parent search endpoint.
 *
 * NOT SHARED: the mutation. There is none here. A capture surface has no record
 * to write to yet, so these report a value and the host's own submit is what
 * creates the Task through the one canonical creation route. Duplicating a Task
 * mutation to make a picker work is the thing DHDS-09 §36 forbids, and the way
 * to avoid it is for the picker not to have one.
 */

import { useId, useRef, useState } from "react";

import { DateChoice } from "~/shared/forms";
import { Menu, Picker, Popover } from "~/shared/floating";
import type { FloatingMenuOption, PickerOption } from "~/shared/floating";
import { InlineEditShell } from "~/shared/inline-edit";
import type { TaskPriority } from "~/kernel/tasks";

import { PriorityFlag, PriorityGlyph } from "./PriorityIndicator";
import { TASK_PRIORITY_OPTIONS, UNTRIAGED_PRIORITY } from "./priority-options";
import { taskDateShortcuts } from "./plan-targets";
import { formatCalendarDate, relativeCalendarDate } from "./task-view";

/* -------------------------------------------------------------------------- */
/* Due date                                                                   */
/* -------------------------------------------------------------------------- */

export interface TaskDueDateControlProps {
  /** ISO `YYYY-MM-DD`, or `""` for no due date. */
  readonly value: string;
  readonly onChange: (next: string) => void;
  /**
   * The OWNER's calendar day (ADR-022). Without one there are no shortcuts and
   * no relative wording — a surface that cannot name an honest "today" must not
   * guess one from the browser clock.
   */
  readonly todayIso?: string | null;
  readonly disabled?: boolean;
  readonly "data-testid"?: string;
}

export function TaskDueDateControl({
  value,
  onChange,
  todayIso = null,
  disabled = false,
  "data-testid": testId,
}: TaskDueDateControlProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const surfaceId = `${useId()}-due`;

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  /*
   * The read state is the words a list is actually scanned by — "Today",
   * "Tomorrow", "Thu, 12 Jun" — from the same derivation the Task row uses, so
   * a date captured here reads identically the moment the row appears.
   */
  const shown =
    value.length === 0
      ? null
      : ((todayIso === null
          ? formatCalendarDate(value)
          : relativeCalendarDate(value, todayIso)?.label) ?? value);

  return (
    <div className="dh-task-meta">
      <InlineEditShell
        label="Due date"
        valueText={shown ?? "No due date"}
        isEmpty={shown === null}
        emptyLabel="No due date"
        editing={false}
        onActivate={() => setOpen((current) => !current)}
        triggerRef={triggerRef}
        triggerProps={{
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          ...(open ? { "aria-controls": surfaceId } : {}),
        }}
        readOnly={disabled}
        variant="text"
        data-testid={testId}
      >
        {shown}
      </InlineEditShell>

      {open ? (
        <Popover
          anchorRef={triggerRef}
          label="Choose a due date"
          onClose={close}
          id={surfaceId}
          className="dh-inline-date__popover"
          {...(testId ? { "data-testid": `${testId}-popover` } : {})}
        >
          <DateChoice
            label="Due date"
            value={value.length === 0 ? null : value}
            todayIso={todayIso}
            {...(todayIso === null
              ? {}
              : { shortcuts: taskDateShortcuts(todayIso) })}
            onSelect={(iso) => {
              onChange(iso);
              close();
            }}
            onClear={
              value.length === 0
                ? undefined
                : () => {
                    onChange("");
                    close();
                  }
            }
            onCancel={close}
          />
        </Popover>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Priority                                                                   */
/* -------------------------------------------------------------------------- */

export interface TaskPriorityControlProps {
  /**
   * The stored priority, or `""` for an untriaged task.
   *
   * `""` and `p4` are the SAME state to a reader, so the menu checks Priority 4
   * for both and there is no fifth "No priority" row. What `onChange` reports
   * back is exactly what the caller gave: choosing Priority 4 explicitly still
   * posts `p4`, and a task nobody touched still posts nothing.
   */
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly disabled?: boolean;
  readonly "data-testid"?: string;
}

export function TaskPriorityControl({
  value,
  onChange,
  disabled = false,
  "data-testid": testId,
}: TaskPriorityControlProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const surfaceId = `${useId()}-priority`;
  const current: TaskPriority =
    value.length === 0 ? UNTRIAGED_PRIORITY : (value as TaskPriority);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const items: readonly FloatingMenuOption[] = TASK_PRIORITY_OPTIONS.map(
    ({ value: priority, label }) => ({
      id: priority,
      label,
      mark: <PriorityGlyph priority={priority} size="md" />,
      onSelect: () => {
        onChange(priority);
      },
    }),
  );

  return (
    <div className="dh-task-meta">
      <InlineEditShell
        label="Priority"
        valueText={
          TASK_PRIORITY_OPTIONS.find((option) => option.value === current)
            ?.label ?? "Priority 4"
        }
        editing={false}
        onActivate={() => setOpen((now) => !now)}
        triggerRef={triggerRef}
        triggerProps={{
          "aria-haspopup": "menu",
          "aria-expanded": open,
          ...(open ? { "aria-controls": surfaceId } : {}),
        }}
        readOnly={disabled}
        variant="text"
        data-testid={testId}
      >
        {/* The row's own read state is the flag plus its short tag — the same
            mark the Task row will draw once the task exists. */}
        <PriorityFlag priority={current} />
      </InlineEditShell>

      {open ? (
        <Menu
          anchorRef={triggerRef}
          label="Priority"
          items={items}
          value={current}
          onClose={close}
          id={surfaceId}
          {...(testId ? { "data-testid": `${testId}-menu` } : {})}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Project or Area                                                            */
/* -------------------------------------------------------------------------- */

export interface TaskParentControlProps {
  /** The chosen parent's id, or `""` for the Inbox. */
  readonly value: string;
  readonly onChange: (next: string) => void;
  /** The candidate parents, from the shared bounded search. */
  readonly options: readonly PickerOption[];
  /** Run a server search. The caller owns filtering and drives `options`. */
  readonly onSearch: (query: string) => void;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly "data-testid"?: string;
}

export function TaskParentControl({
  value,
  onChange,
  options,
  onSearch,
  loading = false,
  disabled = false,
  "data-testid": testId,
}: TaskParentControlProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const surfaceId = `${useId()}-parent`;
  const selected = options.find((option) => option.id === value) ?? null;

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  return (
    <div className="dh-task-meta">
      <InlineEditShell
        label="Project or Area"
        /*
         * TASKS-04 — a capture surface ALWAYS states where the task will be
         * filed, because "somewhere" is the one thing a trustworthy inbox may
         * never be. The empty value is "Inbox", a real destination, rather than
         * a placeholder the owner has to clear.
         */
        valueText={selected?.label ?? "Inbox"}
        editing={false}
        onActivate={() => setOpen((now) => !now)}
        triggerRef={triggerRef}
        triggerProps={{
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          ...(open ? { "aria-controls": surfaceId } : {}),
        }}
        readOnly={disabled}
        variant="text"
        data-testid={testId}
      >
        {selected?.label ?? "Inbox"}
      </InlineEditShell>

      {open ? (
        <Picker
          anchorRef={triggerRef}
          label="Project or Area"
          options={options}
          value={value.length === 0 ? null : value}
          onSelect={(id) => onChange(id)}
          onSearch={onSearch}
          loading={loading}
          onClose={close}
          id={surfaceId}
          // "No project" is a real destination rather than an absence, so it is
          // worded as the place the task goes.
          clear={
            value.length === 0
              ? undefined
              : { label: "Move to Inbox", onSelect: () => onChange("") }
          }
          {...(testId ? { "data-testid": `${testId}-picker` } : {})}
        />
      ) : null}
    </div>
  );
}
