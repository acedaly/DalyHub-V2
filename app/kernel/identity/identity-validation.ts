/**
 * IDENT-01 Identity kernel — pure validation of the persisted identity facts.
 *
 * Bounds every value that reaches the `workspace_members` row. The subject bound
 * is deliberately the SAME as the Activity kernel's actor-id bound, because the
 * subject IS the actor id: a subject that could not be an actor id would produce
 * membership that history could never join to.
 */

import { canonicaliseEmail, isValidEmail } from "~/kernel/auth";

import { IdentityValidationError } from "./identity-errors";

/** Maximum stored subject length — aligned with `ACTOR_ID_MAX_LENGTH`. */
export const MEMBER_SUBJECT_MAX_LENGTH = 128;

/** Maximum stored display-name length. Generous for a real name, still bounded. */
export const MEMBER_DISPLAY_NAME_MAX_LENGTH = 120;

/** Maximum stored entity-id length for the linked Person. */
export const MEMBER_PERSON_ID_MAX_LENGTH = 128;

/** Trim and collapse internal whitespace. */
function collapse(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Validate the stable authenticated subject. */
export function validateMemberSubject(value: unknown): string {
  if (typeof value !== "string") {
    throw new IdentityValidationError("subject", "subject must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new IdentityValidationError("subject", "subject must not be empty.");
  }
  if (trimmed.length > MEMBER_SUBJECT_MAX_LENGTH) {
    throw new IdentityValidationError("subject", "subject is too long.");
  }
  return trimmed;
}

/**
 * Validate an optional stored email. Absent/blank → null. A structurally invalid
 * address is dropped to null rather than throwing: a member row must never be
 * unwritable because a provider sent an odd address, and a missing email simply
 * moves resolution down the canonical order.
 */
export function normaliseMemberEmail(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return isValidEmail(value) ? canonicaliseEmail(value as string) : null;
}

/**
 * Validate an optional display name. Absent/blank → null; anything longer than
 * the bound is rejected loudly, because a caller passing an unbounded name is a
 * programming error, not a data quirk.
 */
export function normaliseMemberDisplayName(
  value: unknown,
  field: "displayName" | "authDisplayName" = "displayName",
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new IdentityValidationError(field, `${field} must be a string.`);
  }
  const collapsed = collapse(value);
  if (collapsed.length === 0) {
    return null;
  }
  if (collapsed.length > MEMBER_DISPLAY_NAME_MAX_LENGTH) {
    throw new IdentityValidationError(field, `${field} is too long.`);
  }
  return collapsed;
}

/** Validate the optional linked Person entity id. */
export function normaliseMemberPersonId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new IdentityValidationError(
      "personEntityId",
      "personEntityId must be a string.",
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > MEMBER_PERSON_ID_MAX_LENGTH) {
    throw new IdentityValidationError(
      "personEntityId",
      "personEntityId is too long.",
    );
  }
  return trimmed;
}
