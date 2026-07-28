/**
 * FND-05 Activity kernel — pagination cursors, bound to their query scope.
 *
 * Both the workspace Activity Feed and an entity Timeline are potentially
 * long-lived streams, paginated with an opaque, stable cursor rather than an
 * unbounded offset. A cursor captures two things:
 *
 *   1. the ordering POSITION — the `(occurredAt, id)` tuple of the last event
 *      returned, so the next page resumes exactly after it. `id` is the
 *      tiebreaker that makes the newest-first ordering total and deterministic.
 *   2. the query SCOPE that produced it — the workspace, the scope KIND
 *      (`workspace` feed vs. an `entity` Timeline vs. an `entities` multi-anchor
 *      Timeline), the anchor key when anchored, and the event-type filter (if
 *      any). For an `entity` scope the anchor key IS the anchor entity id; for an
 *      `entities` scope it is the stable digest of the whole anchor SET
 *      ({@link activityAnchorKey}), so a cursor cannot be replayed against a
 *      different set of anchors and silently skip events.
 *
 * This is a DEDICATED, VERSIONED cursor format, deliberately separate from the
 * entity and entity-link cursors: the query scope and record type differ, so the
 * three must never be interchangeable merely because all use base64url. Binding
 * the scope into the cursor is a correctness and safety requirement (ADR-012):
 *
 *   - a cursor issued for workspace A is rejected in workspace B;
 *   - a workspace-feed cursor cannot be replayed on an entity Timeline (and vice
 *     versa);
 *   - a cursor for entity X is rejected when listing entity Y;
 *   - a cursor for anchor set {A,B} is rejected when listing {A,B,C};
 *   - a type-filtered cursor cannot be reused without that filter or under another.
 *
 * The encoding is base64url over a small, versioned JSON array — opaque to callers
 * but intentionally simple and dependency-free. Cursor CONTENTS are treated as
 * UNTRUSTED input: every field is validated on decode and every value that reaches
 * SQL is still bound, never interpolated. No cursor field is a secret, so the
 * cursor is NOT signed or encrypted — versioning binds shape and scope, which is
 * what correctness needs. The payload is base64url over UTF-8 bytes (so Unicode
 * ids paginate) and decoded with a FATAL UTF-8 decoder, so malformed bytes are
 * rejected rather than silently substituted with U+FFFD.
 */

import { InvalidActivityCursorError } from "./activity-errors";

/** The current Activity-cursor format version. Bump when the shape changes. */
export const ACTIVITY_CURSOR_VERSION = 1;

/**
 * Which kind of listing a cursor belongs to: the whole-workspace feed, ONE
 * entity's Timeline, or a bounded SET of anchor entities read as one stream
 * (`listForEntities`).
 */
export type ActivityCursorScopeKind = "workspace" | "entity" | "entities";

/** The ordering position a cursor points just after (newest-first). */
export type ActivityCursorPosition = {
  /** ISO-8601 UTC timestamp of the last returned event's `occurredAt`. */
  readonly occurredAt: string;
  /** Id of the last returned event (the tiebreaker). */
  readonly id: string;
};

/** The query scope a cursor is bound to. A cursor is only valid for a listing
 * whose scope matches this exactly. */
export type ActivityCursorScope = {
  /** The workspace the listing was scoped to. */
  readonly workspaceId: string;
  /** Whether this is the whole-workspace feed, one entity's Timeline, or a set. */
  readonly scope: ActivityCursorScopeKind;
  /**
   * The anchor key: the anchor entity id when `scope === "entity"`, the anchor
   * SET digest ({@link activityAnchorKey}) when `scope === "entities"`, and null
   * for the whole-workspace feed.
   */
  readonly entityId: string | null;
  /** The single event-type filter in effect, or null when unfiltered. */
  readonly type: string | null;
};

/**
 * Encode a string as base64url with no padding. The input is first serialised to
 * UTF-8 bytes so any Unicode content (e.g. a non-Latin entity id) survives —
 * `btoa` alone would throw on it.
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
 * invalid UTF-8 byte sequence throws (mapped by the caller to
 * `InvalidActivityCursorError`) rather than substituting U+FFFD — a tampered
 * cursor must be rejected, not repaired.
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
export function encodeActivityCursor(
  scope: ActivityCursorScope,
  position: ActivityCursorPosition,
): string {
  return toBase64Url(
    JSON.stringify([
      ACTIVITY_CURSOR_VERSION,
      scope.workspaceId,
      scope.scope,
      scope.entityId,
      scope.type,
      position.occurredAt,
      position.id,
    ]),
  );
}

/** A decoded cursor: the scope it was issued for and the position it points to. */
export type DecodedActivityCursor = {
  readonly scope: ActivityCursorScope;
  readonly position: ActivityCursorPosition;
};

const SCOPE_KINDS: ReadonlySet<ActivityCursorScopeKind> = new Set([
  "workspace",
  "entity",
  "entities",
]);

/** Scope kinds that carry a non-empty anchor key in the cursor's `entityId` slot. */
const ANCHORED_SCOPE_KINDS: ReadonlySet<ActivityCursorScopeKind> = new Set([
  "entity",
  "entities",
]);

/**
 * The stable digest of a multi-anchor listing's anchor SET, used as the cursor's
 * anchor key so a cursor issued for one set is rejected against another.
 *
 * It is a 64-bit FNV-1a over the sorted, deduped, length-prefixed ids, prefixed
 * with the anchor count — deterministic, dependency-free and small (the alternative,
 * embedding dozens of ids verbatim, would make the opaque cursor kilobytes long).
 * It is deliberately NOT a cryptographic commitment and is not required to be:
 * the anchor ids are always supplied by the trusted server caller on every call
 * and are never *read back out* of the cursor, so the key only has to detect an
 * accidental scope change, not resist forgery — a forged key grants nothing the
 * caller could not obtain by passing a different anchor set directly, and the
 * workspace and ordering position remain independently bound and validated.
 */
export function activityAnchorKey(entityIds: readonly string[]): string {
  const sorted = [...new Set(entityIds)].sort();
  // Length-prefix each id so the concatenation is injective: no two distinct
  // anchor sets can produce the same input string, whatever the ids contain.
  const joined = sorted.map((id) => `${id.length}:${id}`).join("");
  const bytes = new TextEncoder().encode(joined);
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & mask;
  }
  return `${sorted.length}:${hash.toString(16).padStart(16, "0")}`;
}

/**
 * Decode an opaque cursor back into its scope and position, validating version
 * and shape. Throws `InvalidActivityCursorError` for anything not produced by
 * {@link encodeActivityCursor} at the current version — including a cursor from
 * the entity or entity-link kernels, whose shapes and versions differ.
 */
export function decodeActivityCursor(cursor: string): DecodedActivityCursor {
  if (typeof cursor !== "string" || cursor.length === 0) {
    throw new InvalidActivityCursorError();
  }

  let decoded: string;
  try {
    decoded = fromBase64Url(cursor);
  } catch {
    throw new InvalidActivityCursorError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new InvalidActivityCursorError();
  }

  if (!Array.isArray(parsed) || parsed.length !== 7) {
    throw new InvalidActivityCursorError();
  }

  const [version, workspaceId, scope, entityId, type, occurredAt, id] = parsed;

  const anchored =
    typeof scope === "string" &&
    ANCHORED_SCOPE_KINDS.has(scope as ActivityCursorScopeKind);
  if (
    version !== ACTIVITY_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    typeof scope !== "string" ||
    !SCOPE_KINDS.has(scope as ActivityCursorScopeKind) ||
    // anchored ⇒ non-empty anchor key; workspace-scoped ⇒ null anchor key.
    (anchored
      ? !(typeof entityId === "string" && entityId.length > 0)
      : entityId !== null) ||
    !(type === null || (typeof type === "string" && type.length > 0)) ||
    typeof occurredAt !== "string" ||
    occurredAt.length === 0 ||
    typeof id !== "string" ||
    id.length === 0
  ) {
    throw new InvalidActivityCursorError();
  }

  return {
    scope: {
      workspaceId,
      scope: scope as ActivityCursorScopeKind,
      entityId: anchored ? (entityId as string) : null,
      type,
    },
    position: { occurredAt, id },
  };
}

/** True when two scopes are identical in workspace, kind, anchor and type. */
export function activityCursorScopeMatches(
  a: ActivityCursorScope,
  b: ActivityCursorScope,
): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.scope === b.scope &&
    a.entityId === b.entityId &&
    a.type === b.type
  );
}

/**
 * Decode a cursor and assert it was issued for `expectedScope`, returning just the
 * ordering position. A cursor from another workspace, scope kind, anchor entity or
 * type filter is rejected as `InvalidActivityCursorError` — it is never silently
 * reinterpreted under a different scope.
 */
export function decodeActivityCursorForScope(
  cursor: string,
  expectedScope: ActivityCursorScope,
): ActivityCursorPosition {
  const { scope, position } = decodeActivityCursor(cursor);
  if (!activityCursorScopeMatches(scope, expectedScope)) {
    throw new InvalidActivityCursorError();
  }
  return position;
}
