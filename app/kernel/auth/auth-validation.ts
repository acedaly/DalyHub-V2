/**
 * FND-09 Authentication kernel — identity-claim validation and normalisation.
 *
 * Pure, dependency-free validation of the small set of identity values the
 * application trusts: the stable `subject` and the verified `email`. Email
 * comparison is normalised (trimmed, lowercased) and used consistently for owner
 * enforcement so a differently-cased address can neither be rejected wrongly nor
 * slip through (ADR-016 §5.3). Nothing here imports Cloudflare, `jose`, React,
 * React Router, D1 or env.
 */

import type { AuthenticatedUser } from "./auth";
import { IdentityClaimError } from "./auth-errors";

/**
 * Maximum accepted email length. Bounds untrusted claim size; the practical
 * ceiling for a usable address is well under the 254-octet RFC 5321 limit.
 */
export const EMAIL_MAX_LENGTH = 254;

/**
 * Maximum accepted subject length. Aligned with the Activity kernel's actor-id
 * bound (`ACTOR_ID_MAX_LENGTH`) because the subject becomes the Activity actor
 * id, so a valid subject is always a valid actor id.
 */
export const SUBJECT_MAX_LENGTH = 128;

/**
 * A deliberately strict, single-line email shape: one `@`, a dot-bearing domain,
 * and no whitespace. Not a full RFC validator — it rejects the malformed and
 * obviously-hostile while accepting real addresses. Tested against the canonical
 * (trimmed, lowercased) form.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Canonicalise an email for storage/comparison: trim surrounding whitespace and
 * lowercase. Pure; assumes a string. */
export function canonicaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** True when `value` is a structurally valid, bounded email (checked in canonical
 * form). */
export function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const canonical = canonicaliseEmail(value);
  return (
    canonical.length > 0 &&
    canonical.length <= EMAIL_MAX_LENGTH &&
    EMAIL_PATTERN.test(canonical)
  );
}

/**
 * Validate and normalise an email CLAIM from a credential. Returns the canonical
 * form or throws `IdentityClaimError` (a safe, generic error). The invalid value
 * is never echoed.
 */
export function normaliseEmailClaim(value: unknown): string {
  if (!isValidEmail(value)) {
    throw new IdentityClaimError();
  }
  return canonicaliseEmail(value);
}

/**
 * Validate a subject CLAIM (the stable actor identifier). A non-empty, bounded,
 * non-whitespace string; returns it trimmed or throws `IdentityClaimError`. An
 * empty `sub` (as a service token carries) is rejected here.
 */
export function normaliseSubjectClaim(value: unknown): string {
  if (typeof value !== "string") {
    throw new IdentityClaimError();
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > SUBJECT_MAX_LENGTH) {
    throw new IdentityClaimError();
  }
  return trimmed;
}

/**
 * Maximum accepted provider display-name length. Aligned with the identity
 * kernel's stored bound, so a name that authenticates is always storable.
 */
export const DISPLAY_NAME_MAX_LENGTH = 120;

/**
 * Normalise an OPTIONAL provider display-name claim. Unlike `sub` and `email`,
 * this claim is not required and is not an identifier: a missing, blank,
 * non-string or over-long value simply yields `null` and resolution moves down
 * the canonical order. It never fails authentication — a cosmetic claim must not
 * be able to lock the owner out.
 */
export function normaliseDisplayNameClaim(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (collapsed.length === 0 || collapsed.length > DISPLAY_NAME_MAX_LENGTH) {
    return null;
  }
  return collapsed;
}

/**
 * Build a validated `AuthenticatedUser` from raw identity claims. `subject` and
 * `email` are required, validated and normalised; any failure raises a typed
 * `IdentityClaimError`. `displayName` is optional and best-effort (see
 * `normaliseDisplayNameClaim`).
 */
export function createAuthenticatedUser(claims: {
  readonly subject: unknown;
  readonly email: unknown;
  readonly displayName?: unknown;
}): AuthenticatedUser {
  return {
    subject: normaliseSubjectClaim(claims.subject),
    email: normaliseEmailClaim(claims.email),
    displayName: normaliseDisplayNameClaim(claims.displayName),
  };
}

/**
 * Owner comparison: true when a verified candidate email is the configured owner.
 * Both sides are canonicalised, so comparison is case- and whitespace-insensitive
 * and consistent everywhere it is used.
 */
export function emailMatchesOwner(
  candidate: string,
  ownerEmail: string,
): boolean {
  return canonicaliseEmail(candidate) === canonicaliseEmail(ownerEmail);
}
