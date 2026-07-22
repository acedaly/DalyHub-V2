/**
 * PROJ-01 Tasks kernel — the project-task list cursor, bound to its query scope.
 *
 * A project's task list is paginated with an opaque, stable cursor rather than an
 * unbounded offset — mirroring the spine child cursor and the Projects collection
 * cursor (ADR-014 §11, ADR-034). A cursor captures two things:
 *
 *   1. the ordering POSITION — the `(createdAt, id)` tuple of the last task
 *      returned, so the next page resumes exactly after it. `id` is the
 *      tiebreaker that makes the ordering total and therefore deterministic. The
 *      project task list is ordered `(created_at ASC, id ASC)` — a stable keyset
 *      over columns that never change, so no task is ever skipped or repeated
 *      across page boundaries.
 *   2. the query SCOPE — the workspace, the PROJECT id and the completion `state`
 *      filter. Every input that affects WHICH tasks appear is bound in.
 *
 * Binding the scope in is a correctness and safety requirement: a cursor issued
 * for one project must be rejected under another, a cursor for the `open` filter
 * must be rejected under `completed`, and a cross-workspace cursor must be
 * rejected — a stale cursor is never silently reinterpreted against a different
 * result set. Mismatches — like malformed cursors — are rejected as
 * `InvalidSpineCursorError`. A wrong-kind, missing or cross-workspace project id
 * still simply yields no tasks; the cursor discloses nothing.
 *
 * The encoding is base64url over a small, versioned JSON array, decoded with a
 * FATAL UTF-8 pass so a tampered/malformed cursor is rejected, never repaired.
 * Cursor CONTENTS are untrusted: every field is validated on decode and every
 * value reaching SQL is still bound, never interpolated.
 */

import { InvalidSpineCursorError } from "~/kernel/spine";

import type { TaskStateFilter } from "./task";

/** The current project-task cursor format version. Bump when the shape changes. */
export const PROJECT_TASK_CURSOR_VERSION = 1;

/** The ordering position a project-task cursor points just after. */
export type ProjectTaskCursorPosition = {
  /** ISO-8601 UTC timestamp of the last returned task's `createdAt`. */
  readonly createdAt: string;
  /** Id of the last returned task (the tiebreaker). */
  readonly id: string;
};

/** The query scope a project-task cursor is bound to. */
export type ProjectTaskCursorScope = {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly state: TaskStateFilter;
};

const TASK_STATE_FILTERS: readonly TaskStateFilter[] = [
  "open",
  "completed",
  "all",
];

const textEncoder = new TextEncoder();
/** A FATAL decoder: malformed UTF-8 throws rather than yielding replacement chars. */
const fatalTextDecoder = new TextDecoder("utf-8", { fatal: true });

/** Encode bytes as unpadded base64url. */
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

/** Decode unpadded base64url back into bytes, or throw for a malformed string. */
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
export function encodeProjectTaskCursor(
  scope: ProjectTaskCursorScope,
  position: ProjectTaskCursorPosition,
): string {
  const json = JSON.stringify([
    PROJECT_TASK_CURSOR_VERSION,
    scope.workspaceId,
    scope.projectId,
    scope.state,
    position.createdAt,
    position.id,
  ]);
  return toBase64Url(textEncoder.encode(json));
}

/** A decoded cursor: the scope it was issued for and the position it points to. */
export type DecodedProjectTaskCursor = {
  readonly scope: ProjectTaskCursorScope;
  readonly position: ProjectTaskCursorPosition;
};

/**
 * Decode an opaque cursor back into its scope and position, validating version
 * and shape. Throws `InvalidSpineCursorError` for anything not produced by
 * {@link encodeProjectTaskCursor} at the current version.
 */
export function decodeProjectTaskCursor(
  cursor: string,
): DecodedProjectTaskCursor {
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

  const [version, workspaceId, projectId, state, createdAt, id] = parsed;

  if (
    version !== PROJECT_TASK_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    typeof projectId !== "string" ||
    projectId.length === 0 ||
    typeof state !== "string" ||
    !TASK_STATE_FILTERS.includes(state as TaskStateFilter) ||
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
      projectId,
      state: state as TaskStateFilter,
    },
    position: { createdAt, id },
  };
}

/** True when two scopes are identical in workspace, project id and state filter. */
export function projectTaskCursorScopeMatches(
  a: ProjectTaskCursorScope,
  b: ProjectTaskCursorScope,
): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.projectId === b.projectId &&
    a.state === b.state
  );
}

/**
 * Decode a cursor and assert it was issued for `expectedScope`, returning just
 * the ordering position. A cursor from another workspace, project or state filter
 * is rejected — it is never silently reinterpreted against a different result set.
 */
export function decodeProjectTaskCursorForScope(
  cursor: string,
  expectedScope: ProjectTaskCursorScope,
): ProjectTaskCursorPosition {
  const { scope, position } = decodeProjectTaskCursor(cursor);
  if (!projectTaskCursorScopeMatches(scope, expectedScope)) {
    throw new InvalidSpineCursorError();
  }
  return position;
}
