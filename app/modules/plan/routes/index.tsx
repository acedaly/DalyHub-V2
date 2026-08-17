/**
 * PLAN-01 — the `/plan` route: Weekly Planning.
 *
 * The loader resolves the whole week — its boundaries, its calendar context, its
 * planned Tasks, the "Still to place" queue and the planning signals — in the one
 * bounded read `plan-load.server.ts` documents, and hands the screen finished,
 * JSON-safe data. It performs NO mutation: every write on this surface leaves
 * through the canonical Task routes (`POST /tasks/:id`, `POST /tasks/bulk`), so
 * `/plan` has no action of its own and could not become a second Task authority
 * even by accident.
 *
 * Workspace scope comes from TRUSTED server config, never the client
 * (`resolveAuthenticatedWorkspaceScope` → ADR-010/ADR-016), and the owner's
 * timezone and first-day-of-week come from their preferences — the planning week
 * is never derived from the Worker's UTC day (ADR-022).
 */

import { env } from "cloudflare:workers";
import type { ShouldRevalidateFunctionArgs } from "react-router";

import { parsePlanningWeekParam } from "~/kernel/planning";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  isSameDocumentParameterChange,
  parametersUnchanged,
} from "~/shared/router/revalidation";

import { PlanWorkspace } from "../PlanWorkspace";
import { loadPlanPage } from "../plan-load.server";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Weekly planning · DalyHub" },
    {
      name: "description",
      content:
        "Place real work onto the days of your week, around what is already on.",
    },
  ];
}

/** Every URL parameter this loader reads. */
const LOADER_PARAMS: readonly string[] = ["week", "day", "queue"];

/**
 * Opening or closing a Task drawer only toggles the `drawer` parameter, which this
 * loader does not read — yet React Router would otherwise re-run the whole week
 * (a schedule read, several Task reads, the Project signals) to produce
 * byte-for-byte the same answer. The same rule, for the same reason, as `/tasks`
 * and the Notes collection. Every change the loader DOES depend on still
 * revalidates through the default, and so does every submission and every
 * explicit `revalidate()` — which is how the row mutations refresh the week.
 */
export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  if (!isSameDocumentParameterChange(args)) {
    return args.defaultShouldRevalidate;
  }
  return parametersUnchanged(args, LOADER_PARAMS)
    ? false
    : args.defaultShouldRevalidate;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);

  let scope = null;
  try {
    scope = await resolveAuthenticatedWorkspaceScope(env, session);
  } catch {
    // Degrade, never blank: the week still renders with honest empty days and
    // says that something could not be read.
  }

  return loadPlanPage({
    scope,
    ownerId: session.user.subject,
    now: new Date(),
    weekOffset: parsePlanningWeekParam(url.searchParams.get("week")),
    requestedDay: url.searchParams.get("day"),
    requestedQueueSource: url.searchParams.get("queue"),
  });
}

export default function PlanRoute({ loaderData }: Route.ComponentProps) {
  return <PlanWorkspace data={loaderData} />;
}
