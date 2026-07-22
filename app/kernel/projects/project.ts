/**
 * PROJ-01 Projects kernel — the read-projection domain types.
 *
 * The storage-independent shapes the Projects collection and a project overview
 * render. A Project is an ordinary spine record (FND-07 / ADR-014); this module adds
 * NO new persisted state — it is a READ projection that resolves, in bounded
 * workspace-scoped queries, the facts a project surface needs: the project's Area
 * (directly or via its Goal), its optional Goal, its open/completed state, and its
 * active direct-task counts (the same definition as the SpineRepository's project
 * rollup). Project identity, completion, parentage and the authoritative rollup stay
 * the SpineRepository's; project mutations go through `spine.createProject` /
 * `rename` / `complete` / `reopen` (ADR-034). Nothing here is copied or cached onto a
 * project — Area/Goal titles are resolved live through the hierarchy.
 */

import type { WorkspaceId } from "~/kernel/workspaces";
import type { ProjectWorkflowStatus } from "~/kernel/project-settings";

/**
 * A resolved parent reference on a project — its Area or its Goal — carrying the
 * CURRENT title (resolved through the hierarchy, never a stored duplicate).
 */
export type ProjectRelation = {
  readonly kind: "area" | "goal";
  readonly id: string;
  readonly title: string;
};

/** The completion filter for the project collection. */
export type ProjectStateFilter = "open" | "completed" | "archived" | "all";

/**
 * The ordering of the project collection query:
 * - `created` — deterministic `(createdAt, id)` ascending (the stable default).
 * - `recent`  — most-recently-updated first (`updatedAt` descending, `id`
 *   descending as a stable tiebreak) — used by Today's "Continue working" so the
 *   globally most-recently-active projects are selected AT the database, before the
 *   limit is applied (never a client-side re-sort of a creation-ordered page).
 */
export type ProjectOrder = "created" | "recent";

/**
 * Options for the bounded, workspace-scoped project collection query. Never
 * "load every project"; the limit is clamped to a safe maximum.
 */
export type ListProjectsInput = {
  /** Completion filter. Defaults to `all`. */
  readonly state?: ProjectStateFilter;
  /**
   * An additional, exact workflow-status filter (PROJ-05), independent of `state`.
   * When set, only Projects with EXACTLY this workflow status are returned — e.g.
   * Today's "Continue working" passes `"active"` so Planned/On-hold Projects (which
   * are `state: "open"` but not actively worked) never appear as ordinary active
   * work. Omit for no workflow-status restriction.
   */
  readonly workflowStatus?: ProjectWorkflowStatus;
  /** Ordering. Defaults to `created` (deterministic `(createdAt, id)` ascending). */
  readonly orderBy?: ProjectOrder;
  /** Page size, clamped to a safe maximum; defaults to a safe page size. */
  readonly limit?: number;
  /**
   * An opaque cursor from a previous page's `nextCursor`, to fetch the following
   * page. It is bound to the workspace, `state` filter, `workflowStatus` and
   * ordering it was issued for; a cursor that does not match the current query
   * scope is rejected (`InvalidSpineCursorError`), never silently reinterpreted.
   * Omit for the first page.
   */
  readonly cursor?: string;
};

/**
 * A project as shown in the collection: identity, its Area/Goal context, its
 * open/completed state and its active direct-task counts. `area` is present whether
 * the project sits directly under an Area or advances a Goal (resolved to the Goal's
 * Area); `goal` is present only when the project advances a Goal. The counts match
 * the SpineRepository's project rollup (active direct child tasks) and are computed
 * live — never cached columns.
 */
export type ProjectListItem = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly createdAt: Date;
  /**
   * The authoritative PRESENTATION timestamp (ADR-037 §37.2): the later of the
   * spine entity's `updated_at` and the PROJ-05 `project_details.updated_at` — so a
   * status change/archive/restore affects "recent" ordering, health staleness and
   * Activity revalidation exactly like a rename does. Never a raw copy of either
   * source; always the derived maximum.
   */
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  /**
   * The PROJ-05 workflow status. ALWAYS present — every projected Project has an
   * effective value (an explicit `project_details` row, or the documented default
   * `"planned"` when none exists yet).
   */
  readonly status: ProjectWorkflowStatus;
  /** ALWAYS present (never omitted) — `null` when not archived. */
  readonly archivedAt: Date | null;
  readonly area: ProjectRelation | null;
  readonly goal: ProjectRelation | null;
  /** Total active direct child tasks. */
  readonly taskTotal: number;
  /** Completed active direct child tasks. */
  readonly taskCompleted: number;
};

/** A bounded page of project summaries. */
export type ProjectListPage = {
  readonly items: readonly ProjectListItem[];
  /**
   * An opaque cursor to fetch the next page, or `null` when this is the last page
   * (no more matching projects). Pass it back as `ListProjectsInput.cursor`. It is
   * bound to this query's workspace, `state` filter and ordering.
   */
  readonly nextCursor: string | null;
};

/**
 * The project overview header/summary data for the record route: identity, dates,
 * open/completed state and the resolved Area/Goal context. The displayed PROGRESS is
 * NOT here — it comes from `SpineRepository.getRollup(projectId)`, the single source
 * of truth (PROJ-01 §4). This projection only resolves the relationships and header
 * facts efficiently and testably.
 */
export type ProjectOverview = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly createdAt: Date;
  /** The authoritative PRESENTATION timestamp — see {@link ProjectListItem.updatedAt}. */
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  /** ALWAYS present — see {@link ProjectListItem.status}. */
  readonly status: ProjectWorkflowStatus;
  /** ALWAYS present (never omitted) — `null` when not archived. */
  readonly archivedAt: Date | null;
  readonly area: ProjectRelation | null;
  readonly goal: ProjectRelation | null;
};
