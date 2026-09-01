/**
 * REVIEW-03 — the Review-period insight snapshot: the ONE thing this feature
 * persists, and the smallest thing that makes "what changed since last time"
 * honest.
 *
 * ── Why it has to exist ─────────────────────────────────────────────────────
 * Movement (Tasks/Projects/Goals completed) is exactly reconstructible for any
 * past period from the append-only Activity stream, so REVIEW-03 does NOT store
 * it. What is not reconstructible is *state at a past moment*: a Project's
 * PROJ-02 health, a Goal's AREA-03 alignment and the set of commitments that
 * were carrying over are all derived from data that only describes NOW. Asking
 * "did this Project improve since my last Review?" against today's records
 * answers a different question, and answering it anyway would be a lie the
 * owner could not detect. So a Review, when it is COMPLETED, records the small
 * set of derived facts that were true at that point.
 *
 * ── The rules this snapshot holds itself to ─────────────────────────────────
 *   - **It belongs to the workspace** and cascades from its Review.
 *   - **It is tied to one Review and its period**, never to a floating date.
 *   - **It contains derived facts, not record bodies.** Ids, states and counts.
 *     No titles, no descriptions, no reflection text, no Task names — a
 *     snapshot is never a second copy of the owner's records, so a renamed
 *     Project is still rendered from its live title through its id.
 *   - **It has a version.** `REVIEW_INSIGHT_SNAPSHOT_VERSION` shapes the JSON;
 *     an unrecognised or malformed version reads as "no snapshot", never as a
 *     crash and never as fabricated zeros.
 *   - **It is deterministic and bounded.** The same facts build the same
 *     snapshot, and every list has a stated cap.
 *   - **It is never a competing source of truth.** Areas, Goals, Projects and
 *     Tasks are authoritative for what they are; a snapshot only says what was
 *     true at one Review point, and nothing reads it except the insight
 *     comparison.
 *
 * ── When it is written ──────────────────────────────────────────────────────
 * On completion, and only on completion — the moment the owner declares the
 * period closed. Reopening leaves the snapshot alone; completing again
 * overwrites it with the state at the new completion. Nothing else in DalyHub
 * writes here, and a failed capture never fails a completion.
 */

import {
  GOAL_ALIGNMENT_STATES,
  type GoalAlignmentState,
} from "~/kernel/alignment";
import {
  PROJECT_HEALTH_STATES,
  type ProjectHealthState,
} from "~/kernel/project-health";

import type { ReviewInsightFacts } from "./review-insight-facts";

/**
 * The stored shape's version. Bump it when the shape changes incompatibly; a
 * snapshot with any other version is ignored (treated as absent) rather than
 * misread, so an old row can never be interpreted under new rules.
 */
export const REVIEW_INSIGHT_SNAPSHOT_VERSION = 1;

/** Caps on every list a snapshot stores, so one row can never grow with the
 * workspace. Exceeding a cap sets the matching `*Bounded` flag, which the
 * comparison then states plainly rather than quietly ignoring. */
export const SNAPSHOT_LIMITS = {
  projects: 40,
  goals: 25,
  areas: 20,
  carryOverTasks: 50,
} as const;

/** One Project's state at a Review point. Ids and states only. */
export interface SnapshotProjectState {
  readonly id: string;
  /**
   * PROJ-02's health at that point, or **null when there was no reading**.
   *
   * V2.7 RECALL-04 (DEBT-234) — a Project whose health facts the read did not
   * return used to be stored here as `"on_track"`, because that is what the
   * context defaulted to. The snapshot's own stated rule is that it records what
   * was TRUE at a Review point; a state nothing measured is not a truth, and once
   * stored it was indistinguishable from a measured one — so the next Review
   * could compare a real reading against a fabricated one and announce an
   * improvement or a deterioration that never happened. The absence is now
   * stored as an absence, and {@link classifyProjectHealthChange} refuses to
   * make a transition out of one.
   *
   * Reading is backwards-compatible in the direction that matters: an existing
   * v1 row carries a health STRING for every project and still parses exactly as
   * it did, so the version is not bumped and no stored snapshot is discarded.
   */
  readonly health: ProjectHealthState | null;
  readonly openTasks: number;
  readonly overdueTasks: number;
}

/** One Goal's state at a Review point. */
export interface SnapshotGoalState {
  readonly id: string;
  readonly alignment: GoalAlignmentState;
  readonly contributingProjects: number;
  /** The period's contribution classification — see `goal-contribution.ts`. */
  readonly contribution: SnapshotGoalContribution;
}

/** The stored contribution vocabulary. Deliberately the same closed set the
 * evaluator produces, so a stored value can never mean something the current
 * rules cannot express. */
export const SNAPSHOT_GOAL_CONTRIBUTIONS = [
  "moving",
  "limited",
  "none",
  "no_structure",
  "completed",
] as const;
export type SnapshotGoalContribution =
  (typeof SNAPSHOT_GOAL_CONTRIBUTIONS)[number];

/** One Area's completed-work total at a Review point. */
export interface SnapshotAreaState {
  readonly id: string;
  readonly tasksCompleted: number;
}

/** The whole stored shape. Fully JSON-serialisable, deterministic, bounded. */
export interface ReviewInsightSnapshot {
  readonly version: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly tasksCompleted: number;
  readonly projectsCompleted: number;
  readonly goalsCompleted: number;
  readonly overdueCarryOver: number;
  readonly waitingCarryOver: number;
  readonly projects: readonly SnapshotProjectState[];
  readonly projectsBounded: boolean;
  readonly goals: readonly SnapshotGoalState[];
  readonly goalsBounded: boolean;
  readonly areas: readonly SnapshotAreaState[];
  readonly areasBounded: boolean;
  /** Ids of the commitments that were already carrying over at this point —
   * how "still open at your last two Reviews" is answered without storing a
   * single Task title. */
  readonly carryOverTaskIds: readonly string[];
  readonly carryOverTaskIdsBounded: boolean;
}

/** A stored snapshot with the identity of the Review it describes. */
export interface StoredReviewInsightSnapshot {
  readonly reviewId: string;
  readonly capturedAt: Date;
  readonly snapshot: ReviewInsightSnapshot;
}

/* -------------------------------------------------------------------------- */
/* Building                                                                    */
/* -------------------------------------------------------------------------- */

/** Deterministic ordering: highest signal first, then id, so two builds of the
 * same facts are byte-identical. */
function byIdAscending<T extends { readonly id: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Build the snapshot for a completed Review from the facts already gathered for
 * its evidence surface. Pure and total: the same facts always produce the same
 * snapshot, so a re-capture after a reopen is deterministic and a test can
 * assert the whole row.
 *
 * `contributionOf` is supplied by the caller (the evaluator owns the rule) so
 * this module never re-derives a classification and the two can never drift.
 */
export function buildReviewInsightSnapshot(
  facts: ReviewInsightFacts,
  contributionOf: (goalId: string) => SnapshotGoalContribution,
): ReviewInsightSnapshot {
  const projects = byIdAscending(facts.state.projects).slice(
    0,
    SNAPSHOT_LIMITS.projects,
  );
  const goals = byIdAscending(facts.state.goals).slice(
    0,
    SNAPSHOT_LIMITS.goals,
  );
  const areas = byIdAscending(facts.state.areas).slice(
    0,
    SNAPSHOT_LIMITS.areas,
  );
  const carryOverIds = [...facts.state.carryOver]
    .map((task) => task.id)
    .sort((a, b) => a.localeCompare(b));

  return {
    version: REVIEW_INSIGHT_SNAPSHOT_VERSION,
    periodStart: facts.window.periodStart,
    periodEnd: facts.window.periodEnd,
    tasksCompleted: facts.history.completions.tasksCompleted,
    projectsCompleted: facts.history.completions.projectsCompleted,
    goalsCompleted: facts.history.completions.goalsCompleted,
    overdueCarryOver: facts.state.carryOverOverdue.value,
    waitingCarryOver: facts.state.carryOverWaiting.value,
    projects: projects.map((project) => ({
      id: project.id,
      health: project.healthState,
      openTasks: project.openTasks,
      overdueTasks: project.overdueTasks,
    })),
    projectsBounded:
      facts.state.projectsBounded ||
      facts.state.projects.length > SNAPSHOT_LIMITS.projects,
    goals: goals.map((goal) => ({
      id: goal.id,
      alignment: goal.alignmentState,
      contributingProjects: goal.contributingProjects,
      contribution: contributionOf(goal.id),
    })),
    goalsBounded:
      facts.state.goalsBounded ||
      facts.state.goals.length > SNAPSHOT_LIMITS.goals,
    areas: areas.map((area) => ({
      id: area.id,
      tasksCompleted: area.tasksCompletedInPeriod,
    })),
    areasBounded:
      facts.state.areasBounded ||
      facts.state.areas.length > SNAPSHOT_LIMITS.areas,
    carryOverTaskIds: carryOverIds.slice(0, SNAPSHOT_LIMITS.carryOverTasks),
    carryOverTaskIdsBounded:
      carryOverIds.length > SNAPSHOT_LIMITS.carryOverTasks,
  };
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                     */
/* -------------------------------------------------------------------------- */

const HEALTH_STATES: ReadonlySet<string> = new Set(PROJECT_HEALTH_STATES);
const ALIGNMENT_STATES: ReadonlySet<string> = new Set(GOAL_ALIGNMENT_STATES);
const CONTRIBUTIONS: ReadonlySet<string> = new Set(SNAPSHOT_GOAL_CONTRIBUTIONS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0;
}

function readIsoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

function readIdList(value: unknown, limit: number): readonly string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.length > 0) ids.push(entry);
    if (ids.length >= limit) break;
  }
  return ids;
}

/**
 * Parse a stored snapshot payload. Returns null — "there is no comparable
 * snapshot" — for anything unrecognised: a different version, malformed JSON, a
 * missing period. The surface then says it has nothing to compare against,
 * which is the truth, instead of rendering fabricated zeros.
 */
export function parseReviewInsightSnapshot(
  raw: string,
): ReviewInsightSnapshot | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  if (value.version !== REVIEW_INSIGHT_SNAPSHOT_VERSION) return null;
  const periodStart = readIsoDate(value.periodStart);
  const periodEnd = readIsoDate(value.periodEnd);
  if (periodStart === null || periodEnd === null) return null;

  const projects: SnapshotProjectState[] = [];
  if (Array.isArray(value.projects)) {
    for (const entry of value.projects) {
      if (!isRecord(entry)) continue;
      if (typeof entry.id !== "string" || entry.id.length === 0) continue;
      /*
       * V2.7 RECALL-04 — three cases, and only one of them is a reading.
       *
       * A recognised state is a reading. An explicit `null` is an absence this
       * snapshot recorded honestly, and it is KEPT as one — dropping the row
       * would make the Project look as though it did not exist at that Review,
       * which `classifyProjectHealthChange` reads as "new" and is a different
       * (and equally untrue) story. Anything else — a state this version does
       * not recognise, a number, a missing key — is malformed and the row is
       * skipped, exactly as before.
       */
      const storedHealth =
        entry.health === null
          ? null
          : typeof entry.health === "string" && HEALTH_STATES.has(entry.health)
            ? (entry.health as ProjectHealthState)
            : undefined;
      if (storedHealth === undefined) continue;
      projects.push({
        id: entry.id,
        health: storedHealth,
        openTasks: readCount(entry.openTasks),
        overdueTasks: readCount(entry.overdueTasks),
      });
      if (projects.length >= SNAPSHOT_LIMITS.projects) break;
    }
  }

  const goals: SnapshotGoalState[] = [];
  if (Array.isArray(value.goals)) {
    for (const entry of value.goals) {
      if (!isRecord(entry)) continue;
      if (typeof entry.id !== "string" || entry.id.length === 0) continue;
      if (
        typeof entry.alignment !== "string" ||
        !ALIGNMENT_STATES.has(entry.alignment)
      )
        continue;
      const contribution =
        typeof entry.contribution === "string" &&
        CONTRIBUTIONS.has(entry.contribution)
          ? (entry.contribution as SnapshotGoalContribution)
          : "none";
      goals.push({
        id: entry.id,
        alignment: entry.alignment as GoalAlignmentState,
        contributingProjects: readCount(entry.contributingProjects),
        contribution,
      });
      if (goals.length >= SNAPSHOT_LIMITS.goals) break;
    }
  }

  const areas: SnapshotAreaState[] = [];
  if (Array.isArray(value.areas)) {
    for (const entry of value.areas) {
      if (!isRecord(entry)) continue;
      if (typeof entry.id !== "string" || entry.id.length === 0) continue;
      areas.push({
        id: entry.id,
        tasksCompleted: readCount(entry.tasksCompleted),
      });
      if (areas.length >= SNAPSHOT_LIMITS.areas) break;
    }
  }

  return {
    version: REVIEW_INSIGHT_SNAPSHOT_VERSION,
    periodStart,
    periodEnd,
    tasksCompleted: readCount(value.tasksCompleted),
    projectsCompleted: readCount(value.projectsCompleted),
    goalsCompleted: readCount(value.goalsCompleted),
    overdueCarryOver: readCount(value.overdueCarryOver),
    waitingCarryOver: readCount(value.waitingCarryOver),
    projects,
    projectsBounded: value.projectsBounded === true,
    goals,
    goalsBounded: value.goalsBounded === true,
    areas,
    areasBounded: value.areasBounded === true,
    carryOverTaskIds: readIdList(
      value.carryOverTaskIds,
      SNAPSHOT_LIMITS.carryOverTasks,
    ),
    carryOverTaskIdsBounded: value.carryOverTaskIdsBounded === true,
  };
}

/** Serialise for storage. Deterministic — `buildReviewInsightSnapshot` already
 * ordered every list, and this writes the keys in a fixed order. */
export function serializeReviewInsightSnapshot(
  snapshot: ReviewInsightSnapshot,
): string {
  return JSON.stringify(snapshot);
}
