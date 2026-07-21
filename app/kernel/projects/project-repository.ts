/**
 * PROJ-01 Projects kernel — the read-only repository contract.
 *
 * A storage-independent, WORKSPACE-BOUND read projection over the FND-07 spine
 * (ADR-034). It performs NO mutations — project create/rename/complete/reopen stay
 * the SpineRepository's authority (the single completion + parentage authority), and
 * the authoritative rollup stays `SpineRepository.getRollup`. This contract exists so
 * the Projects collection and a project overview resolve their Area/Goal context and
 * task counts in bounded, workspace-scoped queries WITHOUT an N+1 per project.
 *
 * No method accepts a `workspaceId` — scope is fixed at construction (ADR-010). A
 * project in another workspace, or one that does not exist, is indistinguishable from
 * "not found" and never disclosed.
 */

import type {
  ListProjectsInput,
  ProjectListPage,
  ProjectOverview,
} from "./project";

export interface ProjectRepository {
  /**
   * List the workspace's projects as bounded, deterministic collection summaries —
   * each with its resolved Area/Goal context and its active direct-task counts,
   * computed in ONE bounded query (no per-project rollup call, no N+1). Ordered
   * deterministically by `(createdAt, id)`. The limit is clamped to a safe maximum;
   * never an unbounded "load everything".
   */
  listProjects(input?: ListProjectsInput): Promise<ProjectListPage>;

  /**
   * Read one project's overview (identity, dates, open/completed state, resolved
   * Area/Goal context) for the record route. Returns `null` when the id is not a
   * project in this workspace (nonexistent, soft-deleted, wrong entity type, or
   * cross-workspace) — never disclosing cross-workspace existence. The displayed
   * progress comes from `SpineRepository.getRollup`, not this projection.
   */
  getProjectOverview(id: string): Promise<ProjectOverview | null>;
}
