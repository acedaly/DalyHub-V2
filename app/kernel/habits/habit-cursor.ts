/**
 * HABITS-01 Habits kernel — the versioned, scope-bound collection cursor.
 *
 * An opaque base64url cursor binding BOTH the ordering position and the query
 * scope. A cursor issued for one scope (workspace + status + query) is REJECTED
 * under any other, so a stale or hand-crafted cursor can never leak rows across
 * scopes. Habits are ordered newest-first by `(createdAt, id)`; the cursor
 * carries that position. Cursor contents are untrusted — every decoded value is
 * still BOUND in SQL by the D1 adapter, never interpolated.
 */

import { InvalidHabitCursorError } from "./habit-errors";
import type { HabitListStatus } from "./habit";

/** The cursor wire-format version. Bump on any incompatible shape change. */
export const HABIT_CURSOR_VERSION = 1;

/** The ordering position: the `(createdAt, id)` total-order tiebreaker. */
export interface HabitCursorPosition {
  readonly createdAt: string;
  readonly id: string;
}

/** The query scope a cursor is bound to. */
export interface HabitCursorScope {
  readonly workspaceId: string;
  readonly status: HabitListStatus;
  readonly query: string | null;
}

export interface DecodedHabitCursor {
  readonly scope: HabitCursorScope;
  readonly position: HabitCursorPosition;
}

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
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Encode a cursor for a page position within a scope. */
export function encodeHabitCursor(
  scope: HabitCursorScope,
  position: HabitCursorPosition,
): string {
  const payload = [
    HABIT_CURSOR_VERSION,
    scope.workspaceId,
    scope.status,
    scope.query,
    position.createdAt,
    position.id,
  ];
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

/** Decode a cursor, validating its shape. Throws `InvalidHabitCursorError`. */
export function decodeHabitCursor(cursor: string): DecodedHabitCursor {
  let parsed: unknown;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(
      fromBase64Url(cursor),
    );
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidHabitCursorError();
  }
  if (!Array.isArray(parsed) || parsed.length !== 6) {
    throw new InvalidHabitCursorError();
  }
  const [version, workspaceId, status, query, createdAt, id] =
    parsed as unknown[];
  if (
    version !== HABIT_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    (status !== "active" && status !== "archived" && status !== "all") ||
    (query !== null && typeof query !== "string") ||
    typeof createdAt !== "string" ||
    typeof id !== "string"
  ) {
    throw new InvalidHabitCursorError();
  }
  return { scope: { workspaceId, status, query }, position: { createdAt, id } };
}

/** True when two scopes are identical. */
export function habitCursorScopeMatches(
  a: HabitCursorScope,
  b: HabitCursorScope,
): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.status === b.status &&
    a.query === b.query
  );
}

/** Decode a cursor and assert it was issued for `expectedScope`. */
export function decodeHabitCursorForScope(
  cursor: string,
  expectedScope: HabitCursorScope,
): HabitCursorPosition {
  const decoded = decodeHabitCursor(cursor);
  if (!habitCursorScopeMatches(decoded.scope, expectedScope)) {
    throw new InvalidHabitCursorError();
  }
  return decoded.position;
}
