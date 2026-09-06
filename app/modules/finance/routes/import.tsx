/**
 * V2.12 FIN-01 — the import screen (`/finance/import`).
 *
 * The page only. The preview and the apply are a separate RESOURCE route
 * (`/finance/import/run`), because a document route that also exports a
 * component re-renders HTML for a `fetch` POST rather than returning JSON.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";

import { FinanceImport } from "../FinanceImport";
import { loadFinanceImport } from "../finance-load.server";
import type { Route } from "./+types/import";

export function meta() {
  return [
    { title: "Import a statement · Finance · DalyHub" },
    {
      name: "description",
      content:
        "Read a CSV from your bank. Importing the same file twice adds nothing.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadFinanceImport({ env, session, request });
}

export default function FinanceImportRoute({
  loaderData,
}: Route.ComponentProps) {
  return <FinanceImport {...loaderData} />;
}
