/**
 * V2.12 FIN-02 — the budget mutation endpoint (`POST /finance/budgets/mutate`).
 *
 * An action-only RESOURCE route. Three intents, and no repetition engine behind
 * any of them: a budget is set for ONE month, and "copy last month's" is an
 * explicit action the owner takes rather than a rule that runs on the first.
 *
 * An empty amount CLEARS the budget rather than storing zero. Zero is a real
 * budget — "I intend to spend nothing on this" — and silently turning "I have
 * not decided" into it would make the variance sentence lie.
 */

import { env } from "cloudflare:workers";

import { addMonths, isFinanceMonth } from "~/kernel/finance";
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
import type { Route } from "./+types/budgets.mutate";

export const loader = actionOnlyLoader;

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const body = await readFinanceBody(request);
  if (body === null) return financeFailure("That budget could not be read.");

  const month = text(body, "month");
  if (!isFinanceMonth(month)) {
    return financeFailure("That is not a month DalyHub can budget for.");
  }

  const finance = scope.finance;
  const categoryId = text(body, "categoryId");

  switch (text(body, "intent")) {
    case "set": {
      const amount = text(body, "amount");
      if (amount === "") {
        /*
         * Clearing, not zeroing. The budgets screen sends an empty field when
         * the owner deletes what they typed, and the honest reading of that is
         * "there is no budget here" — not "the budget is nothing".
         */
        return financeAttempt(async () => {
          const existing = await finance.listBudgets(month);
          const match = existing.find(
            (budget) => budget.categoryId === categoryId,
          );
          if (match !== undefined) await finance.deleteBudget(match.id);
        });
      }
      return financeAttempt(async () => {
        await finance.setBudget({
          categoryId,
          periodMonth: month,
          amount,
          currencyCode: text(body, "currencyCode"),
        });
      });
    }

    case "copy-from-previous":
      /*
       * SKIPS a category this month already has, so pressing it twice cannot
       * overwrite a budget the owner has since edited. The count comes back so
       * the screen can say what happened rather than just refreshing.
       */
      return financeAttempt(async () => {
        const copied = await finance.copyBudgets(addMonths(month, -1), month);
        return { copied };
      });

    default:
      return financeFailure("That is not something a budget can do.");
  }
}
