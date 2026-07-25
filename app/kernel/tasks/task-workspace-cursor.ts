/**
 * TASKS-01 Tasks kernel — the workspace-wide Tasks list cursor (ADR-043 §8).
 *
 * `/tasks` paginates the workspace-wide collection with an opaque, versioned,
 * scope-bound cursor — never an offset, never "load the whole workspace". It binds:
 *
 *   1. the ordering POSITION — the primary sort value plus a universal
 *      `(createdAt, id)` tiebreaker of the last row, so the next page resumes
 *      exactly after it with no skip or duplicate (`id` makes ordering total).
 *   2. the query SCOPE — the workspace, the system VIEW, the SORT, the owner's
 *      calendar date window (`todayIso`, which changes calendar-relative views),
 *      and a canonical signature of every FILTER that can change which tasks
 *      appear. Every input that affects membership or ordering is bound in.
 *
 * A cursor issued for one scope is REJECTED under another (a different view,
 * filter, sort, workspace or day) as `InvalidSpineCursorError` — never silently
 * reinterpreted against a different result set. Cursor CONTENTS are untrusted:
 * every field is validated on decode; every value reaching SQL is still bound,
 * never interpolated. Encoding is base64url over a small versioned JSON array,
 * decoded with a FATAL UTF-8 pass so a tampered cursor is rejected, not repaired.
 */

import { InvalidSpineCursorError } from "~/kernel/spine";

import {
  TASK_SORTS,
  TASK_SYSTEM_VIEWS,
  type TaskSort,
  type TaskSystemView,
  type WorkspaceTaskFilters,
} from "./task";

/** The current workspace-tasks cursor format version. Bump when the shape changes. */
export const WORKSPACE_TASK_CURSOR_VERSION = 1;

/** The ordering position a workspace-tasks cursor points just after. */
export type WorkspaceTaskCursorPosition = {
  /** The primary sort value of the last row (empty string represents null). */
  readonly sortValue: string;
  /** ISO-8601 UTC `createdAt` of the last row (universal tiebreaker). */
  readonly createdAt: string;
  /** Id of the last row (the final tiebreaker). */
  readonly id: string;
};

/** The query scope a workspace-tasks cursor is bound to. */
export type WorkspaceTaskCursorScope = {
  readonly workspaceId: string;
  readonly view: TaskSystemView;
  readonly sort: TaskSort;
  readonly todayIso: string;
  /** A canonical, order-independent signature of the applied filters. */
  readonly filtersSignature: string;
};

/**
 * Build the canonical, deterministic signature of a filter set. Order-independent
 * (keys are emitted in a fixed order) so two equivalent filter sets produce the
 * same signature and the same cursor scope.
 */
export function workspaceTaskFiltersSignature(
  filters: WorkspaceTaskFilters | undefined,
): string {
  if (!filters) {
    return "";
  }
  const parts: string[] = [];
  // `undefined` = no filter; an explicit `null` = the "IS NULL" filter (a Matrix
  // Unprioritised / Sectors Inbox "view all"). They are DISTINCT scopes, so a null
  // filter is encoded (`p=null`) rather than omitted — a cursor from the unfiltered
  // view is then rejected under the null-filtered view, never reinterpreted.
  if (filters.priority !== undefined)
    parts.push(`p=${filters.priority ?? "null"}`);
  if (filters.timeSector !== undefined)
    parts.push(`s=${filters.timeSector ?? "null"}`);
  if (filters.commitmentState != null)
    parts.push(`c=${filters.commitmentState}`);
  if (filters.status != null) parts.push(`w=${filters.status}`);
  if (filters.projectId != null) parts.push(`pr=${filters.projectId}`);
  if (filters.goalId != null) parts.push(`g=${filters.goalId}`);
  if (filters.areaId != null) parts.push(`a=${filters.areaId}`);
  if (filters.delegatedOnly) parts.push("dg=1");
  if (filters.waitingOnly) parts.push("wt=1");
  return parts.join("&");
}

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
export function encodeWorkspaceTaskCursor(
  scope: WorkspaceTaskCursorScope,
  position: WorkspaceTaskCursorPosition,
): string {
  const json = JSON.stringify([
    WORKSPACE_TASK_CURSOR_VERSION,
    scope.workspaceId,
    scope.view,
    scope.sort,
    scope.todayIso,
    scope.filtersSignature,
    position.sortValue,
    position.createdAt,
    position.id,
  ]);
  return toBase64Url(textEncoder.encode(json));
}

/** A decoded cursor: the scope it was issued for and the position it points to. */
export type DecodedWorkspaceTaskCursor = {
  readonly scope: WorkspaceTaskCursorScope;
  readonly position: WorkspaceTaskCursorPosition;
};

/**
 * Decode an opaque cursor back into its scope and position, validating version and
 * shape. Throws `InvalidSpineCursorError` for anything not produced by
 * {@link encodeWorkspaceTaskCursor} at the current version.
 */
export function decodeWorkspaceTaskCursor(
  cursor: string,
): DecodedWorkspaceTaskCursor {
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
    workspaceId,
    view,
    sort,
    todayIso,
    filtersSignature,
    sortValue,
    createdAt,
    id,
  ] = parsed;

  if (
    version !== WORKSPACE_TASK_CURSOR_VERSION ||
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    typeof view !== "string" ||
    !(TASK_SYSTEM_VIEWS as readonly string[]).includes(view) ||
    typeof sort !== "string" ||
    !(TASK_SORTS as readonly string[]).includes(sort) ||
    typeof todayIso !== "string" ||
    typeof filtersSignature !== "string" ||
    typeof sortValue !== "string" ||
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
      view: view as TaskSystemView,
      sort: sort as TaskSort,
      todayIso,
      filtersSignature,
    },
    position: { sortValue, createdAt, id },
  };
}

/** True when two scopes are identical in every bound field. */
export function workspaceTaskCursorScopeMatches(
  a: WorkspaceTaskCursorScope,
  b: WorkspaceTaskCursorScope,
): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.view === b.view &&
    a.sort === b.sort &&
    a.todayIso === b.todayIso &&
    a.filtersSignature === b.filtersSignature
  );
}

/**
 * Decode a cursor and assert it was issued for `expectedScope`, returning just the
 * ordering position. A cursor from another workspace, view, sort, day or filter set
 * is rejected — never silently reinterpreted against a different result set.
 */
export function decodeWorkspaceTaskCursorForScope(
  cursor: string,
  expectedScope: WorkspaceTaskCursorScope,
): WorkspaceTaskCursorPosition {
  const { scope, position } = decodeWorkspaceTaskCursor(cursor);
  if (!workspaceTaskCursorScopeMatches(scope, expectedScope)) {
    throw new InvalidSpineCursorError();
  }
  return position;
}
