/**
 * V2.10 LIFE-02 — the candidate-subject search (`/obligations/subjects`).
 *
 * A loader-only resource route (no UI). It answers "which of my records could
 * this obligation be about?" using `searchLinkTargets` — the SAME bounded,
 * workspace-scoped, accessible-only search the link picker uses. Reusing it is
 * what guarantees the subject picker and the link picker can never disagree
 * about which records exist, and it means this route holds no SQL of its own.
 *
 * There is no anchor to exclude: a new obligation has no id yet, so the empty
 * anchor excludes nothing, which is the correct answer rather than a special
 * case.
 */

import { env } from "cloudflare:workers";

import {
  SUPPORTED_LINK_ENTITY_TYPES,
  searchLinkTargets,
} from "~/platform/entity-links";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/subjects";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const targets = await searchLinkTargets(
      {
        entities: scope.entities,
        entityLinks: scope.entityLinks,
      },
      {
        anchorId: "",
        query,
        targetTypes: [...SUPPORTED_LINK_ENTITY_TYPES],
      },
    );
    return json({
      options: targets.map((target) => ({
        id: target.id,
        type: target.type,
        title: target.title,
      })),
    });
  } catch {
    // Fail closed and calm: no options, never a 500 that breaks a form.
    return json({ options: [] });
  }
}
