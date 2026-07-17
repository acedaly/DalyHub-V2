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

import type { EntityRepository } from "~/kernel/entities";
import type { EntityLinkRepository } from "~/kernel/entity-links";
import type {
  WorkspaceContext,
  WorkspaceContextResolver,
} from "~/kernel/workspaces";
import {
  createEntityLinkRepository,
  createEntityRepository,
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
 * A resolved workspace scope: the context plus every workspace-scoped
 * repository, all bound to the SAME `WorkspaceContext`. Both the entity and the
 * EntityLink repositories are exposed here (FND-04 / ADR-011) so module code
 * obtains them through this single seam rather than constructing scope itself.
 * There is deliberately no unscoped link repository in the module-facing surface.
 */
export interface WorkspaceScope {
  readonly context: WorkspaceContext;
  readonly entities: EntityRepository;
  readonly entityLinks: EntityLinkRepository;
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
 * entity and EntityLink repositories, both already bound to that SAME context.
 * Fails closed (throws a typed workspace error) if the workspace cannot be
 * resolved.
 */
export async function resolveWorkspaceScope(
  env: WorkspaceScopeEnv,
): Promise<WorkspaceScope> {
  const context = await createWorkspaceContextResolver(env).resolve();
  const entities = createEntityRepository(env.DB, context);
  const entityLinks = createEntityLinkRepository(env.DB, context);
  return { context, entities, entityLinks };
}
