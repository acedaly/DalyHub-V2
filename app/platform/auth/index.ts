/**
 * FND-09 Authentication platform — public surface and authenticator factory.
 *
 * The request boundary obtains its `Authenticator` from `createAuthenticator(env)`
 * here. Configuration is validated once per call (cheap, fail-closed). For
 * Cloudflare Access, the remote JWKS verifier is MEMOISED by its config so the
 * bounded `jose` JWKS cache survives warm Worker invocations rather than being
 * rebuilt (and re-fetched) per request (ADR-016 §8, §30).
 *
 * This module (and everything it imports — `jose`, the verifier) is SERVER-ONLY:
 * it is imported by the Worker request boundary and server-side composition,
 * never by a client component, so no authentication code reaches the browser
 * bundle.
 */

import type { Authenticator } from "~/kernel/auth";

import {
  resolveAuthConfig,
  type AuthConfig,
  type AuthConfigEnv,
  type CloudflareAccessConfig,
} from "./auth-configuration";
import {
  CloudflareAccessAuthenticator,
  createRemoteAccessVerifier,
  type AccessTokenVerifier,
} from "./cloudflare-access-authenticator";
import { DevelopmentAuthenticator } from "./development-authenticator";

export {
  resolveAuthConfig,
  canonicaliseTeamDomain,
  validateAudience,
  ACCESS_AUD_MAX_LENGTH,
  type AuthMode,
  type AuthConfig,
  type AuthConfigEnv,
  type CloudflareAccessConfig,
  type DevelopmentAuthConfig,
} from "./auth-configuration";
export {
  CloudflareAccessAuthenticator,
  createRemoteAccessVerifier,
  ACCESS_JWT_HEADER,
  type AccessTokenVerifier,
} from "./cloudflare-access-authenticator";
export { DevelopmentAuthenticator } from "./development-authenticator";

/** Memoised remote verifiers, keyed by the JWKS url + issuer + audience. */
const verifierCache = new Map<string, AccessTokenVerifier>();

function getRemoteVerifier(
  config: CloudflareAccessConfig,
): AccessTokenVerifier {
  const key = `${config.jwksUrl}|${config.teamDomain}|${config.audience}`;
  let verifier = verifierCache.get(key);
  if (verifier === undefined) {
    verifier = createRemoteAccessVerifier(config);
    verifierCache.set(key, verifier);
  }
  return verifier;
}

/**
 * Build the request `Authenticator` for an environment. Validates configuration
 * (fail closed) and returns the strategy for the resolved `AUTH_MODE`: the
 * Cloudflare Access verifier in production/default, or the fixed development
 * identity locally. The concrete authenticator type never leaks past this seam.
 */
export function createAuthenticator(env: AuthConfigEnv): Authenticator {
  const config: AuthConfig = resolveAuthConfig(env);
  if (config.mode === "development") {
    return new DevelopmentAuthenticator(config);
  }
  return new CloudflareAccessAuthenticator({
    config,
    verifyToken: getRemoteVerifier(config),
  });
}
