/**
 * TASKS-03 — the in-workspace quick add row.
 *
 * The Tasks workspace is where a person files a burst of things at once, and the
 * cost that matters is the cost of the SECOND task. So the field stays where it is
 * after a successful save, clears, and refocuses — adding five tasks is five
 * titles and five Enters, with no navigation and no drawer between them.
 *
 * It changes no authority: it posts to the canonical `/tasks/new` resource route,
 * exactly as the Drawer's capture form does (ADR-043 §13), so a task created here
 * is created atomically with its planning fields, under a server-verified parent,
 * with the same Activity trail. There is no list-only create path.
 *
 * MOBILE-01's title-and-Enter capture path is untouched: this is an ADDITIONAL
 * affordance inside the workspace, not a replacement for the shared Quick Capture,
 * and it uses exactly the same "least information that can work" rule — a title,
 * plus whatever parent and classification the session is already carrying.
 *
 * Failure behaviour is the DS-06 contract: entered text is NEVER discarded on a
 * recoverable failure, the error is shown inline AND announced, and the field keeps
 * focus so a retry is one keystroke away.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRevalidator } from "react-router";

import type { TaskParentOption, TasksCreateResult } from "./tasks-contract";

export interface TasksQuickAddProps {
  /** The resolved default capture parent, or null when none is configured. */
  readonly defaultParent: TaskParentOption | null;
  /**
   * Classification carried for the SESSION from the current view, so a task added
   * while looking at "This week / P1" lands there instead of in a generic inbox the
   * user then has to re-file. Never persisted — it follows what is on screen.
   */
  readonly sessionDefaults: {
    readonly priority?: string;
    readonly timeSector?: string;
    readonly scheduledDate?: string;
  };
  /** Opens the full capture Drawer for anything this row deliberately cannot do. */
  readonly onOpenFullForm: () => void;
}

export function TasksQuickAdd({
  defaultParent,
  sessionDefaults,
  onOpenFullForm,
}: TasksQuickAddProps) {
  const revalidator = useRevalidator();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refocus, setRefocus] = useState(false);
  const fieldId = useId();
  const errorId = useId();

  // A quick add with no resolvable parent would fail on every submit, so the row
  // says so up front and points at the full form rather than letting the user type
  // a task into something that cannot accept it.
  const canQuickAdd = defaultParent !== null;

  const submit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = title.trim();
      if (trimmed.length === 0 || !defaultParent || busy) return;

      setBusy(true);
      setError(null);
      const body = new FormData();
      body.set("intent", "create");
      body.set("title", trimmed);
      body.set("parentId", defaultParent.id);
      body.set("parentKind", defaultParent.kind);
      if (sessionDefaults.priority)
        body.set("priority", sessionDefaults.priority);
      if (sessionDefaults.timeSector) {
        body.set("timeSector", sessionDefaults.timeSector);
      }
      if (sessionDefaults.scheduledDate) {
        body.set("scheduledDate", sessionDefaults.scheduledDate);
      }

      let result: TasksCreateResult;
      try {
        const response = await fetch("/tasks/new", { method: "POST", body });
        result = (await response.json()) as TasksCreateResult;
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
        setStatus(`Added “${trimmed}”.`);
        revalidator.revalidate();
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
    [title, defaultParent, busy, sessionDefaults, revalidator],
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

  return (
    <form
      className="dh-tasks-quickadd"
      onSubmit={submit}
      aria-label="Add a task"
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
        disabled={!canQuickAdd || busy}
        placeholder={
          canQuickAdd
            ? `Add a task to ${defaultParent.title} — press Enter`
            : "Choose a default capture parent to add tasks here"
        }
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          setTitle(event.target.value);
          if (error) setError(null);
        }}
        data-testid="tasks-quickadd-input"
      />
      <button
        type="submit"
        className="dh-btn dh-btn--secondary dh-tasks-quickadd__submit"
        disabled={!canQuickAdd || busy || title.trim().length === 0}
      >
        {busy ? "Adding…" : "Add"}
      </button>
      <button
        type="button"
        className="dh-btn dh-btn--ghost dh-tasks-quickadd__more"
        onClick={onOpenFullForm}
      >
        More options
      </button>

      {error ? (
        <p id={errorId} className="dh-tasks-quickadd__error" role="alert">
          {error}
        </p>
      ) : null}
      {/* Success is announced politely so repeated capture never interrupts typing. */}
      <p className="dh-visually-hidden" role="status" aria-live="polite">
        {status ?? ""}
      </p>
    </form>
  );
}
