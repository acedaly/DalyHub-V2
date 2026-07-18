/**
 * FND-09 request platform — the authenticated request boundary.
 *
 * The single function the Worker entry delegates to (ADR-016 §5.5, §10). It runs
 * BEFORE the React Router handler, so no protected loader or action can execute
 * before authentication succeeds: on failure it returns a generic response and
 * NEVER invokes `requestHandler`. `/health` is the only public application path,
 * matched EXACTLY. The validated session is passed into loaders via React Router's
 * typed request context (never a client header), and baseline security headers are
 * applied to every response.
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
 * Handle a request at the authenticated boundary. Public paths pass straight to
 * the handler; every other request is authenticated first, and only on success is
 * the handler invoked with the session-carrying context.
 */
export async function handleAuthenticatedRequest(
  request: Request,
  env: AuthConfigEnv,
  requestHandler: ReactRouterRequestHandler,
  authenticatorFactory: AuthenticatorFactory = createAuthenticator,
): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (isPublicPath(pathname)) {
    const response = await requestHandler(request);
    return withSecurityHeaders(response, { authenticated: false });
  }

  let context: RouterContextProvider;
  try {
    const session = await authenticatorFactory(env).authenticate(request);
    context = new RouterContextProvider();
    setAuthenticatedSession(context, session);
  } catch (error) {
    // Return BEFORE invoking the handler: no protected loader/action runs.
    return buildUnauthenticatedResponse(error);
  }

  const response = await requestHandler(request, context);
  return withSecurityHeaders(response, { authenticated: true });
}
