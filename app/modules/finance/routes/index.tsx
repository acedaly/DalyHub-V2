/**
 * V2.12 — the Finance home (`/finance`).
 *
 * The trusted server boundary for the question the whole module exists to
 * answer: where is my money going? It reads the authoritative
 * `FinanceRepository` through the authenticated composition boundary and hands
 * the presentational home a finished, JSON-safe month.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";

import { FinanceHome } from "../FinanceHome";
import { loadFinanceHome } from "../finance-load.server";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Finance · DalyHub" },
    {
      name: "description",
      content: "Where your money went this month.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadFinanceHome({ env, session, request });
}

export default function FinanceHomeRoute({ loaderData }: Route.ComponentProps) {
  return <FinanceHome {...loaderData} />;
}
