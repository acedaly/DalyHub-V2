/**
 * PX-04 — reversible removal, shared.
 *
 * Notes proved the pattern (ADR-042): one deliberate click, a REAL server
 * mutation through the module's trusted route, a redirect back to the
 * collection, and a DS-10 **Undo** toast whose handler calls the mirror
 * `restore` intent — never an optimistic-only client state, never a confirmation
 * dialog for something this recoverable (AGENTS.md §7). Goals, Diary entries and
 * every future entity now inherit that behaviour instead of re-implementing it,
 * so "delete" feels the same everywhere.
 *
 * The hook is entity-agnostic: the caller supplies its own mutation endpoint,
 * the entity type (which supplies the wording), and where to go afterwards.
 */

import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";

import type { EntityType } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";

import { entityPluralLabel } from "./lifecycle-copy";

export interface ReversibleDeleteOptions {
  /** The record's entity type — the source of every label in the messages. */
  readonly entityType: EntityType;
  /** The record's title, used verbatim in the toasts. */
  readonly title: string;
  /**
   * POST one lifecycle intent to the module's trusted mutation route and report
   * whether it succeeded. The caller owns the endpoint and the result shape, so
   * this hook imports no route or repository.
   */
  readonly post: (intent: "delete" | "restore") => Promise<boolean>;
  /** Where to go once the record is gone (usually its collection). */
  readonly redirectTo: string;
  /**
   * Optional pre-flight, run BEFORE the delete: return `false` to abort. Notes
   * use it to flush an in-flight editor save, so Undo restores exactly what the
   * user last wrote rather than an earlier version.
   */
  readonly beforeDelete?: () => Promise<boolean>;
  /** Message shown when `beforeDelete` refuses. */
  readonly beforeDeleteError?: string;
}

export interface ReversibleDelete {
  readonly remove: () => Promise<void>;
  readonly pending: boolean;
  /**
   * Set synchronously the instant the delete succeeds, BEFORE navigating away,
   * so an unsaved-changes guard can disarm itself for this deliberate departure.
   */
  readonly deleted: boolean;
}

export function useReversibleDelete({
  entityType,
  title,
  post,
  redirectTo,
  beforeDelete,
  beforeDeleteError,
}: ReversibleDeleteOptions): ReversibleDelete {
  const navigate = useNavigate();
  const feedback = useFeedback();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [deleted, setDeleted] = useState(false);

  const plural = entityPluralLabel(entityType);

  const remove = useCallback(async () => {
    if (pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setPending(true);

    const proceed = (await beforeDelete?.()) ?? true;
    if (!proceed) {
      pendingRef.current = false;
      setPending(false);
      feedback.notifyError(
        beforeDeleteError ??
          `Couldn’t save your latest changes, so "${title}" wasn’t deleted. Fix the save error, then try again.`,
      );
      return;
    }

    const ok = await post("delete");
    pendingRef.current = false;
    setPending(false);

    if (!ok) {
      feedback.notifyError(`Couldn’t delete "${title}". Please try again.`);
      return;
    }

    // `flushSync` so an unsaved-changes guard sees `deleted` before `navigate`
    // runs — React would otherwise batch the update and the guard would still be
    // armed for a departure the user deliberately asked for.
    flushSync(() => {
      setDeleted(true);
    });
    navigate(redirectTo);
    feedback.notifyUndo(`"${title}" deleted`, {
      onUndo: async () => {
        const restored = await post("restore");
        if (restored) {
          feedback.notifySuccess(`"${title}" restored`);
        } else {
          feedback.notifyError(
            `Couldn’t restore "${title}". Find it in Deleted ${plural} and restore it from there.`,
          );
        }
      },
    });
  }, [
    beforeDelete,
    beforeDeleteError,
    feedback,
    navigate,
    plural,
    post,
    redirectTo,
    title,
  ]);

  return { remove, pending, deleted };
}
