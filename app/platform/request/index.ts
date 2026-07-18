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
} from "./authenticated-request-context";

export {
  applyBaseSecurityHeaders,
  applyAuthenticatedCachePolicy,
  withSecurityHeaders,
  buildUnauthenticatedResponse,
} from "./security-headers";

export {
  handleAuthenticatedRequest,
  isPublicPath,
  PUBLIC_PATHS,
  type ReactRouterRequestHandler,
  type AuthenticatorFactory,
} from "./request-boundary";
