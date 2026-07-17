/**
 * FND-04 EntityLinks kernel — pagination cursors, bound to their query scope.
 *
 * `listForEntity` results are paginated with an opaque, stable cursor rather than
 * an unbounded offset. A cursor captures two things:
 *
 *   1. the ordering POSITION — the `(createdAt, id)` tuple of the last row
 *      returned, so the next page resumes exactly after it. `id` is the
 *      tiebreaker that makes ordering total and therefore deterministic.
 *   2. the query SCOPE that produced it — the workspace, the ANCHOR entity, the
 *      direction filter and the type filter (if any).
 *
 * This is a DEDICATED, VERSIONED cursor format, deliberately separate from the
 * entity kernel's cursor (`app/kernel/entities/entity-cursor.ts`): the query
 * scope and record type differ (a link listing is anchored to an entity and a
 * direction, an entity listing is not), so the two must not be interchangeable
 * merely because both happen to use base64url. Binding the anchor and filters
 * into the cursor is a correctness and safety requirement (ADR-011):
 *
 *   - a cursor issued for workspace A is rejected in workspace B;
 *   - a cursor issued for anchor X is rejected when listing anchor Y;
 *   - an `outgoing` cursor cannot be replayed under an `incoming` or `both` query;
 *   - a type-filtered cursor cannot be reused without that filter or under
 *     another type.
 *
 * The encoding is base64url over a small, versioned JSON array — opaque to
 * callers but intentionally simple and dependency-free. Cursor CONTENTS are
 * treated as UNTRUSTED input: every field is validated on decode and every value
 * that reaches SQL is still bound, never interpolated. Workspace/entity ids are
 * scope identifiers, not secrets, so the cursor is NOT signed or encrypted
 * (ADR-010/ADR-011) — versioning binds shape and scope, which is what
 * correctness needs.
 */

import { InvalidEntityLinkCursorError } from "./entity-link-errors";
import type { EntityLinkDirectionFilter } from "./entity-link";

/** The current link-cursor format version. Bump when the encoded shape changes. */
export const ENTITY_LINK_CURSOR_VERSION = 1;

/** The ordering position a cursor points just after. */
export type EntityLinkCursorPosition = {
  /** ISO-8601 UTC timestamp of the last returned link's `createdAt`. */
  readonly createdAt: string;
  /** Id of the last returned link (the tiebreaker). */
  readonly id: string;
};

/** The query scope a cursor is bound to. A cursor is only valid for a listing
 * whose scope matches this exactly. */
export type EntityLinkCursorScope = {
  /** The workspace the listing was scoped to. */
  readonly workspaceId: string;
  /** The anchor entity the listing was for. */
  readonly anchorEntityId: string;
  /** The direction filter in effect. */
  readonly direction: EntityLinkDirectionFilter;
  /** The single-type filter in effect, or null when unfiltered. */
  readonly type: string | null;
};

/**
 * Encode a string as base64url with no padding. The input is first serialised to
 * UTF-8 bytes so any Unicode content survives: workspace and entity ids are
 * validated only as non-empty bounded strings, so a non-Latin id (e.g. `个人`)
 * can legitimately reach the cursor — `btoa` alone would throw on it. Feeding
 * `btoa` a Latin-1 string of raw UTF-8 bytes keeps it in range.
 */
function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode a base64url string produced by {@link toBase64Url}, reversing the UTF-8
 * byte encoding so Unicode round-trips exactly. The `TextDecoder` is FATAL: an
 * invalid UTF-8 byte sequence throws a `TypeError` (which the caller maps to
 * `InvalidEntityLinkCursorError`) rather than silently substituting U+FFFD
 * replacement characters — a tampered cursor must be rejected, not repaired.
 */
function fromBase64Url(value: string): string {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised.padEnd(
    normalised.length + ((4 - (normalised.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Encode a scope + ordering position into an opaque, versioned cursor string. */
export function encodeEntityLinkCursor(
  scope: EntityLinkCursorScope,
  position: EntityLinkCursorPosition,
): string {
  return toBase64Url(
    JSON.stringify([
      ENTITY_LINK_CURSOR_VERSION,
      scope.workspaceId,
      scope.anchorEntityId,
      scope.direction,
      scope.type,
      position.createdAt,
      position.id,
    ]),
  );
}

/** A decoded cursor: the scope it was issued for and the position it points to. */
export type DecodedEntityLinkCursor = {
  readonly scope: EntityLinkCursorScope;
  readonly position: EntityLinkCursorPosition;
};

const DIRECTIONS: ReadonlySet<EntityLinkDirectionFilter> = new Set([
  "outgoing",
  "incoming",
  "both",
]);

/**
 * Decode an opaque cursor back into its scope and position, validating version
 * and shape. Throws `InvalidEntityLinkCursorError` for anything not produced by
 * {@link encodeEntityLinkCursor} at the current version — including a cursor from
 * the entity kernel, whose shape and version differ.
 */
export function decodeEntityLinkCursor(
  cursor: string,
): DecodedEntityLinkCursor {
  if (typeof cursor !== "string" || cursor.length === 0) {
    throw new InvalidEntityLinkCursorError();
  }

  let decoded: string;
  try {
    decoded = fromBase64Url(cursor);
  } catch {
    throw new InvalidEntityLinkCursorError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new InvalidEntityLinkCursorError();
  }

  if (!Array.isArray(parsed) || parsed.length !== 7) {
    throw new InvalidEntityLinkCursorError();
  }

  const [version, workspaceId, anchorEntityId, direction, type, createdAt, id] =
    parsed;

  if (
    version !== ENTITY_LINK_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    typeof anchorEntityId !== "string" ||
    anchorEntityId.length === 0 ||
    typeof direction !== "string" ||
    !DIRECTIONS.has(direction as EntityLinkDirectionFilter) ||
    !(type === null || (typeof type === "string" && type.length > 0)) ||
    typeof createdAt !== "string" ||
    createdAt.length === 0 ||
    typeof id !== "string" ||
    id.length === 0
  ) {
    throw new InvalidEntityLinkCursorError();
  }

  return {
    scope: {
      workspaceId,
      anchorEntityId,
      direction: direction as EntityLinkDirectionFilter,
      type,
    },
    position: { createdAt, id },
  };
}

/** True when two scopes are identical in workspace, anchor, direction and type. */
export function entityLinkCursorScopeMatches(
  a: EntityLinkCursorScope,
  b: EntityLinkCursorScope,
): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.anchorEntityId === b.anchorEntityId &&
    a.direction === b.direction &&
    a.type === b.type
  );
}

/**
 * Decode a cursor and assert it was issued for `expectedScope`, returning just
 * the ordering position. A cursor from another workspace, anchor, direction or
 * type filter is rejected as `InvalidEntityLinkCursorError` — it is never
 * silently reinterpreted under a different scope.
 */
export function decodeEntityLinkCursorForScope(
  cursor: string,
  expectedScope: EntityLinkCursorScope,
): EntityLinkCursorPosition {
  const { scope, position } = decodeEntityLinkCursor(cursor);
  if (!entityLinkCursorScopeMatches(scope, expectedScope)) {
    throw new InvalidEntityLinkCursorError();
  }
  return position;
}
