/**
 * FND-09 Authentication kernel — public surface.
 *
 * The request boundary, workspace composition and tests import the auth contract
 * from here. It exposes ONLY the storage- and provider-independent contract:
 * identity/session types, the `Authenticator` seam, the typed errors and the
 * pure claim validators. The Cloudflare Access verifier, the development
 * authenticator and all configuration live in `app/platform/auth` — kept OUT of
 * the kernel so it stays free of Cloudflare, `jose`, React, React Router, D1,
 * Vite and environment types (ADR-016 §6).
 */

export type {
  AuthenticatedUser,
  AuthenticatedSession,
  Authenticator,
} from "./auth";

export {
  AuthError,
  MissingCredentialsError,
  InvalidCredentialsError,
  ExpiredCredentialsError,
  IdentityClaimError,
  OwnerMismatchError,
  AuthConfigurationError,
  AuthInfrastructureError,
  type AuthErrorCode,
} from "./auth-errors";

export {
  EMAIL_MAX_LENGTH,
  SUBJECT_MAX_LENGTH,
  EMAIL_PATTERN,
  canonicaliseEmail,
  isValidEmail,
  normaliseEmailClaim,
  normaliseSubjectClaim,
  createAuthenticatedUser,
  emailMatchesOwner,
} from "./auth-validation";
