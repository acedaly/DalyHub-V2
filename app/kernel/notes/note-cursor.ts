/**
 * NOTES-03 Notes kernel — the collection cursor, bound to its query scope.
 *
 * Mirrors `~/kernel/projects/project-cursor.ts` exactly in shape and intent: an
 * opaque, versioned base64url cursor carrying (1) the ordering POSITION — the
 * `(sortValue, id)` tuple of the last Note returned, `id` being the tiebreaker
 * that makes the order total — and (2) the query SCOPE.
 *
 * Binding the scope is a correctness requirement, not decoration. The Notes
 * collection now has SIX independent filters; a cursor issued under one filter
 * set must be rejected under another, or a page boundary computed against one
 * result set would silently skip or duplicate Notes in a different one. The
 * scope is compared as a canonical string, so adding a filter can never
 * accidentally leave it out of the comparison.
 *
 * Cursor CONTENTS are untrusted: every field is validated on decode and every
 * value that reaches SQL is still bound, never interpolated.
 */

import {
  InvalidNoteCursorError,
  type ListNotesInput,
  type NoteCollectionState,
  type NoteLinkFilter,
  type NoteSortOrder,
} from "./note-query";

/** The current note cursor format version. Bump when the encoded shape changes. */
export const NOTE_CURSOR_VERSION = 1;

/** The ordering position a note cursor points just after. */
export type NoteCursorPosition = {
  /** The ISO-8601 UTC timestamp the requested ordering sorts on. */
  readonly sortValue: string;
  /** Id of the last returned Note (the tiebreaker). */
  readonly id: string;
};

/** Every input that affects WHICH Notes appear, and in WHAT sequence. */
export type NoteCursorScope = {
  readonly workspaceId: string;
  readonly state: NoteCollectionState;
  readonly query: string | null;
  readonly tag: string | null;
  readonly projectId: string | null;
  readonly areaId: string | null;
  readonly links: NoteLinkFilter;
  readonly sort: NoteSortOrder;
};

const STATES: readonly NoteCollectionState[] = [
  "active",
  "archived",
  "deleted",
];
const SORTS: readonly NoteSortOrder[] = ["recent", "created"];
const LINK_FILTERS: readonly NoteLinkFilter[] = ["all", "linked", "unlinked"];

const textEncoder = new TextEncoder();
const fatalTextDecoder = new TextDecoder("utf-8", { fatal: true });

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised.padEnd(
    normalised.length + ((4 - (normalised.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The canonical, order-stable serialisation of a scope (also its identity). */
function scopeTuple(scope: NoteCursorScope): readonly unknown[] {
  return [
    scope.workspaceId,
    scope.state,
    scope.query,
    scope.tag,
    scope.projectId,
    scope.areaId,
    scope.links,
    scope.sort,
  ];
}

/** Build the scope a set of (already-normalised) list inputs will query under. */
export function noteCursorScope(
  workspaceId: string,
  input: {
    readonly state: NoteCollectionState;
    readonly query: string | null;
    readonly tag: string | null;
    readonly projectId: string | null;
    readonly areaId: string | null;
    readonly links: NoteLinkFilter;
    readonly sort: NoteSortOrder;
  },
): NoteCursorScope {
  return { workspaceId, ...input };
}

/** Encode a scope + ordering position into an opaque, versioned cursor string. */
export function encodeNoteCursor(
  scope: NoteCursorScope,
  position: NoteCursorPosition,
): string {
  const json = JSON.stringify([
    NOTE_CURSOR_VERSION,
    ...scopeTuple(scope),
    position.sortValue,
    position.id,
  ]);
  return toBase64Url(textEncoder.encode(json));
}

export type DecodedNoteCursor = {
  readonly scope: NoteCursorScope;
  readonly position: NoteCursorPosition;
};

function optionalString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0);
}

/**
 * Decode an opaque cursor back into its scope and position, validating version
 * and shape. Throws {@link InvalidNoteCursorError} for anything not produced by
 * {@link encodeNoteCursor} at the current version.
 */
export function decodeNoteCursor(cursor: string): DecodedNoteCursor {
  if (typeof cursor !== "string" || cursor.length === 0) {
    throw new InvalidNoteCursorError();
  }

  let decoded: string;
  try {
    decoded = fatalTextDecoder.decode(fromBase64Url(cursor));
  } catch {
    throw new InvalidNoteCursorError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new InvalidNoteCursorError();
  }

  if (!Array.isArray(parsed) || parsed.length !== 11) {
    throw new InvalidNoteCursorError();
  }

  const [
    version,
    workspaceId,
    state,
    query,
    tag,
    projectId,
    areaId,
    links,
    sort,
    sortValue,
    id,
  ] = parsed as unknown[];

  if (
    version !== NOTE_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    typeof state !== "string" ||
    !STATES.includes(state as NoteCollectionState) ||
    !optionalString(query) ||
    !optionalString(tag) ||
    !optionalString(projectId) ||
    !optionalString(areaId) ||
    typeof links !== "string" ||
    !LINK_FILTERS.includes(links as NoteLinkFilter) ||
    typeof sort !== "string" ||
    !SORTS.includes(sort as NoteSortOrder) ||
    typeof sortValue !== "string" ||
    sortValue.length === 0 ||
    typeof id !== "string" ||
    id.length === 0
  ) {
    throw new InvalidNoteCursorError();
  }

  return {
    scope: {
      workspaceId,
      state: state as NoteCollectionState,
      query,
      tag,
      projectId,
      areaId,
      links: links as NoteLinkFilter,
      sort: sort as NoteSortOrder,
    },
    position: { sortValue, id },
  };
}

/** True when two scopes are identical in every field that shapes the result set. */
export function noteCursorScopeMatches(
  a: NoteCursorScope,
  b: NoteCursorScope,
): boolean {
  return JSON.stringify(scopeTuple(a)) === JSON.stringify(scopeTuple(b));
}

/**
 * Decode a cursor and require it to have been issued for exactly this scope. A
 * cursor from another workspace, filter set or ordering is rejected — never
 * silently reinterpreted against a different result set.
 */
export function decodeNoteCursorForScope(
  cursor: string,
  scope: NoteCursorScope,
): NoteCursorPosition {
  const decoded = decodeNoteCursor(cursor);
  if (!noteCursorScopeMatches(decoded.scope, scope)) {
    throw new InvalidNoteCursorError();
  }
  return decoded.position;
}

/** Normalise a free-text query the same way for both the scope and the SQL. */
export function normaliseNoteQuery(
  value: ListNotesInput["query"],
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed === "" ? null : trimmed;
}
