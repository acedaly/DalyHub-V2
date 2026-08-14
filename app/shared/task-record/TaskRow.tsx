/**
 * DS-04 — the canonical product-level Task ROW.
 *
 * Until DS-04 a task on `/tasks` was the generic `Card` in list presentation with
 * roughly seven hundred lines of `.dh-collection--tasks .dh-card__*` overrides
 * pulling it towards a row. That worked, and it could not reach the concept: the
 * generic card lays its metadata out as a WRAPPING RUN, and the concept's Tasks
 * screen is a COLUMN GRID with a header — `Task · Project · Due · Priority ·
 * Status` — where a date only reads as a column because every date in it starts
 * at the same x. A run of flex items cannot be a column, however it is styled.
 *
 * So this is a row rather than a card, in three deliberate senses:
 *
 *   - **It has no surface of its own.** No radius, no border box, no shadow, no
 *     tonal fill. A hairline underneath, a hover wash, a selected wash. The list
 *     it sits in has no surface either — the rows are drawn straight onto the
 *     page (DS-04 §9).
 *   - **Its columns are the LIST's columns.** The grid template is declared once
 *     on `.dh-tasklist` and inherited, which is what keeps the header cells and
 *     every row's cells on the same vertical lines at every width.
 *   - **The title outranks everything.** The title cell is the only `1fr`; every
 *     metadata column is a fixed width that is dropped, narrowest-first, as the
 *     viewport tightens. Metadata yields before the title does (DS-04 §10).
 *
 * ── What it does NOT own ────────────────────────────────────────────────────
 * No mutation authority whatsoever. Completion, priority, project and both dates
 * are the SAME shared controls the Drawer, Today and a Project's task list use
 * (`TaskRowFields`, `dh-check-circle`), posting the same canonical intents; the
 * row supplies data and callbacks and nothing else. It does not fetch, it does
 * not know about routes beyond the href it is handed, and it holds no state
 * except the hover/focus its stylesheet reads.
 *
 * ── Why it is SHARED but wired only into `/tasks` ───────────────────────────
 * It lives here, beside the other shared task surfaces, because Today and a
 * Project's task list show the same object and will adopt it. DS-04 wires it
 * into `/tasks` alone so that the module that is being redesigned is the only
 * one whose rows move — the others keep the generic Card and cannot regress
 * (DS-04 §61).
 */

import { useRef, type ReactNode } from "react";
import { Link } from "react-router";

import { Menu, type MenuItem } from "~/shared/ui";
import { RepeatIcon } from "~/shared/icons";
import type { TaskPriority } from "~/kernel/tasks";

import { PriorityIndicator } from "./PriorityIndicator";
import {
  InlineTaskDate,
  InlineTaskParent,
  type TaskParentOption,
  type TaskRowFieldSave,
} from "./TaskRowFields";
import { InlineTaskPriority } from "./TaskRowFields";
import { relativeCalendarDate, taskRecurrenceLabel } from "./task-view";
import type { SerializedTaskListItem } from "./task-view";

/**
 * Everything a row draws. Structurally the `TaskCardData` the Tasks module
 * derives, restated here as the row's own contract so a second caller does not
 * have to import a module-private view-model to render a task.
 */
export interface TaskRowData {
  readonly id: string;
  readonly title: string;
  readonly priority: TaskPriority | null;
  readonly stateKind: string;
  readonly stateLabel: string;
  readonly stateTone: string;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  readonly parent: {
    readonly kind: "project" | "goal" | "area";
    readonly id: string;
    readonly title: string;
  } | null;
  readonly completed: boolean;
  readonly waiting: boolean;
  readonly recurrence: SerializedTaskListItem["recurrence"];
}

export interface TaskRowSelection {
  readonly selected: boolean;
  readonly onSelectedChange: (
    selected: boolean,
    modifiers?: { readonly shift: boolean },
  ) => void;
  readonly label: string;
}

export interface TaskRowProps {
  readonly task: TaskRowData;
  /** The OWNER's calendar day, so a date can say "Today" rather than guessing. */
  readonly todayIso: string;
  /** The loader's bounded parent candidates, for the inline project editor. */
  readonly parents: readonly TaskParentOption[];
  /** Where the title links — the Drawer, as a real, shareable URL. */
  readonly href: string;
  /** Opening through the router's drawer stack rather than a full navigation. */
  readonly onOpen: () => void;
  /** The document outline level for the row's title. */
  readonly headingLevel: 2 | 3;
  readonly onCompletedChange: (complete: boolean) => void;
  readonly onInlineSave: (save: TaskRowFieldSave) => void;
  readonly overflowActions: readonly MenuItem[];
  /** Replaces the title with an editor while this row is being renamed. */
  readonly titleEditor?: ReactNode;
  /** Opens the shared searchable parent picker, from the project menu's foot. */
  readonly onSearchParents?: () => void;
  /** Bulk selection, when the surface is in selection mode. */
  readonly selection?: TaskRowSelection;
  /** A touch hold enters selection mode; inert on a pointer device. */
  readonly onLongPress?: () => void;
  /** A deleted task is shown, never edited. */
  readonly readOnly?: boolean;
  /** This device is holding an unsent change for this task (PWA-12). */
  readonly pending?: boolean;
  /** What that unsent change IS, in words, beside the title. */
  readonly pendingNote?: string;
}

/** How long a touch must be held before it means "select this" (TASKS-08). */
const LONG_PRESS_MS = 500;

/**
 * The display states a row draws no pill for.
 *
 * `planned` is "there is a planned date" and `inbox` is "there is not" — both of
 * which the row already states in the columns beside it. Every other state
 * (Completed, Cancelled, Waiting, On hold, Someday / Maybe, In progress) appears
 * nowhere else, so for those the pill genuinely is the only signal. Carried here
 * rather than passed in: it is a property of the ROW's anatomy, and a second
 * surface drawing this row must not be able to disagree about it.
 */
const ROUTINE_STATES: ReadonlySet<string> = new Set(["planned", "inbox"]);

export function TaskRow({
  task,
  todayIso,
  parents,
  href,
  onOpen,
  headingLevel,
  onCompletedChange,
  onInlineSave,
  overflowActions,
  titleEditor,
  onSearchParents,
  selection,
  onLongPress,
  readOnly = false,
  pending = false,
  pendingNote,
}: TaskRowProps) {
  const Heading = `h${headingLevel}` as const;
  const due = relativeCalendarDate(task.dueDate, todayIso);
  const overdue = !task.completed && due?.urgency === "overdue";
  const disabled = readOnly || task.completed;
  const showState = !ROUTINE_STATES.has(task.stateKind);
  const repeat = taskRecurrenceLabel(task.recurrence ?? null);

  /*
   * The hold gesture, as a timer rather than a library.
   *
   * It cancels on move and on release, so a scroll that starts on a row is a
   * scroll. It is an ACCELERATOR — the header's "Select tasks" item and the
   * checkbox it reveals are the ordinary, keyboard- and screen-reader-reachable
   * path — which is why nothing here is the only way to reach selection.
   */
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHold = () => {
    if (holdRef.current !== null) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
  };
  const startHold = () => {
    if (!onLongPress) return;
    cancelHold();
    holdRef.current = setTimeout(() => {
      holdRef.current = null;
      onLongPress();
    }, LONG_PRESS_MS);
  };

  return (
    <li
      className="dh-taskrow"
      data-testid="task-row"
      data-completed={task.completed ? "true" : undefined}
      data-overdue={overdue ? "true" : undefined}
      data-selected={selection?.selected ? "true" : undefined}
      data-pending={pending ? "true" : undefined}
      {...(onLongPress
        ? {
            onTouchStart: startHold,
            onTouchMove: cancelHold,
            onTouchEnd: cancelHold,
            onTouchCancel: cancelHold,
          }
        : {})}
    >
      <span className="dh-taskrow__lead">
        {selection ? (
          <label className="dh-taskrow__select">
            <input
              type="checkbox"
              className="dh-checkbox__input"
              checked={selection.selected}
              data-testid="task-select"
              aria-label={selection.label}
              onChange={(event) =>
                selection.onSelectedChange(event.currentTarget.checked, {
                  shift: (
                    event.nativeEvent as unknown as { shiftKey?: boolean }
                  ).shiftKey!,
                })
              }
              onClick={(event) => event.stopPropagation()}
            />
            <span className="dh-checkbox__box" aria-hidden="true" />
          </label>
        ) : null}
        {/*
         * Completion. The SAME control the whole product uses, at the row's
         * leading edge, with a real accessible name that says which task it
         * finishes — never a bare "complete" repeated down a list.
         */}
        <label className="dh-check-circle-target dh-taskrow__complete">
          <input
            type="checkbox"
            className="dh-check-circle"
            checked={task.completed}
            disabled={readOnly}
            data-testid="task-complete"
            /*
             * DS-04 — the ring does NOT take the overdue colour.
             *
             * It did, and in a bucket called Overdue that painted a column of
             * fourteen crimson circles down the left edge of the page — the
             * loudest object on a screen whose product principle is calm over
             * urgent (AGENTS.md §2). The state is already said twice, in words:
             * the due date reads "Yesterday" or a passed date in the overdue
             * colour, and the group heading above says Overdue. A third,
             * larger, colour-only restatement of it on the control that
             * FINISHES the task is not a signal, it is alarm.
             */
            aria-label={
              task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`
            }
            onChange={(event) => onCompletedChange(event.currentTarget.checked)}
            onClick={(event) => event.stopPropagation()}
          />
        </label>
      </span>

      <Heading className="dh-taskrow__main">
        {titleEditor ?? (
          <Link
            className="dh-taskrow__title"
            to={href}
            /*
             * "Open <title>" is the product-wide accessible name for a record's
             * open link — every collection in DalyHub uses it, and a row that
             * named itself differently would be the only place in the product
             * where the same act is announced with different words. It contains
             * the visible text, so WCAG 2.5.3 (Label in Name) is satisfied.
             */
            aria-label={`Open ${task.title}`}
            data-testid="task-row-open"
            onClick={(event) => {
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }
              event.preventDefault();
              onOpen();
            }}
          >
            {task.title}
          </Link>
        )}
        {/*
         * The two facts that are signals rather than values: this repeats, and
         * this is blocked on someone else. Each is an icon PLUS a word for
         * assistive technology, never a pill — a recurrence is a property of a
         * task, not a status worth a bounded container on every row (§12).
         */}
        {repeat !== null ? (
          <span className="dh-taskrow__signal" data-testid="task-row-repeat">
            <RepeatIcon aria-hidden="true" />
            <span className="dh-visually-hidden">Repeats: {repeat}</span>
          </span>
        ) : null}
        {/* PWA-12 — what this device is still holding, in words. Absent in the
            steady state, which must look completely ordinary. */}
        {pendingNote ? (
          <span className="dh-task-sync" data-testid="task-row-sync">
            {pendingNote}
          </span>
        ) : null}
      </Heading>

      {/*
       * The metadata columns.
       *
       * `display: contents` on a desktop, so these four are GRID ITEMS of the
       * row and land on the list's shared column lines; a real flex container on
       * a phone, where they become the row's quiet second line. One DOM, two
       * compositions, no duplicated markup and nothing to keep in step.
       */}
      <span className="dh-taskrow__meta">
        <span className="dh-taskrow__cell dh-taskrow__cell--project">
          <InlineTaskParent
            taskId={task.id}
            title={task.title}
            parent={task.parent}
            options={parents}
            onSaved={onInlineSave}
            disabled={disabled}
            {...(onSearchParents && !disabled
              ? { onSearchAll: onSearchParents }
              : {})}
          />
        </span>
        {/*
         * The DATE cell — one column, two strictly separate fields.
         *
         * DalyHub has two dates and the concept's list has one date column, and
         * both facts have to survive. The cell shows the DUE date, which is the
         * deadline and the more urgent of the two; when a task has no due date
         * but IS planned, it shows the planned date instead, in italic and under
         * its own accessible name ("Planned date: Tomorrow"), so the two are
         * never confused by ear or by eye.
         *
         * Nothing about the domain is blurred: the two dates keep their separate
         * columns, their separate intents (`set_due` vs `plan`/`clear_plan`) and
         * their separate editors, and editing one from here cannot touch the
         * other. The row surfaces one of them; the row's overflow → "Priority,
         * dates and repeat…" and the Drawer edit both.
         *
         * Showing NEITHER was the alternative, and it was wrong: a task planned
         * for tomorrow with no deadline is the ordinary shape of planned work,
         * and a row that says nothing about when it is due to happen is a row
         * that cannot be planned from.
         */}
        <span className="dh-taskrow__cell dh-taskrow__cell--due">
          {task.dueDate === null && task.scheduledDate !== null ? (
            <InlineTaskDate
              taskId={task.id}
              title={task.title}
              kind="scheduled"
              value={task.scheduledDate}
              todayIso={todayIso}
              onSaved={onInlineSave}
              disabled={disabled}
            />
          ) : (
            <InlineTaskDate
              taskId={task.id}
              title={task.title}
              kind="due"
              value={task.dueDate}
              todayIso={todayIso}
              onSaved={onInlineSave}
              disabled={disabled}
            />
          )}
        </span>
        <span className="dh-taskrow__cell dh-taskrow__cell--priority">
          <InlineTaskPriority
            taskId={task.id}
            title={task.title}
            priority={task.priority}
            onSaved={onInlineSave}
            disabled={disabled}
          />
        </span>
        <span className="dh-taskrow__cell dh-taskrow__cell--status">
          {showState ? (
            <span
              className="dh-taskrow__state"
              data-tone={task.stateTone}
              data-testid="task-row-state"
            >
              {task.stateLabel}
            </span>
          ) : null}
        </span>
      </span>

      <span className="dh-taskrow__actions">
        <Menu
          // The product-wide wording for a row's long tail, so one phrase
          // names this control everywhere it appears.
          label={`More actions for ${task.title}`}
          triggerClassName="dh-taskrow__overflow"
          items={overflowActions as MenuItem[]}
        />
      </span>
    </li>
  );
}

/**
 * The row's priority cell, exported so a caller can render the same mark outside
 * a row (a bulk bar's summary, a Drawer field) without re-deriving it.
 */
export function TaskRowPriority({
  priority,
}: {
  readonly priority: TaskRowData["priority"];
}) {
  return <PriorityIndicator priority={priority} />;
}
