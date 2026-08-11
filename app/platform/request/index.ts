/**
 * FND-09 request platform — public surface.
 *
 * The Worker request boundary and protected loaders/actions import the request
 * context helpers and the security-header policy from here.
 */

export {
  authenticatedSessionContext,
  setAuthenticatedSession,
  getAuthenticatedSession,
  requireAuthenticatedSession,
  getDisplayIdentity,
  cspNonceContext,
  setCspNonce,
  getCspNonce,
} from "./authenticated-request-context";

export {
  applyBaseSecurityHeaders,
  applyAuthenticatedCachePolicy,
  withSecurityHeaders,
  buildUnauthenticatedResponse,
  buildCrossOriginRejectionResponse,
  createSecurityHeaderOptions,
  AUTHENTICATED_CACHE_CONTROL,
  type SecurityHeaderOptions,
} from "./security-headers";

export {
  buildContentSecurityPolicy,
  createCspNonce,
  isValidCspNonce,
  resolveCspMode,
  type CspMode,
  type CspModeEnv,
} from "./content-security-policy";

export {
  evaluateMutationProvenance,
  isSafeMethod,
  trustedOriginFor,
  type MutationProvenanceResult,
  type MutationProvenanceRejection,
} from "./mutation-provenance";

export {
  handleAuthenticatedRequest,
  isPublicPath,
  isCaptureRequest,
  CAPTURE_PATH,
  PUBLIC_PATHS,
  type ReactRouterRequestHandler,
  type AuthenticatorFactory,
  type RequestBoundaryEnv,
} from "./request-boundary";

export {
  provisionAuthenticatedMember,
  provisionMemberSafely,
  type IdentityProvisioningEnv,
  type MemberProvisioner,
} from "./identity-provisioning";

export {
  readEntityIconField,
  ENTITY_ICON_FIELD_ERROR,
  type EntityIconFieldResult,
} from "./entity-icon-field";
