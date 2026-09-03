/**
 * TASKS-06 / V2.8 CONV-01 — the ONE bulk-action bar a Task selection gets,
 * wherever the selection is made.
 *
 * It was a module-private component at the foot of `TasksWorkspace.tsx`, and
 * that was right while `/tasks` was the only surface that selected rows. CONV-01
 * gave the Project record's Tasks tab the shared row and, with it, the shared
 * selection contract — and a selection needs somewhere to act. Two bars would
 * be two answers to "what can I do to eighteen tasks at once", and ADR-115's
 * rule is that a Task has the same powers wherever you meet it; so the bar
 * moved here, beside the row and the selection reducer it serves, and both
 * surfaces render THIS one. Nothing about its behaviour changed in the move.
 *
 * ── Authority ───────────────────────────────────────────────────────────────
 * Nothing here writes. Every action posts the whole id list, as one request,
 * to the canonical `/tasks/bulk` route — the same route the row's own inline
 * fields post a single id to — and the host announces the SERVER's outcome
 * through its own live region. There is no per-surface bulk endpoint and no
 * client loop.
 *
 * ── What the host supplies ──────────────────────────────────────────────────
 * The selected tasks (for the mixed-value summaries), the ids, the owner's
 * day, the bounded parent candidates for "Move", whether the surface is the
 * Deleted view, and the two callbacks: clear the selection, announce-and-
 * revalidate. A bounded surface with no Deleted view passes `viewingDeleted`
 * false and gets exactly the working bar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { addCalendarDays, isCalendarDate } from "~/kernel/datetime";
import { MAX_PLAN_BATCH_SIZE, TIME_SECTORS } from "~/kernel/tasks";
import type { TaskPriority, TaskRelation } from "~/kernel/tasks";

import type { TaskBulkResult } from "./contract";
import { TASK_PRIORITY_SELECT_OPTIONS } from "./priority-options";
import {
  bulkFieldLabel,
  bulkSelectionOverBy,
  summariseBulkField,
} from "./task-selection";
import type { TaskParentOption } from "./TaskRowFields";
import {
  formatCalendarDate,
  taskPriorityLabel,
  timeSectorLabel,
} from "./task-view";

/**
 * The facts the bar reads off a SELECTED task — the four its mixed-value
 * summaries and its Complete/Reopen offer are decided by. Both `/tasks`'s card
 * view-model and the shared row projection carry them, so either host passes
 * its own rows without an adapter.
 */
export interface TaskBulkSelectionItem {
  readonly id: string;
  readonly priority: TaskPriority | null;
  readonly dueDate: string | null;
  readonly parent: TaskRelation | null;
  readonly completed: boolean;
}

/**
 * The bounded parent candidates "Move" offers. The bar reads only the identity
 * and the title; a host's richer option (with identity colour) is accepted as
 * it is.
 */
export type TaskBulkParentOption = Pick<
  TaskParentOption,
  "id" | "kind" | "title"
>;

/*
 * DHDS-09 — the canonical four, plus the one thing bulk editing genuinely adds.
 *
 * A bulk control CAN clear a field across a selection, which no single-task
 * picker offers (a stored `null` is Priority 4 to a reader, so a per-task "No
 * priority" would be a second way to say P4). Here it is a real, distinct
 * operation over many rows, so it stays — appended to the shared list rather
 * than inside a fifth hand-built copy of it.
 */
const BULK_PRIORITY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  ...TASK_PRIORITY_SELECT_OPTIONS,
  { value: "__none", label: "No priority" },
];

const BULK_SECTOR_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "__none", label: "No sector" },
  ...TIME_SECTORS.map((sector) => ({
    value: sector,
    label: timeSectorLabel(sector),
  })),
];

const BULK_STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "on_hold", label: "On hold" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * The contextual bulk surface.
 *
 * Four decisions shape it, and each answers a specific way a bulk toolbar goes wrong:
 *
 *   1. **It states the MIXED state rather than inventing a current value.** With P1s,
 *      P2s and untriaged tasks selected, Priority reads "Mixed" — choosing P2 then
 *      sets all of them to P2, which is what the owner asked for. Pretending the
 *      selection has one value is how a bulk control silently overwrites work the owner
 *      could not see (brief §17).
 *   2. **The common six are visible; the rest are behind More.** On a phone the row
 *      collapses to Complete · Date · Priority · Move · More, which is the M3 bottom
 *      action-bar shape the shell already uses — not a new overlay primitive.
 *   3. **Delete is REVERSIBLE and says so.** "Delete 18 tasks?" explains that they move
 *      to the Deleted view and can be restored, and names where from. Permanent
 *      destruction is not reachable from here at all (brief §15).
 *   4. **Every action is ONE request.** Each posts the whole id list to `/tasks/bulk`,
 *      which resolves and validates every id before a single write and then runs one
 *      atomic batch. There is no client loop anywhere in this component.
 */
/**
 * The past-tense verb each bulk intent reports in the live region. Only the four
 * LIFECYCLE intents get their own word — those are the ones where "updated" would
 * be actively misleading. Every field mutation (priority, dates, parent, status,
 * commitment) genuinely is an update and shares the default.
 */
const BULK_INTENT_VERBS: Readonly<Record<string, string>> = {
  delete: "deleted",
  restore: "restored",
  complete: "completed",
  reopen: "reopened",
};

export function TaskBulkActionBar({
  tasks,
  ids,
  todayIso,
  parents,
  viewingDeleted,
  onCleared,
  onAnnounce,
}: {
  readonly tasks: readonly TaskBulkSelectionItem[];
  readonly ids: readonly string[];
  readonly todayIso: string;
  readonly parents: readonly TaskBulkParentOption[];
  /** True on the Deleted view, where Restore replaces the destructive actions. */
  readonly viewingDeleted: boolean;
  readonly onCleared: () => void;
  /**
   * Announce a COMMITTED outcome through the workspace's own live region, and
   * re-read the list.
   *
   * It cannot be announced from inside this bar. A successful bulk action clears the
   * selection, which unmounts the bar in the same commit — so a message written to a
   * live region that lives in here is destroyed before any assistive technology can
   * read it, and the one confirmation a screen-reader user gets for an action on
   * eighteen records is silence. The workspace's region outlives the selection, so
   * that is where a committed outcome belongs. A REFUSAL still speaks from in here,
   * because a refusal keeps the selection and the bar stays mounted beside it.
   */
  readonly onAnnounce: (message: string) => void;
}) {
  const fetcher = useFetcher<TaskBulkResult>();
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const processed = useRef<TaskBulkResult | null>(null);
  /*
   * The verb the LAST submitted intent deserves.
   *
   * "18 tasks updated" is true of a priority change and misleading of a deletion —
   * the one bulk action whose outcome the owner most needs stated back to them is
   * the one a generic verb describes worst. The live region is the only confirmation
   * a screen-reader user gets, so it names what happened.
   */
  const lastVerb = useRef<string>("updated");

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const result = fetcher.data;
    if (processed.current === result) return;
    processed.current = result;
    if (result.ok) {
      setConfirmDelete(false);
      setShowMore(false);
      // Announces AND revalidates, through the same channel every row mutation uses.
      onAnnounce(
        `${result.changed} ${result.changed === 1 ? "task" : "tasks"} ${lastVerb.current}, ${result.unchanged} unchanged.`,
      );
      onCleared();
    } else {
      // A refusal keeps the selection: the owner's intent survives so they can fix the
      // cause and retry, rather than having to re-select fourteen rows.
      setStatus(result.formError);
      setConfirmDelete(false);
    }
  }, [fetcher.state, fetcher.data, onAnnounce, onCleared]);

  const busy = fetcher.state !== "idle";

  const run = useCallback(
    (fields: Record<string, string>) => {
      lastVerb.current = BULK_INTENT_VERBS[fields.intent ?? ""] ?? "updated";
      const body = new FormData();
      for (const id of ids) body.append("id", id);
      for (const [key, value] of Object.entries(fields)) body.set(key, value);
      fetcher.submit(body, { method: "post", action: "/tasks/bulk" });
    },
    [fetcher, ids],
  );

  // Mixed-value summaries over the SELECTED rows, so each control can state what the
  // selection currently holds before it is changed.
  const prioritySummary = useMemo(
    () => summariseBulkField(tasks, (task) => task.priority),
    [tasks],
  );
  const dueSummary = useMemo(
    () => summariseBulkField(tasks, (task) => task.dueDate),
    [tasks],
  );
  const parentSummary = useMemo(
    () => summariseBulkField(tasks, (task) => task.parent?.id ?? null),
    [tasks],
  );
  const anyCompleted = tasks.some((task) => task.completed);
  const anyOpen = tasks.some((task) => !task.completed);

  const count = ids.length;
  const noun = count === 1 ? "task" : "tasks";

  /*
   * DEBT-110 — a selection the server's bound cannot accept says so INSTEAD of
   * offering actions that are all guaranteed to be refused.
   *
   * Only a Shift-range across more than one loaded page can build one: "Select all" is
   * capped at the bound. Offering a toolbar here would be offering eleven controls
   * that each end in the same typed validation error, which is exactly the
   * correct-but-unexplained refusal this entry was raised about.
   */
  const overBy = bulkSelectionOverBy(count);
  if (overBy > 0) {
    return (
      <div
        className="dh-tasks-bulk dh-tasks-bulk--empty"
        role="group"
        aria-label="Bulk task actions"
      >
        <p className="dh-tasks-bulk__count" aria-live="polite">
          {count} selected
        </p>
        <p className="dh-tasks-bulk__status">
          Bulk actions work on up to {MAX_PLAN_BATCH_SIZE} tasks at a time, so
          one change stays fast and atomic. Deselect {overBy} to continue.
        </p>
        <div className="dh-tasks-bulk__actions">
          <button
            type="button"
            className="dh-btn dh-btn--secondary"
            onClick={onCleared}
          >
            Clear selection
          </button>
        </div>
      </div>
    );
  }

  if (confirmDelete) {
    return (
      <div
        className="dh-tasks-bulk dh-tasks-bulk--confirm"
        role="group"
        aria-label="Confirm bulk delete"
      >
        <p className="dh-tasks-bulk__confirm-title">
          Delete {count} {noun}?
        </p>
        <p className="dh-tasks-bulk__confirm-body">
          They move to the <strong>Deleted</strong> view, keeping their dates,
          links and history, and can be restored from there. Nothing is
          permanently destroyed.
        </p>
        <div className="dh-tasks-bulk__actions">
          <button
            type="button"
            className="dh-btn dh-btn--danger"
            disabled={busy}
            onClick={() => run({ intent: "delete" })}
          >
            Delete {count} {noun}
          </button>
          <button
            type="button"
            className="dh-btn dh-btn--secondary"
            disabled={busy}
            onClick={() => setConfirmDelete(false)}
          >
            Keep them
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dh-tasks-bulk" role="group" aria-label="Bulk task actions">
      <p className="dh-tasks-bulk__count" aria-live="polite">
        {count} selected
      </p>
      <div className="dh-tasks-bulk__actions">
        {viewingDeleted ? (
          <button
            type="button"
            className="dh-btn dh-btn--primary"
            disabled={busy}
            onClick={() => run({ intent: "restore" })}
          >
            Restore
          </button>
        ) : (
          <>
            {anyOpen ? (
              <button
                type="button"
                className="dh-btn dh-btn--secondary"
                disabled={busy}
                onClick={() => run({ intent: "complete" })}
              >
                Complete
              </button>
            ) : null}
            {/* Reopen is offered ONLY when the selection actually contains completed
                work — a control that cannot apply to anything selected is worse than
                a missing one (brief §14). */}
            {anyCompleted ? (
              <button
                type="button"
                className="dh-btn dh-btn--secondary"
                disabled={busy}
                onClick={() => run({ intent: "reopen" })}
              >
                Reopen
              </button>
            ) : null}

            <BulkMenu
              label="Date"
              current={bulkFieldLabel(
                dueSummary,
                (iso) => formatCalendarDate(iso) ?? iso,
                "No due date",
              )}
              disabled={busy}
              options={[
                { value: `due:${todayIso}`, label: "Due today" },
                {
                  value: `due:${shiftIso(todayIso, 1)}`,
                  label: "Due tomorrow",
                },
                {
                  value: `due:${shiftIso(todayIso, 7)}`,
                  label: "Due in a week",
                },
                { value: "due:", label: "Clear due date" },
                { value: `plan:${todayIso}`, label: "Plan for today" },
                {
                  value: `plan:${shiftIso(todayIso, 1)}`,
                  label: "Plan for tomorrow",
                },
                { value: "plan:", label: "Clear planned date" },
              ]}
              onChoose={(value) => {
                const [kind, date] = splitOnce(value, ":");
                if (kind === "due") {
                  run({ intent: "set_due", dueDate: date });
                } else if (date.length === 0) {
                  run({ intent: "clear_plan" });
                } else {
                  run({ intent: "plan", scheduledDate: date });
                }
              }}
            />

            <BulkMenu
              label="Priority"
              current={bulkFieldLabel(
                prioritySummary,
                taskPriorityLabel,
                "No priority",
              )}
              disabled={busy}
              options={BULK_PRIORITY_OPTIONS}
              onChoose={(value) =>
                run({
                  intent: "set_priority",
                  priority: value === "__none" ? "" : value,
                })
              }
            />

            <BulkMenu
              label="Move"
              current={bulkFieldLabel(
                parentSummary,
                (id) =>
                  parents.find((parent) => parent.id === id)?.title ??
                  "A Project or Area",
                "Inbox",
              )}
              disabled={busy}
              options={[
                { value: "__inbox", label: "Move to Inbox" },
                ...parents.map((parent) => ({
                  value: `${parent.kind}:${parent.id}`,
                  label: parent.title,
                })),
              ]}
              onChoose={(value) => {
                if (value === "__inbox") {
                  run({ intent: "set_parent", parentId: "", parentKind: "" });
                  return;
                }
                const [kind, id] = splitOnce(value, ":");
                run({ intent: "set_parent", parentId: id, parentKind: kind });
              }}
            />

            <button
              type="button"
              className="dh-btn dh-btn--secondary"
              aria-expanded={showMore}
              disabled={busy}
              onClick={() => setShowMore((open) => !open)}
            >
              More
            </button>

            {showMore ? (
              <>
                <BulkMenu
                  label="Status"
                  current="Set for all"
                  disabled={busy}
                  options={BULK_STATUS_OPTIONS}
                  onChoose={(value) =>
                    run({ intent: "set_status", status: value })
                  }
                />
                <BulkMenu
                  label="Sector"
                  current="Set for all"
                  disabled={busy}
                  options={BULK_SECTOR_OPTIONS}
                  onChoose={(value) =>
                    run({
                      intent: "set_sector",
                      sector: value === "__none" ? "" : value,
                    })
                  }
                />
                <button
                  type="button"
                  className="dh-btn dh-btn--secondary"
                  disabled={busy}
                  onClick={() =>
                    run({ intent: "set_commitment", commitment: "someday" })
                  }
                >
                  Someday / Maybe
                </button>
                <button
                  type="button"
                  className="dh-btn dh-btn--secondary"
                  disabled={busy}
                  onClick={() =>
                    run({ intent: "set_commitment", commitment: "active" })
                  }
                >
                  Make active
                </button>
                <button
                  type="button"
                  className="dh-btn dh-btn--danger-quiet"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete…
                </button>
              </>
            ) : null}
          </>
        )}

        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          disabled={busy}
          onClick={onCleared}
        >
          Done
        </button>
      </div>
      {status ? (
        <p className="dh-tasks-bulk__status" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One bulk field control: a labelled `<select>` whose current OPTION states what the
 * selection holds ("Mixed", "P2 · High", "No due date") and whose real options apply a
 * value to every selected task.
 *
 * A native select rather than a bespoke popover: it is one tab stop, it is announced
 * correctly, it opens as the platform picker on a phone, and the shared anchored-menu
 * primitive is built for a SINGLE record's current value — which is precisely what a
 * mixed selection does not have. The first option is a disabled summary, so the control
 * never claims a value the selection does not share.
 */
function BulkMenu({
  label,
  current,
  options,
  disabled,
  onChoose,
}: {
  readonly label: string;
  readonly current: string;
  readonly options: ReadonlyArray<{ value: string; label: string }>;
  readonly disabled?: boolean;
  readonly onChoose: (value: string) => void;
}) {
  return (
    <label className="dh-tasks-bulk__select">
      <span className="dh-tasks-bulk__select-label">{label}</span>
      <select
        className="dh-input"
        value=""
        disabled={disabled}
        onChange={(event) => {
          const value = event.target.value;
          if (value.length === 0) return;
          onChoose(value);
        }}
      >
        <option value="">{`${label}: ${current}`}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Shift a calendar date by whole days, on the OWNER's calendar day (ADR-022) rather
 * than the browser's clock. Pure string arithmetic through `Date.UTC`, so no timezone
 * can move the result.
 */
function shiftIso(iso: string, days: number): string {
  // DEBT-52 — the kernel's ONE calendar-day implementation, keeping this
  // helper's lenient contract for a value that may not be a date yet.
  return isCalendarDate(iso) ? addCalendarDays(iso, days) : iso;
}

/** Split on the FIRST separator only, so an id containing one survives intact. */
function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator);
  return index === -1
    ? [value, ""]
    : [value.slice(0, index), value.slice(index + separator.length)];
}

/**
 * Selection mode with nothing chosen yet — the state a long press or the
 * "Select tasks" toggle produces. It says what to do next rather than showing
 * an empty toolbar of disabled buttons, and it states the bulk BOUND before
 * the action rather than as a refusal after it (DEBT-110): the bound is only
 * reachable by loading more than one page, so it is said only when it applies.
 *
 * Shared with the bar for the same reason the bar is shared: the two surfaces
 * that select Task rows enter the mode the same way and must be told the same
 * thing.
 */
export function TaskSelectionPrompt({
  loadedCount,
  selectableIds,
  capped,
  onSelectAll,
  onDone,
}: {
  /** How many rows are on screen. */
  readonly loadedCount: number;
  /** The ids "Select all" may take — already bounded by `boundBulkSelection`. */
  readonly selectableIds: readonly string[];
  /** True when more rows are loaded than one bulk mutation may touch. */
  readonly capped: boolean;
  readonly onSelectAll: (ids: readonly string[]) => void;
  readonly onDone: () => void;
}) {
  return (
    <div
      className="dh-tasks-bulk dh-tasks-bulk--empty"
      role="group"
      aria-label="Select tasks"
    >
      <p className="dh-tasks-bulk__count">
        Choose tasks to act on them together.
      </p>
      {capped ? (
        <p className="dh-tasks-bulk__status">
          {loadedCount} tasks are loaded. Bulk actions work on up to{" "}
          {MAX_PLAN_BATCH_SIZE} at a time, so “Select all” takes the first{" "}
          {MAX_PLAN_BATCH_SIZE}.
        </p>
      ) : null}
      <div className="dh-tasks-bulk__actions">
        <button
          type="button"
          className="dh-btn dh-btn--secondary"
          disabled={loadedCount === 0}
          onClick={() => onSelectAll(selectableIds)}
        >
          Select all {selectableIds.length}
        </button>
        <button type="button" className="dh-btn dh-btn--ghost" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
