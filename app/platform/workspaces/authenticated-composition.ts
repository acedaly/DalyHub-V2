/**
 * FND-09 Workspace platform — authenticated request composition.
 *
 * Authentication answers "WHO is making the request?"; workspace resolution
 * answers "WHICH trusted data scope is active?". These stay separate (ADR-016
 * §5.6): the authenticated session NEVER selects the workspace. The workspace is
 * still resolved from trusted server configuration (`DEFAULT_WORKSPACE_ID`) via
 * the existing request-free resolver — no header, JWT claim, route param, query
 * string, cookie, form field or JSON body can choose it.
 *
 * What FND-09 adds is the trusted Activity ACTOR: the validated session's stable
 * subject becomes `{ type: "user", id: session.user.subject }`, threaded into the
 * same workspace-scoped repositories the kernel already builds. The email is
 * never used as the actor id (a subject is stable; an email can change). Module
 * method calls cannot supply or override the actor.
 */

import { createActivityActorContext } from "~/kernel/activity";
import type { AuthenticatedSession } from "~/kernel/auth";

import {
  bindWorkspaceRepositories,
  createWorkspaceContextResolver,
  startOwnerPreferencesRead,
  type WorkspaceScope,
  type WorkspaceScopeEnv,
} from "./composition";

/**
 * Resolve the workspace scope for an authenticated request. Composes:
 *
 *     validated session
 *       + configured WorkspaceContext (trusted, request-free)
 *       + Activity actor { type: "user", id: session.user.subject }
 *       + workspace-scoped repositories (entities, entityLinks, spine, activity)
 *
 * The entity, EntityLink and spine repositories all record Activity with this
 * SAME `user` actor. Fails closed (typed workspace error) if the configured
 * workspace cannot be resolved — authentication succeeding never fabricates or
 * broadens a scope.
 */
export async function resolveAuthenticatedWorkspaceScope(
  env: WorkspaceScopeEnv,
  session: AuthenticatedSession,
): Promise<WorkspaceScope> {
  const actorContext = createActivityActorContext({
    type: "user",
    id: session.user.subject,
  });
  /*
   * PERF-01 — the owner's preferences read is STARTED before the workspace
   * existence check is awaited, because it never depended on the answer. See
   * `startOwnerPreferencesRead`: it is best-effort and it is not an authority.
   * The existence check below is unchanged and still decides everything — a
   * workspace that does not resolve still fails closed, with the warm read
   * discarded unused.
   */
  const warm = startOwnerPreferencesRead(env, actorContext);
  const context = await createWorkspaceContextResolver(env).resolve();
  return bindWorkspaceRepositories(env, context, actorContext, warm);
}
