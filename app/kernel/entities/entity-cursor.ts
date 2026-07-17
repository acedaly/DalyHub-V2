/**
 * FND-02/FND-03 Data kernel — pagination cursors, bound to their query scope.
 *
 * List results are paginated with an opaque, stable cursor rather than an
 * unbounded offset. A cursor captures two things:
 *
 *   1. the ordering POSITION — the `(createdAt, id)` tuple of the last row
 *      returned, so the next page resumes exactly after it. `id` is the
 *      tiebreaker that makes ordering total and therefore deterministic.
 *   2. the query SCOPE that produced it — the workspace, the type filter (if
 *      any) and the include-deleted state.
 *
 * Binding the scope into the cursor is a security and correctness requirement
 * (FND-03 / ADR-010): a cursor issued for workspace A must be rejected in
 * workspace B, a cursor issued under one type filter must be rejected under
 * another, and a cursor issued with `includeDeleted: true` must not be accepted
 * in the default active-only query. Mismatches — like malformed cursors — are
 * rejected as `InvalidCursorError`.
 *
 * The encoding is base64url over a small, versioned JSON array. It is opaque to
 * callers but intentionally simple and dependency-free. Cursor CONTENTS are
 * treated as untrusted input: every field is validated on decode and every
 * value that reaches SQL is still bound, never interpolated. Workspace ids are
 * scope identifiers, not secrets, so the cursor is NOT signed or encrypted
 * (ADR-010) — versioning binds shape and scope, which is what correctness needs.
 *
 * Versioning: the format is versioned (`CURSOR_VERSION`). The FND-02 cursor was
 * an unscoped `[createdAt, id]` tuple; this version is a scoped array. Legacy
 * FND-02 cursors decode to the wrong shape/version and are therefore rejected —
 * acceptable because there are no released consumers yet.
 */

import { InvalidCursorError } from "./entity-errors";

/** The current cursor format version. Bump when the encoded shape changes. */
export const CURSOR_VERSION = 2;

/** The ordering position a cursor points just after. */
export type CursorPosition = {
  /** ISO-8601 UTC timestamp of the last returned row's `createdAt`. */
  readonly createdAt: string;
  /** Id of the last returned row (the tiebreaker). */
  readonly id: string;
};

/** The query scope a cursor is bound to. A cursor is only valid for a list
 * request whose scope matches this exactly. */
export type CursorScope = {
  /** The workspace the listing was scoped to. */
  readonly workspaceId: string;
  /** The single-type filter in effect, or null when unfiltered. */
  readonly type: string | null;
  /** Whether soft-deleted rows were included. */
  readonly includeDeleted: boolean;
};

/** Encode a base64url string with no padding (URL/JSON-safe, ASCII payload). */
function toBase64Url(ascii: string): string {
  return btoa(ascii).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode a base64url string produced by {@link toBase64Url}. */
function fromBase64Url(value: string): string {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  // atob tolerates missing padding in practice, but restore it for correctness.
  const padded = normalised.padEnd(
    normalised.length + ((4 - (normalised.length % 4)) % 4),
    "=",
  );
  return atob(padded);
}

/** Encode a scope + ordering position into an opaque, versioned cursor string. */
export function encodeCursor(
  scope: CursorScope,
  position: CursorPosition,
): string {
  return toBase64Url(
    JSON.stringify([
      CURSOR_VERSION,
      scope.workspaceId,
      scope.type,
      scope.includeDeleted ? 1 : 0,
      position.createdAt,
      position.id,
    ]),
  );
}

/** A decoded cursor: the scope it was issued for and the position it points to. */
export type DecodedCursor = {
  readonly scope: CursorScope;
  readonly position: CursorPosition;
};

/**
 * Decode an opaque cursor back into its scope and position, validating version
 * and shape. Throws `InvalidCursorError` for anything not produced by
 * {@link encodeCursor} at the current version (including legacy FND-02 cursors).
 */
export function decodeCursor(cursor: string): DecodedCursor {
  if (typeof cursor !== "string" || cursor.length === 0) {
    throw new InvalidCursorError();
  }

  let decoded: string;
  try {
    decoded = fromBase64Url(cursor);
  } catch {
    throw new InvalidCursorError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new InvalidCursorError();
  }

  if (!Array.isArray(parsed) || parsed.length !== 6) {
    throw new InvalidCursorError();
  }

  const [version, workspaceId, type, includeDeleted, createdAt, id] = parsed;

  if (
    version !== CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    !(type === null || (typeof type === "string" && type.length > 0)) ||
    !(includeDeleted === 0 || includeDeleted === 1) ||
    typeof createdAt !== "string" ||
    createdAt.length === 0 ||
    typeof id !== "string" ||
    id.length === 0
  ) {
    throw new InvalidCursorError();
  }

  return {
    scope: { workspaceId, type, includeDeleted: includeDeleted === 1 },
    position: { createdAt, id },
  };
}

/** True when two scopes are identical in workspace, type filter and deleted-mode. */
export function cursorScopeMatches(a: CursorScope, b: CursorScope): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.type === b.type &&
    a.includeDeleted === b.includeDeleted
  );
}

/**
 * Decode a cursor and assert it was issued for `expectedScope`, returning just
 * the ordering position. A cursor from another workspace, type filter or
 * deleted-mode is rejected as `InvalidCursorError` — it is never silently
 * reinterpreted under a different scope.
 */
export function decodeCursorForScope(
  cursor: string,
  expectedScope: CursorScope,
): CursorPosition {
  const { scope, position } = decodeCursor(cursor);
  if (!cursorScopeMatches(scope, expectedScope)) {
    throw new InvalidCursorError();
  }
  return position;
}
