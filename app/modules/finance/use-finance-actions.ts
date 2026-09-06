/**
 * V2.12 — the ONE client hook every Finance mutation goes through.
 *
 * Each action is a same-origin `POST` to a resource route that returns JSON, and
 * a success revalidates the loader rather than patching a local copy. That is
 * deliberate for a money surface: a balance, a month total and a budget are all
 * DERIVED from the rows this mutation just changed, and an optimistic patch
 * would have to re-derive four figures on the client from a rule that lives on
 * the server. Two derivations of one definition is exactly what ADR-120 decision
 * 5 refuses for balances, and the same argument holds here.
 *
 * The cost is one round trip on a categorisation. It is worth it: a figure that
 * is briefly stale is a figure that catches up, and a figure the client computed
 * differently is a figure the owner cannot trust.
 *
 * ## Errors are the owner's words
 *
 * The route returns a `message` from a named domain refusal — "432 transactions
 * use that category", "the date and amount came from your bank". The hook
 * surfaces it verbatim and never invents a generic one, because every Finance
 * refusal is a rule with a reason.
 */

import { useCallback, useState } from "react";

import type { TransferCandidateOption } from "~/shared/finance";

interface MutateResponse {
  readonly ok: boolean;
  readonly message?: string;
  readonly transferCandidates?: readonly TransferCandidateOption[];
}

/** What the manual-entry form submits. */
export interface NewTransactionInput {
  readonly accountId: string;
  readonly occurredOn: string;
  /** The magnitude the owner typed. The DIRECTION is a separate control. */
  readonly amount: string;
  readonly direction: "in" | "out";
  readonly payeeDisplay: string;
  readonly categoryId: string | null;
}

export function useFinanceActions(onChanged: () => void) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferCandidates, setTransferCandidates] = useState<
    readonly TransferCandidateOption[]
  >([]);

  const post = useCallback(
    async (
      id: string,
      body: Record<string, unknown>,
    ): Promise<MutateResponse> => {
      setPendingId(id);
      setError(null);
      try {
        const response = await fetch("/finance/transactions/mutate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = (await response.json()) as MutateResponse;
        if (!result.ok) {
          setError(
            result.message ??
              "That could not be saved. Nothing has been changed.",
          );
          return result;
        }
        onChanged();
        return result;
      } catch {
        setError("That could not be saved. Nothing has been changed.");
        return { ok: false };
      } finally {
        setPendingId(null);
      }
    },
    [onChanged],
  );

  const setCategory = useCallback(
    (transactionId: string, categoryId: string | null) =>
      post(transactionId, {
        intent: "set-category",
        transactionId,
        categoryId,
      }),
    [post],
  );

  const saveDetails = useCallback(
    (
      transactionId: string,
      input: { readonly payeeDisplay: string; readonly memo: string },
    ) =>
      post(transactionId, {
        intent: "save-details",
        transactionId,
        ...input,
      }),
    [post],
  );

  const linkTransfer = useCallback(
    (transactionId: string, partnerId: string) =>
      post(transactionId, {
        intent: "link-transfer",
        transactionId,
        partnerId,
      }),
    [post],
  );

  const unlinkTransfer = useCallback(
    (transactionId: string) =>
      post(transactionId, { intent: "unlink-transfer", transactionId }),
    [post],
  );

  const remove = useCallback(
    (transactionId: string) =>
      post(transactionId, { intent: "delete", transactionId }),
    [post],
  );

  const create = useCallback(
    (input: NewTransactionInput) => post("new", { intent: "create", ...input }),
    [post],
  );

  const loadTransferCandidates = useCallback(
    async (transactionId: string) => {
      const result = await post(transactionId, {
        intent: "transfer-candidates",
        transactionId,
      });
      setTransferCandidates(result.transferCandidates ?? []);
    },
    [post],
  );

  return {
    pendingId,
    error,
    transferCandidates,
    setCategory,
    saveDetails,
    linkTransfer,
    unlinkTransfer,
    remove,
    create,
    loadTransferCandidates,
  };
}
