/**
 * AREA-02 Goals kernel — read-only repository contract.
 *
 * Storage-independent and workspace-bound at construction, mirroring
 * `~/kernel/areas/area-repository.ts` exactly. Performs no mutations and never
 * accepts a workspace id; Goal creation, rename, completion and reopening remain
 * `SpineRepository` authority.
 */

import type {
  GoalAlignmentListInput,
  GoalAlignmentListPage,
  GoalChildrenInput,
  GoalListInput,
  GoalListPage,
  GoalOutcomeCountsInput,
  GoalOutcomeListInput,
  GoalOutcomeListPage,
  GoalOverview,
  GoalProjectContribution,
  GoalProjectPage,
  GoalSearchHit,
  GoalSearchInput,
} from "./goal";
import type { GoalOutcomeLensCounts } from "./goal-outcome";

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

  /** Search active Goals by title with parent Area and completion context. */
  searchGoals(input: GoalSearchInput): Promise<readonly GoalSearchHit[]>;

  /**
   * The WORKSPACE-WIDE Goal list ordered by the deterministic Alignment display
   * precedence (`GOAL_ALIGNMENT_DISPLAY_RANK`), established BEFORE pagination
   * (DEBT-23) — so the Goals most worth a look lead across the WHOLE workspace,
   * not merely within each fetched page. Ordering is a keyset over
   * `(displayRank, createdAt, id)` ending in the immutable id; pages carry no
   * duplicates or gaps. The SQL rank uses the SAME structural facts, meaningful
   * activity vocabulary and recent-window bound as the pure `evaluateGoalAlignment`
   * (parity is proven by test), so it never introduces a second, drifting
   * classification. The read is bounded and never issues an unbounded scan.
   */
  listGoalsByAlignment(
    input: GoalAlignmentListInput,
  ): Promise<GoalAlignmentListPage>;

  /**
   * STEER-01 — the WORKSPACE-WIDE Goal list ordered by the deterministic
   * OUTCOME display precedence (`GOAL_OUTCOME_DISPLAY_RANK` over GOAL-02's
   * derived status, spine completion last), established in SQL BEFORE
   * pagination, with the requested lens applied in the same read. This is the
   * `/goals` collection's base read — the recorded question it answers is
   * `GOAL_OUTCOME_QUESTION`.
   *
   * The SQL status expression mirrors `evaluateGoalProgress` exactly (parity
   * is proven by test against the pure comparator over the same fact matrix —
   * the DEBT-23 precedent). The rank is computed in the read and NEVER
   * persisted (ADR-111 decision 5; ADR-110's no-cached-column rule). Keyset
   * pagination over `(displayRank, createdAt, id)` with a cursor bound to
   * workspace + owner day + time zone + lens; a stale or foreign cursor is
   * rejected (`InvalidSpineCursorError`), never reinterpreted.
   *
   * Cost: a FIXED number of workspace-scoped statements (one bounded
   * id/creation scan to resolve schedule origins, then one ranked page read) —
   * flat in the number of Goals, measurements and milestones, never one query
   * per Goal.
   */
  listGoalsByOutcome(input: GoalOutcomeListInput): Promise<GoalOutcomeListPage>;

  /**
   * STEER-01 — the WORKSPACE-TRUE count for every collection lens, in a fixed
   * number of statements (never a page-local tally). DEBT-121's closing
   * condition: a count shown beside a lens describes the workspace, or it is
   * not shown. Uses the SAME status/lens expressions as
   * {@link listGoalsByOutcome}, so a lens's count and its result set cannot
   * disagree.
   */
  countGoalsByOutcomeLens(
    input: GoalOutcomeCountsInput,
  ): Promise<GoalOutcomeLensCounts>;

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
