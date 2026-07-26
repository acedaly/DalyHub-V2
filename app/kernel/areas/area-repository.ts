/**
 * AREA-01 Areas kernel — read-only repository contract.
 *
 * The contract is workspace-bound at construction and storage-independent at the
 * route boundary. It performs no mutations and never accepts a workspace id; Area
 * creation and rename remain `SpineRepository` authority.
 */

import type {
  AreaChildrenInput,
  AreaDependencySummary,
  AreaGoalPage,
  AreaListInput,
  AreaListPage,
  AreaMomentumSourceFacts,
  AreaOverview,
  AreaProjectPage,
} from "./area";

export interface AreaRepository {
  /** List active Areas with live hierarchy roll-up facts in a bounded page. */
  listAreas(input?: AreaListInput): Promise<AreaListPage>;

  /**
   * Read a single active Area header. Returns `null` for missing, deleted,
   * wrong-kind or cross-workspace ids without disclosing which case occurred.
   */
  getAreaOverview(id: string): Promise<AreaOverview | null>;

  /** List active Goals directly belonging to an Area, with live project/task counts. */
  listAreaGoals(input: AreaChildrenInput): Promise<AreaGoalPage>;

  /**
   * List Projects aligned to an Area: both directly under the Area and advancing a
   * Goal in that Area, with live direct-task counts and parent context.
   */
  listAreaProjects(input: AreaChildrenInput): Promise<AreaProjectPage>;

  /**
   * The COMPLETE Area momentum-facts boundary (AGENTS.md-corrective): every
   * Project aligned to the Area, independent of `listAreaProjects`'s bounded card
   * page, plus authoritative direct Area Task counts. Read as a fixed, small
   * number of workspace-scoped aggregate queries — never one query per Project,
   * and never capped at an arbitrary maximum that would silently truncate the
   * aggregate.
   */
  getAreaMomentumFacts(areaId: string): Promise<AreaMomentumSourceFacts>;

  /**
   * AREA-05 — the records blocking a permanent deletion of this Area, grouped by
   * kind, read live from the active links referencing the Area. Advisory (the
   * trusted deletion re-checks the same "genuinely empty" condition atomically);
   * used to render the danger-zone blockers and decide whether to offer the
   * exact-title deletion confirmation at all. A missing/wrong-kind/cross-workspace
   * id returns an all-zero, `deletable: true` summary, disclosing nothing.
   */
  getAreaDependencySummary(areaId: string): Promise<AreaDependencySummary>;

  /**
   * AREA-05 — of the given candidate ids, return the subset that are ARCHIVED
   * Areas in this workspace, in ONE bounded query. Creation pickers (New Project /
   * New Task parent search) call this to drop archived Areas from their results
   * without a per-candidate read. Non-Area, active-Area, cross-workspace and
   * unknown ids are simply absent from the result.
   */
  listArchivedAreaIds(
    candidateIds: readonly string[],
  ): Promise<readonly string[]>;
}
