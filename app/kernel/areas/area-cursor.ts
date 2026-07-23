/**
 * AREA-01 Areas kernel — opaque cursors for bounded Area reads.
 *
 * Cursors are keyset positions bound to the exact workspace/query scope they were
 * issued for. They are opaque to callers and rejected on scope mismatch, so a
 * cursor from another workspace or another Area record subsection is never reused
 * against a different result set.
 */

import { InvalidSpineCursorError } from "~/kernel/spine";

export const AREA_CURSOR_VERSION = 1;

export type AreaCursorKind = "areas" | "goals" | "projects";

export type AreaCursorPosition = {
  readonly createdAt: string;
  readonly id: string;
};

export type AreaCursorScope = {
  readonly workspaceId: string;
  readonly kind: AreaCursorKind;
  readonly areaId: string | null;
};

const AREA_CURSOR_KINDS: readonly AreaCursorKind[] = [
  "areas",
  "goals",
  "projects",
];

const textEncoder = new TextEncoder();
const fatalTextDecoder = new TextDecoder("utf-8", { fatal: true });

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
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised.padEnd(
    normalised.length + ((4 - (normalised.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeAreaCursor(
  scope: AreaCursorScope,
  position: AreaCursorPosition,
): string {
  const json = JSON.stringify([
    AREA_CURSOR_VERSION,
    scope.workspaceId,
    scope.kind,
    scope.areaId,
    position.createdAt,
    position.id,
  ]);
  return toBase64Url(textEncoder.encode(json));
}

export type DecodedAreaCursor = {
  readonly scope: AreaCursorScope;
  readonly position: AreaCursorPosition;
};

export function decodeAreaCursor(cursor: string): DecodedAreaCursor {
  if (typeof cursor !== "string" || cursor.length === 0) {
    throw new InvalidSpineCursorError();
  }

  let decoded: string;
  try {
    decoded = fatalTextDecoder.decode(fromBase64Url(cursor));
  } catch {
    throw new InvalidSpineCursorError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new InvalidSpineCursorError();
  }

  if (!Array.isArray(parsed) || parsed.length !== 6) {
    throw new InvalidSpineCursorError();
  }

  const [version, workspaceId, kind, areaId, createdAt, id] = parsed;
  if (
    version !== AREA_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    typeof kind !== "string" ||
    !AREA_CURSOR_KINDS.includes(kind as AreaCursorKind) ||
    (areaId !== null && (typeof areaId !== "string" || areaId.length === 0)) ||
    typeof createdAt !== "string" ||
    createdAt.length === 0 ||
    typeof id !== "string" ||
    id.length === 0
  ) {
    throw new InvalidSpineCursorError();
  }

  return {
    scope: {
      workspaceId,
      kind: kind as AreaCursorKind,
      areaId,
    },
    position: { createdAt, id },
  };
}

export function areaCursorScopeMatches(
  a: AreaCursorScope,
  b: AreaCursorScope,
): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.kind === b.kind &&
    a.areaId === b.areaId
  );
}

export function decodeAreaCursorForScope(
  cursor: string,
  expectedScope: AreaCursorScope,
): AreaCursorPosition {
  const { scope, position } = decodeAreaCursor(cursor);
  if (!areaCursorScopeMatches(scope, expectedScope)) {
    throw new InvalidSpineCursorError();
  }
  return position;
}
