/**
 * FND-09 Authentication kernel — the storage- and provider-independent contract.
 *
 * This module defines WHO is making a request, as a tiny trusted value, and the
 * seam that produces it. It knows nothing about how identity is proven: no
 * Cloudflare Access, no `jose`, no JWTs, no React, no React Router, no D1, no
 * environment variables, no Vite. Those live in `app/platform/auth`. Keeping the
 * contract here means the request boundary, the workspace composition and the
 * tests all depend on this interface, never on a concrete authenticator
 * (ADR-016 §5.4, §7).
 *
 * An `AuthenticatedSession` is the result of a SUCCESSFUL authentication. There
 * is deliberately no "maybe authenticated" or "anonymous" variant: a protected
 * request either produces a session or fails with a typed `AuthError`. The raw
 * credential (e.g. a JWT) is never part of the session — only the minimal,
 * already-safe identity the application needs.
 */

/**
 * The authenticated identity of the request's actor. Intentionally minimal:
 *   - `subject` is the STABLE actor identifier (the Access JWT `sub`), used as
 *     the Activity actor id — never the email, which can change.
 *   - `email` is the verified, normalised email, used only as the safe display
 *     identity in the shell.
 * It holds no token, no raw claims and no provider internals.
 */
export type AuthenticatedUser = {
  readonly subject: string;
  readonly email: string;
};

/**
 * A validated authentication session: the identity plus the credential's
 * time-bounds. It is an IN-MEMORY value derived per request — DalyHub persists no
 * session (ADR-016 §5.4). `issuedAt`/`expiresAt` come from the validated
 * credential's `iat`/`exp`.
 */
export type AuthenticatedSession = {
  readonly user: AuthenticatedUser;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
};

/**
 * The single seam that turns an incoming request into an authenticated session,
 * or throws a typed `AuthError`. Every concrete strategy (Cloudflare Access in
 * production, a fixed development identity locally, generated test keys in tests)
 * implements this same interface, so nothing downstream depends on how identity
 * was proven.
 *
 * `request` is the Web Fetch `Request` (a platform global, not a Cloudflare
 * type). Implementations MUST validate at the boundary and MUST NOT trust the
 * mere presence of a header, an unverified payload, or any client-supplied
 * identity (ADR-016 §5.2).
 */
export interface Authenticator {
  /** Authenticate a request, or reject with a typed `AuthError`. */
  authenticate(request: Request): Promise<AuthenticatedSession>;
}
