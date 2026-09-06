/**
 * V2.12 — the category mutation endpoint (`POST /finance/categories/mutate`).
 *
 * An action-only RESOURCE route. The delete refusal names a count, and this
 * route passes it through verbatim rather than replacing it with "that could
 * not be deleted": "432 transactions use Dining" tells the owner both why and
 * what archiving would keep.
 *
 * There is no `set-kind` intent. Flipping a category from money-out to money-in
 * would rewrite every month it appears in, turning historical spend into
 * historical income with no record that anything happened — so
 * `UpdateFinanceCategoryInput` has no `kind` field and there is nothing here to
 * call.
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
  flag,
  readFinanceBody,
  text,
} from "../finance-mutate.server";
import type { Route } from "./+types/categories.mutate";

export const loader = actionOnlyLoader;

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const body = await readFinanceBody(request);
  if (body === null) return financeFailure("That change could not be read.");

  const finance = scope.finance;
  const categoryId = text(body, "categoryId");

  switch (text(body, "intent")) {
    case "create":
      return financeAttempt(async () => {
        const category = await finance.createCategory({
          name: text(body, "name"),
          kind: text(body, "kind"),
        });
        return { categoryId: category.id };
      });

    case "rename":
      return financeAttempt(async () => {
        await finance.updateCategory(categoryId, { name: text(body, "name") });
      });

    case "archive":
      // Always allowed, and never touches a transaction: archiving is how a
      // category stops being offered while every row that carries it keeps it.
      return financeAttempt(async () => {
        await finance.setCategoryArchived(categoryId, flag(body, "archived"));
      });

    case "delete":
      return financeAttempt(async () => {
        await finance.deleteCategory(categoryId);
      });

    default:
      return financeFailure("That is not something a category can do.");
  }
}
