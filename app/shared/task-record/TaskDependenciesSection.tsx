/**
 * TASKS-12 — the Task record's Dependencies.
 *
 * Two short lists and one picker. **Blocked by** is what must happen before this
 * Task can proceed; **Blocks** is what this Task is holding up. Each row is a
 * state, a title that opens that Task, and — on the blockers only — a Remove
 * control.
 *
 * ── What it deliberately is not ──────────────────────────────────────────────
 * It is not a graph editor. There is no canvas, no arrow, no drag, no Gantt and
 * no second level: the record shows the Tasks ONE step away in each direction,
 * because that is the question the owner is asking ("what is stopping this?"),
 * and anything further is a click away on the Task the row already links to.
 *
 * ── Direction, and why only one side is editable ─────────────────────────────
 * A dependency is stored ONCE, as `blocker --blocks--> blocked`. This section
 * edits the relationship from the BLOCKED end — "this Task waits on that one" —
 * because that is the end the owner is looking at when they discover the
 * obstacle. The **Blocks** list is therefore READ-ONLY here: it is the same rows
 * seen from the other side, and each is editable on its own record. Offering
 * both would put two controls on one fact and invite the question of which one
 * won.
 *
 * ── Blocked is DERIVED ───────────────────────────────────────────────────────
 * A blocker with a completion no longer blocks, and this section shows exactly
 * that: it reads each blocker's own completion and states the consequence in
 * words. Nothing here is stored, so completing a blocker on another screen and
 * reopening it again both land correctly with no reconciliation.
 *
 * ── Interaction ──────────────────────────────────────────────────────────────
 * The shared async `SelectField` combobox over the dependency-target search
 * (the same control the waiting picker uses), a Remove button per blocker, and
 * a live region for the changes a screen reader cannot see. Keyboard, mouse and
 * thumb reach every one of them; there is no hover-only detail and no gesture.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { MAX_TASK_BLOCKERS } from "~/kernel/tasks";
import { EntityLink } from "~/shared/entity";
import { FormButton, SelectField } from "~/shared/forms";
import type { EntityLinkTargetOption } from "~/shared/forms/model";
import type { SelectOption } from "~/shared/forms/types";
import { useFeedback } from "~/shared/feedback";

import type { SerializedTaskDependency } from "./task-view";
import type { TaskDependencyApi } from "./use-task-dependencies";

const SEARCH_DEBOUNCE_MS = 250;

export interface TaskDependenciesSectionProps {
  readonly dependencies: TaskDependencyApi;
  /** The picker's candidate search, wired to the Task's own resource route. */
  readonly searchTargets: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly EntityLinkTargetOption[]>;
  /**
   * A read-only Task shows its dependencies and offers no control on them.
   *
   * This is DELETION, not completion — a completed Task keeps its dependency
   * controls, exactly as it keeps its checklist, because "finished it, then
   * realised it was waiting on the wrong thing" is an ordinary correction.
   */
  readonly readOnly?: boolean;
}

export function TaskDependenciesSection({
  dependencies,
  searchTargets,
  readOnly = false,
}: TaskDependenciesSectionProps) {
  const { blockedBy, blocks } = dependencies.dependencies;
  const { notifyError } = useFeedback();
  /*
   * A generated id, not a literal: the drawer STACKS, so opening a Task from a
   * Task leaves two of these mounted and a shared id would make one section's
   * `aria-labelledby` point at the other's heading.
   */
  const headingId = `task-dependencies-heading-${useId()}`;
  const [adding, setAdding] = useState(false);
  const [choice, setChoice] = useState("");
  const [options, setOptions] = useState<readonly SelectOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  /*
   * Focus after a change that REMOVES the element holding it.
   *
   * Two things make this an effect rather than a call. The control focus should
   * land on may not exist yet at the moment the mutation resolves — React has
   * not re-rendered — and while the request is in flight the shared button is
   * `disabled`, which silently ignores `.focus()`. Both were true of the first
   * attempt, and the outcome was a keyboard user dropped to the document body
   * after removing a blocker; the E2E keyboard journey caught it.
   *
   * So a mutation RECORDS the intent and the effect below performs it once the
   * list it is keyed on has actually been drawn — the same shape
   * `TaskChecklistSection` uses for the same reason.
   *
   * Focus is taken through the CONTAINER rather than through a ref on the
   * button, because the shared `FormButton` deliberately exposes no ref: a
   * generic primitive that handed out its DOM node would be one callers could
   * reach around. The container holds exactly one button, so the query is
   * unambiguous.
   */
  const addSlotRef = useRef<HTMLDivElement | null>(null);
  const wantsAddFocus = useRef(false);
  const focusAdd = useCallback(() => {
    wantsAddFocus.current = true;
  }, []);
  const searchSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // Keyed on the two things that decide whether the Add control is on screen and
  // enabled: the list it sits under, and whether a mutation is still in flight.
  useEffect(() => {
    if (!wantsAddFocus.current) return;
    const button = addSlotRef.current?.querySelector("button");
    if (!button || button.disabled) return;
    wantsAddFocus.current = false;
    button.focus();
  }, [blockedBy, adding, dependencies.busy]);

  const runSearch = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const seq = ++searchSeq.current;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setSearching(true);
        void searchTargets(query, controller.signal)
          .then((results) => {
            if (seq !== searchSeq.current) return;
            setOptions(
              results.map((result) => ({
                value: result.id,
                label: result.title,
              })),
            );
            setSearching(false);
          })
          .catch(() => {
            if (seq !== searchSeq.current) return;
            setSearching(false);
          });
      }, SEARCH_DEBOUNCE_MS);
    },
    [searchTargets],
  );

  const closeComposer = useCallback(() => {
    setAdding(false);
    setChoice("");
    setOptions([]);
    setError(null);
    // Focus returns to the control that opened the composer, so a keyboard user
    // is never dropped to the document body.
    focusAdd();
  }, [focusAdd]);

  const save = useCallback(async () => {
    if (choice.length === 0) {
      setError("Choose the task this one waits on.");
      return;
    }
    const chosen = options.find((option) => option.value === choice);
    const outcome = await dependencies.addBlocker(choice);
    if (!outcome.ok) {
      /*
       * The refusal is shown BESIDE the picker rather than only as a toast: a
       * cycle refusal and a bound refusal are both about the choice that is still
       * on screen, and the owner needs to read it while making another one. It is
       * also announced, because a message that appears without focus moving is a
       * message a screen reader never hears.
       */
      setError(outcome.message ?? "That couldn’t be added.");
      notifyError(outcome.message ?? "That couldn’t be added.");
      return;
    }
    setAnnouncement(`${chosen?.label ?? "That task"} now blocks this task.`);
    closeComposer();
  }, [choice, closeComposer, dependencies, notifyError, options]);

  const remove = useCallback(
    async (blocker: SerializedTaskDependency) => {
      const outcome = await dependencies.removeBlocker(blocker.taskId);
      if (!outcome.ok) {
        notifyError(outcome.message ?? "That couldn’t be removed.");
        return;
      }
      setAnnouncement(`${blocker.title} no longer blocks this task.`);
      focusAdd();
    },
    [dependencies, focusAdd, notifyError],
  );

  const full = blockedBy.length >= MAX_TASK_BLOCKERS;

  return (
    <section
      className="dh-task-dependencies"
      aria-labelledby={headingId}
      data-testid="task-dependencies"
    >
      <h4 className="dh-record-section__label" id={headingId}>
        Dependencies
      </h4>

      {/*
       * There is deliberately NO "Blocked by …" sentence at the top of this
       * section.
       *
       * The record's HEADER already says Blocked, through the one display-state
       * evaluator, and the list below already names what by. A third rendering of
       * one fact on one screen is what the "one blocked label" rule exists to
       * prevent (`TASKS_12_ADVANCED_RECURRENCE_DEPENDENCIES_2026_08.md` §3.2) —
       * it WAS drafted, drawn on the 1440 capture and cut on that evidence. The
       * ROW is the surface that needs the sentence, because a row has no header
       * to carry the state.
       */}
      <div className="dh-task-dependencies__group">
        <h5 className="dh-task-dependencies__label">Blocked by</h5>
        {blockedBy.length === 0 ? (
          <p className="dh-record-muted">Nothing is holding this task up.</p>
        ) : (
          <ul className="dh-task-dependencies__list">
            {blockedBy.map((blocker) => (
              <li
                key={blocker.taskId}
                className="dh-task-dependencies__row"
                data-complete={
                  blocker.completedAt !== null ? "true" : undefined
                }
              >
                {/*
                 * The state is a WORD, not a colour and not a glyph alone: a
                 * completed blocker reads "Done", an open one reads "Waiting",
                 * so the row survives a monochrome display, a screen reader and
                 * a colour-blind reader identically.
                 */}
                <span className="dh-task-dependencies__status">
                  {blocker.completedAt !== null ? "Done" : "Waiting"}
                </span>
                <EntityLink
                  type="task"
                  id={blocker.taskId}
                  title={blocker.title}
                  showIcon={false}
                  className="dh-task-dependencies__title"
                />
                {readOnly ? null : (
                  <FormButton
                    type="button"
                    variant="ghost"
                    disabled={dependencies.busy}
                    onClick={() => void remove(blocker)}
                  >
                    <span className="dh-visually-hidden">
                      Remove {blocker.title} as a blocker
                    </span>
                    <span aria-hidden="true">Remove</span>
                  </FormButton>
                )}
              </li>
            ))}
          </ul>
        )}

        {readOnly ? null : adding ? (
          <div className="dh-task-dependencies__composer">
            <SelectField
              label="Which task must happen first"
              placeholder="Search tasks…"
              emptyMessage="No matching tasks."
              value={choice}
              options={options}
              loading={searching}
              onSearch={runSearch}
              onChange={(value) => {
                setChoice(value);
                setError(null);
              }}
              error={error}
              required
            />
            <div className="dh-task-dependencies__actions">
              <FormButton
                type="button"
                variant="primary"
                pending={dependencies.busy}
                onClick={() => void save()}
              >
                Add blocker
              </FormButton>
              <FormButton
                type="button"
                variant="ghost"
                disabled={dependencies.busy}
                onClick={closeComposer}
              >
                Cancel
              </FormButton>
            </div>
          </div>
        ) : (
          <div className="dh-task-dependencies__add" ref={addSlotRef}>
            <FormButton
              type="button"
              variant="secondary"
              disabled={full || dependencies.busy}
              onClick={() => {
                setAdding(true);
                setError(null);
                runSearch("");
              }}
            >
              Add blocker
            </FormButton>
          </div>
        )}
        {full ? (
          <p className="dh-record-muted">
            A task waits on at most {MAX_TASK_BLOCKERS} others. Remove one, or
            make this a Project.
          </p>
        ) : null}
      </div>

      {/*
       * "Blocks" appears ONLY when this Task actually holds something up. An
       * empty second list on every Task in the workspace would be a permanent
       * reminder of a relationship most Tasks do not have.
       */}
      {blocks.length > 0 ? (
        <div className="dh-task-dependencies__group">
          <h5 className="dh-task-dependencies__label">Blocks</h5>
          <ul className="dh-task-dependencies__list">
            {blocks.map((blocked) => (
              <li key={blocked.taskId} className="dh-task-dependencies__row">
                <span className="dh-task-dependencies__status">
                  {blocked.completedAt !== null ? "Done" : "Waiting"}
                </span>
                <EntityLink
                  type="task"
                  id={blocked.taskId}
                  title={blocked.title}
                  showIcon={false}
                  className="dh-task-dependencies__title"
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Adding and removing change the list silently — the DOM updates and
          nothing speaks — so the outcome is announced. */}
      <p className="dh-visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
