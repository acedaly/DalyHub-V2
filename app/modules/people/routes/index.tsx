/**
 * PEOPLE-01 — the real People collection route (`/people`).
 *
 * Replaces the PX-03 `ModuleComingSoon` placeholder. The trusted server boundary
 * for the bounded, workspace-scoped People collection: it reads the authoritative
 * `PersonRepository` through the authenticated composition boundary, then renders
 * the presentational `PeopleCollectionView`. A scope/list failure degrades to a
 * calm error state so the shell stays usable — never a 500 (mirrors
 * `~/modules/notes/routes/index.tsx`).
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { PeopleCollectionView } from "../PeopleCollection";
import { serializePeoplePage } from "../person-collection-relationships";
import { type SerializedPersonListItem } from "../person-view";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "People · DalyHub" },
    {
      name: "description",
      content: "The people in your life — care, not a CRM.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const page = await scope.people.list({ status: "active", cursor });
    // PEOPLE-03 — ONE batched relationship read for the WHOLE page (never one per
    // card); see `person-collection-relationships.ts`.
    return {
      people: await serializePeoplePage(
        scope.relationships,
        scope.ownerTimeZone,
        page.items,
      ),
      nextCursor: page.nextCursor,
      view: "all" as const,
      failed: false,
    };
  } catch {
    return {
      people: [] as SerializedPersonListItem[],
      nextCursor: null as string | null,
      view: "all" as const,
      failed: true,
    };
  }
}

export default function PeopleRoute({ loaderData }: Route.ComponentProps) {
  return (
    <PeopleCollectionView
      people={loaderData.people}
      nextCursor={loaderData.nextCursor}
      failed={loaderData.failed}
      view="all"
    />
  );
}
