/**
 * FND-09 request platform — the trusted server-side authenticated context.
 *
 * The Worker request boundary authenticates BEFORE any loader/action runs and
 * places the validated session into React Router's typed request context. Loaders
 * and actions read it from there — never from a client-supplied header — so the
 * authenticated identity reaching a loader is always the one the boundary
 * verified (ADR-016 §5.5, §10). The raw JWT is deliberately NOT part of this
 * context; only the minimal, already-safe session is.
 *
 * This is the server-side security context, distinct from any React client
 * context: a client context may expose the safe display email, but authorization
 * lives here on the server.
 */

import { createContext, type RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";

/**
 * The typed context slot carrying the authenticated session for a request.
 * Defaults to `null` — an unauthenticated request never reaches a protected
 * loader, but the default lets a loader detect the impossible case and fail
 * closed rather than dereference undefined.
 */
export const authenticatedSessionContext =
  createContext<AuthenticatedSession | null>(null);

/** Place the boundary-validated session into the request context (server only). */
export function setAuthenticatedSession(
  context: RouterContextProvider,
  session: AuthenticatedSession,
): void {
  context.set(authenticatedSessionContext, session);
}

/** Read the authenticated session, or null when absent. */
export function getAuthenticatedSession(
  context: Readonly<RouterContextProvider>,
): AuthenticatedSession | null {
  return context.get(authenticatedSessionContext);
}

/**
 * Read the authenticated session or fail closed. A protected loader/action should
 * never run without a session (the boundary guarantees it); this is defence in
 * depth — if it somehow does, respond 401 rather than proceed unauthenticated.
 */
export function requireAuthenticatedSession(
  context: Readonly<RouterContextProvider>,
): AuthenticatedSession {
  const session = getAuthenticatedSession(context);
  if (session === null) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session;
}

/**
 * The safe display identity for the shell: just the verified email. Never exposes
 * the subject, token or raw claims to the client.
 */
export function getDisplayIdentity(context: Readonly<RouterContextProvider>): {
  readonly email: string;
} {
  return { email: requireAuthenticatedSession(context).user.email };
}

/**
 * AUDIT-10 — the per-response CSP nonce.
 *
 * The request boundary mints one nonce per request, writes it into the
 * `Content-Security-Policy` header AND places it here, so the server render can
 * put the SAME value on every inline script it emits. It is not a secret and not
 * a credential: it is a per-response token that ties the scripts DalyHub wrote to
 * the policy DalyHub sent, and it is worthless the moment the response is over.
 *
 * Defaults to the empty string, which is the honest reading of "no boundary ran"
 * — a render with no nonce emits no `nonce` attribute rather than a wrong one.
 */
export const cspNonceContext = createContext<string>("");

/** Place the boundary-minted nonce into the request context (server only). */
export function setCspNonce(
  context: RouterContextProvider,
  nonce: string,
): void {
  context.set(cspNonceContext, nonce);
}

/** Read the request's CSP nonce, or the empty string when none was set. */
export function getCspNonce(context: Readonly<RouterContextProvider>): string {
  return context.get(cspNonceContext);
}
