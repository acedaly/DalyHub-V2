/**
 * V2.12 — the transaction mutation endpoint
 * (`POST /finance/transactions/mutate`).
 *
 * An action-only RESOURCE route: the single server-authoritative path for
 * everything that changes ONE transaction, whatever surface asked. The month
 * list, the uncategorised queue, the drawer and the account record all post
 * here, so a transaction cannot be categorised through one door and refused
 * through another with two different behaviours.
 *
 * ## Every intent proves the id first
 *
 * `getTransaction` runs before any dispatch, so an id from another workspace —
 * or a Task id, or an Obligation id — gets the calm not-found rather than
 * reaching a mutation. The refusal is identical to one for an id that never
 * existed, so existence does not leak.
 *
 * ## The SIGN is assembled here, from two explicit fields
 *
 * `create` takes a magnitude and an `in`/`out` direction and composes the
 * signed string the money kernel parses. The owner never types a minus sign,
 * and the one place that decides what the sign means is the server.
 *
 * ## Which leg is the outflow is DERIVED, never sent
 *
 * `link-transfer` receives two ids and reads both amounts to decide which is
 * which. A client that got the order wrong would otherwise pair a transfer
 * backwards, and the repository's refusals (same account, same sign, already
 * paired, deleted) would not catch it because the pair would still be valid.
 */

import { env } from "cloudflare:workers";

import {
  actionOnlyLoader,
  requireAuthenticatedSession,
} from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { TransferCandidateOption } from "~/shared/finance";

import {
  financeAttempt,
  financeFailure,
  optionalId,
  readFinanceBody,
  text,
} from "../finance-mutate.server";
import type { Route } from "./+types/transactions.mutate";

export const loader = actionOnlyLoader;

/** Compose the signed amount from the magnitude and the direction control. */
function signedAmount(magnitude: string, direction: string): string {
  const value = magnitude.trim();
  if (value === "") return value;
  const bare = value.replace(/^[-−]/, "");
  return direction === "out" ? `-${bare}` : bare;
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const body = await readFinanceBody(request);
  if (body === null) return financeFailure("That change could not be read.");

  const finance = scope.finance;
  const intent = text(body, "intent");

  /*
   * V2.12 FIN-04 — the money-OUT transactions that could have settled an
   * obligation, in a window the caller names.
   *
   * A READ behind a POST, for the reason `transfer-candidates` is: the window is
   * a bill's due date, and a GET would put "what the owner paid, and roughly
   * when" into a browser history. Nothing auto-settles — this offers, and the
   * owner confirms against the figures before anything is written.
   */
  if (intent === "settlement-candidates") {
    return financeAttempt(async () => {
      const page = await finance.listTransactions({
        filters: {
          fromDate: text(body, "fromDate"),
          toDate: text(body, "toDate"),
        },
        limit: 25,
      });
      const settlementCandidates: readonly TransferCandidateOption[] =
        page.items
          .filter((item) => item.transaction.amountMinor < 0)
          .map((item) => ({
            transactionId: item.transaction.id,
            accountTitle: item.accountTitle,
            occurredOn: item.transaction.occurredOn,
            amountMinor: item.transaction.amountMinor,
            currencyCode: item.transaction.currencyCode,
            payeeDisplay: item.transaction.payeeDisplay,
          }));
      return { settlementCandidates };
    });
  }

  // `create` is the one intent with no existing transaction to prove.
  if (intent === "create") {
    return financeAttempt(async () => {
      const created = await finance.createTransaction({
        accountId: text(body, "accountId"),
        occurredOn: text(body, "occurredOn"),
        amount: signedAmount(text(body, "amount"), text(body, "direction")),
        payeeDisplay: text(body, "payeeDisplay"),
        categoryId: optionalId(body, "categoryId"),
      });
      return { transactionId: created.id };
    });
  }

  const transactionId = text(body, "transactionId");
  const existing = await finance.getTransaction(transactionId);
  if (existing === null) throw new Response("Not Found", { status: 404 });

  switch (intent) {
    case "set-category":
      /*
       * Setting a category through the repository stamps `categoryConfirmedAt`,
       * which is what the suggestion engine learns from — so it learns only from
       * decisions the owner actually made, and never from a suggestion it
       * offered and nobody accepted.
       */
      return financeAttempt(async () => {
        await finance.updateTransaction(transactionId, {
          categoryId: optionalId(body, "categoryId"),
        });
      });

    case "save-details":
      return financeAttempt(async () => {
        const memo = text(body, "memo");
        await finance.updateTransaction(transactionId, {
          payeeDisplay: text(body, "payeeDisplay"),
          memo: memo === "" ? null : memo,
        });
      });

    case "link-transfer": {
      const partnerId = text(body, "partnerId");
      /*
       * Proved OUTSIDE the attempt, because a partner from another workspace is
       * a 404 and not a refusal — `financeAttempt` turns everything it catches
       * into a sentence, which would tell the caller the id was at least
       * well-formed enough to reach a mutation.
       */
      const partner = await finance.getTransaction(partnerId);
      if (partner === null) throw new Response("Not Found", { status: 404 });

      const outflow =
        existing.transaction.amountMinor < 0 ? transactionId : partnerId;
      const inflow = outflow === transactionId ? partnerId : transactionId;
      return financeAttempt(async () => {
        await finance.linkTransfer(outflow, inflow);
      });
    }

    case "unlink-transfer":
      return financeAttempt(async () => {
        await finance.unlinkTransfer(transactionId);
      });

    case "delete":
      return financeAttempt(async () => {
        await finance.deleteTransaction(transactionId);
      });

    case "restore":
      return financeAttempt(async () => {
        await finance.restoreTransaction(transactionId);
      });

    case "transfer-candidates":
      /*
       * A READ behind a POST, and deliberately so: the alternative is a GET
       * whose query string carries a transaction id into the browser history and
       * the Worker's request log. Nothing auto-pairs — this offers, and the
       * owner chooses.
       */
      return financeAttempt(async () => {
        const candidates = await finance.suggestTransferPartners(transactionId);
        const transferCandidates: readonly TransferCandidateOption[] =
          candidates.map((candidate) => ({
            transactionId: candidate.transactionId,
            accountTitle: candidate.accountTitle,
            occurredOn: candidate.occurredOn,
            amountMinor: candidate.amountMinor,
            currencyCode: candidate.currencyCode,
            payeeDisplay: candidate.payeeDisplay,
          }));
        return { transferCandidates };
      });

    default:
      return financeFailure("That is not something a transaction can do.");
  }
}
