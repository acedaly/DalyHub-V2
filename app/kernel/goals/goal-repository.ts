/**
 * AREA-02 Goals kernel — read-only repository contract.
 *
 * Storage-independent and workspace-bound at construction, mirroring
 * `~/kernel/areas/area-repository.ts` exactly. Performs no mutations and never
 * accepts a workspace id; Goal creation, rename, completion and reopening remain
 * `SpineRepository` authority.
 */

import type {
  GoalChildrenInput,
  GoalListInput,
  GoalListPage,
  GoalOverview,
  GoalProjectContribution,
  GoalProjectPage,
} from "./goal";

export interface GoalRepository {
  /**
   * Read a single active Goal header, with its resolved Area. Returns `null`
   * for missing, deleted, wrong-kind or cross-workspace ids without disclosing
   * which case occurred.
   */
  getGoalOverview(id: string): Promise<GoalOverview | null>;

  /**
   * The bounded, cursor-paginated, WORKSPACE-WIDE list of active Goals (across
   * every Area) — the Alignment collection's base read (AREA-03, ADR-040
   * §40.7). Ordered `(createdAt, id)` ascending, mirroring every other
   * collection surface. Copies no Area/hierarchy state into another table.
   */
  listGoals(input?: GoalListInput): Promise<GoalListPage>;

  /**
   * The EXACT, complete Project-contribution boundary for a Goal: every active
   * `project.advances_goal` link, independent of `listGoalProjects`'s bounded
   * card page. Read as a fixed, small number of workspace-scoped, parameterised
   * queries — never one query per Project, and never capped at an arbitrary
   * maximum that would silently truncate the aggregate. Returns the all-zero
   * shape for a missing/deleted/wrong-kind/cross-workspace Goal id (never
   * throws) — callers verify the Goal itself separately via
   * {@link getGoalOverview}.
   */
  getGoalProjectContribution(goalId: string): Promise<GoalProjectContribution>;

  /**
   * The SAME exact contribution boundary as {@link getGoalProjectContribution},
   * batched over a bounded set of Goal ids (a collection page) — a fixed,
   * small number of grouped queries, never one query per Goal (mirrors
   * `ProjectHealthRepository.listProjectHealthFacts`, AREA-03 / ADR-040
   * §40.6). A Goal id with no linked Projects still appears, with the
   * all-zero contribution shape; an id that is not an active Goal in this
   * workspace is simply absent.
   */
  listGoalProjectContributions(
    goalIds: readonly string[],
  ): Promise<Map<string, GoalProjectContribution>>;

  /** List the bounded, cursor-paginated first page(s) of Projects advancing a
   * Goal, for display. The complete boundary lives in
   * {@link getGoalProjectContribution}, not here. */
  listGoalProjects(input: GoalChildrenInput): Promise<GoalProjectPage>;
}
