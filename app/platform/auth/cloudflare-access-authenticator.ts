/**
 * FND-09 Authentication platform — the Cloudflare Access verifier.
 *
 * Implements the kernel `Authenticator` seam by cryptographically validating the
 * Cloudflare Access application token on every protected request (ADR-016 §5.2,
 * §8). It reads the `Cf-Access-Jwt-Assertion` header (never the cookie, never a
 * client-supplied identity header), verifies the JWT against the team's Access
 * JWKS with `jose`, and enforces issuer, audience, RS256, the time-based claims,
 * a valid subject and verified email, rejects non-identity (service) tokens, and
 * independently enforces the configured owner.
 *
 * `jose` verification is INJECTED (`verifyToken`) so tests exercise this exact
 * code against generated keys and a local JWKS without touching the network or
 * weakening verification. The production verifier (`createRemoteAccessVerifier`)
 * builds a bounded remote JWKS whose cache is managed by `jose`.
 *
 * Provenance: the `createRemoteJWKSet` + `jwtVerify` shape is adapted from
 * Cloudflare's official "Validate JWTs in Workers" example
 * (https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/,
 * retrieved 2026-07-18). Changes: hoist the JWKS to module scope, pin
 * `algorithms: ["RS256"]`, map failures to typed non-disclosing errors, enforce
 * identity/owner claims, and return a minimal session instead of a text response.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

import {
  AuthInfrastructureError,
  ExpiredCredentialsError,
  IdentityClaimError,
  InvalidCredentialsError,
  MissingCredentialsError,
  OwnerMismatchError,
  createAuthenticatedUser,
  emailMatchesOwner,
  type AuthenticatedSession,
  type Authenticator,
} from "~/kernel/auth";

import type { CloudflareAccessConfig } from "./auth-configuration";

/** The Cloudflare Access header carrying the signed application token. */
export const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";

/** The verified JWT payload shape this authenticator reads. */
type AccessTokenPayload = {
  readonly sub?: unknown;
  readonly email?: unknown;
  readonly iat?: unknown;
  readonly exp?: unknown;
  /** Present only on service tokens — its presence marks a non-identity token. */
  readonly common_name?: unknown;
  readonly [claim: string]: unknown;
};

/** A verifier that validates signature/issuer/audience/algorithm/time claims. */
export type AccessTokenVerifier = (
  token: string,
) => Promise<{ payload: AccessTokenPayload }>;

/**
 * Build the production remote-JWKS verifier for a config. The JWKS is created
 * once (hoist per config) so its bounded in-memory cache survives warm Worker
 * invocations — never a per-request fetch, never an unbounded cache.
 */
export function createRemoteAccessVerifier(
  config: CloudflareAccessConfig,
): AccessTokenVerifier {
  const jwks = createRemoteJWKSet(new URL(config.jwksUrl));
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.teamDomain,
      audience: config.audience,
      algorithms: ["RS256"],
    });
    return { payload: payload as AccessTokenPayload };
  };
}

/** Map a `jose` verification failure to a typed, non-disclosing auth error. */
function mapVerificationError(error: unknown): never {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  switch (code) {
    case "ERR_JWT_EXPIRED":
      throw new ExpiredCredentialsError({ cause: error });
    case "ERR_JWKS_TIMEOUT":
    case "ERR_JWKS_NO_MATCHING_KEY_OPERATION":
      throw new AuthInfrastructureError({ cause: error });
    case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED":
    case "ERR_JWT_CLAIM_VALIDATION_FAILED":
    case "ERR_JWKS_NO_MATCHING_KEY":
    case "ERR_JWKS_MULTIPLE_MATCHING_KEYS":
    case "ERR_JWS_INVALID":
    case "ERR_JWT_INVALID":
    case "ERR_JOSE_ALG_NOT_ALLOWED":
      throw new InvalidCredentialsError({ cause: error });
    default:
      // No jose error code → the token could not be evaluated at all (e.g. the
      // JWKS endpoint was unreachable). Treat as infrastructure, not "invalid".
      if (code === "") {
        throw new AuthInfrastructureError({ cause: error });
      }
      throw new InvalidCredentialsError({ cause: error });
  }
}

/** Read the single Access token from the request, or fail with a typed error. */
function readToken(request: Request): string {
  const raw = request.headers.get(ACCESS_JWT_HEADER);
  if (raw === null || raw.trim().length === 0) {
    throw new MissingCredentialsError();
  }
  const token = raw.trim();
  // A compact JWS is three base64url segments joined by dots — it contains no
  // whitespace and no comma. `Headers.get` joins duplicate headers with ", ", so
  // any whitespace/comma means an ambiguous or malformed credential.
  if (/[\s,]/.test(token)) {
    throw new InvalidCredentialsError();
  }
  return token;
}

/** A finite UNIX-seconds claim, or throw invalid. */
function toEpochSeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidCredentialsError();
  }
  return value;
}

export class CloudflareAccessAuthenticator implements Authenticator {
  readonly #config: CloudflareAccessConfig;
  readonly #verifyToken: AccessTokenVerifier;

  constructor(deps: {
    readonly config: CloudflareAccessConfig;
    readonly verifyToken: AccessTokenVerifier;
  }) {
    this.#config = deps.config;
    this.#verifyToken = deps.verifyToken;
  }

  async authenticate(request: Request): Promise<AuthenticatedSession> {
    const token = readToken(request);

    let payload: AccessTokenPayload;
    try {
      ({ payload } = await this.#verifyToken(token));
    } catch (error) {
      mapVerificationError(error);
    }

    // Reject a service token / non-identity actor before trusting any claim.
    if (
      typeof payload.common_name === "string" &&
      payload.common_name.trim().length > 0
    ) {
      throw new IdentityClaimError();
    }

    // A valid application token always carries an expiry; require it explicitly
    // (jose does not reject a token that simply omits `exp`).
    const exp = toEpochSeconds(payload.exp);

    const user = createAuthenticatedUser({
      subject: payload.sub,
      email: payload.email,
    });

    // Independently enforce the owner, regardless of the Access policy.
    if (!emailMatchesOwner(user.email, this.#config.ownerEmail)) {
      throw new OwnerMismatchError();
    }

    const issuedAt =
      payload.iat === undefined
        ? new Date(0)
        : new Date(toEpochSeconds(payload.iat) * 1000);

    return {
      user,
      issuedAt,
      expiresAt: new Date(exp * 1000),
    };
  }
}
