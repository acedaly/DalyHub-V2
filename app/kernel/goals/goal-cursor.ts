/**
 * AREA-02 Goals kernel — an opaque cursor for the bounded Goal-Projects read.
 *
 * A keyset position bound to the exact workspace + Goal it was issued for
 * (mirrors `~/kernel/areas/area-cursor.ts`). Opaque to callers and rejected on
 * scope mismatch, so a cursor from another Goal or workspace is never reused
 * against a different result set.
 */

import { InvalidSpineCursorError } from "~/kernel/spine";

export const GOAL_CURSOR_VERSION = 1;

export type GoalCursorPosition = {
  readonly createdAt: string;
  readonly id: string;
};

export type GoalCursorScope = {
  readonly workspaceId: string;
  readonly goalId: string;
};

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

export function encodeGoalCursor(
  scope: GoalCursorScope,
  position: GoalCursorPosition,
): string {
  const json = JSON.stringify([
    GOAL_CURSOR_VERSION,
    scope.workspaceId,
    scope.goalId,
    position.createdAt,
    position.id,
  ]);
  return toBase64Url(textEncoder.encode(json));
}

export type DecodedGoalCursor = {
  readonly scope: GoalCursorScope;
  readonly position: GoalCursorPosition;
};

export function decodeGoalCursor(cursor: string): DecodedGoalCursor {
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
  if (!Array.isArray(parsed) || parsed.length !== 5) {
    throw new InvalidSpineCursorError();
  }
  const [version, workspaceId, goalId, createdAt, id] = parsed;
  if (
    version !== GOAL_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    typeof goalId !== "string" ||
    goalId.length === 0 ||
    typeof createdAt !== "string" ||
    createdAt.length === 0 ||
    typeof id !== "string" ||
    id.length === 0
  ) {
    throw new InvalidSpineCursorError();
  }
  return { scope: { workspaceId, goalId }, position: { createdAt, id } };
}

export function goalCursorScopeMatches(
  a: GoalCursorScope,
  b: GoalCursorScope,
): boolean {
  return a.workspaceId === b.workspaceId && a.goalId === b.goalId;
}

export function decodeGoalCursorForScope(
  cursor: string,
  expectedScope: GoalCursorScope,
): GoalCursorPosition {
  const { scope, position } = decodeGoalCursor(cursor);
  if (!goalCursorScopeMatches(scope, expectedScope)) {
    throw new InvalidSpineCursorError();
  }
  return position;
}
