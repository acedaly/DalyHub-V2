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

import { useCallback, useId, useRef, type ReactNode } from "react";
import { Link } from "react-router";

import { useCardLongPress } from "~/shared/card/useCardLongPress";
import { Checkbox, Menu, type MenuItem } from "~/shared/ui";
import { CheckCircleIcon, RepeatIcon, ScheduleIcon } from "~/shared/icons";
import {
  checklistProgressLabel,
  taskBlockedLabel,
  type TaskBlockedSummary,
  type TaskChecklistProgress,
  type TaskPriority,
  type TaskRelation,
} from "~/kernel/tasks";

import { useTaskRowSwipe } from "./useTaskRowSwipe";

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
  /**
   * The structural parent, as the kernel resolves it — including the identity
   * DEBT-144 added, so the row's parent mark is the parent's OWN colour and
   * glyph rather than a neutral entity badge (TODAY-TASK-01).
   */
  readonly parent: TaskRelation | null;
  readonly completed: boolean;
  readonly waiting: boolean;
  /**
   * V2.4-GATE-02 — is this Task still a commitment the owner OWES?
   *
   * The kernel's `open`-scope answer, projected by `toTaskRowProjection` and
   * never re-derived here. It decides one thing and one thing only: whether a
   * passed due date is allowed to claim urgency. A **completed**, **cancelled**
   * or **Someday / Maybe** Task keeps its date and loses the overdue ramp; a
   * **waiting** or **on hold** Task is still owed and is unchanged, because
   * blocked is not abandoned.
   */
  readonly stillOwed: boolean;
  readonly recurrence: SerializedTaskListItem["recurrence"];
  /**
   * TASKS-13 — this Task's checklist progress, when the SURFACE projected it.
   *
   * Absent means the surface did not read it (and pays nothing for it), which is
   * deliberately different from a total of zero — a Task with no checklist. The
   * row draws the figure only for a real, non-empty checklist, so neither can be
   * mistaken for the other.
   */
  readonly checklist?: TaskChecklistProgress;
  /**
   * TASKS-12 — this Task's BLOCKED state, when the SURFACE projected it.
   *
   * Absent means the surface did not read it (and pays nothing for it), which is
   * deliberately different from "nothing blocks this Task" — both draw nothing,
   * so a row can never claim a Task is free to start on a surface that did not
   * ask the question.
   */
  readonly blocked?: TaskBlockedSummary;
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
  /**
   * DHDS-10 — the project menu's escape hatch, when the SURFACE wants to own it.
   *
   * Omit it, which every surface now does: the field opens the shared
   * searchable `Picker` in place, anchored to its own cell, writing through the
   * same `set_parent` intent. It was `() => openDrawer("task-move:<id>")` on
   * both callers, which meant "search all Projects and Areas" — a command
   * whose whole purpose is to choose one value — opened the Task's full record.
   *
   * Kept as an override for a surface that genuinely cannot host an anchored
   * surface over the row.
   */
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
  /**
   * DHDS-11 — the reorder/move grip, when the SURFACE has somewhere to drop.
   *
   * A slot rather than a capability the row grants itself, and that is the whole
   * design: a Task row is drawn on six surfaces and only some of them draw
   * visible destinations. `/tasks` grouped by Project passes one; Today, Plan,
   * a Project's task list and Search pass nothing, and are byte-identical to
   * what they were. A row is never draggable "because it is a Task row".
   *
   * The grip is a shared `DragHandle` supplied by the caller, so this component
   * imports no drag machinery and holds no drag state.
   */
  readonly dragHandle?: ReactNode;
  /** True while THIS row is the object being dragged. Draws the quiet source. */
  readonly dragging?: boolean;
  /**
   * DHDS-11 — this Task has LEFT this surface and the row is collapsing.
   *
   * The row is `aria-hidden` and pointer-inert while it goes, but deliberately
   * not `inert`: `inert` blurs its subtree synchronously, which would destroy
   * the information the focus handoff needs (`use-departing-rows.ts`). It is
   * pointer-inert from the same commit, so nothing in a row that has already
   * been reported gone can be clicked.
   */
  readonly leaving?: boolean;
  /**
   * DHDS-11 — this Task's record is the one currently open.
   *
   * Object continuity, and the smallest form of it: "I opened this object from
   * here, and here is still here." The row keeps a quiet current marker while
   * its Inspector is open, so closing it lands the owner's eye back on the row
   * they came from rather than on a list they now have to re-find their place
   * in. It is a MARK rather than a selection wash — bulk selection already owns
   * that treatment, and the two mean different things.
   *
   * Opt-in per surface: a surface that does not know which record is open
   * passes nothing and is unchanged.
   */
  readonly current?: boolean;
}

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
  dragHandle,
  dragging = false,
  leaving = false,
  current = false,
}: TaskRowProps) {
  const Heading = `h${headingLevel}` as const;
  /* The selection control's id, so its 44px label can name it explicitly. */
  const selectionId = useId();
  const due = relativeCalendarDate(task.dueDate, todayIso);
  /*
   * V2.4-GATE-02 — the row's own overdue flag agrees with the date beside it.
   *
   * It asked `!task.completed`, which is one third of the kernel's answer, so a
   * cancelled Task's passed date set `data-overdue` on the row exactly like a
   * live one. `stillOwed` is that answer, resolved once per Task in the shared
   * projection, so the flag, the date's colour and the cross-view row can no
   * longer disagree.
   */
  const overdue = task.stillOwed && due?.urgency === "overdue";
  const disabled = readOnly || task.completed;
  const repeat = taskRecurrenceLabel(task.recurrence ?? null);
  const checklist = checklistProgressLabel(task.checklist);
  /*
   * TASKS-12 — the blocked reason, and why it REPLACES the status pill.
   *
   * "Blocked" on its own is the least useful half of the fact: the owner already
   * knows the Task has not moved, and what they need is the name of the thing to
   * chase. So a blocked row states the whole sentence — "Blocked by Get director
   * approval", or "Blocked by 2 tasks" when naming one would be a half-truth —
   * and the status column stays empty, because a pill reading "Blocked" beside a
   * line reading "Blocked by …" is the duplicated label a row cannot afford.
   *
   * It sits on the TITLE's own line, beside the checklist figure, so it costs the
   * row no grid track — and, measured, no HEIGHT at 1440/1280/820, one extra line
   * at 393/320. Unlike the checklist figure, that phone cost is accepted: see
   * `task-dependencies.css`. It is TEXT rather than a colour, so the state
   * survives a monochrome display and a screen reader alike.
   *
   * It is drawn ONLY when the shared precedence evaluator actually resolved to
   * `blocked`. A Task that is both waiting and blocked reads "Waiting" and says
   * nothing about the blocker — exactly as a completed Task says nothing about
   * being in progress. One state per row, decided in one place.
   */
  const blocked =
    task.stateKind === "blocked" ? taskBlockedLabel(task.blocked) : null;
  const showState = !ROUTINE_STATES.has(task.stateKind) && blocked === null;

  /*
   * The hold gesture, through the SHARED hook.
   *
   * The first form of this row hand-rolled a `setTimeout` on the `<li>`'s touch
   * events, which was a second implementation of a behaviour the product
   * already owns — and a worse one. `useCardLongPress` is gated on a touch-first
   * media query (so it is genuinely inert on a pointer device rather than
   * merely unlikely to fire), excludes nested controls, cancels on drift, and
   * SWALLOWS the compatibility click the browser emits after `touchend`.
   *
   * That last one is the defect the hand-rolled version shipped: holding the
   * title, the completion checkbox or the overflow button for half a second
   * entered selection mode AND then opened, completed or invoked the task.
   */
  const longPress = useCardLongPress({
    ...(onLongPress ? { onLongPress } : {}),
  });

  /*
   * MOBILE-02 §4 — the two swipe acts, and why they are these two.
   *
   * They are the row's two most frequent acts and the two whose ordinary
   * controls are the smallest: completion is a 20px ring at the leading edge,
   * and the date is an inline trigger in a 7rem column that a phone drops
   * entirely at the narrow tier. A thumb that can reach neither can reach both
   * by pulling the row.
   *
   * ── Both fire the row's OWN controls, not a second path ────────────────────
   * Complete calls `onCompletedChange`, which is the checkbox's own handler.
   * Schedule ACTIVATES the inline date trigger this row already renders, so the
   * gesture opens the same shared DalyHub date control the trigger opens, writes
   * through the same `onInlineSave`, and cannot drift from it. There is no
   * swipe-only mutation anywhere in this component — which is also what keeps
   * the gesture an accelerator rather than the only way to reach either act.
   */
  const dateCellRef = useRef<HTMLSpanElement | null>(null);
  const openScheduler = useCallback(() => {
    // The cell holds exactly one control: `InlineTaskDate`'s trigger button.
    dateCellRef.current?.querySelector("button")?.click();
  }, []);

  /*
   * V2.4-GATE-02 — completion stays reachable while selection displaces it.
   *
   * The row's long tail is the one place that is present in EVERY mode, so it is
   * where the displaced act goes. It appears only while the lead is showing the
   * selection control — an at-rest row's menu is byte-identical to what it was,
   * because a menu item duplicating the control 200px to its left is noise.
   *
   * It is added HERE rather than by each surface deliberately: the row is what
   * knows its own lead is occupied, and a rule that depended on four callers
   * remembering is a rule that would be missed on the fifth. It writes through
   * `onCompletedChange` — the checkbox's own handler — so there is no second
   * completion path anywhere in this component.
   */
  const menuItems: MenuItem[] =
    selection && !readOnly
      ? [
          {
            id: "complete",
            label: task.completed ? "Reopen" : "Complete",
            icon: <CheckCircleIcon />,
            onSelect: () => onCompletedChange(!task.completed),
          },
          ...(overflowActions as MenuItem[]),
        ]
      : (overflowActions as MenuItem[]);

  const swipe = useTaskRowSwipe({
    // A read-only row (the Deleted view) offers neither: every mutation on a
    // soft-deleted task is invisible, so a gesture there could only ever fail.
    ...(readOnly
      ? {}
      : {
          onStartEdge: () => onCompletedChange(!task.completed),
          // A completed task has no plan to change; the column is disabled for
          // the same reason, so the gesture yields with it rather than opening a
          // control the row is already refusing.
          ...(disabled ? {} : { onEndEdge: openScheduler }),
        }),
  });

  return (
    <li
      className="dh-taskrow"
      data-dh-action-context="true"
      data-testid="task-row"
      data-completed={task.completed ? "true" : undefined}
      data-overdue={overdue ? "true" : undefined}
      data-selected={selection?.selected ? "true" : undefined}
      data-pending={pending ? "true" : undefined}
      /*
       * DHDS-11 — the row is the OBJECT a drag measures and lifts, and while it
       * is in the air its own place is kept and drawn quiet. It never collapses:
       * the list must not jump and the scroll position must not move, which is
       * most of what makes a drag feel like moving a thing.
       */
      data-dh-drag-item={dragHandle ? "true" : undefined}
      data-dh-drag-source={dragging ? "true" : undefined}
      data-dh-exit={leaving ? "true" : undefined}
      aria-hidden={leaving ? "true" : undefined}
      data-current={current ? "true" : undefined}
      /*
       * The gesture's whole visual footprint: an edge, an armed flag and a
       * distance. The stylesheet selects on `[data-swipe-edge]`, so the cells'
       * transform exists ONLY mid-gesture on a touch device — a permanent
       * identity transform would make every cell a containing block and quietly
       * move the anchored popovers the inline editors open.
       */
      data-swipe-enabled={swipe.enabled ? "true" : undefined}
      data-swipe-edge={swipe.edge ?? undefined}
      data-swipe-armed={swipe.armed ? "true" : undefined}
      data-swipe-dragging={swipe.dragging ? "true" : undefined}
      style={
        swipe.offset === 0
          ? undefined
          : ({
              "--swipe-offset": `${swipe.offset}px`,
            } as React.CSSProperties)
      }
      {...(longPress.enabled || swipe.enabled
        ? {
            onPointerDown: (event) => {
              longPress.onPointerDown(event);
              swipe.onPointerDown(event);
            },
            onPointerMove: (event) => {
              longPress.onPointerMove(event);
              swipe.onPointerMove(event);
            },
            onPointerUp: (event) => {
              longPress.onPointerUp(event);
              swipe.onPointerUp(event);
            },
            onPointerCancel: (event) => {
              longPress.onPointerCancel(event);
              swipe.onPointerCancel(event);
            },
            onClickCapture: (event) => {
              longPress.onClickCapture(event);
              swipe.onClickCapture(event);
            },
          }
        : {})}
    >
      {/*
       * The progressive affordance.
       *
       * `position: absolute`, so it takes no grid track and the row's column
       * geometry is byte-identical with it and without it. `aria-hidden`,
       * because it is a visual accelerator for two controls that are both
       * present on this row as ordinary, keyboard-reachable elements — the same
       * rule `CardSwipeTray` states for itself.
       *
       * Rendered only once the gesture is live, which is after mount and only on
       * a touch-first device: this is the most repeated component in the product
       * (fifty rows a page) and a desktop should not carry fifty inert spans it
       * can never reveal. It appears in a post-mount re-render rather than
       * during hydration, so there is no mismatch.
       */}
      {swipe.enabled && swipe.edge !== null ? (
        <span className="dh-taskrow__swipe" aria-hidden="true">
          <span className="dh-taskrow__swipe-action">
            {swipe.edge === "start" ? (
              <>
                <CheckCircleIcon />
                {task.completed ? "Reopen" : "Complete"}
              </>
            ) : (
              <>
                <ScheduleIcon />
                Schedule
              </>
            )}
          </span>
        </span>
      ) : null}
      <span className="dh-taskrow__lead">
        {dragHandle}
        {/*
         * V2.4-GATE-02 — ONE checkbox-like control at the row's leading edge.
         *
         * `task-signals.css` has always stated the invariant — *"selection is a
         * control that appears at the row's leading edge ONLY in selection mode
         * … A row shows one of them at rest"* — and the row did not keep it: a
         * surface in selection mode drew the 20px completion square AND a
         * selection checkbox 8px from it, unlabelled as a pair. On Weekly
         * Planning's queue, which is permanently in selection mode, ticking the
         * wrong one COMPLETED work the owner meant to schedule (DEBT-194 /
         * DEBT-164).
         *
         * The rule is now structural rather than a note: in selection mode the
         * selection control REPLACES completion; otherwise completion is the
         * row's control. Not hidden-but-interactive, not shrunk, not recoloured
         * — there is exactly one control in the DOM, so a mis-click cannot reach
         * the other act and a screen reader is never offered two checkboxes on
         * one row.
         *
         * Completion is not lost while the mode is on: it stays one item away in
         * the row's own overflow menu (below), it is what the surface's bulk bar
         * offers over the selection, and leaving the mode restores it instantly.
         *
         * The two are still told apart by SHAPE, at the same size and in the same
         * place: selection is the design system's own 18px SQUARE — the shared
         * `Checkbox` primitive, whose file header is the other half of D7
         * (*"this primitive is the square — selection"*) — and completion is the
         * 20px rounded square. Both sit inside the SAME 44px target box, so
         * entering and leaving selection mode moves no other cell by a pixel.
         *
         * `Checkbox` is COMPOSED rather than its class applied to a bare input:
         * a styled `<input>` written by hand is exactly what `AGENTS.md` §6 says
         * to import the primitive instead of, and a parallel copy would not
         * inherit the indeterminate handling or any later accessibility change.
         * Its own note licenses the unlabelled form here — *"omit it ONLY where
         * the control's name comes from elsewhere (a row whose title names it),
         * and pass `aria-label` in that case"* — which is this case exactly.
         *
         * The `<label>` around it is the 44px hit area. It associates EXPLICITLY,
         * by `htmlFor`, rather than by nesting: the primitive puts a wrapper span
         * between the label and the input, and while nesting still associates
         * them through it, an explicit pair is the one a reader — and a static
         * analyser — can verify without knowing what `Checkbox` renders.
         */}
        {selection ? (
          <label
            className="dh-check-circle-target dh-taskrow__select"
            htmlFor={selectionId}
          >
            <Checkbox
              id={selectionId}
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
          </label>
        ) : null}
        {/*
         * Completion. The SAME control the whole product uses, at the row's
         * leading edge, with a real accessible name that says which task it
         * finishes — never a bare "complete" repeated down a list.
         *
         * A READ-ONLY row draws none. The Deleted view is a recovery surface:
         * a soft-deleted task is invisible to every ordinary mutation, so a
         * completion control there is one that can only ever fail. A disabled
         * checkbox would still be announced, and would still say the task can
         * be finished. Restore it first.
         */}
        {readOnly || selection ? null : (
          <label className="dh-check-circle-target dh-taskrow__complete">
            <input
              type="checkbox"
              className="dh-check-circle"
              checked={task.completed}
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
                task.completed
                  ? `Reopen ${task.title}`
                  : `Complete ${task.title}`
              }
              onChange={(event) =>
                onCompletedChange(event.currentTarget.checked)
              }
              onClick={(event) => event.stopPropagation()}
            />
          </label>
        )}
      </span>

      <Heading className="dh-taskrow__main">
        {titleEditor ?? (
          <Link
            className="dh-taskrow__title dh-complete-strike dh-complete-recede"
            to={href}
            /*
             * "Open <title>" is the product-wide accessible name for a record's
             * open link — every collection in DalyHub uses it, and a row that
             * named itself differently would be the only place in the product
             * where the same act is announced with different words. It contains
             * the visible text, so WCAG 2.5.3 (Label in Name) is satisfied.
             */
            aria-label={`Open ${task.title}`}
            /*
             * DHDS-11 — the record open right now IS this page's current
             * location, so the link that opens it says so. `page` rather than
             * `true`: the drawer is addressed by the URL, and a screen reader
             * hearing "current page" is being told exactly the fact the visual
             * mark carries.
             */
            aria-current={current ? "page" : undefined}
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
        {/*
         * TASKS-13 — the checklist figure, as a compact "2 of 4".
         *
         * On the TITLE's own line, so it costs the row no grid track and no
         * height: a row with a checklist is exactly as tall as one without
         * (measured). It is a value rather than a signal, so it is READ rather
         * than hidden — and it is the same two numbers the record shows, which is
         * what stops a second wording appearing for one fact.
         *
         * The checklist's ITEMS are never drawn here. The Task is the unit of
         * planning and completion, and a row that unfolded into five sub-rows
         * would make the collection a tree.
         */}
        {checklist !== null ? (
          <span
            className="dh-taskrow__checklist"
            data-testid="task-row-checklist"
          >
            {checklist}
          </span>
        ) : null}
        {blocked !== null ? (
          <span className="dh-taskrow__blocked" data-testid="task-row-blocked">
            {blocked}
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
        <span
          className="dh-taskrow__cell dh-taskrow__cell--due"
          ref={dateCellRef}
        >
          {task.dueDate === null && task.scheduledDate !== null ? (
            <InlineTaskDate
              taskId={task.id}
              title={task.title}
              kind="scheduled"
              value={task.scheduledDate}
              todayIso={todayIso}
              stillOwed={task.stillOwed}
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
              stillOwed={task.stillOwed}
              onSaved={onInlineSave}
              disabled={disabled}
            />
          )}
        </span>
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
          triggerClassName="dh-taskrow__overflow dh-action-reveal"
          items={menuItems}
        />
      </span>
    </li>
  );
}
