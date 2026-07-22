/**
 * PROJ-02 Project Health kernel — the read-only facts repository contract.
 *
 * A storage-independent, WORKSPACE-BOUND read projection (ADR-035) that gathers the
 * raw `ProjectHealthFacts` a project's health is derived from. It performs NO
 * mutations and stores NOTHING — health is recomputed from live spine, task-detail
 * and Activity data every read, so it can never drift from its sources. Like the
 * PROJ-01 `ProjectRepository`, no method accepts a `workspaceId`; scope is fixed at
 * construction (ADR-010), and a project in another workspace (or a non-project id)
 * is indistinguishable from "not found".
 *
 * The rules live in `evaluateProjectHealth` (`project-health.ts`); this contract
 * only supplies the facts. Both methods are bounded and N+1-free: the collection
 * variant gathers facts for a WHOLE bounded page of projects in a fixed number of
 * grouped queries, never one query per project.
 */

import type { ProjectHealthFacts } from "./project-health";

export interface ProjectHealthRepository {
  /**
   * Gather health facts for a bounded set of project ids (a collection page),
   * returning a map keyed by project id. Ids are validated and de-duplicated; a
   * project with no matching tasks or activity still appears (with zeroed counts
   * and a null last-activity), and an id that is not a project in this workspace is
   * simply absent from the map — never disclosed, never an error. Computed in a
   * fixed number of grouped queries regardless of page size (no N+1).
   *
   * `todayIso` is the owner's calendar date `YYYY-MM-DD`, supplied by the caller so
   * overdue/slipped/upcoming counts and the pure `evaluateProjectHealth` agree on
   * the same day boundary (and tests are deterministic).
   */
  listProjectHealthFacts(
    projectIds: readonly string[],
    todayIso: string,
  ): Promise<Map<string, ProjectHealthFacts>>;

  /**
   * Gather health facts for one project. Returns null when the id is not a project
   * in this workspace (nonexistent, soft-deleted, wrong entity type or
   * cross-workspace) — the same calm not-found the project overview returns.
   */
  getProjectHealthFacts(
    id: string,
    todayIso: string,
  ): Promise<ProjectHealthFacts | null>;
}
