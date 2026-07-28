/**
 * NOTES-03 — the Note record's Archive / Restore actions.
 *
 * Archive is the organisational half of the Note lifecycle: put a note away
 * without removing it. It is deliberately DISTINCT from the NOTES-01C
 * soft-delete:
 *
 *   | act      | canonical route | relationships | collection            |
 *   |----------|-----------------|---------------|-----------------------|
 *   | archive  | still opens     | all kept      | `?state=archived`     |
 *   | delete   | 404s            | all kept      | `?state=deleted`      |
 *
 * Both are reversible, so neither needs a typed confirmation; the shared
 * `useRecordLifecycle` supplies the confirm-and-announce friction for archive
 * (one dialog, because the record leaves the active list) and the Undo-toast
 * path for delete. This hook only owns the POST and the pending flag; the
 * server is the authority and the record loader revalidates from it.
 */

import { useCallback, useState } from "react";
import { useRevalidator } from "react-router";

import type { NoteMutationResult } from "./routes/mutate";

export function useArchiveNote(noteId: string) {
  const revalidator = useRevalidator();
  const [pending, setPending] = useState(false);

  const post = useCallback(
    async (intent: "archive" | "unarchive") => {
      setPending(true);
      try {
        const body = new FormData();
        body.set("intent", intent);
        const response = await fetch(
          `/notes/${encodeURIComponent(noteId)}/mutate`,
          { method: "POST", body },
        );
        const data = (await response.json()) as NoteMutationResult;
        if (data.kind !== intent || !data.ok) {
          // Reject so the shared confirmation dialog stays open with an inline
          // error and a retry — never a silent failure.
          throw new Error("Note archive change failed");
        }
        revalidator.revalidate();
      } finally {
        setPending(false);
      }
    },
    [noteId, revalidator],
  );

  return {
    archiveNote: useCallback(() => post("archive"), [post]),
    unarchiveNote: useCallback(() => post("unarchive"), [post]),
    pending,
  };
}
