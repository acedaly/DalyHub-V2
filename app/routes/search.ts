/**
 * DS-08 Shared Search — the server search endpoint (`GET /search`).
 *
 * A resource route (no UI) that runs global search on the server and returns a
 * bounded, grouped, display-ready {@link SearchOutcome} as JSON. It is the trusted
 * composition boundary and uses the SAME production path the kernel tests cover:
 *
 *   - authentication is guaranteed by the Worker boundary before this runs;
 *     `requireAuthenticatedSession` re-checks and fails **401** (not a Search
 *     result) if a session is somehow absent;
 *   - the workspace scope is resolved through the established FND-03/FND-09
 *     authenticated composition boundary (`resolveAuthenticatedWorkspaceScope`),
 *     which derives the scope from TRUSTED server configuration
 *     (`env.DEFAULT_WORKSPACE_ID`) and VERIFIES the workspace exists in D1 — the
 *     client cannot supply or influence a workspace id (ADR-010, ADR-013 §4.5,
 *     ADR-016 §5.6). There is no second resolver and no `workspaceContextFromId`
 *     shortcut here;
 *   - providers come only from `ModuleRegistry.listSearchProviders()` (registry
 *     discovery), never a manual array;
 *   - the pure orchestrator normalises/bounds the query, isolates provider
 *     failures (with a bounded per-provider deadline), validates output and
 *     enforces every limit.
 *
 * It fails **closed**: a missing/invalid `DEFAULT_WORKSPACE_ID`, a nonexistent
 * configured workspace, or a D1 lookup failure all resolve to the calm, retryable
 * Search failure outcome — never a crash and never an internal-detail leak. A
 * missing authenticated session stays a 401.
 *
 * The browser sends only the bounded `q` query and receives only bounded results —
 * never a workspace dataset. The raw query is not logged.
 */

import { env } from "cloudflare:workers";

import { discoverModuleRegistry } from "~/modules/discover-modules";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { executeSearch } from "~/shared/search/orchestrator";
import { SEARCH_QUERY_PARAM } from "~/shared/search/client";
import { failureOutcome } from "~/shared/search/model";
import type { SearchOutcome } from "~/shared/search/model";

import type { Route } from "./+types/search";

function json(outcome: SearchOutcome): Response {
  return new Response(JSON.stringify(outcome), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  // Authentication is authoritative: a missing session is a 401, NOT a Search
  // result. `requireAuthenticatedSession` throws a 401 Response, which propagates.
  const session = requireAuthenticatedSession(context);

  const url = new URL(request.url);
  const rawQuery = url.searchParams.get(SEARCH_QUERY_PARAM) ?? "";
  // The Universal Relationship System: when a record scopes the search, boost that
  // record's directly-linked entities so they surface first (server-resolved; the
  // client only names the anchor record, never the boost ids themselves).
  const boostLinkedTo = url.searchParams.get("boostLinkedTo");

  try {
    // The trusted, request-free, D1-verified workspace scope. The client cannot
    // choose it; this is the exact FND-09 boundary the kernel tests exercise.
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const registry = discoverModuleRegistry();

    let boostIds: ReadonlySet<string> | undefined;
    if (boostLinkedTo) {
      try {
        const page = await scope.entityLinks.listForEntity(boostLinkedTo, {
          direction: "both",
          limit: 100,
        });
        boostIds = new Set(page.items.map((view) => view.counterpart.id));
      } catch {
        // A missing/invalid anchor simply means no boost — never a search failure.
        boostIds = undefined;
      }
    }

    const outcome = await executeSearch({
      providers: registry.listSearchProviders(),
      context: { workspace: scope.context, ownerId: session.user.subject },
      rawQuery,
      // Group headings come from the SAME registry the providers came from: a
      // module declares what its entity type is called, so a type with no
      // visual identity of its own (a Project template wears the Project mark)
      // is still headed with a human label rather than its slug.
      entityLabels: new Map(
        registry
          .listEntityTypes()
          .map((entity) => [entity.type, entity.plural ?? entity.singular]),
      ),
      ...(boostIds && boostIds.size > 0 ? { boostIds } : {}),
    });
    return json(outcome);
  } catch {
    // Fail closed: a missing/invalid/nonexistent workspace or a D1 failure become
    // a safe, retryable Search failure — no internal detail leaks. (Auth failures
    // already threw a 401 above, outside this try.)
    return json(failureOutcome("", []));
  }
}
