/**
 * AREA-03 Goals kernel — an opaque cursor for the bounded, workspace-wide Goal
 * list read (`GoalRepository.listGoals`, ADR-040 §40.7).
 *
 * A keyset position bound to the exact workspace it was issued for. This is
 * DELIBERATELY a separate cursor kernel from `goal-cursor.ts` (which scopes
 * the bounded Goal→Projects read to one Goal) — mirroring this codebase's
 * established convention that cursor kernels are never interchangeable across
 * collection surfaces (activity/entity-link/spine/entity/goal/project/area/
 * task-project cursors are all separate). Opaque to callers and rejected on
 * scope mismatch.
 */

import { InvalidSpineCursorError } from "~/kernel/spine";

export const GOAL_LIST_CURSOR_VERSION = 1;

export type GoalListCursorPosition = {
  readonly createdAt: string;
  readonly id: string;
};

export type GoalListCursorScope = {
  readonly workspaceId: string;
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

export function encodeGoalListCursor(
  scope: GoalListCursorScope,
  position: GoalListCursorPosition,
): string {
  const json = JSON.stringify([
    GOAL_LIST_CURSOR_VERSION,
    scope.workspaceId,
    position.createdAt,
    position.id,
  ]);
  return toBase64Url(textEncoder.encode(json));
}

export type DecodedGoalListCursor = {
  readonly scope: GoalListCursorScope;
  readonly position: GoalListCursorPosition;
};

export function decodeGoalListCursor(cursor: string): DecodedGoalListCursor {
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
  if (!Array.isArray(parsed) || parsed.length !== 4) {
    throw new InvalidSpineCursorError();
  }
  const [version, workspaceId, createdAt, id] = parsed;
  if (
    version !== GOAL_LIST_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    typeof createdAt !== "string" ||
    createdAt.length === 0 ||
    typeof id !== "string" ||
    id.length === 0
  ) {
    throw new InvalidSpineCursorError();
  }
  return { scope: { workspaceId }, position: { createdAt, id } };
}

export function goalListCursorScopeMatches(
  a: GoalListCursorScope,
  b: GoalListCursorScope,
): boolean {
  return a.workspaceId === b.workspaceId;
}

export function decodeGoalListCursorForScope(
  cursor: string,
  expectedScope: GoalListCursorScope,
): GoalListCursorPosition {
  const { scope, position } = decodeGoalListCursor(cursor);
  if (!goalListCursorScopeMatches(scope, expectedScope)) {
    throw new InvalidSpineCursorError();
  }
  return position;
}
