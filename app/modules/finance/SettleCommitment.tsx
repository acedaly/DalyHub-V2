/**
 * V2.12 FIN-04 — settling an Obligation with a Transaction the owner already
 * has.
 *
 * ## Why this control lives in FINANCE and not in Life Admin
 *
 * The dependency runs one way. Finance implements `ObligationSettlementGateway`
 * and therefore knows about obligations; Life Admin knows nothing about a
 * transaction and never joins a Finance table. A settle control on the
 * Obligation record would have had to reach the other way — so it lives beside
 * the month's commitments, which is also where the owner is when the question
 * occurs to them: here is the electricity bill, here is the $180 that left the
 * account, those are the same event.
 *
 * ## The WRITE still belongs to the obligation
 *
 * This posts to `/obligations/:id/mutate` — the obligation's own endpoint, the
 * one writer for a completion. Finance never writes to `obligation_details`.
 * What it contributes is the read the obligation repository makes back through
 * the gateway to check the transaction is real, in this workspace, money out,
 * and not already settling something else.
 *
 * ## The confirmation names the figures, because completing cannot be undone
 *
 * V2.10's rule is that a completed obligation cannot be reopened — `setStatus`
 * refuses it by name. So settling the WRONG transaction is recovered by
 * deleting the obligation and making it again, which is a real cost. The
 * confirmation therefore states the transaction's own amount and date, in
 * words, before the button that writes: the owner is agreeing to a figure they
 * can see rather than to a row they clicked.
 *
 * The amount and the date are NOT editable here, and that is the kernel's rule
 * rather than this component's preference: a completion that names a settling
 * transaction is refused if it also carries a typed amount or date, because two
 * sources for one figure and no rule for which wins is how a ledger starts
 * disagreeing with itself.
 */

import { useState } from "react";

import { addCalendarDays } from "~/kernel/datetime";

import {
  financeDate,
  money,
  type SerializedCommitment,
} from "~/shared/finance";
import { Button } from "~/shared/ui";

/** One candidate, as the deterministic read offers it. */
interface SettlementCandidate {
  readonly transactionId: string;
  readonly accountTitle: string;
  readonly occurredOn: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly payeeDisplay: string;
}

export interface SettleCommitmentProps {
  readonly commitment: SerializedCommitment;
  readonly onSettled: () => void;
}

/** How far either side of the due date a settling payment is looked for. */
const SETTLEMENT_WINDOW_DAYS = 14;

export function SettleCommitment({
  commitment,
  onSettled,
}: SettleCommitmentProps) {
  const [candidates, setCandidates] = useState<
    readonly SettlementCandidate[] | null
  >(null);
  const [chosen, setChosen] = useState<SettlementCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCandidates() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/finance/transactions/mutate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: "settlement-candidates",
          fromDate: addCalendarDays(
            commitment.dueDate,
            -SETTLEMENT_WINDOW_DAYS,
          ),
          toDate: addCalendarDays(commitment.dueDate, SETTLEMENT_WINDOW_DAYS),
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        message?: string;
        settlementCandidates?: readonly SettlementCandidate[];
      };
      if (!result.ok) {
        setError(result.message ?? "Those transactions could not be read.");
        return;
      }
      setCandidates(result.settlementCandidates ?? []);
    } catch {
      setError("Those transactions could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function settle(candidate: SettlementCandidate) {
    setBusy(true);
    setError(null);
    try {
      /*
       * FormData, because this is the OBLIGATION's endpoint and that is the
       * shape it takes. Neither `completedOn` nor `completedAmount` is sent:
       * both come from the transaction, and the kernel refuses a completion
       * that carries one beside a settlement.
       */
      const form = new FormData();
      form.set("intent", "complete");
      form.set("settledByTransactionId", candidate.transactionId);
      const response = await fetch(
        `/obligations/${encodeURIComponent(commitment.obligationId)}/mutate`,
        { method: "POST", body: form },
      );
      const result = (await response.json()) as {
        ok: boolean;
        formError?: string;
      };
      if (!result.ok) {
        setError(result.formError ?? "That could not be recorded.");
        return;
      }
      setCandidates(null);
      setChosen(null);
      onSettled();
    } catch {
      setError("That could not be recorded. Nothing has been changed.");
    } finally {
      setBusy(false);
    }
  }

  if (commitment.settled) return null;

  return (
    <div
      className="dh-finance-settle"
      data-testid={`settle-${commitment.obligationId}`}
    >
      {error === null ? null : (
        <p role="alert" className="dh-finance-settle__error">
          {error}
        </p>
      )}

      {candidates === null ? (
        <Button
          variant="subtle"
          size="sm"
          disabled={busy}
          onClick={() => void loadCandidates()}
          data-testid={`settle-open-${commitment.obligationId}`}
        >
          Paid by a transaction?
        </Button>
      ) : chosen !== null ? (
        <div className="dh-finance-settle__confirm" role="group">
          {/*
           * The figures, in words, before the write. Completing cannot be
           * undone: V2.10 refuses to reopen a completed obligation, so the
           * recovery from settling the wrong row is deleting the obligation and
           * making it again.
           */}
          <p>
            Record <strong>{commitment.title}</strong> as paid by{" "}
            {money(Math.abs(chosen.amountMinor), chosen.currencyCode)} to{" "}
            {chosen.payeeDisplay} on {financeDate(chosen.occurredOn)}, from{" "}
            {chosen.accountTitle}?
          </p>
          <p className="dh-finance-settle__note">
            The amount and the date come from the transaction, not from you.
            Completing an obligation cannot be undone — if this is the wrong
            payment, choose another one now.
          </p>
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => void settle(chosen)}
            data-testid={`settle-confirm-${commitment.obligationId}`}
          >
            Yes, this paid it
          </Button>
          <Button
            variant="subtle"
            size="sm"
            disabled={busy}
            onClick={() => setChosen(null)}
          >
            Choose a different one
          </Button>
        </div>
      ) : candidates.length === 0 ? (
        <p className="dh-finance-settle__note">
          No money-out transaction within a fortnight of{" "}
          {financeDate(commitment.dueDate)}. Import the statement it is on, or
          complete the obligation on its own record.
        </p>
      ) : (
        <ul className="dh-finance-settle__candidates">
          {candidates.map((candidate) => (
            <li key={candidate.transactionId}>
              <Button
                variant="subtle"
                size="sm"
                disabled={busy}
                onClick={() => setChosen(candidate)}
                data-testid={`settle-pick-${candidate.transactionId}`}
              >
                {money(Math.abs(candidate.amountMinor), candidate.currencyCode)}
                {" · "}
                {candidate.payeeDisplay}
                {" · "}
                {financeDate(candidate.occurredOn)}
                {" · "}
                {candidate.accountTitle}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
