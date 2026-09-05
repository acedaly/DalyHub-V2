/**
 * V2.10 LIFE-02 — the Life Admin collection route (`/obligations`).
 *
 * The trusted server boundary for the bounded, workspace-scoped obligation
 * collection: it reads the authoritative `ObligationRepository` through the
 * authenticated composition boundary and hands the presentational collection a
 * finished, JSON-safe page.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";

import { ObligationsCollection } from "../ObligationsCollection";
import { loadObligationsCollection } from "../obligations-load.server";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Life Admin · DalyHub" },
    {
      name: "description",
      content: "Everything with a date on it that is not a task.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadObligationsCollection({ env, session, request });
}

export default function ObligationsRoute({ loaderData }: Route.ComponentProps) {
  return <ObligationsCollection {...loaderData} />;
}
