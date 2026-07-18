/**
 * FND-09 Authentication platform — the development authenticator.
 *
 * A separate strategy behind the SAME kernel `Authenticator` seam, for local
 * development and automated tests where a live Cloudflare Access application is
 * unavailable (ADR-016 §5.8). Its identity is FIXED server-side by validated
 * configuration and is NOT derived from the request in any way — it ignores the
 * request entirely, so no header, cookie, query parameter or hostname can select
 * or spoof it. There is no "accept any JWT" path.
 *
 * It is only ever constructed when `resolveAuthConfig` has already confirmed
 * `AUTH_MODE=development` AND an explicit development/test `ENVIRONMENT`, so it
 * can never run in production.
 */

import {
  createAuthenticatedUser,
  type AuthenticatedSession,
  type Authenticator,
} from "~/kernel/auth";

import type { DevelopmentAuthConfig } from "./auth-configuration";

/** Local development sessions are treated as valid for a bounded window. */
const DEVELOPMENT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export class DevelopmentAuthenticator implements Authenticator {
  readonly #config: DevelopmentAuthConfig;
  readonly #now: () => Date;

  constructor(
    config: DevelopmentAuthConfig,
    now: () => Date = () => new Date(),
  ) {
    this.#config = config;
    this.#now = now;
  }

  authenticate(_request: Request): Promise<AuthenticatedSession> {
    // The request is deliberately ignored: the identity is server-fixed.
    const user = createAuthenticatedUser({
      subject: this.#config.subject,
      email: this.#config.email,
    });
    const issuedAt = this.#now();
    return Promise.resolve({
      user,
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + DEVELOPMENT_SESSION_TTL_MS),
    });
  }
}
