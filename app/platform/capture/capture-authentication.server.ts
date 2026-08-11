/**
 * CAPTURE-01 — authenticating an external capture.
 *
 * The capture endpoint is reached WITHOUT a Cloudflare Access session, so this
 * module is the whole of its authentication. It is deliberately the narrowest
 * authentication path in DalyHub and it fails closed at every step.
 *
 * ── The order, and what each step refuses to leak ───────────────────────────
 *   1. read a `Bearer dhcap_…` token. A malformed header, a missing header, a
 *      token of the wrong shape: all become the SAME `invalid_capture_token`,
 *      because telling a prober which one it was is telling it how to improve;
 *   2. resolve the workspace from TRUSTED SERVER CONFIGURATION — the same
 *      `DEFAULT_WORKSPACE_ID` path every authenticated request uses (ADR-010).
 *      The request has no say. This is what makes CAPTURE-01 §36 structural: a credential
 *      is looked up INSIDE the configured workspace, so a token minted elsewhere
 *      is simply not found;
 *   3. look the credential up by the SHA-256 digest of the token. The stored
 *      value is the digest, so this comparison is an indexed equality on a
 *      value that is useless if it leaks;
 *   4. evaluate revocation and expiry against ONE clock. Revocation takes effect
 *      on the very next request — there is no session to outlive it (CAPTURE-01 §14).
 *
 * The workspace ACTOR for a capture is `{ type: "integration", id: <tokenId> }`,
 * an actor type the identity kernel already understands and labels. That is the
 * honest reading: the record was created by a capture device the owner
 * authorised, not by a signed-in DalyHub session — and it means a capture can
 * never be mistaken in the audit trail for something the owner did at a keyboard.
 */

import { createActivityActorContext } from "~/kernel/activity";
import {
  CaptureCredentialError,
  captureTokenIsUsable,
  hashCaptureToken,
  readBearerCaptureToken,
  type CaptureTokenRecord,
} from "~/kernel/capture";
import { createCaptureTokenRepository } from "~/platform/storage/d1";
import {
  bindWorkspaceRepositories,
  createWorkspaceContextResolver,
  type WorkspaceScope,
  type WorkspaceScopeEnv,
} from "~/platform/workspaces";

/** The result of authenticating a capture request. */
export type AuthenticatedCapture = {
  /** The workspace scope, bound to the credential's workspace and actor. */
  readonly scope: WorkspaceScope;
  /** The credential itself. Never carries the token or its digest. */
  readonly credential: CaptureTokenRecord;
};

/**
 * The Activity actor type used for external capture. `integration` is an existing
 * member of the open actor vocabulary (`app/kernel/identity`), already rendered
 * with a proper label by the one canonical actor-resolution rule.
 */
export const CAPTURE_ACTOR_TYPE = "integration";

/**
 * Authenticate a capture request, or throw {@link CaptureCredentialError}.
 *
 * `now` is injected so token expiry is testable without touching the clock.
 */
export async function authenticateCaptureRequest(
  env: WorkspaceScopeEnv,
  request: Request,
  now: Date,
): Promise<AuthenticatedCapture> {
  const token = readBearerCaptureToken(request.headers.get("authorization"));
  if (token === null) throw new CaptureCredentialError();

  const tokenHash = await hashCaptureToken(token);

  // The workspace comes from configuration, never from the request. A resolution
  // failure is reported as an invalid credential rather than as a configuration
  // error: an external caller learns nothing about DalyHub's internal state.
  let scope: WorkspaceScope;
  let credential: CaptureTokenRecord | null;
  try {
    const context = await createWorkspaceContextResolver(env).resolve();
    // ONE repository for the lookup, not a whole scope. The full scope binds
    // every workspace repository and its trusted ACTOR, and the actor is the
    // credential's id — which is not known yet. Constructing a throwaway scope
    // with a placeholder actor just to read one row would build thirty
    // repositories bound to an actor that names nothing.
    credential = await createCaptureTokenRepository(env.DB, context).findByHash(
      tokenHash,
    );
    if (credential === null || !captureTokenIsUsable(credential, now)) {
      throw new CaptureCredentialError();
    }
    // Now the actor IS known, so the scope is bound once, correctly, and every
    // repository on it records Activity as this capture device.
    scope = bindWorkspaceRepositories(
      env,
      context,
      createActivityActorContext({
        type: CAPTURE_ACTOR_TYPE,
        id: credential.id,
      }),
    );
  } catch (cause) {
    if (cause instanceof CaptureCredentialError) throw cause;
    throw new CaptureCredentialError();
  }

  return { scope, credential };
}

/**
 * Record that a credential was used. Best-effort by contract: "last used" is a
 * convenience in Settings, and it must never be able to fail a capture.
 */
export async function touchCaptureCredential(
  scope: WorkspaceScope,
  credentialId: string,
  at: Date,
): Promise<void> {
  try {
    await scope.captureTokens.markUsed(credentialId, at);
  } catch {
    // Deliberately swallowed — see above.
  }
}
