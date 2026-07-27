/**
 * ASSET-01 Assets kernel — the versioned, scope-bound collection cursor.
 *
 * An opaque base64url cursor that binds BOTH the ordering position and the query
 * scope. A cursor issued for one scope (workspace + view + sort + filters + query)
 * is REJECTED under any other, so a stale or hand-crafted cursor can never leak
 * rows across scopes. Every view/sort reduces to a stable total order of a single
 * primary key expression plus the `id` tiebreaker; the cursor carries that
 * `(primary, id)` position. Cursor contents are untrusted — every decoded value is
 * still BOUND in SQL by the D1 adapter, never interpolated.
 */

import type { AssetFilters, AssetSort, AssetView } from "./asset";
import { InvalidAssetCursorError } from "./asset-errors";

/** The cursor wire-format version. Bump on any incompatible shape change. */
export const ASSET_CURSOR_VERSION = 1;

/** The ordering position: the primary sort value plus the `id` total-order tiebreak. */
export type AssetCursorPosition = {
  /** The serialised value of the view/sort's primary ordering expression. */
  readonly primary: string;
  readonly id: string;
};

/** The query scope a cursor is bound to. */
export type AssetCursorScope = {
  readonly workspaceId: string;
  readonly view: AssetView;
  readonly sort: AssetSort;
  readonly query: string | null;
  /** The active filters (bound so a cursor can't cross filter sets). */
  readonly filters: AssetFilters;
};

/** A decoded cursor: its scope plus the position to resume after. */
export type DecodedAssetCursor = {
  readonly scope: AssetCursorScope;
  readonly position: AssetCursorPosition;
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

/** Canonicalise the active filters to a stable string, so the scope binds them. */
function serialiseFilters(filters: AssetFilters): string {
  return JSON.stringify([
    filters.type ?? "",
    filters.status ?? "",
    filters.areaId ?? "",
    filters.personId ?? "",
    filters.tag ?? "",
  ]);
}

/** Reconstruct the filters object from its canonical serialised form. */
function deserialiseFilters(value: string): AssetFilters {
  let parts: unknown;
  try {
    parts = JSON.parse(value);
  } catch {
    return {};
  }
  if (!Array.isArray(parts)) return {};
  const [type, status, areaId, personId, tag] = parts as unknown[];
  const out: {
    type?: string;
    status?: string;
    areaId?: string;
    personId?: string;
    tag?: string;
  } = {};
  if (typeof type === "string" && type) out.type = type;
  if (typeof status === "string" && status) out.status = status;
  if (typeof areaId === "string" && areaId) out.areaId = areaId;
  if (typeof personId === "string" && personId) out.personId = personId;
  if (typeof tag === "string" && tag) out.tag = tag;
  return out;
}

/** Encode a cursor for a page position within a scope. */
export function encodeAssetCursor(
  scope: AssetCursorScope,
  position: AssetCursorPosition,
): string {
  const payload = [
    ASSET_CURSOR_VERSION,
    scope.workspaceId,
    scope.view,
    scope.sort,
    scope.query,
    serialiseFilters(scope.filters),
    position.primary,
    position.id,
  ];
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

/** Decode a cursor, validating its shape. Throws `InvalidAssetCursorError`. */
export function decodeAssetCursor(cursor: string): DecodedAssetCursor {
  let parsed: unknown;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(
      fromBase64Url(cursor),
    );
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidAssetCursorError();
  }
  if (!Array.isArray(parsed) || parsed.length !== 8) {
    throw new InvalidAssetCursorError();
  }
  const [version, workspaceId, view, sort, query, filters, primary, id] =
    parsed as unknown[];
  if (
    version !== ASSET_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    typeof view !== "string" ||
    typeof sort !== "string" ||
    (query !== null && typeof query !== "string") ||
    typeof filters !== "string" ||
    typeof primary !== "string" ||
    typeof id !== "string"
  ) {
    throw new InvalidAssetCursorError();
  }
  return {
    scope: {
      workspaceId,
      view: view as AssetView,
      sort: sort as AssetSort,
      query,
      filters: deserialiseFilters(filters),
    },
    position: { primary, id },
  };
}

/** True when two scopes are identical. */
export function assetCursorScopeMatches(
  a: AssetCursorScope,
  b: AssetCursorScope,
): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.view === b.view &&
    a.sort === b.sort &&
    a.query === b.query &&
    serialiseFilters(a.filters) === serialiseFilters(b.filters)
  );
}

/** Decode a cursor and assert it was issued for `expectedScope`. */
export function decodeAssetCursorForScope(
  cursor: string,
  expectedScope: AssetCursorScope,
): AssetCursorPosition {
  const decoded = decodeAssetCursor(cursor);
  if (!assetCursorScopeMatches(decoded.scope, expectedScope)) {
    throw new InvalidAssetCursorError();
  }
  return decoded.position;
}
