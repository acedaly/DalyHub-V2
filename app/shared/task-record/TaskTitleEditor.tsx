/**
 * DHDS-10 — the ONE inline Task TITLE editor, and the hook that decides which
 * row is using it.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * A row's title was renameable in exactly one place in DalyHub: `/tasks`, from
 * a ~110-line editor declared privately inside `TasksWorkspace.tsx`. Today and
 * Plan draw the SAME shared `TaskRow`, over the same tasks, with the same
 * `titleEditor` slot on it — and simply passed nothing, so correcting a typo
 * from the surface an owner spends the working day on meant opening the record.
 *
 * DHDS-10's acceptance workflow (§49) is explicit that the ideal number of
 * record navigations for "correct its title" is zero, so the editor moves here,
 * beside the other shared Task controls, and the three surfaces adopt it.
 * Nothing about its behaviour changes — this is a convergence, not a rewrite.
 *
 * ── The contract (DHDS-10 §13) ──────────────────────────────────────────────
 *   - entry is DELIBERATE. The title is a LINK at rest and stays one; renaming
 *     is reached from the row's overflow (or ⌘/Ctrl-clicking is still an open),
 *     so nothing becomes editable by accident while selecting or opening;
 *   - Enter commits, Escape cancels and restores the previous value;
 *   - blur commits, EXCEPT while an error is showing — a blur that threw the
 *     owner's rejected text away would lose work;
 *   - an empty title is refused locally before anything is sent or queued, and
 *     the domain remains the authority (`rename` re-validates server-side);
 *   - a refusal KEEPS the typed text, states the server's reason and puts focus
 *     back in the field;
 *   - the busy state disables the input rather than replacing it, so the row's
 *     geometry does not move while a save is in flight (§31).
 *
 * ── It owns no mutation policy ──────────────────────────────────────────────
 * It posts the canonical `rename` intent through the shared
 * `postTaskRecordActionOffline` seam — the same one every other inline Task
 * edit uses, with the same PWA-12 offline queueing — and reports the outcome.
 * What to revalidate, and what to paint optimistically, stays with the host.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { postTaskRecordActionOffline } from "./task-inline-edit";

/** The longest title the Task routes accept. Mirrors the record drawer's field. */
const TITLE_MAX = 512;

const GENERIC_REFUSAL =
  "That title couldn’t be saved. Your text is safe — try again.";

export interface TaskTitleEditorProps {
  readonly taskId: string;
  readonly title: string;
  /** Leave edit mode. Called on commit, on cancel and on a no-op save. */
  readonly onDone: () => void;
  /** The server accepted the rename. The host decides what to re-read. */
  readonly onSaved: (taskId: string, title: string) => void;
  /**
   * PWA-12 — the rename was accepted LOCALLY because DalyHub could not be
   * reached. A host that paints it must also say it is waiting to sync; a host
   * with no offline presentation may simply treat it as saved.
   */
  readonly onQueued?: (taskId: string, title: string) => void;
  /** The route prefix, for a surface mounted somewhere other than `/tasks`. */
  readonly basePath?: string;
}

export function TaskTitleEditor({
  taskId,
  title,
  onDone,
  onSaved,
  onQueued,
  basePath = "/tasks",
}: TaskTitleEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const save = useCallback(() => {
    const trimmed = draft.trim();
    if (saving) return;
    if (trimmed.length === 0) {
      // Local validation catches a structurally invalid value EARLY, online or
      // off, so nothing pointless is queued. The domain remains authoritative:
      // this is a courtesy, never the decision.
      setError("A title is required.");
      window.requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    if (trimmed === title) {
      onDone();
      return;
    }
    setError(null);
    setSaving(true);
    const fail = (message: string) => {
      setSaving(false);
      // The user's text is never discarded on a recoverable failure.
      setError(message);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    };
    void postTaskRecordActionOffline(
      taskId,
      { intent: "rename", title: trimmed },
      { operation: "set_title", value: trimmed, baseValue: title },
      basePath,
    )
      .then((outcome) => {
        if (outcome.kind === "refused") {
          fail(outcome.message);
          return;
        }
        if (outcome.kind === "queued") {
          setSaving(false);
          onQueued?.(taskId, trimmed);
          onDone();
          return;
        }
        const result = outcome.data;
        if (result.kind === "update" && result.status === "success") {
          setSaving(false);
          onSaved(taskId, trimmed);
          onDone();
          return;
        }
        fail(
          (result.kind === "update" ? result.fieldErrors?.title : undefined) ??
            (result.kind === "update" ? result.formError : undefined) ??
            GENERIC_REFUSAL,
        );
      })
      .catch(() => fail(GENERIC_REFUSAL));
  }, [basePath, draft, onDone, onQueued, onSaved, saving, taskId, title]);

  return (
    <span className="dh-tasks-inline-title-editor">
      <input
        ref={inputRef}
        className="dh-input dh-tasks-inline-title-editor__input"
        value={draft}
        maxLength={TITLE_MAX}
        disabled={saving}
        aria-label={`Rename ${title}`}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setError(null);
            onDone();
          }
        }}
        onBlur={() => {
          // A blur with an unresolved error would throw the text away; keep editing.
          if (!error) save();
        }}
      />
      {error ? (
        <span className="dh-tasks-inline-title-editor__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Which row (if any) is being renamed, held by the SURFACE.
 *
 * Deliberately not row state: exactly one title may be in edit mode at a time,
 * and every other row must keep its ordinary open link — which is what makes
 * inline renaming free rather than something that costs the way into the
 * record. Every adopting surface holds it the same way, so this is the one
 * place that shape is written down.
 */
export interface TaskTitleEditing {
  readonly editingId: string | null;
  readonly beginRename: (taskId: string) => void;
  readonly endRename: () => void;
}
