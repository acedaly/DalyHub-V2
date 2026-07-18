/**
 * FND-09 Authentication kernel — typed authentication errors.
 *
 * Every authentication failure is one of these typed errors. Security rules
 * (ADR-016 §5.3, §7):
 *   - Public `message`s are GENERIC. They never contain a JWT, a raw or decoded
 *     claim, the team domain, the AUD value, an email, or any JWKS/signature
 *     internals. The request boundary maps these to a generic HTTP response.
 *   - The original `cause` MAY be attached for server-side diagnostics (it is
 *     never sent to the browser and must itself never be logged if it could
 *     contain a token — callers log the code, not the token).
 *   - `configuration` distinguishes an operator MISCONFIGURATION (fail closed,
 *     safe to treat as a server fault) from an ordinary unauthenticated request.
 *
 * Nothing here imports Cloudflare, `jose`, React, React Router, D1 or env.
 */

/** The stable, machine-readable classification of an authentication failure. */
export type AuthErrorCode =
  | "missing_credentials"
  | "invalid_credentials"
  | "expired_credentials"
  | "identity_claim_unavailable"
  | "owner_mismatch"
  | "configuration_error"
  | "infrastructure_failure";

/** Base class for every authentication failure. Carries a generic message. */
export abstract class AuthError extends Error {
  /** The stable classification of this failure. */
  abstract readonly code: AuthErrorCode;
  /**
   * True when this failure is an operator misconfiguration or an infrastructure
   * fault rather than an ordinary unauthenticated request. Such failures fail
   * closed and are treated as a server-side problem, not "please log in".
   */
  readonly configuration: boolean = false;

  protected constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** No credential was presented (missing/empty header). Ordinary unauthenticated. */
export class MissingCredentialsError extends AuthError {
  readonly code = "missing_credentials" as const;
  constructor(options?: { cause?: unknown }) {
    super("Authentication credentials are missing.", options);
  }
}

/**
 * A credential was presented but is not valid: bad signature, wrong algorithm,
 * wrong issuer/audience, malformed token, ambiguous/duplicate credentials, or a
 * not-yet-valid (`nbf`) token. Deliberately coarse so the public message never
 * reveals which check failed.
 */
export class InvalidCredentialsError extends AuthError {
  readonly code = "invalid_credentials" as const;
  constructor(options?: { cause?: unknown }) {
    super("Authentication credentials are invalid.", options);
  }
}

/** The credential is expired (`exp` in the past). */
export class ExpiredCredentialsError extends AuthError {
  readonly code = "expired_credentials" as const;
  constructor(options?: { cause?: unknown }) {
    super("Authentication credentials have expired.", options);
  }
}

/**
 * The credential is otherwise valid but lacks a required identity claim (empty
 * `sub`, missing/malformed `email`), or represents a non-identity actor such as
 * a service token. The request is not an authenticated owner user.
 */
export class IdentityClaimError extends AuthError {
  readonly code = "identity_claim_unavailable" as const;
  constructor(options?: { cause?: unknown }) {
    super("A required identity claim is unavailable.", options);
  }
}

/**
 * The credential is a valid identity token, but for an email that is not the
 * configured owner. This is enforced independently of the Access policy so an
 * accidentally-broadened policy cannot grant access (ADR-016 §5.3).
 */
export class OwnerMismatchError extends AuthError {
  readonly code = "owner_mismatch" as const;
  constructor(options?: { cause?: unknown }) {
    super("Access is restricted to the owner.", options);
  }
}

/**
 * The authenticator is misconfigured: a required, trusted server-side value is
 * absent or malformed, an unknown auth mode was requested, or development mode
 * was requested outside a development/test environment. Fails closed and is
 * treated as a server fault, not an unauthenticated request.
 */
export class AuthConfigurationError extends AuthError {
  readonly code = "configuration_error" as const;
  readonly configuration = true;
  constructor(message?: string, options?: { cause?: unknown }) {
    super(message ?? "Authentication is not correctly configured.", options);
  }
}

/**
 * An authentication infrastructure operation failed (e.g. the JWKS endpoint
 * could not be reached or returned an error). Distinct from an invalid token:
 * the credential could not be evaluated at all. Treated as a server fault.
 */
export class AuthInfrastructureError extends AuthError {
  readonly code = "infrastructure_failure" as const;
  readonly configuration = true;
  constructor(options?: { cause?: unknown }) {
    super("Authentication is temporarily unavailable.", options);
  }
}
