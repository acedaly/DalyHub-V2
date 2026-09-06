/**
 * V2.12 — the create-account endpoint (`POST /finance/accounts/create`).
 *
 * An action-only RESOURCE route, deliberately separate from the `/new` page.
 *
 * ## The SIGN is assembled here, from two explicit fields
 *
 * The form sends a magnitude and a direction, never a typed minus sign. This
 * route composes them into the signed string the money kernel parses, so the
 * one place that decides what "−$400 on a credit card" means is the server. A
 * forgotten minus would otherwise be wrong by twice the figure in every
 * net-worth reading afterwards.
 *
 * ## Nothing credential-shaped is read, because nothing credential-shaped exists
 *
 * The body's keys are enumerated below. A key this route has never heard of is
 * ignored rather than forwarded, and there is no column in `finance_accounts`
 * for a login, a card number, a BSB or an account number to be stored in even
 * if one arrived.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { actionOnlyLoader } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import {
  financeFailure,
  financeOk,
  financeErrorMessage,
  readFinanceBody,
  text,
} from "../finance-mutate.server";
import type { Route } from "./+types/accounts.create";

export const loader = actionOnlyLoader;

/**
 * Compose the signed opening balance from the magnitude and the direction.
 *
 * An empty magnitude stays empty (the account opens at zero and the kernel is
 * never handed a bare `"-"`), and a magnitude the owner already signed is left
 * alone rather than double-negated.
 */
function signedOpening(magnitude: string, direction: string): string {
  const value = magnitude.trim();
  if (value === "") return "";
  if (value.startsWith("-") || value.startsWith("−")) return value;
  return direction === "negative" ? `-${value}` : value;
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const body = await readFinanceBody(request);
  if (body === null) return financeFailure("That account could not be read.");

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const openingBalance = signedOpening(
      text(body, "openingBalance"),
      text(body, "openingDirection"),
    );
    const institution = text(body, "institution");

    const account = await scope.finance.createAccount({
      title: text(body, "title"),
      accountType: text(body, "accountType"),
      currencyCode: text(body, "currencyCode"),
      openingDate: text(body, "openingDate"),
      openingBalance: openingBalance === "" ? null : openingBalance,
      institution: institution === "" ? null : institution,
    });

    return financeOk({ accountId: account.id });
  } catch (error) {
    return financeFailure(financeErrorMessage(error));
  }
}
