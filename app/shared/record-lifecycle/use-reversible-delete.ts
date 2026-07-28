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

/**
 * What a lifecycle post reports back. A bare `boolean` is the simple case; the
 * object form lets a module surface the SPECIFIC recovery its route already
 * returned — "This Goal still has active Projects…" — instead of collapsing it to
 * a generic "try again" the user cannot act on (AGENTS.md §6: every error names a
 * recovery).
 */
export type LifecyclePostResult =
  boolean | { readonly ok: boolean; readonly error?: string };

function resolveOutcome(result: LifecyclePostResult): {
  ok: boolean;
  error?: string;
} {
  return typeof result === "boolean"
    ? { ok: result }
    : { ok: result.ok, error: result.error };
}

export interface ReversibleDeleteOptions {
  /** The record's entity type — the source of every label in the messages. */
  readonly entityType: EntityType;
  /** The record's title, used verbatim in the toasts. */
  readonly title: string;
  /**
   * POST one lifecycle intent to the module's trusted mutation route and report
   * the outcome. The caller owns the endpoint and the result shape, so this hook
   * imports no route or repository. Return the object form to carry the route's
   * own recovery message through to the user.
   */
  readonly post: (intent: "delete" | "restore") => Promise<LifecyclePostResult>;
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

    // Everything that can reject lives inside this try, and `finally` ALWAYS
    // clears the pending flags. Without it a network fault or a non-JSON
    // response left the record's Delete action disabled until a page reload —
    // and, because the reversible path fires this without awaiting, produced an
    // unhandled rejection as well.
    try {
      const proceed = (await beforeDelete?.()) ?? true;
      if (!proceed) {
        feedback.notifyError(
          beforeDeleteError ??
            `Couldn’t save your latest changes, so "${title}" wasn’t deleted. Fix the save error, then try again.`,
        );
        return;
      }

      const outcome = resolveOutcome(await post("delete"));
      if (!outcome.ok) {
        // The route's own explanation wins when it has one: a blocked delete
        // tells the user what to do first, never a bare "try again" they cannot
        // act on.
        feedback.notifyError(
          outcome.error ?? `Couldn’t delete "${title}". Please try again.`,
        );
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
          // Undo runs long after `remove` returned, so it owns its own failure
          // handling — a rejection here must surface the durable path back, not
          // vanish as an unhandled rejection.
          try {
            const restored = resolveOutcome(await post("restore"));
            if (restored.ok) {
              feedback.notifySuccess(`"${title}" restored`);
              return;
            }
            feedback.notifyError(
              restored.error ??
                `Couldn’t restore "${title}". Find it in Deleted ${plural} and restore it from there.`,
            );
          } catch {
            feedback.notifyError(
              `Couldn’t restore "${title}". Find it in Deleted ${plural} and restore it from there.`,
            );
          }
        },
      });
    } catch {
      feedback.notifyError(`Couldn’t delete "${title}". Please try again.`);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
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
