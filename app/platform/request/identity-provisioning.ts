/**
 * IDENT-01 request platform — workspace-membership provisioning.
 *
 * Runs ONCE per authenticated HTTP request, immediately after the credential is
 * verified and before the React Router handler runs. It records the durable link
 * between the authenticated subject and the workspace, so the identity the
 * Activity stream already stores (`activities.actor_id` = the Access `sub`) has
 * something to resolve to.
 *
 * Why the request boundary and not the workspace composition: a document request
 * resolves the workspace scope once per LOADER, and provisioning is a write. The
 * boundary is the one place that runs exactly once per request.
 *
 * Cost is ONE statement. The workspace context is built from the trusted
 * configured id WITHOUT a lookup — the `workspace_members` foreign key already
 * refuses a nonexistent workspace, so a second existence query would buy nothing.
 *
 * It is BEST-EFFORT by design: identity plumbing must never turn a database
 * hiccup into a failed page. A failure is swallowed, the request proceeds, and
 * the next request retries; unresolved actors render as `Unknown user` rather
 * than as a wrong name.
 */

import type { AuthenticatedSession } from "~/kernel/auth";
import { workspaceContextFromId } from "~/kernel/workspaces";
import { createWorkspaceMemberRepository } from "~/platform/storage/d1";

/** The trusted server-side values provisioning reads. Both may be absent. */
export interface IdentityProvisioningEnv {
  readonly DB?: D1Database;
  readonly DEFAULT_WORKSPACE_ID?: string;
}

/** Provisions the membership row for an authenticated session. */
export type MemberProvisioner = (
  env: IdentityProvisioningEnv,
  session: AuthenticatedSession,
) => Promise<void>;

/**
 * Ensure the authenticated subject has a workspace-membership row carrying its
 * current email and provider display name. Idempotent: an unchanged identity
 * leaves the row's identity columns (and `updated_at`) untouched, and the
 * owner-curated display name and Person link are never overwritten.
 */
export const provisionAuthenticatedMember: MemberProvisioner = async (
  env,
  session,
) => {
  const workspaceId = env.DEFAULT_WORKSPACE_ID;
  if (!env.DB || workspaceId === undefined || workspaceId.trim().length === 0) {
    return;
  }
  const context = workspaceContextFromId(workspaceId);
  await createWorkspaceMemberRepository(env.DB, context).ensureMember({
    subject: session.user.subject,
    email: session.user.email,
    displayName: session.user.displayName,
  });
};

/**
 * Run a provisioner without ever failing the request. Any error — misconfigured
 * workspace id, storage outage, a migration not yet applied — is absorbed.
 */
export async function provisionMemberSafely(
  env: IdentityProvisioningEnv,
  session: AuthenticatedSession,
  provision: MemberProvisioner = provisionAuthenticatedMember,
): Promise<void> {
  try {
    await provision(env, session);
  } catch {
    // Deliberately silent: see the file header. Identity resolution degrades to
    // `Unknown user`, which is honest, rather than breaking the page.
  }
}
