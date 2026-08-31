/**
 * V2.7 RECALL-03 — the Waiting collection cursor (DEBT-232).
 *
 * `/today/waiting` used to end at `LIMIT 100` with no cursor at all, and state
 * the truncated count in its subtitle as though it were the whole population. At
 * 150 waiting Tasks the surface whose entire job is "what am I waiting on" said
 * "100 tasks are waiting" and row 101 was unreachable. This is the missing half:
 * the standard opaque, versioned, scope-bound keyset cursor every other DalyHub
 * collection already paginates with (ADR-014 §11, ADR-034), shaped exactly like
 * {@link encodeWorkspaceTaskCursor}.
 *
 * A cursor binds two things:
 *
 *   1. the ordering POSITION — the composite `sortValue` of the last row plus the
 *      `id` tiebreaker that makes the ordering TOTAL. The Waiting list orders by
 *      four facts (overdue first, then longest-waiting, then due date, then id);
 *      the repository projects them into ONE lexicographically-comparable string
 *      so the resume predicate is the ordinary two-part keyset comparison rather
 *      than a four-level nest that is easy to get subtly wrong.
 *   2. the query SCOPE — the workspace, the owner's calendar day (which decides
 *      what counts as overdue, and therefore the ORDER) and the follow-up filter
 *      (which decides MEMBERSHIP). A cursor issued under one scope is rejected
 *      under another, never reinterpreted against a different result set.
 *
 * Cursor CONTENTS are untrusted: every field is validated on decode and every
 * value reaching SQL is still bound. Encoding is base64url over a small versioned
 * JSON array, decoded with a FATAL UTF-8 pass so a tampered cursor is rejected
 * rather than repaired.
 */

import { InvalidSpineCursorError } from "~/kernel/spine";

import { TASK_FOLLOW_UP_STATES, type TaskFollowUpState } from "./task";

/** The current waiting-cursor format version. Bump when the shape changes. */
export const WAITING_TASK_CURSOR_VERSION = 1;

/** The ordering position a waiting cursor points just after. */
export type WaitingTaskCursorPosition = {
  /** The composite ordering key of the last returned row. */
  readonly sortValue: string;
  /** Id of the last returned row (the tiebreaker that totalises the order). */
  readonly id: string;
};

/** The query scope a waiting cursor is bound to. */
export type WaitingTaskCursorScope = {
  readonly workspaceId: string;
  /** The owner's calendar day — it decides the overdue-first ordering. */
  readonly todayIso: string;
  /** The follow-up filter, or `""` for the unfiltered collection. */
  readonly followUp: TaskFollowUpState | "";
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

/** Encode a scope + ordering position into an opaque, versioned cursor string. */
export function encodeWaitingTaskCursor(
  scope: WaitingTaskCursorScope,
  position: WaitingTaskCursorPosition,
): string {
  const json = JSON.stringify([
    WAITING_TASK_CURSOR_VERSION,
    scope.workspaceId,
    scope.todayIso,
    scope.followUp,
    position.sortValue,
    position.id,
  ]);
  return toBase64Url(textEncoder.encode(json));
}

/** A decoded cursor: the scope it was issued for and the position it points to. */
export type DecodedWaitingTaskCursor = {
  readonly scope: WaitingTaskCursorScope;
  readonly position: WaitingTaskCursorPosition;
};

/**
 * Decode an opaque cursor back into its scope and position, validating version
 * and shape. Throws `InvalidSpineCursorError` for anything not produced by
 * {@link encodeWaitingTaskCursor} at the current version.
 */
export function decodeWaitingTaskCursor(
  cursor: string,
): DecodedWaitingTaskCursor {
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

  const [version, workspaceId, todayIso, followUp, sortValue, id] = parsed;

  if (
    version !== WAITING_TASK_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    typeof todayIso !== "string" ||
    typeof followUp !== "string" ||
    (followUp !== "" &&
      !(TASK_FOLLOW_UP_STATES as readonly string[]).includes(followUp)) ||
    typeof sortValue !== "string" ||
    typeof id !== "string" ||
    id.length === 0
  ) {
    throw new InvalidSpineCursorError();
  }

  return {
    scope: {
      workspaceId,
      todayIso,
      followUp: followUp as TaskFollowUpState | "",
    },
    position: { sortValue, id },
  };
}

/** True when two scopes are identical in every bound field. */
export function waitingTaskCursorScopeMatches(
  a: WaitingTaskCursorScope,
  b: WaitingTaskCursorScope,
): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.todayIso === b.todayIso &&
    a.followUp === b.followUp
  );
}

/**
 * Decode a cursor and assert it was issued for `expectedScope`, returning just
 * the ordering position. A cursor from another workspace, another owner-day or
 * another follow-up filter is rejected — never silently reinterpreted against a
 * different result set.
 */
export function decodeWaitingTaskCursorForScope(
  cursor: string,
  expectedScope: WaitingTaskCursorScope,
): WaitingTaskCursorPosition {
  const { scope, position } = decodeWaitingTaskCursor(cursor);
  if (!waitingTaskCursorScopeMatches(scope, expectedScope)) {
    throw new InvalidSpineCursorError();
  }
  return position;
}
