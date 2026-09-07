/**
 * V2.13 RPT-04 — a definition executed from the URL (`/reports/view`).
 *
 * Every built-in the owner has changed, and every unsaved edit, lives here. The
 * definition comes entirely from the query string through the same total codec
 * a stored row is parsed with, so a copied link and a saved report open the
 * same screen from the same rules.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";

import { ReportScreen } from "../ReportScreen";
import { loadReport } from "../reports-load.server";
import type { Route } from "./+types/view";

export function meta() {
  return [
    { title: "Report · DalyHub" },
    { name: "description", content: "A question, answered from your records." },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadReport({ env, session, request });
}

export default function ReportViewRoute({ loaderData }: Route.ComponentProps) {
  return <ReportScreen {...loaderData} />;
}
