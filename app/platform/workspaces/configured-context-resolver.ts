/**
 * FND-03 Workspace platform — the configured (single-user) context resolver.
 *
 * Resolves the active `WorkspaceContext` from TRUSTED server-side configuration:
 * a `DEFAULT_WORKSPACE_ID` environment binding. It implements the kernel's
 * `WorkspaceContextResolver` interface, whose `resolve()` takes NO arguments —
 * so no request header, cookie, query string, route parameter, form field or
 * JSON body can select or override the workspace scope (ADR-010).
 *
 * It fails CLOSED: missing configuration, a structurally invalid value, or a
 * configured id that does not exist in D1 all raise a typed workspace error and
 * never silently fall back to another workspace or fabricate one. Errors carry
 * no environment or database internals.
 *
 * FND-09 will add an authenticated session resolver implementing this same
 * interface; module repository contracts do not change when it does.
 */

import {
  WorkspaceConfigurationError,
  WorkspaceNotFoundError,
  createWorkspaceContext,
  parseWorkspaceId,
  type WorkspaceContext,
  type WorkspaceContextResolver,
  type WorkspaceRepository,
} from "~/kernel/workspaces";

/** What the configured resolver needs. Note there is deliberately no request
 * parameter anywhere in this shape. */
export interface ConfiguredWorkspaceContextResolverDeps {
  /**
   * The raw configured workspace id from server-side configuration
   * (`env.DEFAULT_WORKSPACE_ID`). May be undefined or blank in a misconfigured
   * environment — both fail closed.
   */
  readonly configuredWorkspaceId: string | undefined;
  /** The low-level workspace store, used to confirm the workspace exists. */
  readonly repository: WorkspaceRepository;
}

/**
 * Create a `WorkspaceContextResolver` bound to a configured default workspace.
 * `resolve()` validates the configured value, confirms the workspace exists, and
 * returns a typed context — or throws a typed workspace error.
 */
export function createConfiguredWorkspaceContextResolver(
  deps: ConfiguredWorkspaceContextResolverDeps,
): WorkspaceContextResolver {
  const { configuredWorkspaceId, repository } = deps;

  return {
    async resolve(): Promise<WorkspaceContext> {
      // 1. Configuration must be present and non-blank.
      if (
        configuredWorkspaceId === undefined ||
        configuredWorkspaceId.trim().length === 0
      ) {
        throw new WorkspaceConfigurationError(
          "DEFAULT_WORKSPACE_ID is not configured",
        );
      }

      // 2. It must be structurally valid. `parseWorkspaceId` throws
      //    `WorkspaceValidationError` (a safe, typed error) — it never echoes
      //    the raw value beyond the generic structural reason.
      const workspaceId = parseWorkspaceId(configuredWorkspaceId);

      // 3. It must actually exist in D1 — no silent fallback, no auto-create.
      //    `repository.exists` maps any raw storage failure to a safe
      //    `WorkspaceStorageError`, so database internals never leak here.
      if (!(await repository.exists(workspaceId))) {
        throw new WorkspaceNotFoundError(
          "The configured workspace does not exist",
        );
      }

      // 4. A workspace id is a scope identifier, not an auth secret (ADR-010):
      //    existence is the whole check at this phase.
      return createWorkspaceContext(workspaceId);
    },
  };
}
