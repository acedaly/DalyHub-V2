/**
 * FND-03 Workspace platform — public surface for the composition boundary.
 *
 * Server code (loaders, actions, future modules) obtains a workspace-scoped
 * entity repository from here: `resolveWorkspaceScope(env)` runs the trusted,
 * request-free resolver and returns a `WorkspaceContext` plus its bound
 * `EntityRepository` (ADR-010). The configured resolver is also exported for
 * callers that need only the resolver seam.
 */

export {
  resolveWorkspaceScope,
  bindWorkspaceRepositories,
  createWorkspaceContextResolver,
  type WorkspaceScope,
  type WorkspaceScopeEnv,
} from "./composition";

export { resolveAuthenticatedWorkspaceScope } from "./authenticated-composition";

export {
  createConfiguredWorkspaceContextResolver,
  type ConfiguredWorkspaceContextResolverDeps,
} from "./configured-context-resolver";
