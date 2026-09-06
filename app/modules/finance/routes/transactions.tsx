/**
 * V2.12 — the transactions surface (`/finance/transactions`).
 *
 * ONE route serves both the month's list and the uncategorised queue
 * (`?uncategorised=1`), because they are one list under two filters. A second
 * route would be a second row component, a second set of actions and a second
 * place for the two to disagree about what a transfer leg is.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";

import { FinanceTransactions } from "../FinanceTransactions";
import { loadFinanceTransactions } from "../finance-load.server";
import type { Route } from "./+types/transactions";

export function meta({ loaderData }: Route.MetaArgs) {
  /*
   * The QUEUE and the month get different titles, and neither carries a payee,
   * an amount or a search term: a document title reaches the tab strip, the
   * history, the task switcher and any screen recording of them.
   */
  const queue = loaderData?.uncategorised === true;
  return [
    {
      title: queue
        ? "Uncategorised · Finance · DalyHub"
        : "Transactions · Finance · DalyHub",
    },
    {
      name: "description",
      content: queue
        ? "Every transaction still waiting for a category."
        : "The month's transactions.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadFinanceTransactions({ env, session, request });
}

export default function FinanceTransactionsRoute({
  loaderData,
}: Route.ComponentProps) {
  return <FinanceTransactions {...loaderData} />;
}
