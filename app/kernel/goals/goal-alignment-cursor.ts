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
 * The cursor is bound to the workspace, the sort semantics ("alignment") AND the
 * effective ranking window (`windowStartIso` — the owner-calendar active/neglected
 * boundary that decides each Goal's rank). A cursor issued for the creation-order
 * list, another workspace, or a DIFFERENT recency window (e.g. reused across an
 * owner-calendar day rollover, when a Goal's rank could shift around the activity
 * cutoff) is rejected rather than reinterpreted — so appended pages can never
 * duplicate or omit a Goal whose rank moved. The version guards against a future
 * ranking-format change silently reusing stale positions.
 */

import { InvalidSpineCursorError } from "~/kernel/spine";

/**
 * Version 2 (STEER-02): the scope gained `omitSetAside`, because a page read
 * with set-aside Goals excluded is a different result set from one without.
 * Bumping refuses every cursor issued under version 1 rather than
 * reinterpreting it — the calm reset to page one every cursor kernel here
 * performs.
 */
export const GOAL_ALIGNMENT_CURSOR_VERSION = 2;

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
  /** The effective ranking window (the owner-calendar active/neglected boundary
   * instant) the rank was computed under. A cursor is invalid under a different
   * window. */
  readonly windowStartIso: string;
  /**
   * STEER-02 — whether the page EXCLUDED Goals the owner has set aside (an
   * attention surface's read). It is part of the scope because it changes which
   * Goals the result set contains, so a cursor from one cannot page the other.
   */
  readonly omitSetAside: boolean;
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
    scope.windowStartIso,
    scope.omitSetAside,
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
  if (!Array.isArray(parsed) || parsed.length !== 8) {
    throw new InvalidSpineCursorError();
  }
  const [
    version,
    sort,
    workspaceId,
    windowStartIso,
    omitSetAside,
    rank,
    createdAt,
    id,
  ] = parsed;
  if (
    version !== GOAL_ALIGNMENT_CURSOR_VERSION ||
    sort !== GOAL_ALIGNMENT_CURSOR_SORT ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    typeof windowStartIso !== "string" ||
    windowStartIso.length === 0 ||
    typeof omitSetAside !== "boolean" ||
    typeof rank !== "number" ||
    !Number.isInteger(rank) ||
    typeof createdAt !== "string" ||
    createdAt.length === 0 ||
    typeof id !== "string" ||
    id.length === 0
  ) {
    throw new InvalidSpineCursorError();
  }
  return {
    scope: { workspaceId, windowStartIso, omitSetAside },
    position: { rank, createdAt, id },
  };
}

export function goalAlignmentCursorScopeMatches(
  a: GoalAlignmentCursorScope,
  b: GoalAlignmentCursorScope,
): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.windowStartIso === b.windowStartIso &&
    a.omitSetAside === b.omitSetAside
  );
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
