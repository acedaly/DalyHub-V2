/**
 * V2.12 — an account's record (`/finance/accounts/:accountId`).
 *
 * An id that is not an account IN THIS WORKSPACE gets 404, never 403: a
 * workspace must not learn that a record exists elsewhere from the shape of a
 * refusal. The loader returns `null` for both cases and this route cannot tell
 * them apart, which is the point.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";

import { FinanceAccountRecord } from "../FinanceAccountRecord";
import { loadFinanceAccount } from "../finance-load.server";
import type { Route } from "./+types/accounts.detail";

export function meta({ loaderData }: Route.MetaArgs) {
  /*
   * The account's own name is the owner's word for it ("Everyday"), never a
   * number and never a balance: a title reaches the tab strip and the browser
   * history, and no figure belongs in either.
   */
  const title = loaderData?.account.title;
  return [
    {
      title:
        title === undefined
          ? "Account · Finance · DalyHub"
          : `${title} · Finance · DalyHub`,
    },
    {
      name: "description",
      content: "An account, its balance and its transactions.",
    },
  ];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const data = await loadFinanceAccount({
    env,
    session,
    request,
    accountId: params.accountId,
  });
  if (data === null) throw new Response("Not Found", { status: 404 });
  return data;
}

export default function FinanceAccountRoute({
  loaderData,
}: Route.ComponentProps) {
  return <FinanceAccountRecord {...loaderData} />;
}
