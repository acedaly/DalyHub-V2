/**
 * V2.12 — the category vocabulary (`/finance/categories`).
 *
 * Reads with `withCounts`, because the delete refusal names a number and the
 * screen must show the same number BEFORE the owner presses the button.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";

import { FinanceCategories } from "../FinanceCategories";
import { loadFinanceCategories } from "../finance-load.server";
import type { Route } from "./+types/categories";

export function meta() {
  return [
    { title: "Categories · Finance · DalyHub" },
    {
      name: "description",
      content: "The words DalyHub uses to answer where your money went.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadFinanceCategories({ env, session, request });
}

export default function FinanceCategoriesRoute({
  loaderData,
}: Route.ComponentProps) {
  return <FinanceCategories {...loaderData} />;
}
