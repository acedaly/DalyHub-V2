/**
 * PEOPLE-01 — the Archived People route (`/people/archived`).
 *
 * The dedicated, explicit restore surface: it lists ONLY archived People (not
 * deleted), newest first, with bounded cursor pagination. Each row carries a
 * one-click "Restore" action (`PeopleCollection`). Same trusted boundary and
 * calm-failure contract as `/people`.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { PeopleCollectionView } from "../PeopleCollection";
import {
  serializePersonListItem,
  type SerializedPersonListItem,
} from "../person-view";
import type { Route } from "./+types/archived";

export function meta() {
  return [
    { title: "Archived people · DalyHub" },
    { name: "description", content: "People you have archived." },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    // Deliberately NO PEOPLE-03 stay-in-touch signal here. Archiving a Person is a
    // reversible "put away"; telling the owner that someone they filed away is due
    // for a catch-up would be exactly the nagging AGENTS.md §5 rules out. The
    // relationship is still fully derived on the record itself.
    const page = await scope.people.list({ status: "archived", cursor });
    return {
      people: page.items.map((person) => serializePersonListItem(person)),
      nextCursor: page.nextCursor,
      view: "archived" as const,
      failed: false,
    };
  } catch {
    return {
      people: [] as SerializedPersonListItem[],
      nextCursor: null as string | null,
      view: "archived" as const,
      failed: true,
    };
  }
}

export default function ArchivedPeopleRoute({
  loaderData,
}: Route.ComponentProps) {
  return (
    <PeopleCollectionView
      people={loaderData.people}
      nextCursor={loaderData.nextCursor}
      failed={loaderData.failed}
      view="archived"
    />
  );
}
