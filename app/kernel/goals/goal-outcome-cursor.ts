/**
 * STEER-01 Goals kernel — an opaque cursor for the WORKSPACE-WIDE,
 * outcome-ordered Goal collection read (`GoalRepository.listGoalsByOutcome`).
 *
 * A deliberately separate cursor kernel from `goal-alignment-cursor.ts` (the
 * alignment-ordered list), `goal-list-cursor.ts` (creation order) and
 * `goal-cursor.ts` (a Goal's Projects), following the standing convention that
 * cursor kernels are never interchangeable across collection surfaces. Its
 * keyset carries the OUTCOME DISPLAY RANK first (`GOAL_OUTCOME_DISPLAY_RANK`,
 * established workspace-wide in SQL BEFORE pagination), then the
 * `(createdAt, id)` tiebreak ending in the immutable id, so a page boundary can
 * never duplicate or omit a Goal.
 *
 * The cursor is bound to EVERY state that materially affects the ordered
 * result, so it can never be replayed against a different question:
 *
 *  - the **workspace** (isolation);
 *  - the **sort semantics** (`"outcome"` — an alignment or creation-order
 *    cursor is rejected, never reinterpreted);
 *  - the **owner-calendar day** (`todayIso`) — overdue, stale and the schedule
 *    comparison all shift on a day rollover, so a cursor from yesterday's
 *    ranking is rejected rather than silently splicing yesterday's page two
 *    onto today's page one;
 *  - the **owner's time zone** — each Goal's schedule origin is its creation
 *    day in the owner's calendar, so a zone change re-ranks and invalidates;
 *  - the **lens** (`view`) — a filtered collection is a different result set,
 *    so a cursor issued under one lens cannot page another.
 *
 * A rejected cursor surfaces as `InvalidSpineCursorError`, which the route
 * resets calmly to the first page — exactly as the alignment cursor does.
 */

import { InvalidSpineCursorError } from "~/kernel/spine";

import type { GoalCollectionView } from "./goal-outcome";

export const GOAL_OUTCOME_CURSOR_VERSION = 1;

/** The sort semantics this cursor is bound to (guards against cross-sort reuse). */
export const GOAL_OUTCOME_CURSOR_SORT = "outcome";

export type GoalOutcomeCursorPosition = {
  /** The outcome display rank (lower = shown first). */
  readonly rank: number;
  readonly createdAt: string;
  readonly id: string;
};

export type GoalOutcomeCursorScope = {
  readonly workspaceId: string;
  /** The owner-calendar day the ranking was computed for (`YYYY-MM-DD`). */
  readonly todayIso: string;
  /** The owner's IANA time zone the schedule origins were resolved in. */
  readonly timeZone: string;
  /** The lens the page was filtered by (`"all"` when unfiltered). */
  readonly view: GoalCollectionView;
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

export function encodeGoalOutcomeCursor(
  scope: GoalOutcomeCursorScope,
  position: GoalOutcomeCursorPosition,
): string {
  const json = JSON.stringify([
    GOAL_OUTCOME_CURSOR_VERSION,
    GOAL_OUTCOME_CURSOR_SORT,
    scope.workspaceId,
    scope.todayIso,
    scope.timeZone,
    scope.view,
    position.rank,
    position.createdAt,
    position.id,
  ]);
  return toBase64Url(textEncoder.encode(json));
}

export type DecodedGoalOutcomeCursor = {
  readonly scope: GoalOutcomeCursorScope;
  readonly position: GoalOutcomeCursorPosition;
};

export function decodeGoalOutcomeCursor(
  cursor: string,
): DecodedGoalOutcomeCursor {
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
  if (!Array.isArray(parsed) || parsed.length !== 9) {
    throw new InvalidSpineCursorError();
  }
  const [
    version,
    sort,
    workspaceId,
    todayIso,
    timeZone,
    view,
    rank,
    createdAt,
    id,
  ] = parsed;
  if (
    version !== GOAL_OUTCOME_CURSOR_VERSION ||
    sort !== GOAL_OUTCOME_CURSOR_SORT ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    typeof todayIso !== "string" ||
    todayIso.length === 0 ||
    typeof timeZone !== "string" ||
    timeZone.length === 0 ||
    typeof view !== "string" ||
    view.length === 0 ||
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
    scope: {
      workspaceId,
      todayIso,
      timeZone,
      view: view as GoalCollectionView,
    },
    position: { rank, createdAt, id },
  };
}

export function goalOutcomeCursorScopeMatches(
  a: GoalOutcomeCursorScope,
  b: GoalOutcomeCursorScope,
): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.todayIso === b.todayIso &&
    a.timeZone === b.timeZone &&
    a.view === b.view
  );
}

export function decodeGoalOutcomeCursorForScope(
  cursor: string,
  expectedScope: GoalOutcomeCursorScope,
): GoalOutcomeCursorPosition {
  const { scope, position } = decodeGoalOutcomeCursor(cursor);
  if (!goalOutcomeCursorScopeMatches(scope, expectedScope)) {
    throw new InvalidSpineCursorError();
  }
  return position;
}
