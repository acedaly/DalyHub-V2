/**
 * FND-03 Workspace platform — the server-side composition boundary.
 *
 * A small, explicit function that demonstrates and implements the intended
 * dependency flow (ADR-010):
 *
 *     environment
 *       → workspace resolver        (trusted, request-free)
 *       → WorkspaceContext          (validated + confirmed to exist)
 *       → workspace-scoped EntityRepository
 *
 * Future loaders, actions and modules obtain their scoped repository through
 * this seam rather than constructing workspace scope themselves. There is no
 * service container or dependency-injection framework — dependencies are passed
 * explicitly (ADR-010: no global mutable state, no AsyncLocalStorage).
 */

import {
  createSystemActorContext,
  type ActivityActorContext,
  type ActivityRepository,
} from "~/kernel/activity";
import type { EntityRepository } from "~/kernel/entities";
import type { EntityLinkRepository } from "~/kernel/entity-links";
import type { SpineRepository } from "~/kernel/spine";
import type {
  WorkspaceContext,
  WorkspaceContextResolver,
} from "~/kernel/workspaces";
import {
  createActivityRepository,
  createEntityLinkRepository,
  createEntityRepository,
  createSpineRepository,
  createWorkspaceRepository,
} from "~/platform/storage/d1";

import { createConfiguredWorkspaceContextResolver } from "./configured-context-resolver";

/**
 * The minimal server environment this boundary reads. `DEFAULT_WORKSPACE_ID` is
 * trusted server-side configuration (a Worker `var`), never a request value.
 */
export interface WorkspaceScopeEnv {
  readonly DB: D1Database;
  readonly DEFAULT_WORKSPACE_ID?: string;
}

/**
 * A resolved workspace scope: the context plus every workspace-scoped repository,
 * all bound to the SAME `WorkspaceContext`. The entity, EntityLink, spine and
 * Activity repositories are exposed here so module code obtains them through this
 * single seam rather than constructing scope itself. The `spine` repository is the
 * authoritative Area → Goal → Project → Task domain repository (FND-07 / ADR-014),
 * sharing the same trusted actor. The `activity` repository is READ-ONLY (FND-05 /
 * ADR-012): events are appended only as the atomic side effect of a mutation,
 * using the trusted actor established below.
 */
export interface WorkspaceScope {
  readonly context: WorkspaceContext;
  readonly entities: EntityRepository;
  readonly entityLinks: EntityLinkRepository;
  readonly spine: SpineRepository;
  readonly activity: ActivityRepository;
}

/**
 * Build the configured workspace context resolver for an environment. Exposed so
 * callers that only need the resolver (or want to resolve once and reuse the
 * context) can, without duplicating the wiring.
 */
export function createWorkspaceContextResolver(
  env: WorkspaceScopeEnv,
): WorkspaceContextResolver {
  return createConfiguredWorkspaceContextResolver({
    configuredWorkspaceId: env.DEFAULT_WORKSPACE_ID,
    repository: createWorkspaceRepository(env.DB),
  });
}

/**
 * Resolve the active workspace scope for a request/environment: derive the
 * `WorkspaceContext` from trusted configuration and return it together with the
 * entity, EntityLink and (read-only) Activity repositories, all bound to that SAME
 * context. The intended dependency flow (ADR-012) is realised here:
 *
 *     environment
 *       → WorkspaceContext
 *       → trusted Activity actor context   (a `system` actor today; FND-09 swaps
 *                                            in an authenticated `user` actor)
 *       → EntityRepository                 (records Activity with that actor)
 *       → EntityLinkRepository             (records Activity with that actor)
 *       → ActivityRepository               (reads)
 *
 * The actor context is constructed ONCE, server-side, and threaded into both
 * mutation repositories — module calls cannot spoof it through a parameter. Fails
 * closed (throws a typed workspace error) if the workspace cannot be resolved.
 */
export async function resolveWorkspaceScope(
  env: WorkspaceScopeEnv,
): Promise<WorkspaceScope> {
  const context = await createWorkspaceContextResolver(env).resolve();
  return bindWorkspaceRepositories(env, context, createSystemActorContext());
}

/**
 * Bind every workspace-scoped repository to the SAME trusted `WorkspaceContext`
 * and the SAME trusted Activity actor context. This is the single place the actor
 * is threaded into the mutation repositories, so module code can never supply or
 * override it (ADR-012, ADR-016 §5.6). FND-09's authenticated composition reuses
 * this with a `user` actor; the default request composition uses the `system`
 * actor.
 */
export function bindWorkspaceRepositories(
  env: WorkspaceScopeEnv,
  context: WorkspaceContext,
  actorContext: ActivityActorContext,
): WorkspaceScope {
  const entities = createEntityRepository(env.DB, context, { actorContext });
  const entityLinks = createEntityLinkRepository(env.DB, context, {
    actorContext,
  });
  const spine = createSpineRepository(env.DB, context, { actorContext });
  const activity = createActivityRepository(env.DB, context);
  return { context, entities, entityLinks, spine, activity };
}
