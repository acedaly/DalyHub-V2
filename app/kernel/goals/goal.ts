/**
 * AREA-02 Goals kernel — storage-independent read-projection types.
 *
 * Goals remain ordinary spine records (identity, title, completion and Area
 * parentage stay `SpineRepository` authority — FND-07 / ADR-014). This contract
 * adds no identity table; it reads live Goal-record facts — the resolved Area,
 * and the EXACT contribution of every active Project structurally advancing the
 * Goal (`project.advances_goal`) — in bounded, workspace-scoped queries. It never
 * copies Area/Project titles, hierarchy or roll-up state into another table.
 */

import type { ProjectWorkflowStatus } from "~/kernel/project-settings";
import type { WorkspaceId } from "~/kernel/workspaces";

/**
 * The Goal's resolved parent Area (current title, never copied).
 *
 * UIX-03 adds the Area's IDENTITY alongside its name. A Goal has no accent of
 * its own — it inherits its Area's, exactly as a Project does (ADR-068 decision
 * 5, `AccentIcon`) — so a gallery of Goals groups visually by the part of life
 * each one serves without needing a heading. Both fields are read from the same
 * Area join the title already comes from, so they cost no extra query, and both
 * are nullable: a read that does not rank the Area yields the neutral container
 * rather than a colour that would mean nothing.
 */
export type GoalAreaContext = {
  readonly id: string;
  readonly title: string;
  /** The Area's stable 0-based colour rank, or `null` for the neutral container. */
  readonly colourRank?: number | null;
  /** The Area's chosen icon key, normalised at the storage boundary. */
  readonly iconKey?: string | null;
  /**
   * IDENTITY-01 — the Area's chosen colour SLOT, normalised at the storage
   * boundary. A Goal that has chosen nothing inherits this rather than the raw
   * rank, so an Area that picked `teal` carries its Goals with it.
   */
  readonly colourSlot?: string | null;
};

/** The canonical Goal record header, resolved from the spine + its Area link. */
export type GoalOverview = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly area: GoalAreaContext;
};

/**
 * One Project structurally advancing a Goal (`project.advances_goal`), as read
 * for the EXACT contribution boundary. Deliberately lighter than the display
 * item below — only what the pure evaluator needs to classify it.
 */
export type GoalProjectFact = {
  readonly id: string;
  readonly status: ProjectWorkflowStatus;
  readonly completedAt: Date | null;
  readonly archivedAt: Date | null;
};

/**
 * The EXACT, complete contribution boundary for a Goal: every non-deleted
 * Project with an active `project.advances_goal` link to it, independent of any
 * displayed card page. `total`/`completed` mirror the spine's own
 * `GoalRollup.projects` definition exactly (a Project counts as completed
 * regardless of its archived state); the workflow buckets follow the SAME
 * Archived-over-Completed precedence AREA-01's momentum evaluator uses, so an
 * archived-and-completed Project is counted once, under `archived`.
 */
export type GoalProjectContribution = {
  readonly total: number;
  readonly completed: number;
  readonly incomplete: number;
  readonly active: number;
  readonly planned: number;
  readonly onHold: number;
  readonly archived: number;
};

/** One Project advancing a Goal, for the bounded DISPLAYED card page. */
export type GoalProjectItem = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly status: ProjectWorkflowStatus;
  readonly archivedAt: Date | null;
  readonly taskTotal: number;
  readonly taskCompleted: number;
};

export type GoalChildrenInput = {
  readonly goalId: string;
  readonly limit?: number;
  readonly cursor?: string;
};

export type GoalProjectPage = {
  readonly items: readonly GoalProjectItem[];
  readonly nextCursor: string | null;
};

/**
 * One Goal on the workspace-wide list (AREA-03, ADR-040 §40.7) — the
 * identity/completion/Area-context fields the Alignment collection needs to
 * render a card. Deliberately lighter than `GoalOverview`; alignment itself
 * (state/reasons) is a SEPARATE evaluation composed by the route, never
 * stored on this shape.
 */
export type GoalListItem = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly area: GoalAreaContext;
};

export type GoalListInput = {
  readonly limit?: number;
  readonly cursor?: string;
};

export type GoalSearchInput = {
  readonly text: string;
  readonly limit?: number;
};

export type GoalListPage = {
  readonly items: readonly GoalListItem[];
  readonly nextCursor: string | null;
};

export type GoalSearchHit = {
  readonly id: string;
  readonly title: string;
  readonly completedAt: Date | null;
  readonly area: GoalAreaContext;
  readonly targetDate: string | null;
  readonly contribution: GoalProjectContribution;
};

/**
 * Input for the WORKSPACE-WIDE, Alignment-ordered Goal list (DEBT-23). Unlike
 * {@link GoalListInput}, it carries the owner-calendar-derived recent-window lower
 * bound so the repository's SQL ranking splits `active`/`neglected` using the SAME
 * window constant/fact the pure evaluator's alignment-facts read uses.
 */
export type GoalAlignmentListInput = {
  readonly limit?: number;
  readonly cursor?: string;
  /**
   * The EXACT owner-calendar active/neglected boundary instant (from
   * `createOwnerAlignmentContext().recentBoundaryStartIso`). A qualifying
   * contribution at/after this instant ranks the Goal `active`, else `neglected` —
   * the SAME owner-calendar boundary `evaluateGoalAlignment` uses, so the SQL rank
   * agrees with the evaluator for every instant (not just clearly-separated ones).
   * The cursor is bound to this value, so a page reusing a cursor from a different
   * window is rejected.
   */
  readonly activeBoundaryIso: string;
  /**
   * STEER-02 — exclude Goals the owner has SET ASIDE (`goal_details.condition`).
   *
   * Opt-in, and only an ATTENTION surface opts in: Today's Goal panel, the
   * at-risk rail and the notification digest ask "what needs me?", and a Goal
   * the owner has deliberately put down is not an answer to that question
   * (ADR-111 decision 3 — a set-aside Goal changes SCOPE, not truth). Every
   * other consumer — the guided Review's Goals step, the insights read,
   * Analytics — passes nothing and sees the set it always saw, because their
   * question is a different one and their selection must not silently change.
   *
   * It never alters what a Goal SAYS: the excluded Goal's alignment, movement
   * and measurement are exactly what they would be, and `/goals` and the record
   * still state all three.
   */
  readonly omitSetAside?: boolean;
};

/**
 * One page of Goals ordered by the deterministic workspace-wide Alignment
 * precedence (`GOAL_ALIGNMENT_DISPLAY_RANK`), established BEFORE pagination
 * (DEBT-23). Items carry the same display fields as {@link GoalListItem}; the
 * cursor is the dedicated alignment-ordered cursor (rank + `(createdAt, id)`).
 */
export type GoalAlignmentListPage = {
  readonly items: readonly GoalListItem[];
  readonly nextCursor: string | null;
};

/**
 * Input for the WORKSPACE-WIDE, OUTCOME-ordered Goal list (STEER-01 /
 * DEBT-120). The rank is GOAL-02's derived status computed in SQL before
 * pagination, so the read needs the same context the pure evaluator takes:
 * the owner-calendar "today" and, for each Goal's schedule origin, the owner's
 * calendar conversion of its creation instant.
 */
export type GoalOutcomeListInput = {
  readonly limit?: number;
  readonly cursor?: string;
  /** The owner-calendar day (`YYYY-MM-DD`), resolved server-side. */
  readonly todayIso: string;
  /**
   * The owner's IANA time zone. Used only as a cursor-scope component — a zone
   * change re-ranks schedule origins, so a cursor from another zone must be
   * rejected rather than reinterpreted.
   */
  readonly timeZone: string;
  /**
   * Convert an instant to the owner-calendar `YYYY-MM-DD` — the SAME conversion
   * the routes feed `evaluateGoalProgress`'s `startedOn` with
   * (`ownerCalendarIso`). Injected rather than imported so the storage adapter
   * stays free of the shared date module, exactly as
   * `AlignmentEvaluationContext.calendarIsoOf` already is.
   */
  readonly calendarIsoOf: (instant: Date) => string;
  /**
   * The lens to filter by, applied IN the collection read (STEER-01: a lens
   * filters the workspace, never the loaded page). Defaults to `"all"`.
   */
  readonly view?: import("./goal-outcome").GoalCollectionView;
};

/**
 * One page of Goals ordered by the deterministic workspace-wide OUTCOME
 * precedence (`GOAL_OUTCOME_DISPLAY_RANK`), established in SQL BEFORE
 * pagination (STEER-01). The cursor is the dedicated outcome cursor, bound to
 * workspace + day + zone + lens.
 */
export type GoalOutcomeListPage = {
  readonly items: readonly GoalListItem[];
  readonly nextCursor: string | null;
};

/** Input for the workspace-true lens counts (`countGoalsByOutcomeLens`). */
export type GoalOutcomeCountsInput = {
  readonly todayIso: string;
  readonly calendarIsoOf: (instant: Date) => string;
};
