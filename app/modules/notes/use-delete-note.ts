/**
 * NOTES-01C / PX-04 — the Note record's "Delete" action: soft-delete with Undo.
 *
 * Soft-delete/restore is fully reversible (spec §C) with no blocking
 * precondition (unlike Projects' archive, which can be blocked by unfinished
 * tasks and therefore needs an explanatory confirm dialog) — the shared DS-10
 * Feedback platform's documented preference is Undo over a confirmation
 * dialog for exactly this shape of action (`FEEDBACK_AND_INSPECTOR.md`,
 * AGENTS.md §7). The Deleted Notes collection view (`?state=deleted`) is the
 * durable, always-available second path back, for whenever the Undo toast is
 * missed, dismissed or expires.
 *
 * PX-04 moved the *behaviour* into the shared `useReversibleDelete`, so every
 * entity's reversible removal is one implementation. What stays here is the one
 * genuinely Note-specific concern: flushing the Markdown editor's latest edit
 * BEFORE deleting, since the delete's navigation unmounts the editor and would
 * otherwise abort an in-flight save — a note that is "deleted" must delete
 * exactly what the user last wrote, so Undo restores that and not an earlier
 * version.
 */

import { useCallback, type RefObject } from "react";

import { useReversibleDelete } from "~/shared/record-lifecycle";

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
  const post = useCallback(
    (intent: "delete" | "restore") => postLifecycleIntent(noteId, intent),
    [noteId],
  );
  const beforeDelete = useCallback(
    async () => (await flushContentRef.current?.()) ?? true,
    [flushContentRef],
  );

  const { remove, pending, deleted } = useReversibleDelete({
    entityType: "note",
    title,
    post,
    redirectTo: "/notes",
    beforeDelete,
    beforeDeleteError: `Couldn’t save your latest changes, so "${title}" wasn’t deleted. Fix the save error, then try again.`,
  });

  return { deleteNote: remove, pending, deleted };
}
