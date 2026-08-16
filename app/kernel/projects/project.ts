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

import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import type { IdentityColourSlot } from "~/kernel/entities/identity-colour-slots";
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
  /**
   * REDESIGN-04 — free-text narrowing by title, for the collection's search
   * field (`mockup3.png`).
   *
   * It is a PREDICATE on the existing list query, not a second query and not a
   * second ordering: the collection keeps its deterministic `(createdAt, id)`
   * sequence, its keyset cursor and its state filter, and simply returns fewer
   * rows. Normalise with `normaliseProjectSearch` before passing it — the same
   * function the cursor scope uses, so the two can never disagree.
   *
   * Distinct from `searchProjects`, which is the command-palette ranking read
   * (relevance-ordered, unpaginated, non-archived only).
   */
  readonly search?: string | null;
  /** Ordering. Defaults to `created` (deterministic `(createdAt, id)` ascending). */
  readonly orderBy?: ProjectOrder;
  /** Page size, clamped to a safe maximum; defaults to a safe page size. */
  readonly limit?: number;
  /**
   * An opaque cursor from a previous page's `nextCursor`, to fetch the following
   * page. It is bound to the workspace, `state` filter, `workflowStatus`,
   * `search` narrowing and ordering it was issued for; a cursor that does not
   * match the current query scope is rejected (`InvalidSpineCursorError`), never
   * silently reinterpreted. Omit for the first page.
   */
  readonly cursor?: string;
};

/**
 * REDESIGN-04 — the workspace's project counts by lifecycle bucket.
 *
 * `mockup3.png` opens the Projects page with "8 active · 2 archived", which is a
 * statement about the WHOLE workspace rather than about the loaded page — so it
 * cannot be counted from the rows on screen, and §5.5 forbids paying for it per
 * card. It is one grouped statement (`GROUP BY` over the same two lifecycle
 * columns the list query already filters on), read once per collection load.
 *
 * `active` here means the same thing the "Active" tab means: open (not
 * completed) and not archived. `completed` and `archived` are the other two
 * mutually-exclusive buckets, so the three sum to every non-deleted Project.
 */
export type ProjectLifecycleCounts = {
  readonly active: number;
  readonly completed: number;
  readonly archived: number;
};

export type ProjectSearchInput = {
  readonly text: string;
  readonly limit?: number;
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
  /**
   * The resolved Area's stable colour rank (ADR-068 decision 5), or `null` when
   * the Project has no Area at all.
   *
   * A Project card INHERITS its Area's accent rather than inventing one, which
   * is what makes a grid of Projects readable as "these three belong to Health"
   * without reading a word. It is the same lifecycle-independent rank
   * `listAreas` computes — ranked over EVERY `area` row so archiving one Area
   * never recolours another — resolved in the SAME query through one window
   * function, never a per-Project follow-up read.
   */
  readonly areaColourRank: number | null;
  /**
   * The PROJECT's OWN stable colour rank — its 0-based position in the
   * workspace's `(created_at, id)` ordering over every `project` row.
   *
   * ADR-068 decision 5's Area mechanism, generalised to a second entity rather
   * than reimplemented for one: the same window, the same total ordering, the
   * same lifecycle independence (ranked over EVERY row, so archiving or
   * soft-deleting a Project never recolours another), the same absence of a
   * column, a migration and an index. It replaces the INHERITED Area accent as
   * the Project card's identity colour, so a Project is recognisable as itself
   * rather than only as a member of its Area — and a Project with no Area gets
   * a real identity instead of the neutral container.
   *
   * Because it is derived from immutable creation facts and never from the
   * result order of the query that reads it, the colour survives refresh,
   * navigation, restart, deployment, rename, description edits, task changes,
   * re-sorting, filtering and the creation of other Projects. Consecutive
   * Projects take consecutive ranks and therefore adjacent, distinct entries in
   * the shared six-colour ramp.
   *
   * `areaColourRank` is retained beside it: it still says which Area a Project
   * belongs to, which is a different fact from which Project this is.
   */
  readonly colourRank: number;
  /**
   * The owner's chosen icon, as the semantic KEY and nothing else. Read from
   * the `project_details` row this projection already joins for status and
   * archival, so it costs no extra query. Normalised on the way OUT: an
   * unrecognised stored key arrives as `null` and the card renders the Project
   * default.
   */
  readonly iconKey: EntityIconKey | null;
  /**
   * IDENTITY-01 — the owner's chosen identity COLOUR, as the semantic SLOT NAME
   * and nothing else: never a hex, never an index into a ramp.
   *
   * Read in the SAME query and from the same detail row as `iconKey`, so it
   * costs no extra read and cannot become an N+1. Normalised on the way OUT:
   * a slot this build no longer recognises arrives here as `null` and the
   * record falls back to its DERIVED colour — which is exactly what it looked
   * like before anyone chose anything.
   */
  readonly colourSlot: IdentityColourSlot | null;
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

export type ProjectSearchHit = ProjectListItem;

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
  /**
   * UIX-02 — the Project's own stable identity colour rank, the SAME rank
   * `ProjectListItem` carries and by the SAME ADR-068 rule. The record draws
   * its identity mark from it, so an owner arriving from the gallery lands on
   * the colour they clicked rather than on a neutral glyph.
   */
  readonly colourRank: number;
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
