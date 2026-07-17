/**
 * FND-03 Workspace kernel — the workspace context and its resolver seam.
 *
 * `WorkspaceContext` is the small, trusted value that scopes all module data
 * access. Module code never chooses a workspace: it receives a repository
 * already bound to one `WorkspaceContext`, established at the server composition
 * boundary from trusted server-side configuration (today) or an authenticated
 * session (FND-09). See ADR-010.
 *
 * The `WorkspaceContextResolver` interface is deliberately request-free:
 * `resolve()` takes NO arguments. There is structurally no way to pass a
 * request, header, cookie, query string, route param, form field or JSON body
 * into resolution, so untrusted input cannot select or override workspace scope.
 * FND-09 will supply an authenticated implementation of this same interface
 * without changing module repository contracts.
 */

import { parseWorkspaceId, type WorkspaceId } from "./workspace";

/**
 * The scope that a workspace-bound repository carries. Intentionally tiny: just
 * the validated workspace id. It is a scope identifier, not an auth token.
 */
export type WorkspaceContext = {
  readonly workspaceId: WorkspaceId;
};

/**
 * Construct a `WorkspaceContext` from an already-validated `WorkspaceId`.
 * Kept as a named factory so the context is always built the same way and stays
 * a plain, immutable value.
 */
export function createWorkspaceContext(
  workspaceId: WorkspaceId,
): WorkspaceContext {
  return { workspaceId };
}

/**
 * Build a `WorkspaceContext` from an untrusted string, validating it first.
 * Throws `WorkspaceValidationError` if the id is not structurally valid. This
 * does NOT confirm the workspace exists in storage — existence is checked by the
 * resolver against D1 (see `app/platform/workspaces`).
 */
export function workspaceContextFromId(value: unknown): WorkspaceContext {
  return createWorkspaceContext(parseWorkspaceId(value));
}

/**
 * Resolves the active `WorkspaceContext` from trusted server-side state.
 *
 * Implementations MUST NOT accept any request-derived input — the interface has
 * no parameter for it by design. The single-user implementation resolves one
 * configured default workspace and confirms it exists; a future authenticated
 * implementation (FND-09) resolves the session's workspace. Either way, callers
 * depend only on this interface.
 */
export interface WorkspaceContextResolver {
  /** Resolve the active workspace context, or fail closed with a typed error. */
  resolve(): Promise<WorkspaceContext>;
}
