/**
 * PEOPLE-01 — the Recent People route (`/people/recent`).
 *
 * A bounded glance at the people most recently added to People (active only,
 * newest first). It is deliberately un-paginated — "recent" is a small window,
 * not the whole collection — so it hands the view a null cursor. Same trusted
 * boundary and calm-failure contract as `/people`.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { PeopleCollectionView } from "../PeopleCollection";
import {
  serializePersonListItem,
  type SerializedPersonListItem,
} from "../person-view";
import type { Route } from "./+types/recent";

const RECENT_LIMIT = 12;

export function meta() {
  return [
    { title: "Recent people · DalyHub" },
    { name: "description", content: "People you added most recently." },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const page = await scope.people.list({
      status: "active",
      limit: RECENT_LIMIT,
    });
    return {
      people: page.items.map(serializePersonListItem),
      nextCursor: null as string | null,
      view: "recent" as const,
      failed: false,
    };
  } catch {
    return {
      people: [] as SerializedPersonListItem[],
      nextCursor: null as string | null,
      view: "recent" as const,
      failed: true,
    };
  }
}

export default function RecentPeopleRoute({
  loaderData,
}: Route.ComponentProps) {
  return (
    <PeopleCollectionView
      people={loaderData.people}
      nextCursor={loaderData.nextCursor}
      failed={loaderData.failed}
      view="recent"
    />
  );
}
