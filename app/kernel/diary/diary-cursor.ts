/**
 * DIARY-01A Diary kernel — the Timeline pagination cursor, bound to its scope.
 *
 * The Timeline is a potentially life-long stream, paginated with an opaque,
 * stable cursor rather than an unbounded offset. A cursor captures two things:
 *
 *   1. the ordering POSITION — the `(occurredAt, id)` tuple of the last entry
 *      returned, so the next page resumes exactly after it. `id` is the
 *      tiebreaker that makes the ordering total and deterministic even when
 *      several entries share one `occurredAt`.
 *   2. the query SCOPE that produced it — the workspace, the ORDER (newest vs
 *      oldest), the entry-type filter, the occurred-at range and the
 *      include-deleted flag.
 *
 * This is a DEDICATED, VERSIONED format, deliberately separate from the entity,
 * entity-link and activity cursors: the record type and query scope differ, so
 * the four must never be interchangeable merely because all use base64url.
 * Binding the scope into the cursor is a correctness requirement (mirrors
 * ADR-012): a cursor issued for one workspace, order, filter or range is
 * rejected under any other, never silently reinterpreted.
 *
 * Cursor CONTENTS are UNTRUSTED input: every field is validated on decode, and
 * every value that reaches SQL is still bound, never interpolated. No field is a
 * secret, so the cursor is not signed — versioning binds shape and scope, which
 * is what correctness needs.
 */

import { InvalidDiaryCursorError } from "./diary-errors";
import type { DiaryTimelineOrder } from "./diary-validation";

/** The current cursor format version. Bump when the shape changes. */
export const DIARY_CURSOR_VERSION = 1;

/** The ordering position a cursor points just after. */
export type DiaryCursorPosition = {
  /** ISO-8601 UTC `occurredAt` of the last returned entry. */
  readonly occurredAt: string;
  /** Id of the last returned entry (the tiebreaker). */
  readonly id: string;
};

/** The query scope a cursor is bound to. */
export type DiaryCursorScope = {
  readonly workspaceId: string;
  readonly order: DiaryTimelineOrder;
  /** The entry-type filter, normalised (sorted, comma-joined), or null. */
  readonly entryTypes: string | null;
  /** ISO-8601 UTC inclusive lower bound on `occurredAt`, or null. */
  readonly from: string | null;
  /** ISO-8601 UTC inclusive upper bound on `occurredAt`, or null. */
  readonly to: string | null;
  readonly includeDeleted: boolean;
};

/** Normalise an entry-type filter list into the cursor's canonical string. */
export function normaliseEntryTypeScope(
  entryTypes: readonly string[] | undefined,
): string | null {
  if (entryTypes === undefined || entryTypes.length === 0) return null;
  return [...entryTypes].sort().join(",");
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

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

/** Encode a scope + ordering position into an opaque, versioned cursor. */
export function encodeDiaryCursor(
  scope: DiaryCursorScope,
  position: DiaryCursorPosition,
): string {
  return toBase64Url(
    JSON.stringify([
      DIARY_CURSOR_VERSION,
      scope.workspaceId,
      scope.order,
      scope.entryTypes,
      scope.from,
      scope.to,
      scope.includeDeleted ? 1 : 0,
      position.occurredAt,
      position.id,
    ]),
  );
}

/** A decoded cursor: its scope and the position it points to. */
export type DecodedDiaryCursor = {
  readonly scope: DiaryCursorScope;
  readonly position: DiaryCursorPosition;
};

const ORDERS: ReadonlySet<string> = new Set(["newest", "oldest"]);

function isNullableString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0);
}

/** Decode an opaque cursor back into scope + position, validating version/shape. */
export function decodeDiaryCursor(cursor: string): DecodedDiaryCursor {
  if (typeof cursor !== "string" || cursor.length === 0) {
    throw new InvalidDiaryCursorError();
  }
  let decoded: string;
  try {
    decoded = fromBase64Url(cursor);
  } catch {
    throw new InvalidDiaryCursorError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new InvalidDiaryCursorError();
  }
  if (!Array.isArray(parsed) || parsed.length !== 9) {
    throw new InvalidDiaryCursorError();
  }
  const [
    version,
    workspaceId,
    order,
    entryTypes,
    from,
    to,
    includeDeleted,
    occurredAt,
    id,
  ] = parsed;

  if (
    version !== DIARY_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    typeof order !== "string" ||
    !ORDERS.has(order) ||
    !isNullableString(entryTypes) ||
    !isNullableString(from) ||
    !isNullableString(to) ||
    (includeDeleted !== 0 && includeDeleted !== 1) ||
    typeof occurredAt !== "string" ||
    occurredAt.length === 0 ||
    typeof id !== "string" ||
    id.length === 0
  ) {
    throw new InvalidDiaryCursorError();
  }

  return {
    scope: {
      workspaceId,
      order: order as DiaryTimelineOrder,
      entryTypes,
      from,
      to,
      includeDeleted: includeDeleted === 1,
    },
    position: { occurredAt, id },
  };
}

/** True when two scopes are identical in every bound dimension. */
export function diaryCursorScopeMatches(
  a: DiaryCursorScope,
  b: DiaryCursorScope,
): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.order === b.order &&
    a.entryTypes === b.entryTypes &&
    a.from === b.from &&
    a.to === b.to &&
    a.includeDeleted === b.includeDeleted
  );
}

/**
 * Decode a cursor and assert it was issued for `expectedScope`, returning just
 * the ordering position. A cursor from another workspace, order, filter, range
 * or delete-mode is rejected — never silently reinterpreted.
 */
export function decodeDiaryCursorForScope(
  cursor: string,
  expectedScope: DiaryCursorScope,
): DiaryCursorPosition {
  const { scope, position } = decodeDiaryCursor(cursor);
  if (!diaryCursorScopeMatches(scope, expectedScope)) {
    throw new InvalidDiaryCursorError();
  }
  return position;
}
