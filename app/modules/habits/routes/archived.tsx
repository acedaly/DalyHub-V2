/**
 * HABITS-01 — the archived Habits view (`/habits/archived`).
 *
 * The SAME collection, the SAME loader body and the SAME component as `/habits`
 * — only the lifecycle scope differs. Archived Habits keep every check-in they
 * earned and remain fully readable: archiving is putting a behaviour down, not
 * failing at it, and the surface says so rather than hiding the record.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";

import { HabitsCollection } from "../HabitsCollection";
import { loadHabitsCollection } from "../habits-load.server";
import type { Route } from "./+types/archived";

export function meta() {
  return [
    { title: "Archived habits · DalyHub" },
    {
      name: "description",
      content: "Habits you have put away, with the history they earned.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadHabitsCollection({ env, session, request, archived: true });
}

export default function ArchivedHabitsRoute({
  loaderData,
}: Route.ComponentProps) {
  return <HabitsCollection {...loaderData} />;
}
