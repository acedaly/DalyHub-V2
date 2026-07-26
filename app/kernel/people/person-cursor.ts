/**
 * PEOPLE-01 People kernel — the versioned, scope-bound collection cursor.
 *
 * An opaque base64url cursor that binds BOTH the ordering position and the query
 * scope. A cursor issued for one scope (workspace + status + query) is REJECTED
 * under any other, so a stale or hand-crafted cursor can never leak rows across
 * scopes. People are ordered newest-first by `(createdAt, id)`; the cursor
 * carries that position. Cursor contents are untrusted — every decoded value is
 * still bound in SQL by the D1 adapter, never interpolated.
 */

import { InvalidPersonCursorError } from "./person-errors";
import type { PersonListStatus } from "./person";

/** The cursor wire-format version. Bump on any incompatible shape change. */
export const PERSON_CURSOR_VERSION = 1;

/** The ordering position: the `(createdAt, id)` total-order tiebreaker. */
export type PersonCursorPosition = {
  readonly createdAt: string;
  readonly id: string;
};

/** The query scope a cursor is bound to. */
export type PersonCursorScope = {
  readonly workspaceId: string;
  readonly status: PersonListStatus;
  /** The normalised query, or null. Bound so a cursor can't cross queries. */
  readonly query: string | null;
};

/** A decoded cursor: its scope plus the position to resume after. */
export type DecodedPersonCursor = {
  readonly scope: PersonCursorScope;
  readonly position: PersonCursorPosition;
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encode a cursor for a page position within a scope. */
export function encodePersonCursor(
  scope: PersonCursorScope,
  position: PersonCursorPosition,
): string {
  const payload = [
    PERSON_CURSOR_VERSION,
    scope.workspaceId,
    scope.status,
    scope.query,
    position.createdAt,
    position.id,
  ];
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

/** Decode a cursor, validating its shape. Throws `InvalidPersonCursorError`. */
export function decodePersonCursor(cursor: string): DecodedPersonCursor {
  let parsed: unknown;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(
      fromBase64Url(cursor),
    );
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidPersonCursorError();
  }
  if (!Array.isArray(parsed) || parsed.length !== 6) {
    throw new InvalidPersonCursorError();
  }
  const [version, workspaceId, status, query, createdAt, id] =
    parsed as unknown[];
  if (
    version !== PERSON_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    (status !== "active" && status !== "archived" && status !== "all") ||
    (query !== null && typeof query !== "string") ||
    typeof createdAt !== "string" ||
    typeof id !== "string"
  ) {
    throw new InvalidPersonCursorError();
  }
  return {
    scope: { workspaceId, status, query },
    position: { createdAt, id },
  };
}

/** True when two scopes are identical. */
export function personCursorScopeMatches(
  a: PersonCursorScope,
  b: PersonCursorScope,
): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.status === b.status &&
    a.query === b.query
  );
}

/** Decode a cursor and assert it was issued for `expectedScope`. */
export function decodePersonCursorForScope(
  cursor: string,
  expectedScope: PersonCursorScope,
): PersonCursorPosition {
  const decoded = decodePersonCursor(cursor);
  if (!personCursorScopeMatches(decoded.scope, expectedScope)) {
    throw new InvalidPersonCursorError();
  }
  return decoded.position;
}
