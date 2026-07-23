/**
 * AREA-01 — Areas collection route (`/areas`).
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { AreasCollectionView } from "../AreasCollection";
import {
  serializeAreaListItem,
  type SerializedAreaListItem,
} from "../area-view";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Areas · DalyHub" },
    {
      name: "description",
      content:
        "The permanent domains of life that hold Goals, Projects and Tasks.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const page = await scope.areas.listAreas({ cursor });
    return {
      areas: page.items.map(serializeAreaListItem),
      nextCursor: page.nextCursor,
      failed: false,
    };
  } catch {
    return {
      areas: [] as SerializedAreaListItem[],
      nextCursor: null as string | null,
      failed: true,
    };
  }
}

export default function AreasRoute({ loaderData }: Route.ComponentProps) {
  return (
    <AreasCollectionView
      areas={loaderData.areas}
      nextCursor={loaderData.nextCursor}
      failed={loaderData.failed}
    />
  );
}
