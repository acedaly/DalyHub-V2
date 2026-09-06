/**
 * V2.12 — the account mutation endpoint
 * (`POST /finance/accounts/:accountId/mutate`).
 *
 * An action-only RESOURCE route: the single server-authoritative path for
 * everything that changes ONE account, whatever surface asked. It verifies the
 * id names an account IN THIS WORKSPACE before any dispatch, so a Task id — or
 * an id from another workspace — gets the calm not-found rather than reaching a
 * mutation.
 *
 * There is no `set-currency` intent, and no `set-balance` intent. The first
 * would silently reinterpret every transaction the account holds; the second
 * would create the stored figure ADR-120 decision 5 exists to refuse. Neither
 * has a repository method to call.
 */

import { env } from "cloudflare:workers";

import {
  actionOnlyLoader,
  requireAuthenticatedSession,
} from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import {
  financeAttempt,
  financeFailure,
  readFinanceBody,
  text,
} from "../finance-mutate.server";
import type { Route } from "./+types/accounts.mutate";

export const loader = actionOnlyLoader;

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const accountId = params.accountId;

  // Fail closed BEFORE any dispatch. Indistinguishable from an id that never
  // existed, which is what a cross-workspace probe must not be able to tell.
  const existing = await scope.finance.getAccount(accountId);
  if (existing === null) throw new Response("Not Found", { status: 404 });

  const body = await readFinanceBody(request);
  if (body === null) return financeFailure("That change could not be read.");

  const finance = scope.finance;

  switch (text(body, "intent")) {
    case "rename":
      return financeAttempt(async () => {
        await finance.updateAccount(accountId, { title: text(body, "title") });
      });

    case "set-institution":
      return financeAttempt(async () => {
        const institution = text(body, "institution");
        await finance.updateAccount(accountId, {
          institution: institution === "" ? null : institution,
        });
      });

    case "set-status":
      /*
       * Closing changes what DalyHub OFFERS — an import target, a new-transaction
       * account — and never what the arithmetic says: a closed account still
       * counts towards net worth, because the money is still there (or still
       * owed).
       */
      return financeAttempt(async () => {
        await finance.updateAccount(accountId, {
          status: text(body, "status"),
        });
      });

    case "delete":
      /*
       * Refused by the repository with `account_in_use` while the account holds
       * any transaction, deleted ones included — a transaction whose account has
       * gone is a row nothing can explain. The record only offers this button on
       * an account with no history, and the server refuses it anyway.
       */
      return financeAttempt(async () => {
        await finance.deleteAccount(accountId);
      });

    default:
      return financeFailure("That is not something an account can do.");
  }
}
