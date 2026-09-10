/**
 * The shared INLINE CAPTURE row — activate, type, Enter, ready for the next one.
 *
 * DalyHub's cheapest task is the SECOND one. Every surface that holds a list of
 * tasks used to answer that differently: the Tasks workspace had `TasksQuickAdd`
 * (a real inline row), a Project record had a button that revealed a full form,
 * a board column had nothing at all, and Today's plan had a link to a drawer.
 * Four costs for one act. This is the ONE row all of them now draw, so filing a
 * burst of things is the same five titles and five Enters everywhere.
 *
 * It changes no authority. It posts to the canonical `/tasks/new` resource route
 * exactly as the capture Drawer does (ADR-043 §13), so a task created from a
 * board column is created atomically, under a server-verified parent, with the
 * same Activity trail. There is no list-only create path and no second parser:
 * the same deterministic `parseQuickCapture` vocabulary applies wherever the row
 * is drawn.
 *
 * ── What a caller decides, and what it must not ──────────────────────────────
 * A caller says WHERE a task lands (`destination`) and what the surface is
 * already carrying (`defaults` — the priority, sector or date implied by the
 * column or view the row sits in). It does not restyle the row: the presentation
 * is one stylesheet block (`tasks.css` → the capture row), so a row in a board
 * column and a row above a flat list are the same object at different widths.
 *
 * Failure behaviour is the DS-06 contract, unchanged from `TasksQuickAdd`, which
 * this replaces: entered text is NEVER discarded on a recoverable failure, the
 * error is shown inline AND announced, and the field keeps focus so a retry is
 * one keystroke away.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRevalidator } from "react-router";

import {
  applyRecurrenceFields,
  applyCaptureTags,
  parseQuickCapture,
} from "~/shared/task-record/quick-capture";
import { useTagVocabulary } from "~/shared/tags";
import { useCompactViewport } from "~/shared/viewport";

/**
 * Where a captured task lands. Structurally the intersection of the two
 * `TaskParentOption` shapes in the codebase, so either can be passed without a
 * mapping step.
 */
export interface InlineCaptureDestination {
  readonly id: string;
  readonly kind: "area" | "project";
  readonly title: string;
}

/**
 * Classification the SURFACE is already carrying — the priority a board column
 * stands for, the sector a planning column names, the day a plan row sits under.
 * Never persisted as a preference: it follows what is on screen, so a task added
 * while looking at "This week / P1" lands there instead of in a generic inbox the
 * owner then has to re-file.
 */
export interface InlineCaptureDefaults {
  readonly priority?: string;
  readonly timeSector?: string;
  readonly scheduledDate?: string;
}

/** The discriminated shape `/tasks/new` answers with. */
type CreateResult =
  | { readonly ok: true; readonly taskId?: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Record<string, string>;
    };

export interface InlineCaptureRowProps {
  /** The resolved destination, or null for Inbox / Unassigned. */
  readonly destination: InlineCaptureDestination | null;
  readonly defaults?: InlineCaptureDefaults;
  readonly todayIso: string;
  /**
   * Opens the full capture Drawer for anything this row deliberately cannot do.
   * Omitted where the surface has no drawer to open (a board column), in which
   * case the "More options" control is not rendered rather than rendered dead.
   */
  readonly onOpenFullForm?: () => void;
  /**
   * What the placeholder calls the destination. Defaults to the destination's
   * own title, or "Inbox". A board column passes its bucket label so the row
   * says where the task will appear rather than where it is filed.
   */
  readonly destinationLabel?: string;
  /** Extra classes for the host surface (a board column's own inset). */
  readonly className?: string;
  /** The form's accessible name. Distinct per surface so a screen reader can
   *  tell four capture rows on one screen apart. */
  readonly label?: string;
  readonly inputTestId?: string;
  /** Called after a successful create, in addition to the revalidation. */
  readonly onCreated?: (title: string) => void;
  /**
   * The SURFACE's own announcer, where it already has one.
   *
   * A screen shows one polite live region, not one per control: two
   * `role="status"` elements on a surface is how "Added X" and "3 tasks
   * completed" end up racing each other, and it is what AGENTS.md §15 means by
   * a duplicate announcement. Where the host already announces its own outcomes
   * (a Project record's Tasks tab, `/tasks`), it passes its announcer here and
   * this row draws no live region of its own. Where it does not, the row keeps
   * the one below, because capture must still be announced.
   */
  readonly announce?: (message: string) => void;
}

export function InlineCaptureRow({
  destination,
  defaults,
  todayIso,
  onOpenFullForm,
  destinationLabel,
  className,
  label = "Add a task",
  inputTestId,
  onCreated,
  announce,
}: InlineCaptureRowProps) {
  const revalidator = useRevalidator();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refocus, setRefocus] = useState(false);
  const fieldId = useId();
  const errorId = useId();
  const compact = useCompactViewport();
  // V2.6 FIND-04 — the ONE workspace tag vocabulary, so `#ERRAND` resolves to
  // the tag the owner already has rather than proposing a second spelling.
  const vocabulary = useTagVocabulary();

  const submit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = title.trim();
      if (trimmed.length === 0 || busy) return;

      setBusy(true);
      setError(null);
      const body = new FormData();
      /*
       * `unknownTags: "ignore"` — this row has NO token preview.
       *
       * The recorded FIND-04 decision is that a tag the workspace does not hold
       * is OFFERED before it is created, and an offer needs somewhere to appear.
       * This row is one input and a button: there is nothing here to show the
       * owner a new word in, and an unreferenced vocabulary entry is kept
       * deliberately, so a typo created here would be permanent and invisible.
       * A tag the workspace ALREADY has still resolves — that is not creating
       * vocabulary — and anything else stays the words they typed.
       */
      const interpretation = parseQuickCapture(trimmed, {
        todayIso,
        knownTags: vocabulary,
        unknownTags: "ignore",
      });
      body.set("intent", "create");
      body.set("title", interpretation.title);
      if (destination) {
        body.set("parentId", destination.id);
        body.set("parentKind", destination.kind);
      }
      const priority = interpretation.priority ?? defaults?.priority;
      const timeSector = interpretation.timeSector ?? defaults?.timeSector;
      const scheduledDate =
        interpretation.scheduledDate ?? defaults?.scheduledDate;
      if (priority) body.set("priority", priority);
      if (timeSector) {
        body.set("timeSector", timeSector);
      }
      if (scheduledDate) {
        body.set("scheduledDate", scheduledDate);
      }
      if (interpretation.dueDate) {
        body.set("dueDate", interpretation.dueDate);
      }
      if (interpretation.commitmentState !== "active") {
        body.set("commitmentState", interpretation.commitmentState);
      }
      // A recognised `every …` phrase is APPLIED here too, through the same shared
      // mapping every capture surface uses. The owner's day is passed so an
      // after-completion rule this row could not otherwise anchor gets its first
      // occurrence — after the session's own scheduled date has been considered.
      applyRecurrenceFields(
        body,
        interpretation.recurrence,
        { scheduledDate, dueDate: interpretation.dueDate },
        todayIso,
      );
      applyCaptureTags(body, interpretation.tags);

      let result: CreateResult;
      try {
        const response = await fetch("/tasks/new", { method: "POST", body });
        result = (await response.json()) as CreateResult;
      } catch {
        setBusy(false);
        // The text is deliberately left in the field: a network blip must never
        // cost the user what they typed.
        setError("That task couldn’t be added. Your text is safe — try again.");
        return;
      }

      setBusy(false);
      if (result.ok) {
        setTitle("");
        const said = `Added “${trimmed}”.`;
        if (announce) announce(said);
        else setStatus(said);
        revalidator.revalidate();
        onCreated?.(trimmed);
        // Refocus is requested, not performed here: the field is still DISABLED in
        // the DOM until React commits `busy: false`, and focusing a disabled input
        // silently does nothing. The effect below runs after that commit.
        setRefocus(true);
        return;
      }
      setError(
        result.formError ??
          Object.values(result.fieldErrors ?? {})[0] ??
          "That task couldn’t be added. Your text is safe — try again.",
      );
    },
    [
      title,
      destination,
      busy,
      defaults,
      todayIso,
      revalidator,
      vocabulary,
      onCreated,
      announce,
    ],
  );

  // Return focus to the field once it is interactive again, so the next task is one
  // keystroke away. The field keeps focus after a FAILURE too, so a correction is
  // immediate and the user never has to find the input again.
  useEffect(() => {
    if (refocus && !busy) {
      inputRef.current?.focus();
      setRefocus(false);
    }
  }, [refocus, busy]);

  useEffect(() => {
    if (error) inputRef.current?.focus();
  }, [error]);

  /*
   * MOBILE-01 (iPhone daily driver) — the phone placeholder drops the hint.
   *
   * The full placeholder names the destination AND teaches the keystroke. On a
   * phone there is no Enter key to teach and no room to teach it: measured at
   * 390px the field cut "Add a task to Inbox — press Enter" mid-word to
   * "…Inbox — press", which is the fastest path in the product introducing
   * itself with a broken sentence, and at 320px with a real Project name it lost
   * the destination as well. The phone keeps the half that carries meaning —
   * WHERE the task will land — and the visible "Add" button beside it is what
   * says how to commit. The accessible name (the visually-hidden label, "Task
   * title") is unchanged at every width.
   */
  const where = destinationLabel ?? destination?.title ?? "Inbox";
  const placeholder = compact
    ? `Add a task to ${where}`
    : `Add a task to ${where} — press Enter`;

  return (
    <form
      className={
        className ? `dh-tasks-quickadd ${className}` : "dh-tasks-quickadd"
      }
      onSubmit={submit}
      aria-label={label}
    >
      <label className="dh-visually-hidden" htmlFor={fieldId}>
        Task title
      </label>
      <input
        id={fieldId}
        ref={inputRef}
        className="dh-input dh-tasks-quickadd__input"
        type="text"
        value={title}
        maxLength={512}
        disabled={busy}
        placeholder={placeholder}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          setTitle(event.target.value);
          if (error) setError(null);
        }}
        data-testid={inputTestId}
      />
      <button
        type="submit"
        className="dh-btn dh-btn--secondary dh-tasks-quickadd__submit"
        disabled={busy || title.trim().length === 0}
      >
        {busy ? "Adding…" : "Add"}
      </button>
      {onOpenFullForm ? (
        <button
          type="button"
          className="dh-btn dh-btn--ghost dh-tasks-quickadd__more"
          onClick={onOpenFullForm}
        >
          More options
        </button>
      ) : null}

      {error ? (
        <p id={errorId} className="dh-tasks-quickadd__error" role="alert">
          {error}
        </p>
      ) : null}
      {/* Success is announced politely so repeated capture never interrupts
          typing — and only where the SURFACE has no announcer of its own. */}
      {announce ? null : (
        <p className="dh-visually-hidden" role="status" aria-live="polite">
          {status ?? ""}
        </p>
      )}
    </form>
  );
}
