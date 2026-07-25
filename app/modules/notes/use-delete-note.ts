/**
 * NOTES-01C — the Note record's "Delete" action: soft-delete with Undo.
 *
 * Soft-delete/restore is fully reversible (spec §C) with no blocking
 * precondition (unlike Projects' archive, which can be blocked by unfinished
 * tasks and therefore needs an explanatory confirm dialog) — the shared DS-10
 * Feedback platform's documented preference is Undo over a confirmation
 * dialog for exactly this shape of action (`FEEDBACK_AND_INSPECTOR.md`,
 * AGENTS.md §7). The click itself is the one deliberate step; the mutation
 * already happened for real (through the trusted `EntityRepository.softDelete`
 * route, same as everywhere else — no optimistic-only client state), and
 * `onUndo` simply calls the mirror `restore` intent. The Deleted Notes
 * collection view (`?state=deleted`) is the durable, always-available second
 * path back, for whenever the Undo toast is missed, dismissed or expires.
 */

import { useCallback, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";

import { useFeedback } from "~/shared/feedback";

import type { NoteMutationResult } from "./routes/mutate";

async function postLifecycleIntent(
  noteId: string,
  intent: "delete" | "restore",
): Promise<boolean> {
  const body = new FormData();
  body.set("intent", intent);
  try {
    const response = await fetch(
      `/notes/${encodeURIComponent(noteId)}/mutate`,
      { method: "POST", body },
    );
    const data = (await response.json()) as NoteMutationResult;
    return data.kind === intent && data.ok;
  } catch {
    return false;
  }
}

export function useDeleteNote(
  noteId: string,
  title: string,
  flushContentRef: RefObject<(() => Promise<boolean>) | null>,
) {
  const navigate = useNavigate();
  const feedback = useFeedback();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  // Set synchronously (via `flushSync`) the instant delete succeeds, BEFORE
  // navigating away — `NoteContentForm`'s `UnsavedChangesGuard` reads this to
  // disarm itself for THIS specific navigation. Without the synchronous flush,
  // `navigate()` would run against the previous render's still-armed guard
  // (React batches the state update) and a note the user just deliberately
  // deleted would incorrectly ask "leave with unsaved changes?".
  const [deleted, setDeleted] = useState(false);

  const deleteNote = useCallback(async () => {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setPending(true);

    // Force the editor's latest edit to be safely persisted BEFORE deleting —
    // otherwise the delete's own navigation unmounts the editor, which aborts
    // an in-flight save's fetch and discards an unsaved/failed draft outright
    // (it lives only in the editor's React state). A note that is "deleted"
    // must delete exactly what the user last wrote, so Undo restores that,
    // not an earlier version.
    const flushed = (await flushContentRef.current?.()) ?? true;
    if (!flushed) {
      pendingRef.current = false;
      setPending(false);
      feedback.notifyError(
        `Couldn't save your latest changes, so "${title}" wasn't deleted. Fix the save error, then try again.`,
      );
      return;
    }

    const ok = await postLifecycleIntent(noteId, "delete");
    pendingRef.current = false;
    setPending(false);

    if (!ok) {
      feedback.notifyError(`Couldn't delete "${title}". Please try again.`);
      return;
    }

    flushSync(() => {
      setDeleted(true);
    });
    navigate("/notes");
    feedback.notifyUndo(`"${title}" deleted`, {
      onUndo: async () => {
        const restored = await postLifecycleIntent(noteId, "restore");
        if (restored) {
          feedback.notifySuccess(`"${title}" restored`);
        } else {
          feedback.notifyError(
            `Couldn't restore "${title}". Find it in Deleted Notes and restore it from there.`,
          );
        }
      },
    });
  }, [noteId, title, navigate, feedback, flushContentRef]);

  return { deleteNote, pending, deleted };
}
