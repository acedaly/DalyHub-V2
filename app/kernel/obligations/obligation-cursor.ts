/**
 * V2.10 LIFE-01 Obligations kernel — the versioned, scope-bound list cursor.
 *
 * The same discipline every bounded read in the product uses: a cursor binds
 * BOTH the ordering position and the query scope (workspace + subject +
 * filters), so a cursor issued for "open service obligations on the ute" is
 * rejected when presented to "everything due in the workspace". Decoded values
 * remain untrusted and are always BOUND in SQL by the adapter, never
 * interpolated.
 *
 * The subject is part of the scope and may be absent, which is the one
 * difference from the Assets history cursor this is modelled on: `null` is the
 * whole workspace, and the empty string is "only the ones about nothing", and
 * they are different scopes rather than the same one spelled two ways.
 */

import { ObligationValidationError } from "./obligation-errors";

/** The cursor wire-format version. Bump on any incompatible shape change. */
export const OBLIGATION_CURSOR_VERSION = 1;

/** Thrown when a cursor is malformed or was issued for another scope. */
export class InvalidObligationCursorError extends ObligationValidationError {
  constructor() {
    super("cursor", "is not a cursor for this list");
    this.name = "InvalidObligationCursorError";
  }
}

/** The ordering position: the primary sort value plus the `id` tiebreak. */
export type ObligationCursorPosition = {
  readonly primary: string;
  readonly id: string;
};

/** The query scope a cursor is bound to. */
export type ObligationCursorScope = {
  readonly workspaceId: string;
  /**
   * `undefined` — the whole workspace. `null` — only obligations with no
   * subject. A string — that subject's obligations.
   */
  readonly subjectEntityId: string | null | undefined;
  /** The canonical serialised filter set, so a cursor cannot cross filters. */
  readonly filterKey: string;
};

/** A decoded cursor: its scope plus the position to resume after. */
export type DecodedObligationCursor = {
  readonly scope: ObligationCursorScope;
  readonly position: ObligationCursorPosition;
};

/** How the three subject scopes travel inside a cursor, unambiguously. */
function encodeSubject(subject: string | null | undefined): string {
  if (subject === undefined) return "*";
  if (subject === null) return "-";
  return `=${subject}`;
}

function decodeSubject(value: string): string | null | undefined {
  if (value === "*") return undefined;
  if (value === "-") return null;
  if (value.startsWith("=")) return value.slice(1);
  throw new InvalidObligationCursorError();
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
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Canonicalise a filter set to a stable key. Sorted, so two requests selecting
 * the same categories in a different order share one cursor scope rather than
 * spuriously rejecting each other's cursors.
 */
export function obligationFilterKey(
  categories: readonly string[],
  statuses: readonly string[] = [],
): string {
  return JSON.stringify([[...categories].sort(), [...statuses].sort()]);
}

/** Encode a cursor for a page position within a scope. */
export function encodeObligationCursor(
  scope: ObligationCursorScope,
  position: ObligationCursorPosition,
): string {
  const payload = [
    OBLIGATION_CURSOR_VERSION,
    scope.workspaceId,
    encodeSubject(scope.subjectEntityId),
    scope.filterKey,
    position.primary,
    position.id,
  ];
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

/** Decode a cursor, validating its shape. */
export function decodeObligationCursor(
  cursor: string,
): DecodedObligationCursor {
  let parsed: unknown;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(
      fromBase64Url(cursor),
    );
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidObligationCursorError();
  }
  if (!Array.isArray(parsed) || parsed.length !== 6) {
    throw new InvalidObligationCursorError();
  }
  const [version, workspaceId, subject, filterKey, primary, id] =
    parsed as unknown[];
  if (
    version !== OBLIGATION_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    typeof subject !== "string" ||
    typeof filterKey !== "string" ||
    typeof primary !== "string" ||
    typeof id !== "string"
  ) {
    throw new InvalidObligationCursorError();
  }
  return {
    scope: {
      workspaceId,
      subjectEntityId: decodeSubject(subject),
      filterKey,
    },
    position: { primary, id },
  };
}

/** Decode a cursor and assert it was issued for `expected`. */
export function decodeObligationCursorForScope(
  cursor: string,
  expected: ObligationCursorScope,
): ObligationCursorPosition {
  const decoded = decodeObligationCursor(cursor);
  if (
    decoded.scope.workspaceId !== expected.workspaceId ||
    decoded.scope.subjectEntityId !== expected.subjectEntityId ||
    decoded.scope.filterKey !== expected.filterKey
  ) {
    throw new InvalidObligationCursorError();
  }
  return decoded.position;
}
