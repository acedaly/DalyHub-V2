/**
 * TASKS-13 — the Task record's Checklist.
 *
 * The steps inside one Task, drawn as the lightest thing DalyHub has: a check
 * control, a title, and an overflow. No card per item, no chip, no priority, no
 * date, no assignee — a checklist is deliberately simpler than a Task, and the
 * anatomy is the argument.
 *
 * ── Where it sits, and why ───────────────────────────────────────────────────
 * In the shared `RecordLayout`'s FEATURE region: under the header, above the
 * summary band. The layout describes that slot as "this region IS the record's
 * subject", and for a Task that has steps, the steps are what the owner opened
 * the record to work through. Putting it below the planning controls would have
 * meant scrolling past the parent, the waiting state, the two dates and the
 * repeat rule to reach the thing being executed.
 *
 * ── The interaction ──────────────────────────────────────────────────────────
 * Modelled on Things and Todoist rather than on a form:
 *
 *   - one "Add item" affordance, which opens an inline input in place;
 *   - Enter saves and immediately opens the NEXT blank input, so a list is typed
 *     in one flow rather than one round trip per step;
 *   - Escape closes a blank input (and only a blank one: Escape must never be
 *     able to discard typed words);
 *   - a title is renamed through the shared DS-16 inline field — the same
 *     click / Enter / Escape / blur behaviour every other editable value in
 *     DalyHub has;
 *   - reorder is TWO ORDINARY COMMANDS in the item's menu, not a drag. There is
 *     no drag-and-drop dependency in this repository and TASKS-13 does not add
 *     one for five rows; more importantly, "Move up" works identically with a
 *     mouse, a keyboard and a thumb, which no drag gesture does.
 *
 * ── What it never does ───────────────────────────────────────────────────────
 * It never completes the parent Task. Ticking the last item leaves the Task
 * open, and says so in words ("All steps done"), because the checklist describes
 * the steps and the Task is the commitment.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  CHECKLIST_TITLE_MAX_LENGTH,
  checklistProgressLabel,
  MAX_CHECKLIST_ITEMS,
} from "~/kernel/tasks";
import { useFeedback } from "~/shared/feedback";
import { InlineTextField } from "~/shared/inline-edit";
import { Button, Menu } from "~/shared/ui";

import type { SerializedChecklistItem } from "./task-view";
import type { ChecklistOutcome, TaskChecklistApi } from "./use-task-checklist";

export interface TaskChecklistSectionProps {
  readonly checklist: TaskChecklistApi;
  /** A completed or otherwise read-only Task shows its checklist, never edits it. */
  readonly readOnly?: boolean;
}

export function TaskChecklistSection({
  checklist,
  readOnly = false,
}: TaskChecklistSectionProps) {
  const { items, progress } = checklist;
  const { notifyError } = useFeedback();
  /*
   * A generated id, not a literal.
   *
   * The drawer STACKS: opening a Task from a Task leaves two records mounted, and
   * two elements sharing one id would make the list's `aria-labelledby` point at
   * whichever the browser found first. `useId` is the React-provided answer and
   * costs nothing.
   */
  const headingId = `task-checklist-heading-${useId()}`;
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  /*
   * What a screen reader is TOLD about a change it cannot see.
   *
   * Adding, deleting and moving all change the list silently: the DOM updates,
   * focus may not move, and nothing speaks. Ticking is deliberately absent from
   * this — the checkbox announces its own state, and saying "done" beside it
   * would make every tick speak twice.
   */
  const [announcement, setAnnouncement] = useState("");
  const composerRef = useRef<HTMLInputElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  /*
   * Focus after a DESTRUCTIVE change.
   *
   * Deleting the row that holds focus would otherwise drop focus to the document
   * body, which strands a keyboard user at the top of the page. The id recorded
   * here is the element focus should land on once React has drawn the new list —
   * the item that took the deleted one's place, or the Add control when the list
   * is now empty.
   */
  const restoreFocus = useRef<string | null>(null);
  /** True while a close is waiting for the Add control to exist again. */
  const returnFocus = useRef(false);
  /** True while the composer is deliberately open and should hold focus. */
  const keepFocus = useRef(false);

  useEffect(() => {
    const target = restoreFocus.current;
    if (target === null) return;
    restoreFocus.current = null;
    if (target === "add") {
      addButtonRef.current?.focus();
      return;
    }
    document
      .querySelector<HTMLElement>(`[data-checklist-focus="${target}"]`)
      ?.focus();
  }, [items]);

  const report = useCallback(
    (outcome: ChecklistOutcome) => {
      if (!outcome.ok && outcome.message) notifyError(outcome.message);
      return outcome;
    },
    [notifyError],
  );

  /**
   * Speak one sentence into the live region.
   *
   * The text is re-set even when it repeats, with a zero-width space appended on
   * the repeat, because an unchanged `aria-live` node is not re-announced — and
   * "Move up" pressed twice on the same step is exactly the case that would
   * otherwise fall silent the second time.
   */
  const announce = useCallback((message: string) => {
    setAnnouncement((current) =>
      current === message ? `${message}\u200b` : message,
    );
  }, []);

  const openComposer = useCallback(() => {
    setDraft("");
    keepFocus.current = true;
    setComposing(true);
  }, []);

  /*
   * Hold focus in the composer for as long as it is deliberately open.
   *
   * It runs after EVERY render rather than on a dependency, and that is the
   * point: saving a step re-renders the record (the surface behind the drawer
   * revalidates, because a tick changes the "2 of 4" on the row underneath) and
   * a re-render can take focus out of an input that is still the one the owner
   * is typing into. Re-asserting it only when it has actually been lost makes
   * "Enter, type, Enter, type" survive the round trip.
   *
   * `keepFocus` is cleared the moment the owner blurs deliberately, so this can
   * never fight a click on something else.
   */
  useEffect(() => {
    if (!composing || !keepFocus.current) return;
    if (document.activeElement !== composerRef.current) {
      composerRef.current?.focus();
    }
  });

  /*
   * Close the composer and RETURN FOCUS to the control that opened it.
   *
   * The focus move is deferred to an effect rather than called here, because the
   * Add button does not exist yet at this point — it renders in place of the
   * input on the next pass, and focusing a control that is not mounted drops
   * focus to the document body.
   */
  const closeComposer = useCallback(() => {
    keepFocus.current = false;
    returnFocus.current = true;
    setComposing(false);
    setDraft("");
  }, []);

  useEffect(() => {
    if (composing || !returnFocus.current) return;
    returnFocus.current = false;
    addButtonRef.current?.focus();
  }, [composing]);

  /**
   * Commit the draft.
   *
   * `keepGoing` is what makes Enter feel like a list rather than a form: the
   * input is cleared and stays open, so the next step is typed straight away.
   * The input is NOT cleared until the server accepts, so a refused title is
   * still there to fix.
   */
  const commitDraft = useCallback(
    async (keepGoing: boolean) => {
      const title = draft.trim();
      if (title.length === 0) {
        if (!keepGoing) closeComposer();
        return;
      }
      setSaving(true);
      const outcome = report(await checklist.addItem(title));
      setSaving(false);
      if (!outcome.ok) return;
      announce(`${title} added.`);
      setDraft("");
      if (keepGoing) {
        composerRef.current?.focus();
      } else {
        closeComposer();
      }
    },
    [announce, checklist, closeComposer, draft, report],
  );

  const full = items.length >= MAX_CHECKLIST_ITEMS;
  const label = checklistProgressLabel(progress);
  const allDone = progress.total > 0 && progress.completed === progress.total;

  return (
    <div className="dh-checklist" data-testid="task-checklist">
      <div className="dh-checklist__head">
        <h4 className="dh-checklist__title" id={headingId}>
          Checklist
        </h4>
        {/*
         * Progress as two NUMBERS, in words, never a ring and never a
         * percentage. "3 of 5" is the truth; "60% productive" is a score, and
         * DalyHub does not keep score (AGENTS.md §2).
         */}
        {label ? (
          <p
            className="dh-checklist__progress"
            data-testid="checklist-progress"
          >
            {label} complete
            {allDone ? (
              // Stated, because the owner will wonder. Completing every step is
              // not completing the Task, and saying so here is cheaper than
              // letting them discover it by the Task not moving.
              <span className="dh-checklist__all-done">
                {" "}
                — the task is still open until you complete it
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      {items.length > 0 ? (
        <ul className="dh-checklist__items" aria-labelledby={headingId}>
          {items.map((item, index) => (
            <ChecklistRow
              key={item.id}
              item={item}
              index={index}
              count={items.length}
              readOnly={readOnly}
              checklist={checklist}
              report={report}
              announce={announce}
              onBeforeDelete={() => {
                // The row that will occupy this position afterwards, or the Add
                // control when this was the last one.
                restoreFocus.current =
                  items.length === 1
                    ? "add"
                    : (items[index + 1]?.id ?? items[index - 1]?.id ?? "add");
              }}
            />
          ))}
        </ul>
      ) : null}

      {readOnly ? null : composing ? (
        <div className="dh-checklist__composer">
          {/*
           * The input takes focus the moment it appears, and that is the point
           * of it: it exists ONLY because the owner has just activated "Add
           * item", so focus moving there is the completion of the act they
           * started rather than a page grabbing the caret on load. The lint rule
           * guards against the latter, which is why this one is exempted here
           * and nowhere else — it is done through a ref in an effect rather than
           * with `autoFocus`, so the focus happens on MOUNT of a
           * deliberately-opened control.
           */}
          <input
            ref={composerRef}
            className="dh-checklist__input"
            type="text"
            value={draft}
            maxLength={CHECKLIST_TITLE_MAX_LENGTH}
            disabled={saving}
            aria-label="New checklist item"
            placeholder="Add a step"
            data-testid="checklist-composer"
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                // ⌘/Ctrl+Enter finishes: the same "commit and leave" the rest of
                // the product binds it to, so it is not a new shortcut to learn.
                void commitDraft(!(event.metaKey || event.ctrlKey));
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                // Only a BLANK input is discarded by Escape. Typed words are
                // never thrown away by a stray keystroke (DS-16's own rule).
                if (draft.trim().length === 0) closeComposer();
              }
            }}
            onBlur={() => {
              // Blur saves, like every other inline field in DalyHub. A blank
              // input simply closes. Either way the composer stops holding
              // focus, so leaving it is never fought.
              keepFocus.current = false;
              if (draft.trim().length === 0) {
                setComposing(false);
                setDraft("");
                return;
              }
              void commitDraft(false);
            }}
          />
        </div>
      ) : (
        /*
         * The empty state is a BUTTON, not a card.
         *
         * A Task with no checklist is the ordinary case, and a bordered
         * empty-state panel with an illustration and a sentence would put a
         * container the size of the summary above every Task that has no steps.
         */
        <Button
          ref={addButtonRef}
          type="button"
          variant="subtle"
          size="sm"
          className="dh-checklist__add"
          disabled={full}
          onClick={openComposer}
          data-testid="checklist-add"
        >
          {items.length === 0 ? "Add checklist" : "Add item"}
        </Button>
      )}
      {full ? (
        <p className="dh-checklist__limit">
          A checklist holds at most {MAX_CHECKLIST_ITEMS} items.
        </p>
      ) : null}

      <p className="dh-visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

interface ChecklistRowProps {
  readonly item: SerializedChecklistItem;
  readonly index: number;
  readonly count: number;
  readonly readOnly: boolean;
  readonly checklist: TaskChecklistApi;
  readonly report: (outcome: ChecklistOutcome) => ChecklistOutcome;
  readonly announce: (message: string) => void;
  readonly onBeforeDelete: () => void;
}

function ChecklistRow({
  item,
  index,
  count,
  readOnly,
  checklist,
  report,
  announce,
  onBeforeDelete,
}: ChecklistRowProps) {
  return (
    <li className="dh-checklist__item" data-testid="checklist-item">
      {/*
       * The SHARED completion control (`.dh-check-circle`), inside the SHARED
       * 44px target. The same mark the Task row and the Habit row use, so
       * "finish this" looks like one act everywhere in the product — and a
       * checklist tick is never mistaken for a selection checkbox, which is a
       * different shape at a different size.
       */}
      <label className="dh-check-circle-target dh-checklist__check">
        <input
          type="checkbox"
          className="dh-check-circle"
          checked={item.completed}
          disabled={readOnly}
          data-testid="checklist-toggle"
          data-checklist-focus={item.id}
          // Named with the step, so a screen-reader user hearing five of these
          // knows which one they are on. The state is the checkbox's own.
          aria-label={item.title}
          onChange={(event) => {
            void checklist
              .setItemCompleted(item.id, event.currentTarget.checked)
              .then(report);
          }}
        />
      </label>

      <span
        className="dh-checklist__label"
        // Completion is NEVER conveyed by the strike-through alone: the checkbox
        // carries the state, and the line is decoration on top of it.
        data-completed={item.completed ? "true" : undefined}
      >
        {readOnly ? (
          item.title
        ) : (
          <InlineTextField
            label={`Step: ${item.title}`}
            value={item.title}
            maxLength={CHECKLIST_TITLE_MAX_LENGTH}
            data-testid="checklist-title"
            onSave={async (next) => {
              const outcome = await checklist.renameItem(item.id, next);
              return outcome.ok
                ? { ok: true }
                : {
                    ok: false,
                    message: outcome.message ?? "That couldn’t be saved.",
                  };
            }}
          />
        )}
      </span>

      {readOnly ? null : (
        <Menu
          // The step is named in the trigger, so a column of these is
          // distinguishable by ear.
          label={`More actions for ${item.title}`}
          triggerClassName="dh-checklist__overflow"
          items={[
            {
              id: "up",
              label: "Move up",
              disabled: index === 0,
              onSelect: () => {
                void checklist.moveItem(item.id, -1).then((outcome) => {
                  if (report(outcome).ok) {
                    announce(
                      `${item.title} moved to position ${index} of ${count}.`,
                    );
                  }
                });
              },
            },
            {
              id: "down",
              label: "Move down",
              disabled: index === count - 1,
              onSelect: () => {
                void checklist.moveItem(item.id, 1).then((outcome) => {
                  if (report(outcome).ok) {
                    announce(
                      `${item.title} moved to position ${index + 2} of ${count}.`,
                    );
                  }
                });
              },
            },
            {
              id: "delete",
              label: "Delete item",
              tone: "danger",
              separatorBefore: true,
              onSelect: () => {
                onBeforeDelete();
                void checklist.deleteItem(item.id).then((outcome) => {
                  if (report(outcome).ok) announce(`${item.title} deleted.`);
                });
              },
            },
          ]}
        />
      )}
    </li>
  );
}
