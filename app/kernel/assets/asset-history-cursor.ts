/**
 * ASSET-02 Assets kernel — the versioned, scope-bound history/obligation cursor.
 *
 * The same discipline as the ASSET-01 collection cursor, applied to the two
 * bounded reads a record makes: an Asset's timeline and its obligations. A cursor
 * binds BOTH the ordering position and the query scope (workspace + asset + kind +
 * filters), so a cursor issued for "service events on the ute" is rejected when
 * presented to "every event on the trailer". Decoded values remain untrusted and
 * are always BOUND in SQL by the adapter, never interpolated.
 */

import { InvalidAssetCursorError } from "./asset-errors";

/** The cursor wire-format version. Bump on any incompatible shape change. */
export const ASSET_HISTORY_CURSOR_VERSION = 1;

/** Which bounded read a cursor belongs to. */
export type AssetHistoryCursorKind = "events" | "obligations";

/** The ordering position: the primary sort value plus the `id` total-order tiebreak. */
export type AssetHistoryCursorPosition = {
  readonly primary: string;
  readonly id: string;
};

/** The query scope a cursor is bound to. */
export type AssetHistoryCursorScope = {
  readonly workspaceId: string;
  readonly assetId: string;
  readonly kind: AssetHistoryCursorKind;
  /** The canonical serialised filter set, so a cursor can never cross filters. */
  readonly filterKey: string;
};

/** A decoded cursor: its scope plus the position to resume after. */
export type DecodedAssetHistoryCursor = {
  readonly scope: AssetHistoryCursorScope;
  readonly position: AssetHistoryCursorPosition;
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

/**
 * Canonicalise a filter set to a stable key. Sorted, so two requests that select
 * the same categories in a different order share one cursor scope rather than
 * spuriously rejecting each other's cursors.
 */
export function historyFilterKey(
  categories: readonly string[],
  extras: readonly string[] = [],
): string {
  return JSON.stringify([[...categories].sort(), [...extras].sort()]);
}

/** Encode a cursor for a page position within a scope. */
export function encodeAssetHistoryCursor(
  scope: AssetHistoryCursorScope,
  position: AssetHistoryCursorPosition,
): string {
  const payload = [
    ASSET_HISTORY_CURSOR_VERSION,
    scope.workspaceId,
    scope.assetId,
    scope.kind,
    scope.filterKey,
    position.primary,
    position.id,
  ];
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

/** Decode a cursor, validating its shape. Throws `InvalidAssetCursorError`. */
export function decodeAssetHistoryCursor(
  cursor: string,
): DecodedAssetHistoryCursor {
  let parsed: unknown;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(
      fromBase64Url(cursor),
    );
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidAssetCursorError();
  }
  if (!Array.isArray(parsed) || parsed.length !== 7) {
    throw new InvalidAssetCursorError();
  }
  const [version, workspaceId, assetId, kind, filterKey, primary, id] =
    parsed as unknown[];
  if (
    version !== ASSET_HISTORY_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    typeof assetId !== "string" ||
    (kind !== "events" && kind !== "obligations") ||
    typeof filterKey !== "string" ||
    typeof primary !== "string" ||
    typeof id !== "string"
  ) {
    throw new InvalidAssetCursorError();
  }
  return {
    scope: { workspaceId, assetId, kind, filterKey },
    position: { primary, id },
  };
}

/** Decode a cursor and assert it was issued for `expected`. */
export function decodeAssetHistoryCursorForScope(
  cursor: string,
  expected: AssetHistoryCursorScope,
): AssetHistoryCursorPosition {
  const decoded = decodeAssetHistoryCursor(cursor);
  const scope = decoded.scope;
  if (
    scope.workspaceId !== expected.workspaceId ||
    scope.assetId !== expected.assetId ||
    scope.kind !== expected.kind ||
    scope.filterKey !== expected.filterKey
  ) {
    throw new InvalidAssetCursorError();
  }
  return decoded.position;
}
