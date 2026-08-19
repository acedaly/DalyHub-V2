/**
 * HABITS-01 — the Habits collection route (`/habits`).
 *
 * The trusted server boundary for the bounded, workspace-scoped ACTIVE Habits
 * collection: it reads the authoritative `HabitRepository` through the
 * authenticated composition boundary and hands the presentational collection a
 * finished, JSON-safe page.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";

import { HabitsCollection } from "../HabitsCollection";
import { loadHabitsCollection } from "../habits-load.server";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Habits · DalyHub" },
    {
      name: "description",
      content: "The behaviours you are practising, and how they are going.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadHabitsCollection({ env, session, request });
}

export default function HabitsRoute({ loaderData }: Route.ComponentProps) {
  return <HabitsCollection {...loaderData} />;
}
