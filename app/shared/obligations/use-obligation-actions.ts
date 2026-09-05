/**
 * V2.10 LIFE-02 — the ONE client-side obligation mutation path.
 *
 * Every surface that acts on an obligation — Life Admin's collection, the
 * Obligation record, the Asset record's Obligations tab — posts to the same
 * endpoint, in the same shape, and reports the same way. The Assets tab used to
 * carry its own `fetch` to `/asset/:id/history`, which meant an obligation could
 * be held from one surface and dismissed from another through two different
 * doors with two different failure behaviours.
 *
 * It lives in SHARED rather than in the obligations module because the Assets
 * module calls it, and a module importing another module's internals is the
 * boundary `module-import-boundary.test.ts` exists to hold. Shared is where the
 * behaviour two modules both need belongs.
 *
 * `complete` and `edit` are deliberately NOT here. Both need more from the owner
 * than a button press — a date, an amount, sometimes a meter reading — so both
 * open a form, and the surface that owns the form owns those. What is here is
 * the set of actions that are genuinely one press.
 */

import { useCallback, useMemo, useState } from "react";

import type { SerializedObligation } from "./obligation-view";

/** What the endpoint answers. Mirrors the DS-06 JSON form contract. */
export type ObligationMutationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

/** The narrow slice of the feedback surface these actions need. */
export interface ObligationActionFeedback {
  notifySuccess(message: string): void;
  notifyError(message: string): void;
}

export interface UseObligationActionsInput {
  /** Re-read the surface after a successful mutation. */
  readonly onChanged: () => void;
  /** Report which obligation is mid-flight, so its row can disable its buttons. */
  readonly onBusy?: (obligationId: string | null) => void;
  readonly feedback: ObligationActionFeedback;
}

/** The one-press actions. Completion and editing are forms, and live elsewhere. */
export interface ObligationActions {
  readonly createTask: (obligation: SerializedObligation) => void;
  readonly hold: (obligation: SerializedObligation) => void;
  readonly dismiss: (obligation: SerializedObligation) => void;
  readonly reopen: (obligation: SerializedObligation) => void;
  /** Which obligation is mid-flight, so its row can disable its own buttons. */
  readonly pendingId: string | null;
}

export function useObligationActions(
  input: UseObligationActionsInput,
): ObligationActions {
  const { onChanged, onBusy, feedback } = input;
  const [pendingId, setPendingId] = useState<string | null>(null);

  const post = useCallback(
    async (intent: string, obligation: SerializedObligation, done: string) => {
      setPendingId(obligation.id);
      onBusy?.(obligation.id);
      const body = new FormData();
      body.set("intent", intent);
      try {
        const response = await fetch(
          `/obligations/${encodeURIComponent(obligation.id)}/mutate`,
          { method: "POST", body },
        );
        const result = (await response.json()) as ObligationMutationResult;
        if (result.ok) {
          feedback.notifySuccess(done);
          onChanged();
          return;
        }
        feedback.notifyError(
          result.formError ?? "That couldn’t be saved. Please try again.",
        );
      } catch {
        feedback.notifyError("That couldn’t be saved. Please try again.");
      } finally {
        setPendingId(null);
        onBusy?.(null);
      }
    },
    [feedback, onBusy, onChanged],
  );

  return useMemo(
    () => ({
      createTask: (obligation: SerializedObligation) => {
        void post("create-task", obligation, "Task created.");
      },
      hold: (obligation: SerializedObligation) => {
        void post("hold", obligation, "Put on hold.");
      },
      dismiss: (obligation: SerializedObligation) => {
        void post("dismiss", obligation, "Dismissed.");
      },
      reopen: (obligation: SerializedObligation) => {
        void post("reopen", obligation, "Reopened.");
      },
      pendingId,
    }),
    [pendingId, post],
  );
}
