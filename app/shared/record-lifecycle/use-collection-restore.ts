/**
 * PX-04 — restoring from a "Deleted" collection view, shared.
 *
 * The durable second path back, for whenever the Undo toast is missed, dismissed
 * or expires. It is deliberately NOT a confirmation flow: the Deleted collection
 * IS the explicit restore surface, so one click is enough for an action the user
 * came here specifically to take.
 *
 * The hook owns only the in-flight bookkeeping every such view needs — which rows
 * are settling, which are already confirmed restored (so a row can leave the list
 * immediately, without waiting for a full reload) — plus the success/error
 * feedback. Notes wrote this once; Goals and every future Deleted view reuse it
 * rather than copying it.
 */

import { useCallback, useState } from "react";

import { useFeedback } from "~/shared/feedback";

export interface CollectionRestoreOptions {
  /**
   * POST the `restore` intent to the module's trusted mutation route and report
   * whether it succeeded. The caller owns the endpoint and the result shape.
   */
  readonly post: (id: string) => Promise<boolean>;
}

export interface CollectionRestore {
  /** Restore one record; `title` is used verbatim in the feedback message. */
  readonly restore: (id: string, title: string) => void;
  /** Ids whose restore is currently in flight (render the row as pending). */
  readonly pendingIds: ReadonlySet<string>;
  /** Ids confirmed restored (drop the row from the Deleted view immediately). */
  readonly restoredIds: ReadonlySet<string>;
}

export function useCollectionRestore({
  post,
}: CollectionRestoreOptions): CollectionRestore {
  const feedback = useFeedback();
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [restoredIds, setRestoredIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const restore = useCallback(
    (id: string, title: string) => {
      setPendingIds((prev) => new Set(prev).add(id));
      const settle = () =>
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });

      void post(id)
        .then((ok) => {
          settle();
          if (ok) {
            setRestoredIds((prev) => new Set(prev).add(id));
            feedback.notifySuccess(`"${title}" restored`);
          } else {
            feedback.notifyError(`Couldn’t restore "${title}". Try again.`);
          }
        })
        .catch(() => {
          settle();
          feedback.notifyError(`Couldn’t restore "${title}". Try again.`);
        });
    },
    [feedback, post],
  );

  return { restore, pendingIds, restoredIds };
}
