/**
 * DEBT-23 Goals kernel — an opaque cursor for the WORKSPACE-WIDE, alignment-ordered
 * Goal collection read (`GoalRepository.listGoalsByAlignment`).
 *
 * This is a DELIBERATELY separate cursor kernel from `goal-list-cursor.ts` (the
 * creation-order workspace Goal list) and `goal-cursor.ts` (the per-Goal → Projects
 * read), mirroring this codebase's convention that cursor kernels are never
 * interchangeable across collection surfaces. Its keyset carries the DISPLAY RANK
 * first (the deterministic Alignment precedence, established workspace-wide BEFORE
 * pagination — DEBT-23), then the `(createdAt, id)` tiebreak ending in the immutable
 * id, so a page boundary can never duplicate or omit a Goal.
 *
 * The cursor is bound to BOTH the workspace AND the sort semantics ("alignment"), so
 * a cursor issued for the creation-order list — or another workspace — is rejected
 * rather than reinterpreted. The version guards against a future ranking change
 * silently reusing stale positions.
 */

import { InvalidSpineCursorError } from "~/kernel/spine";

export const GOAL_ALIGNMENT_CURSOR_VERSION = 1;

/** The sort semantics this cursor is bound to (guards against cross-sort reuse). */
export const GOAL_ALIGNMENT_CURSOR_SORT = "alignment";

export type GoalAlignmentCursorPosition = {
  /** The Alignment display rank (lower = shown first). */
  readonly rank: number;
  readonly createdAt: string;
  readonly id: string;
};

export type GoalAlignmentCursorScope = {
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

export function encodeGoalAlignmentCursor(
  scope: GoalAlignmentCursorScope,
  position: GoalAlignmentCursorPosition,
): string {
  const json = JSON.stringify([
    GOAL_ALIGNMENT_CURSOR_VERSION,
    GOAL_ALIGNMENT_CURSOR_SORT,
    scope.workspaceId,
    position.rank,
    position.createdAt,
    position.id,
  ]);
  return toBase64Url(textEncoder.encode(json));
}

export type DecodedGoalAlignmentCursor = {
  readonly scope: GoalAlignmentCursorScope;
  readonly position: GoalAlignmentCursorPosition;
};

export function decodeGoalAlignmentCursor(
  cursor: string,
): DecodedGoalAlignmentCursor {
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
  const [version, sort, workspaceId, rank, createdAt, id] = parsed;
  if (
    version !== GOAL_ALIGNMENT_CURSOR_VERSION ||
    sort !== GOAL_ALIGNMENT_CURSOR_SORT ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    typeof rank !== "number" ||
    !Number.isInteger(rank) ||
    typeof createdAt !== "string" ||
    createdAt.length === 0 ||
    typeof id !== "string" ||
    id.length === 0
  ) {
    throw new InvalidSpineCursorError();
  }
  return { scope: { workspaceId }, position: { rank, createdAt, id } };
}

export function goalAlignmentCursorScopeMatches(
  a: GoalAlignmentCursorScope,
  b: GoalAlignmentCursorScope,
): boolean {
  return a.workspaceId === b.workspaceId;
}

export function decodeGoalAlignmentCursorForScope(
  cursor: string,
  expectedScope: GoalAlignmentCursorScope,
): GoalAlignmentCursorPosition {
  const { scope, position } = decodeGoalAlignmentCursor(cursor);
  if (!goalAlignmentCursorScopeMatches(scope, expectedScope)) {
    throw new InvalidSpineCursorError();
  }
  return position;
}
