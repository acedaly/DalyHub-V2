/**
 * V2.12 FIN-02 — the budgets screen (`/finance/budgets`).
 *
 * Reads the SAME `readMonthLines` the Finance home does, so the budget screen
 * and the home cannot disagree about what was spent.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";

import { FinanceBudgets } from "../FinanceBudgets";
import { loadFinanceBudgets } from "../finance-load.server";
import type { Route } from "./+types/budgets";

export function meta() {
  return [
    { title: "Budgets · Finance · DalyHub" },
    {
      name: "description",
      content: "What you meant to spend, beside what you did.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadFinanceBudgets({ env, session, request });
}

export default function FinanceBudgetsRoute({
  loaderData,
}: Route.ComponentProps) {
  return <FinanceBudgets {...loaderData} />;
}
