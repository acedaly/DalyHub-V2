/**
 * V2.13 RPT-04 — the Reports collection (`/reports`).
 *
 * The trusted server boundary for the list of DEFINITIONS. It executes no
 * report: opening Reports must never mean running six before first paint.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";

import { ReportsHome } from "../ReportsHome";
import { loadReportsHome } from "../reports-load.server";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Reports · DalyHub" },
    {
      name: "description",
      content: "Saved questions, answered from the records that hold them.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadReportsHome({ env, session, request });
}

export default function ReportsIndexRoute({
  loaderData,
}: Route.ComponentProps) {
  return <ReportsHome {...loaderData} />;
}
