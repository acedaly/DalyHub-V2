/**
 * SET-03 Account & security kernel — the pure session-presentation model.
 *
 * Everything the Account & security surface says about the current session is
 * derived here, from values the SERVER validated, by functions with no React, no
 * storage and no environment. The surface's whole obligation is to not look more
 * powerful or better-informed than the architecture underneath it, and that is a
 * property of the derivation, not of the markup — so the derivation is the part
 * that is unit-tested.
 *
 * The one rule every function here obeys: an ABSENT fact stays absent. A missing
 * `iat` becomes `null` and renders as "Not reported", never as a plausible
 * timestamp; a session with no known expiry reports `unknown`, never "active".
 */

/** How close to expiry a session has to be before the owner is told. */
export const SESSION_EXPIRING_SOON_MINUTES = 30;

/** Where the current authenticated identity came from. */
export type AuthenticationSource = "cloudflare-access" | "development";

/** The state of the current authentication session, as far as DalyHub knows. */
export type SessionExpiryState =
  /** Valid, with time to spare. */
  | "active"
  /** Valid, but inside the warning window. */
  | "expiring_soon"
  /** The credential's own expiry has passed. */
  | "expired"
  /** No expiry was reported — DalyHub does not know. */
  | "unknown";

/** The derived expiry facts. `minutesRemaining` is null whenever unknown. */
export type SessionExpiry = {
  readonly state: SessionExpiryState;
  readonly minutesRemaining: number | null;
};

/**
 * Derive how much of the current session is left.
 *
 * `expiresAt` comes from the validated credential's `exp` claim, so this is an
 * OBSERVED fact rather than an estimate — which is exactly why it is safe to show
 * and why nothing else on the surface is inferred from it. Note what it does not
 * say: an `active` session here means "this credential has not expired", not
 * "you are signed in everywhere" and not "no one else has a session".
 */
export function describeSessionExpiry(
  expiresAt: Date | null,
  now: Date,
): SessionExpiry {
  if (expiresAt === null || Number.isNaN(expiresAt.getTime())) {
    return { state: "unknown", minutesRemaining: null };
  }
  const remainingMs = expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return { state: "expired", minutesRemaining: 0 };
  }
  const minutesRemaining = Math.floor(remainingMs / 60_000);
  return {
    state:
      minutesRemaining < SESSION_EXPIRING_SOON_MINUTES
        ? "expiring_soon"
        : "active",
    minutesRemaining,
  };
}

/**
 * A short, human-readable summary of how long is left. Deliberately coarse —
 * "about 3 hours" rather than "3h 12m 41s" — because a countdown to the second
 * invites the reader to treat it as a guarantee, and an Access session can end
 * earlier for reasons DalyHub cannot see.
 */
export function formatSessionRemaining(expiry: SessionExpiry): string | null {
  if (expiry.minutesRemaining === null) return null;
  const minutes = expiry.minutesRemaining;
  if (minutes <= 0) return "Expired";
  if (minutes < 60) return `About ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `About ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `About ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * The number of characters of the identity subject the surface may show.
 *
 * The Access `sub` is the owner's own stable identifier and is already the
 * Activity actor id, so it is not a secret from the owner. It is also long,
 * opaque and useless as a label — the value of showing any of it is being able
 * to tell two sign-ins apart and to quote something when something is wrong. A
 * fragment does that; the whole string only adds a long token to a screenshot.
 */
export const SUBJECT_FRAGMENT_LENGTH = 8;

/**
 * The displayable fragment of an identity subject, or null when there is none.
 * Always the TRAILING characters, and always rendered by the caller with a
 * leading ellipsis so it can never be mistaken for the whole value.
 */
export function subjectFragment(subject: string | null): string | null {
  if (subject === null) return null;
  const trimmed = subject.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(-SUBJECT_FRAGMENT_LENGTH);
}
