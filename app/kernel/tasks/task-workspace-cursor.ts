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
  TASK_SORT_DIRECTIONS,
  TASK_SYSTEM_VIEWS,
  type TaskSort,
  type TaskSortDirection,
  type TaskSystemView,
  type WorkspaceTaskFilters,
} from "./task";

/**
 * The current workspace-tasks cursor format version.
 *
 * v2 (TASKS-03) adds the explicit sort DIRECTION to the bound scope, because a
 * reversed sort produces a different ordering and a v1 cursor carries no direction
 * to compare. Bumping means every in-flight v1 cursor is rejected calmly (the
 * caller simply loads page one) rather than being reinterpreted against a
 * differently-ordered result set.
 */
export const WORKSPACE_TASK_CURSOR_VERSION = 2;

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
  /** The resolved sort direction — it changes ordering, so it binds the cursor. */
  readonly direction: TaskSortDirection;
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
  // TASKS-03 filters. Additive: a query that applies none of them produces exactly
  // the signature it produced before, so existing links keep working.
  if (filters.dueState != null) parts.push(`du=${filters.dueState}`);
  if (filters.plannedState != null) parts.push(`pl=${filters.plannedState}`);
  if (filters.parentKind != null) parts.push(`pk=${filters.parentKind}`);
  if (filters.delegatedTo != null) parts.push(`dt=${filters.delegatedTo}`);
  if (filters.createdWithin != null) parts.push(`cw=${filters.createdWithin}`);
  if (filters.updatedWithin != null) parts.push(`uw=${filters.updatedWithin}`);
  if (
    filters.completedVisibility != null &&
    filters.completedVisibility !== "default"
  ) {
    parts.push(`cv=${filters.completedVisibility}`);
  }
  // V2.7 RECALL-02 — the completion-time window. Additive in exactly the way
  // every dimension before it was: a query that applies none of the three signs
  // precisely as it did before, so every existing cursor and link stays valid.
  // All three are bound in because each changes WHICH Tasks appear, and the
  // completed SORT is already bound through `scope.sort` — so a page-two cursor
  // can never survive widening the window or switching the order.
  if (filters.completedWithin != null) {
    parts.push(`kw=${filters.completedWithin}`);
  }
  if (filters.completedFrom != null) parts.push(`kf=${filters.completedFrom}`);
  if (filters.completedTo != null) parts.push(`kt=${filters.completedTo}`);
  // V2.7 RECALL-03 — the follow-up dimension. Bound in for the same reason every
  // dimension before it is: each of the three changes WHICH Tasks appear, so a
  // page-two cursor must not survive turning the follow-up filter on, off or
  // widening its window. A query applying none of them signs exactly as before.
  if (filters.followUp != null) parts.push(`fu=${filters.followUp}`);
  if (filters.followUpFrom != null) parts.push(`ff=${filters.followUpFrom}`);
  if (filters.followUpTo != null) parts.push(`ft=${filters.followUpTo}`);
  // PLAN-01 / SMART-01 filters. Additive in the same way: a query that applies
  // none of them signs exactly as it did before, so every existing cursor and
  // every existing link stays valid.
  if (filters.priorities !== undefined && filters.priorities.length > 0) {
    parts.push(
      `ps=${filters.priorities.map((value) => value ?? "null").join(",")}`,
    );
  }
  if (filters.dueFrom != null) parts.push(`df=${filters.dueFrom}`);
  if (filters.dueTo != null) parts.push(`dtm=${filters.dueTo}`);
  if (filters.plannedFrom != null) parts.push(`pf=${filters.plannedFrom}`);
  if (filters.plannedTo != null) parts.push(`pt=${filters.plannedTo}`);
  if (filters.recurring !== undefined) {
    parts.push(`rc=${filters.recurring ? "1" : "0"}`);
  }
  // TASKS-12 — bound into the signature exactly like every other filter, so a
  // page-two cursor cannot survive turning the blocked filter on or off.
  if (filters.blocked !== undefined) {
    parts.push(`bl=${filters.blocked ? "1" : "0"}`);
  }
  // V2.6 FIND-03 — bound into the signature exactly like every other filter, so
  // a page-two cursor cannot survive adding or removing a tag from the filter.
  // The set is already canonically ordered, so two equivalent filters sign
  // identically.
  if (filters.tagKeys !== undefined && filters.tagKeys.length > 0) {
    parts.push(`tg=${filters.tagKeys.join(",")}`);
  }
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
    scope.direction,
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

  if (!Array.isArray(parsed) || parsed.length !== 10) {
    throw new InvalidSpineCursorError();
  }

  const [
    version,
    workspaceId,
    view,
    sort,
    direction,
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
    typeof direction !== "string" ||
    !(TASK_SORT_DIRECTIONS as readonly string[]).includes(direction) ||
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
      direction: direction as TaskSortDirection,
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
    a.direction === b.direction &&
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
