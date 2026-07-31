/**
 * TASKS-04 — the shared Task QUICK EDIT panel.
 *
 * The one composition that makes a Task usable without opening the full record: its
 * parent, priority, scheduled date, due date, Time Sector, Someday/Maybe and repeat,
 * all in a single calm column of shared DS-06 controls. It is deliberately SHARED, not
 * a Tasks-only widget, because two surfaces need exactly the same set:
 *
 *   - the `/tasks` list, where it opens in the DS-03 Drawer from a row's overflow;
 *   - Review Inbox, where it is the body of the triage card.
 *
 * It owns NO data authority. Every change posts to a canonical route — the shared
 * `/tasks/:taskId` action for the parent, the plan and the repeat, and `/tasks/bulk`
 * (with a single id) for the priority, sector, due date and commitment, exactly as the
 * list row and the bulk bar already do. The panel holds only local pending/error
 * state, tells the caller when the server said yes, and keeps the user's input when
 * the server says no.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";

import {
  TASK_PRIORITIES,
  TIME_SECTORS,
  type TaskRecurrenceFrequency,
} from "~/kernel/tasks";
import { DateField, FormButton, SelectField } from "~/shared/forms";

import { useTaskParentSearch } from "./use-task-parent-search";
import {
  taskPriorityLabel,
  timeSectorLabel,
  type SerializedTaskListItem,
  type SerializedTaskView,
} from "./task-view";

/** The subset of a Task this panel reads. Both serialised shapes satisfy it. */
export type QuickEditTask = Pick<
  SerializedTaskListItem | SerializedTaskView,
  | "id"
  | "title"
  | "priority"
  | "dueDate"
  | "scheduledDate"
  | "timeSector"
  | "commitmentState"
> & {
  readonly parent?: { readonly id: string; readonly title: string } | null;
  readonly recurrence?: {
    readonly frequency: TaskRecurrenceFrequency;
    readonly interval: number;
    readonly dateKind: "scheduled" | "due";
    readonly weekdays: readonly number[];
  } | null;
};

export interface TaskQuickEditPanelProps {
  readonly task: QuickEditTask;
  /** The owner's calendar day (ADR-022) for the Today/Tomorrow shortcuts. */
  readonly todayIso: string;
  /** Called after any successful mutation so the host can revalidate. */
  readonly onChanged?: (message: string) => void;
  /** Rendered under the controls — e.g. Review Inbox's Skip/Next actions. */
  readonly footer?: React.ReactNode;
}

/** The repeat options, in the same restrained vocabulary the parser recognises. */
const REPEAT_OPTIONS: ReadonlyArray<{
  readonly value: string;
  readonly label: string;
}> = [
  { value: "", label: "Does not repeat" },
  { value: "day:1", label: "Every day" },
  { value: "weekday:1", label: "Every weekday" },
  { value: "week:1", label: "Every week" },
  { value: "week:2", label: "Every 2 weeks" },
  { value: "month:1", label: "Every month" },
  { value: "year:1", label: "Every year" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "No priority" },
  ...TASK_PRIORITIES.map((priority) => ({
    value: priority,
    label: taskPriorityLabel(priority),
  })),
];

const SECTOR_OPTIONS = [
  { value: "", label: "No sector" },
  ...TIME_SECTORS.map((sector) => ({
    value: sector,
    label: timeSectorLabel(sector),
  })),
];

const COMMITMENT_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "someday", label: "Someday / Maybe" },
];

/** `frequency:interval`, the value REPEAT_OPTIONS uses, for the task's current rule. */
function repeatValueOf(task: QuickEditTask): string {
  const rule = task.recurrence ?? null;
  if (!rule) return "";
  return `${rule.frequency}:${rule.interval}`;
}

export function TaskQuickEditPanel({
  task,
  todayIso,
  onChanged,
  footer,
}: TaskQuickEditPanelProps) {
  const fetcher = useFetcher<unknown>();
  const parentSearch = useTaskParentSearch();
  const [error, setError] = useState<string | null>(null);
  const [parentValue, setParentValue] = useState(task.parent?.id ?? "");
  /**
   * Instance-scoped control ids. The shared field controls otherwise DERIVE their id
   * from the label text, which is fine for a one-off form but not for a panel that is
   * mounted on more than one surface: two copies on a page would share an id, and an
   * `aria-labelledby` pointing at an ambiguous id resolves to no accessible name at
   * all. Scoping every id to this instance makes the panel safe to reuse anywhere.
   */
  const groupId = useId();
  const busy = fetcher.state !== "idle";
  /** The message to announce IF the in-flight mutation succeeds. */
  const pending = useRef<string | null>(null);
  const settled = useRef<unknown>(null);

  /**
   * Report the SERVER's answer, never the optimistic guess. A change is announced (and
   * the host revalidated) only once the canonical route has accepted it; a rejection
   * shows the route's own message and leaves the control as the user left it, so a
   * failed edit is never announced as a success.
   */
  useEffect(() => {
    if (fetcher.state !== "idle" || fetcher.data == null) return;
    if (settled.current === fetcher.data) return;
    settled.current = fetcher.data;
    const result = fetcher.data as {
      readonly ok?: boolean;
      readonly status?: string;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };
    const rejected = result.ok === false || result.status === "error";
    if (rejected) {
      setError(
        result.fieldErrors?.recurrence ??
          result.fieldErrors?.parentId ??
          result.formError ??
          "That change couldn’t be saved. Nothing was changed — try again.",
      );
      pending.current = null;
      return;
    }
    setError(null);
    if (pending.current !== null) {
      onChanged?.(pending.current);
      pending.current = null;
    }
  }, [fetcher.state, fetcher.data, onChanged]);

  /** A single-id `/tasks/bulk` field change — the same authority the bulk bar uses. */
  const bulk = useCallback(
    (fields: Record<string, string>, message: string) => {
      setError(null);
      pending.current = message;
      const body = new FormData();
      body.append("id", task.id);
      for (const [key, value] of Object.entries(fields)) body.set(key, value);
      fetcher.submit(body, { method: "post", action: "/tasks/bulk" });
    },
    [fetcher, task.id],
  );

  /** A canonical `/tasks/:taskId` mutation (parent, plan, repeat). */
  const record = useCallback(
    (fields: Record<string, string>, message: string) => {
      setError(null);
      pending.current = message;
      const body = new FormData();
      for (const [key, value] of Object.entries(fields)) body.set(key, value);
      fetcher.submit(body, { method: "post", action: `/tasks/${task.id}` });
    },
    [fetcher, task.id],
  );

  const setParent = useCallback(
    (value: string) => {
      setParentValue(value);
      if (value.length === 0) {
        record(
          { intent: "set_parent", parentId: "", parentKind: "" },
          `${task.title} moved to Inbox.`,
        );
        return;
      }
      const kind = parentSearch.kindOf(value);
      if (kind === null) {
        setError("Choose a Project or an Area from the list.");
        return;
      }
      record(
        { intent: "set_parent", parentId: value, parentKind: kind },
        `${task.title} filed under the chosen ${kind}.`,
      );
    },
    [parentSearch, record, task.title],
  );

  const setRepeat = useCallback(
    (value: string) => {
      if (value.length === 0) {
        record(
          { intent: "set_recurrence" },
          `${task.title} no longer repeats.`,
        );
        return;
      }
      const [frequency, interval] = value.split(":");
      // A repeat needs an anchor date; a rule with neither would be refused by the
      // server, so prefer the scheduled date and fall back to the due date.
      const dateKind =
        task.scheduledDate === null && task.dueDate !== null
          ? "due"
          : "scheduled";
      record(
        {
          intent: "set_recurrence",
          frequency: frequency ?? "",
          interval: interval ?? "1",
          dateKind,
        },
        `${task.title} now repeats.`,
      );
    },
    [record, task.dueDate, task.scheduledDate, task.title],
  );

  return (
    <div
      className="dh-task-quick-edit"
      role="group"
      aria-labelledby={`${groupId}-label`}
      data-testid="task-quick-edit"
    >
      <h3 className="dh-task-quick-edit__title" id={`${groupId}-label`}>
        {task.title}
      </h3>

      <SelectField
        label="Project or Area"
        id={`${groupId}-parent`}
        help="Leave blank to keep this task in Inbox."
        showOptionalCue={false}
        placeholder="Search Projects and Areas"
        value={parentValue}
        options={parentSearch.withSelected(parentValue)}
        onSearch={parentSearch.search}
        loading={parentSearch.loading}
        emptyMessage="No matching Projects or Areas"
        onChange={setParent}
        disabled={busy}
      />

      <SelectField
        label="Priority"
        id={`${groupId}-priority`}
        showOptionalCue={false}
        value={task.priority ?? ""}
        options={PRIORITY_OPTIONS}
        disabled={busy}
        onChange={(value) =>
          bulk(
            { intent: "set_priority", priority: value },
            value.length === 0
              ? `Cleared the priority on ${task.title}.`
              : `${task.title} set to ${taskPriorityLabel(value as (typeof TASK_PRIORITIES)[number])}.`,
          )
        }
      />

      <div className="dh-task-quick-edit__dates">
        <DateField
          label="Scheduled date"
          id={`${groupId}-scheduled`}
          value={task.scheduledDate ?? ""}
          disabled={busy}
          onChange={(value) =>
            value.length === 0
              ? record(
                  { intent: "clear_plan" },
                  `Cleared the planned date on ${task.title}.`,
                )
              : record(
                  { intent: "plan", scheduledDate: value },
                  `Planned ${task.title} for ${value}.`,
                )
          }
        />
        <DateField
          label="Due date"
          id={`${groupId}-due`}
          value={task.dueDate ?? ""}
          disabled={busy}
          onChange={(value) =>
            bulk(
              { intent: "set_due", dueDate: value },
              value.length === 0
                ? `Cleared the due date on ${task.title}.`
                : `${task.title} is due ${value}.`,
            )
          }
        />
      </div>

      <div className="dh-task-quick-edit__shortcuts">
        <FormButton
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            record(
              { intent: "plan", scheduledDate: todayIso },
              `Planned ${task.title} for today.`,
            )
          }
        >
          Today
        </FormButton>
        <FormButton
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            bulk(
              { intent: "set_due", dueDate: todayIso },
              `${task.title} is due today.`,
            )
          }
        >
          Due today
        </FormButton>
      </div>

      <SelectField
        label="Time Sector"
        id={`${groupId}-sector`}
        showOptionalCue={false}
        value={task.timeSector ?? ""}
        options={SECTOR_OPTIONS}
        disabled={busy}
        onChange={(value) =>
          bulk(
            { intent: "set_sector", sector: value },
            `${task.title} moved to ${value.length === 0 ? "No sector" : timeSectorLabel(value as (typeof TIME_SECTORS)[number])}.`,
          )
        }
      />

      <SelectField
        label="Commitment"
        id={`${groupId}-commitment`}
        showOptionalCue={false}
        value={task.commitmentState}
        options={COMMITMENT_OPTIONS}
        disabled={busy}
        onChange={(value) =>
          bulk(
            { intent: "set_commitment", commitment: value },
            value === "someday"
              ? `${task.title} moved to Someday / Maybe.`
              : `${task.title} is active again.`,
          )
        }
      />

      <SelectField
        label="Repeat"
        id={`${groupId}-repeat`}
        help="A repeat needs a scheduled or due date to repeat from."
        showOptionalCue={false}
        value={repeatValueOf(task)}
        options={REPEAT_OPTIONS}
        disabled={busy}
        onChange={setRepeat}
      />

      {error ? (
        <p className="dh-task-quick-edit__error" role="alert">
          {error}
        </p>
      ) : null}

      {footer ? (
        <div className="dh-task-quick-edit__footer">{footer}</div>
      ) : null}
    </div>
  );
}
