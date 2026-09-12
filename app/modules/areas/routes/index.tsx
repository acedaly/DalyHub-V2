/**
 * AREA-01 — Areas collection route (`/areas`).
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { parseCollectionPresentation } from "~/shared/collection-layout";
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
  const params = new URL(request.url).searchParams;
  const cursor = params.get("cursor") ?? undefined;
  /*
   * The presentation is read on the SERVER, so the first byte is already drawn
   * the way the URL asks for. Resolving it in the browser would flash the
   * default and then swap, which is the one thing a shareable view state must
   * not do.
   *
   * UNTITLED-05 — Areas offers a GALLERY and a TABLE, and the gallery is the
   * default. `?present=list` was the retired row list's value; it is not one of
   * this collection's presentations any more and falls to the default rather
   * than rendering nothing, which is exactly what `allowed` is for. The first
   * allowed presentation is the module's default.
   */
  const presentation = parseCollectionPresentation(params.get("present"), [
    "grid",
    "table",
  ]);

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const page = await scope.areas.listAreas({ cursor });
    return {
      areas: page.items.map(serializeAreaListItem),
      nextCursor: page.nextCursor,
      presentation,
      failed: false,
    };
  } catch {
    return {
      areas: [] as SerializedAreaListItem[],
      nextCursor: null as string | null,
      presentation,
      failed: true,
    };
  }
}

export default function AreasRoute({ loaderData }: Route.ComponentProps) {
  return (
    <AreasCollectionView
      areas={loaderData.areas}
      nextCursor={loaderData.nextCursor}
      presentation={loaderData.presentation}
      failed={loaderData.failed}
    />
  );
}
