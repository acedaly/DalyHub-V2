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

import { useCallback, useRef, useState } from "react";

import type { InlineSaveOutcome } from "~/shared/inline-edit";
import { InlineDateField, InlineSelectField } from "~/shared/inline-edit";
import { AccentIcon } from "~/shared/entity";
import { Picker } from "~/shared/floating";
import type { PickerOption } from "~/shared/floating";
import { RepeatIcon } from "~/shared/icons";
import type { TaskPriority, TaskRelation } from "~/kernel/tasks";

import { useTaskParentSearch } from "./use-task-parent-search";

import { PriorityFlag, PriorityGlyph } from "./PriorityIndicator";
import { TASK_PRIORITY_OPTIONS } from "./priority-options";
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
 * DHDS-09 — the canonical priority options, with their canonical marks.
 *
 * This file used to build its own `{ value, label }` list from
 * `taskPriorityLabel`, as six other surfaces separately did. The list now comes
 * from the one module that owns it (`priority-options.ts`), and the flag is the
 * row's leading MARK rather than a `renderOption` that replaced the whole row —
 * which is what took the current-value check away from this menu and the Task
 * record's.
 */
const PRIORITY_OPTIONS = TASK_PRIORITY_OPTIONS.map(({ value, label }) => ({
  value,
  label,
  mark: <PriorityGlyph priority={value} size="md" />,
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
      /*
       * CONTROL-01 — a stored `null` renders as P4, because that is what it IS.
       *
       * It rendered as the shell's empty state, so the priority column of the
       * seeded workspace read P1 · P2 · P3 · "No priority" · (blank) — FIVE
       * states for a four-state field, with the two largest groups being the
       * same state written two ways. "No priority" was the null rows; the blanks
       * were the rows stored `p4`, hidden by `hideNormal`.
       *
       * Both go. `null` maps to `p4` here (the settled contract), and P4 draws
       * its grey flag like the other three — which is what keeps the column a
       * column and stops "normal" and "not triaged" looking like different
       * things when they are not.
       *
       * The CLEAR command goes with them: with no "no priority" state to clear
       * TO, it was a second way to say Priority 4.
       */
      value={priority ?? "p4"}
      options={PRIORITY_OPTIONS}
      onSave={save}
      readOnly={disabled}
      renderValue={(option) =>
        option ? <PriorityFlag priority={option.value as TaskPriority} /> : null
      }
      // DHDS-10 — a row is a run of values being SCANNED, so the caret and the
      // empty invitation join the row's own DHDS-08 reveal (§6, §25, §26).
      presentation="meta"
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
  stillOwed,
}: TaskRowFieldProps & {
  readonly kind: "due" | "scheduled";
  readonly value: string | null;
  /**
   * V2.4-GATE-02 — is the Task this date belongs to still a commitment?
   *
   * The field is handed the ANSWER, never the facts: DEBT-197's entry names this
   * control as the place a second definition of "overdue" would appear, and the
   * one thing it must not grow is a status list of its own. Its caller reads
   * `stillOwed` off the shared Task projection, which reads it from the kernel
   * (`isTaskStillOwed`).
   *
   * A closed Task keeps its date — "Yesterday", "20 days ago", "6 Jul 2026" is
   * historical truth and stays visible. What it loses is the URGENCY ramp: it
   * stops claiming to be late.
   */
  readonly stillOwed: boolean;
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
  /*
   * The urgency ramp is the calendar answer AND the commitment answer.
   *
   * `relativeCalendarDate` is pure arithmetic that has never seen the Task, which
   * is exactly right for the WORDS ("Yesterday") and exactly wrong for the
   * COLOUR: a date that has passed on work nobody is going to do has not slipped.
   * A Task that is no longer owed takes the ordinary metadata ramp — the same
   * class a planned date takes — rather than a state of its own.
   */
  const urgency =
    relative === null ? null : stillOwed ? relative.urgency : null;
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
        : { shortcuts: taskDateShortcuts(todayIso), todayIso })}
      presentation="meta"
      className={
        // Only a DUE date carries urgency: a planned date is the owner's own
        // intention about when to work on something, and being "late" against
        // your own plan is not a state the product judges.
        kind === "due" && urgency !== null
          ? `dh-task-date dh-task-date--${urgency}`
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
  /**
   * DEBT-144 — the candidate's own identity, so the optimistic patch below can
   * carry it. Optional: a caller that has not widened its loader passes none and
   * the row's mark is neutral until the re-read, exactly as it was before.
   */
  readonly iconKey?: string | null;
  readonly colourSlot?: string | null;
  readonly colourRank?: number | null;
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
  readonly parent: TaskRelation | null;
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
  /*
   * DHDS-10 §11 / §32 — the escape hatch opens a PICKER, not a record.
   *
   * `onSearchAll` used to be handed `() => openDrawer("task-move:<id>")`, so
   * "Search all Projects and Areas…" — a command whose whole purpose is to
   * choose one value — opened the Task's full record. That is the interaction
   * this phase exists to remove: a full editor for a two-second decision.
   *
   * It now opens the shared searchable `Picker` in place, anchored to the same
   * cell, writing through the same `save` below. The bounded MENU is unchanged
   * and is still what opens first: for the overwhelming majority of workspaces
   * it holds every Project and Area, its typeahead is faster than a round trip,
   * and a picker is only worth its request when the answer is not already on
   * screen.
   */
  const [searching, setSearching] = useState(false);
  const cellRef = useRef<HTMLSpanElement | null>(null);
  /**
   * Write the chosen parent.
   *
   * `chosen` is the candidate's own record — its kind, its title and its
   * identity — because the ROUTE needs the kind and the optimistic patch needs
   * the rest. It comes from the bounded menu's option set, or, for a choice made
   * in the searchable picker, from what the search endpoint reported for it.
   * Either way the SERVER re-verifies the destination inside the workspace;
   * this is a convenience for painting, never the authority.
   */
  const commit = useCallback(
    async (
      next: string,
      chosen: TaskParentOption | undefined,
    ): Promise<InlineSaveOutcome> => {
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
              // DEBT-144 — the optimistic parent keeps its identity, so the
              // mark does not flash neutral between the choice and the re-read.
              iconKey: chosen.iconKey ?? null,
              colourSlot: chosen.colourSlot ?? null,
              colourRank: chosen.colourRank ?? null,
            },
          },
        });
      }
      return outcome;
    },
    [onSaved, taskId, title],
  );

  /** The bounded menu's save: the candidate is one of the loader's options. */
  const save = useCallback(
    (next: string): Promise<InlineSaveOutcome> =>
      commit(
        next,
        options.find((option) => option.id === next),
      ),
    [commit, options],
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
     * reading it.
     *
     * ── TODAY-TASK-01 / DEBT-144 — the mark is now the parent's OWN identity ──
     * It was the shared `EntityIcon` badge, which is the ENTITY TYPE's colour: a
     * Project and an Area were visibly different, and every Project was visibly
     * identical. IDENTITY-01's whole premise is the opposite — a record has one
     * appearance, and it is the same appearance on every surface — so the same
     * Project was a violet tile on `/projects` and a generic blue badge on the
     * row that names it.
     *
     * `TaskRelation` now carries the parent's stored slot, its stored glyph and
     * its derived rank, resolved by the same joined read that resolves the title
     * (no extra query, no N+1), so the row draws the shared `AccentIcon` through
     * the ONE `resolveIdentity` every identity surface uses. A read that did not
     * resolve identity (the record overview's relation trio) leaves all three
     * undefined and the tile falls back to the entity's default glyph on the
     * neutral container — which is what the badge was, so nothing regresses.
     *
     * It is `aria-hidden` by construction (both marks are decorative) and it is
     * outside the control, so the editor's accessible name, its keyboard
     * behaviour and its test id are untouched. An unassigned task gets no mark
     * — "Unassigned" is an absence, and an absence does not have an identity.
     */
    <span className="dh-task-parent" ref={cellRef}>
      {parent ? (
        <AccentIcon
          entityType={parent.kind}
          colourSlot={parent.colourSlot ?? null}
          iconKey={parent.iconKey ?? null}
          colourRank={parent.colourRank ?? null}
          size="sm"
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
        {...(disabled
          ? {}
          : {
              escapeAction: {
                label: "Search all Projects and Areas…",
                onSelect: onSearchAll ?? (() => setSearching(true)),
              },
            })}
        presentation="meta"
        data-testid="task-row-parent"
      />
      {searching ? (
        <TaskParentSearchPicker
          anchorRef={cellRef}
          value={parent?.id ?? ""}
          /*
           * The picker stays open until the SERVER answers and closes only on a
           * yes. Closing on the click would leave a refused move with nowhere
           * to report itself — the surface would shut and the row would quietly
           * keep its old Project, which is exactly the "an inline interaction
           * must not become a way to hide errors" failure §30 rules out.
           */
          onChoose={async (chosen) => {
            const outcome = await commit(chosen?.id ?? "", chosen ?? undefined);
            if (outcome.ok) {
              setSearching(false);
              return null;
            }
            return outcome.message;
          }}
          onClose={() => setSearching(false)}
        />
      ) : null}
    </span>
  );
}

/**
 * The searchable picker over EVERY valid Task parent in the workspace.
 *
 * Mounted only while it is open, which is the whole performance contract
 * (DHDS-10 §43): `useTaskParentSearch` seeds itself with one unfiltered page on
 * mount, so a list of fifty rows costs exactly zero requests until an owner
 * asks for one, and then exactly one. The endpoint is the same bounded,
 * workspace-scoped `/tasks/parent-options?q=` the create form and the record
 * drawer already use — there is no second search path.
 *
 * It writes through the caller's `save`, which is the canonical
 * `intent=set_parent`. Choosing here and choosing from the bounded menu are the
 * same mutation.
 */
function TaskParentSearchPicker({
  anchorRef,
  value,
  onChoose,
  onClose,
}: {
  readonly anchorRef: React.RefObject<HTMLElement | null>;
  readonly value: string;
  /**
   * Commit the chosen candidate (`null` for the Inbox), and answer with the
   * server's refusal message, or `null` when it was accepted.
   */
  readonly onChoose: (
    chosen: TaskParentOption | null,
  ) => Promise<string | null>;
  readonly onClose: () => void;
}) {
  const search = useTaskParentSearch();
  /*
   * A refusal from a choice made HERE.
   *
   * The bounded menu's refusals belong to `InlineSelectField`, which shows them
   * beside the value it kept. This surface is the field's escape hatch and has
   * no shell of its own, so it keeps its own message and renders it in the row
   * — because the one thing an inline interaction may never do is close on a
   * change the server refused (§30).
   */
  const [error, setError] = useState<string | null>(null);
  const options: readonly PickerOption[] = search
    .withSelected(value)
    .map((option) => ({
      id: option.value,
      label: option.label,
      ...(option.description ? { support: option.description } : {}),
    }));
  /*
   * The endpoint reports each candidate's KIND, which the `set_parent` intent
   * needs. `kindOf` is the hook's memory of it, and a candidate whose kind the
   * hook does not know is not offered as a save — the field refuses rather than
   * guessing, and the row keeps the value it had.
   */
  const resolve = (id: string): TaskParentOption | null => {
    const kind = search.kindOf(id);
    if (kind === null) return null;
    const option = search.withSelected(value).find((o) => o.value === id);
    return { id, kind, title: option?.label ?? id };
  };
  return (
    <>
      {error !== null ? (
        <p className="dh-inline-edit__error" role="alert">
          {error}
        </p>
      ) : null}
      <Picker
        anchorRef={anchorRef}
        label="Project or Area"
        options={options}
        value={value.length === 0 ? null : value}
        onSelect={(id) => {
          setError(null);
          void onChoose(resolve(id)).then(setError);
        }}
        // The SAVE closes it, not the click — see the note at the call site.
        keepOpenOnSelect
        onSearch={search.search}
        loading={search.loading}
        onClose={onClose}
        // "No project" is a real DESTINATION rather than an absence, so the
        // command is worded as the place the task goes — the same wording Quick
        // Capture's parent control uses.
        {...(value.length === 0
          ? {}
          : {
              clear: {
                label: "Move to Inbox",
                onSelect: () => {
                  setError(null);
                  void onChoose(null).then(setError);
                },
              },
            })}
        data-testid="task-row-parent-picker"
      />
    </>
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
