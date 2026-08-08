/**
 * SET-03 Account & security kernel — public surface.
 *
 * The Settings module, the shared activity descriptors and the sign-out route all
 * import from here. Everything below is pure: identifiers, payload shapes and
 * derivations. No React, no storage, no Cloudflare, no environment.
 */

export {
  SECURITY_SIGNED_OUT,
  SECURITY_LOCAL_DATA_CLEARED,
  SECURITY_ACTIVITY_TYPES,
  isLocalDataClearScope,
  boundedCount,
  type LocalDataClearScope,
  type SignedOutPayload,
  type LocalDataClearedPayload,
} from "./account-security-events";

export {
  SESSION_EXPIRING_SOON_MINUTES,
  SUBJECT_FRAGMENT_LENGTH,
  describeSessionExpiry,
  formatSessionRemaining,
  subjectFragment,
  type AuthenticationSource,
  type SessionExpiry,
  type SessionExpiryState,
} from "./account-security-session";
