/**
 * FND-09 request platform — the authenticated request boundary.
 *
 * The single function the Worker entry delegates to (ADR-016 §5.5, §10). It runs
 * BEFORE the React Router handler, so no protected loader or action can execute
 * before authentication succeeds: on failure it returns a generic response and
 * NEVER invokes `requestHandler`. `/health` is the only public application path,
 * matched EXACTLY, and its bypass covers only safe methods. The validated session
 * is passed into loaders via React Router's typed request context (never a client
 * header), and baseline security headers are applied to every response.
 *
 * AUDIT-FIX-04 adds the second boundary guarantee: an authenticated MUTATION must
 * also prove it came from DalyHub's own origin (`./mutation-provenance`). This is
 * the one place that check belongs — it runs before every protected loader and
 * action, so it covers every current and future mutation route without a single
 * per-route check.
 *
 * The authenticator factory is injectable so tests can drive every branch without
 * a live Access application or network, while production wires the real
 * `createAuthenticator`.
 */

import { RouterContextProvider } from "react-router";

import type { Authenticator } from "~/kernel/auth";
import { createAuthenticator, type AuthConfigEnv } from "~/platform/auth";

import { setAuthenticatedSession } from "./authenticated-request-context";
import {
  provisionMemberSafely,
  type IdentityProvisioningEnv,
  type MemberProvisioner,
} from "./identity-provisioning";
import {
  evaluateMutationProvenance,
  isSafeMethod,
  trustedOriginFor,
} from "./mutation-provenance";
import {
  buildCrossOriginRejectionResponse,
  buildUnauthenticatedResponse,
  withSecurityHeaders,
} from "./security-headers";

/** The React Router request handler signature this boundary drives. */
export type ReactRouterRequestHandler = (
  request: Request,
  context?: RouterContextProvider,
) => Promise<Response>;

/** Builds the request authenticator for an environment. */
export type AuthenticatorFactory = (env: AuthConfigEnv) => Authenticator;

/** Everything the boundary reads from the environment. */
export type RequestBoundaryEnv = AuthConfigEnv & IdentityProvisioningEnv;

/**
 * Application routes that are public at the DalyHub layer. Matched EXACTLY, so
 * `/health-anything` or `/api/health/private` are NOT treated as public.
 */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set(["/health"]);

/** True when a path is public (exact match only). */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

/**
 * Handle a request at the authenticated boundary.
 *
 * The order is the contract (AUDIT-FIX-04):
 *
 *   1. a public path on a SAFE method is served without authentication;
 *   2. every other request is authenticated first, so an unauthenticated
 *      protected request keeps its existing `401`/`403`/`503` answer and a CSRF
 *      check can never mask an authentication failure;
 *   3. an authenticated MUTATION must then prove it came from DalyHub's own
 *      origin — and a request that fails is answered here, before anything else
 *      happens. Membership is NOT provisioned, the React Router handler is NOT
 *      invoked, so no loader or action runs, no repository is touched, no
 *      Activity is recorded and no data changes;
 *   4. only then is membership provisioned and the handler invoked;
 *   5. every response, accepted or rejected, leaves with the baseline security
 *      headers.
 *
 * Provenance sits AFTER authentication on purpose: an anonymous cross-origin
 * probe should learn nothing more than that it is unauthenticated, and the
 * rejection path should not be reachable without a valid session.
 */
export async function handleAuthenticatedRequest(
  request: Request,
  env: RequestBoundaryEnv,
  requestHandler: ReactRouterRequestHandler,
  authenticatorFactory: AuthenticatorFactory = createAuthenticator,
  provisionMember?: MemberProvisioner,
): Promise<Response> {
  const { pathname } = new URL(request.url);

  // The public-path bypass is limited to the SAFE methods `/health` actually
  // supports, so an exact public-path match can never become a hole through
  // which an unsafe method skips both authentication AND provenance. An unsafe
  // method on `/health` takes the protected path below and is answered there.
  if (isPublicPath(pathname) && isSafeMethod(request.method)) {
    const response = await requestHandler(request);
    return withSecurityHeaders(response, { authenticated: false });
  }

  let context: RouterContextProvider;
  let session;
  try {
    session = await authenticatorFactory(env).authenticate(request);
    context = new RouterContextProvider();
    setAuthenticatedSession(context, session);
  } catch (error) {
    // Return BEFORE invoking the handler: no protected loader/action runs.
    return buildUnauthenticatedResponse(error);
  }

  // Authenticated, but is this DalyHub's own request? A valid Access cookie is
  // attached by the browser because of where the request is GOING, not because
  // of who asked for it. Returns BEFORE provisioning and before the handler.
  const provenance = evaluateMutationProvenance(
    request,
    trustedOriginFor(request),
  );
  if (!provenance.allowed) {
    return buildCrossOriginRejectionResponse();
  }

  // IDENT-01: record the subject ↔ workspace membership exactly once per
  // request, so every event this request goes on to record is resolvable to a
  // real name. Best-effort — it can never fail the request (see its module).
  await provisionMemberSafely(env, session, provisionMember);

  const response = await requestHandler(request, context);
  return withSecurityHeaders(response, { authenticated: true });
}
