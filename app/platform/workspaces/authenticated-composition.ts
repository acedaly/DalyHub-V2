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
export interface AuthenticatedScopeOptions {
  /**
   * PERF-01 — start the owner's preference read BEFORE the workspace existence
   * check is awaited, instead of lazily on first use.
   *
   * **Opt-in, and it has to be.** Every authenticated loader begins with the
   * same two round trips in sequence — confirm the configured workspace exists,
   * then read the owner's preference row — and the second never depended on the
   * first: the row is addressed by the configured workspace id and the trusted
   * actor, both known before the check is issued. Starting it first collapses
   * two waves into one, which is worth a round trip on `/today`, `/tasks`,
   * `/projects`, `/goals`, `/obligations`, `/finance` and `/analytics`.
   *
   * It is worth NOTHING to the ~300 other callers of this function. `/search`,
   * `/links`, `/commands`, every mutation action and most resource routes never
   * read `appPreferences`, `ownerTimeZone` or `ownerTodayIso` at all, so an
   * unconditional warm-up would spend a `owner_app_preferences` statement per
   * request to answer a question nobody asks — trading one round trip on seven
   * routes for one statement on all of them. Found by the automated review of
   * this change, and it was right.
   *
   * So the caller says. A caller that omits this keeps exactly the behaviour it
   * had: the read stays lazy, and `ownerTimeZone()` still memoises it on first
   * use for anyone who asks later.
   */
  readonly warmOwnerPreferences?: boolean;
}

export async function resolveAuthenticatedWorkspaceScope(
  env: WorkspaceScopeEnv,
  session: AuthenticatedSession,
  options: AuthenticatedScopeOptions = {},
): Promise<WorkspaceScope> {
  const actorContext = createActivityActorContext({
    type: "user",
    id: session.user.subject,
  });
  /*
   * See `startOwnerPreferencesRead`: it is best-effort and it is not an
   * authority. The existence check below is unchanged and still decides
   * everything — a workspace that does not resolve still fails closed, with the
   * warm read discarded unused.
   */
  const warm =
    options.warmOwnerPreferences === true
      ? startOwnerPreferencesRead(env, actorContext)
      : undefined;
  const context = await createWorkspaceContextResolver(env).resolve();
  return bindWorkspaceRepositories(env, context, actorContext, warm);
}
