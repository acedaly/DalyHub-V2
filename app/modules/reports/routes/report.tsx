/**
 * V2.13 RPT-04 — a saved report or a built-in (`/reports/:reportId`).
 *
 * The definition comes from storage (or from the built-in's code); a query
 * string, when present, is an unsaved EDIT of it, and the screen says so rather
 * than pretending the stored question changed.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";

import { ReportScreen } from "../ReportScreen";
import { loadReport } from "../reports-load.server";
import type { Route } from "./+types/report";

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.title ?? "Report"} · DalyHub` },
    { name: "description", content: "A question, answered from your records." },
  ];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadReport({ env, session, request, reportId: params.reportId });
}

export default function SavedReportRoute({ loaderData }: Route.ComponentProps) {
  return <ReportScreen {...loaderData} />;
}
