/**
 * PROJ-01 Projects kernel — the collection cursor, bound to its query scope.
 *
 * The Projects collection is paginated with an opaque, stable cursor rather than
 * an unbounded offset — mirroring the spine child cursor (ADR-014 §11, ADR-034).
 * A cursor captures two things:
 *
 *   1. the ordering POSITION — the `(sortValue, id)` tuple of the last project
 *      returned, so the next page resumes exactly after it. `id` is the
 *      tiebreaker that makes the ordering total and therefore deterministic. The
 *      `sortValue` is `createdAt` for the `created` order and `updatedAt` for the
 *      `recent` order — whichever column the requested ordering sorts on.
 *   2. the query SCOPE — the workspace, the completion `state` filter and the
 *      `order`. Every input that affects WHICH rows appear, and in WHAT sequence,
 *      is bound in.
 *
 * Binding the scope into the cursor is a correctness and safety requirement: a
 * cursor issued for one workspace must be rejected under another, a cursor for the
 * `open` filter must be rejected under `completed`, and a cursor for the `created`
 * ordering must be rejected under `recent` — a stale cursor is never silently
 * reinterpreted against a different result set (which could skip or duplicate
 * projects). Mismatches — like malformed cursors — are rejected as
 * `InvalidSpineCursorError`.
 *
 * The encoding is base64url over a small, versioned JSON array, decoded with a
 * FATAL UTF-8 pass so a tampered/malformed cursor is rejected, never repaired.
 * Cursor CONTENTS are untrusted: every field is validated on decode and every
 * value reaching SQL is still bound, never interpolated.
 */

import { InvalidSpineCursorError } from "~/kernel/spine";
import type { ProjectWorkflowStatus } from "~/kernel/project-settings";

import type { ProjectOrder, ProjectStateFilter } from "./project";

/** The current project cursor format version. Bump when the encoded shape changes. */
export const PROJECT_CURSOR_VERSION = 3;

/** The ordering position a project cursor points just after. */
export type ProjectCursorPosition = {
  /**
   * The ISO-8601 UTC timestamp the ordering sorts on for the last returned
   * project — its `createdAt` under the `created` order, its `updatedAt` under
   * the `recent` order.
   */
  readonly sortValue: string;
  /** Id of the last returned project (the tiebreaker). */
  readonly id: string;
};

/** The query scope a project cursor is bound to. */
export type ProjectCursorScope = {
  readonly workspaceId: string;
  readonly state: ProjectStateFilter;
  /** The exact `workflowStatus` filter, or `null` when unrestricted. */
  readonly workflowStatus: ProjectWorkflowStatus | null;
  readonly order: ProjectOrder;
};

const PROJECT_STATE_FILTERS: readonly ProjectStateFilter[] = [
  "open",
  "completed",
  "archived",
  "all",
];
const PROJECT_ORDERS: readonly ProjectOrder[] = ["created", "recent"];
const PROJECT_WORKFLOW_STATUS_VALUES: readonly ProjectWorkflowStatus[] = [
  "planned",
  "active",
  "on_hold",
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
export function encodeProjectCursor(
  scope: ProjectCursorScope,
  position: ProjectCursorPosition,
): string {
  const json = JSON.stringify([
    PROJECT_CURSOR_VERSION,
    scope.workspaceId,
    scope.state,
    scope.workflowStatus,
    scope.order,
    position.sortValue,
    position.id,
  ]);
  return toBase64Url(textEncoder.encode(json));
}

/** A decoded cursor: the scope it was issued for and the position it points to. */
export type DecodedProjectCursor = {
  readonly scope: ProjectCursorScope;
  readonly position: ProjectCursorPosition;
};

/**
 * Decode an opaque cursor back into its scope and position, validating version
 * and shape. Throws `InvalidSpineCursorError` for anything not produced by
 * {@link encodeProjectCursor} at the current version.
 */
export function decodeProjectCursor(cursor: string): DecodedProjectCursor {
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

  if (!Array.isArray(parsed) || parsed.length !== 7) {
    throw new InvalidSpineCursorError();
  }

  const [version, workspaceId, state, workflowStatus, order, sortValue, id] =
    parsed;

  if (
    version !== PROJECT_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    typeof state !== "string" ||
    !PROJECT_STATE_FILTERS.includes(state as ProjectStateFilter) ||
    (workflowStatus !== null &&
      (typeof workflowStatus !== "string" ||
        !PROJECT_WORKFLOW_STATUS_VALUES.includes(
          workflowStatus as ProjectWorkflowStatus,
        ))) ||
    typeof order !== "string" ||
    !PROJECT_ORDERS.includes(order as ProjectOrder) ||
    typeof sortValue !== "string" ||
    sortValue.length === 0 ||
    typeof id !== "string" ||
    id.length === 0
  ) {
    throw new InvalidSpineCursorError();
  }

  return {
    scope: {
      workspaceId,
      state: state as ProjectStateFilter,
      workflowStatus: workflowStatus as ProjectWorkflowStatus | null,
      order: order as ProjectOrder,
    },
    position: { sortValue, id },
  };
}

/** True when two scopes are identical in workspace, state filter and ordering. */
export function projectCursorScopeMatches(
  a: ProjectCursorScope,
  b: ProjectCursorScope,
): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.state === b.state &&
    a.workflowStatus === b.workflowStatus &&
    a.order === b.order
  );
}

/**
 * Decode a cursor and assert it was issued for `expectedScope`, returning just
 * the ordering position. A cursor from another workspace, state filter or
 * ordering is rejected — it is never silently reinterpreted against a different
 * result set.
 */
export function decodeProjectCursorForScope(
  cursor: string,
  expectedScope: ProjectCursorScope,
): ProjectCursorPosition {
  const { scope, position } = decodeProjectCursor(cursor);
  if (!projectCursorScopeMatches(scope, expectedScope)) {
    throw new InvalidSpineCursorError();
  }
  return position;
}
