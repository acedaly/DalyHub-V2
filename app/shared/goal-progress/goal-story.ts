/**
 * STEER-03 — the SHARED Goal story: one Goal, one set of facts, everywhere.
 *
 * ADR-111 decision 6, made structural. Five surfaces tell a Goal's story —
 * Today, `/goals` (row and pane), the canonical Goal record, the **Area
 * record's Goals tab** and the **guided Review's Goals step** — and before this
 * module the last two told their own: the Area tab drew a Task roll-up as the
 * Goal's progress bar (DEBT-206) and the Review saw alignment alone (DEBT-209).
 *
 * ── What the story is, and what it deliberately is NOT ──────────────────────
 * FOUR separate answers to FOUR separate questions, plus the structure that
 * carries them. They are never merged, never reconciled and never rolled into a
 * score (ADR-111 decision 7 / ADR-110 decision 4):
 *
 *   | fact | the question it answers | its authority |
 *   |---|---|---|
 *   | `progress` | "how is the OUTCOME going?" | `evaluateGoalProgress` (GOAL-02) |
 *   | `alignment` | "does this Goal have a reachable structure that has had attention?" | `evaluateGoalAlignment` (ADR-040) |
 *   | `movement` | "did it move inside a NAMED window?" | `evaluateGoalMovement` (FOLLOW-02) |
 *   | `condition` | "am I currently pursuing this?" | the OWNER (STEER-02) |
 *   | `contribution` | "what structure is advancing it?" | `listGoalProjectContributions` |
 *
 * A Goal can be on track and unmoved; set aside and moving; aligned and behind.
 * Every cross-combination stays expressible, and no surface may collapse them.
 *
 * **This module derives NOTHING.** It defines the shape the derived answers
 * travel in and the machine-key projection tests compare surfaces by. The
 * evaluators are untouched, and the owner's condition is carried BESIDE the
 * derived facts — it is never an input to any of them (ADR-111 decision 1,
 * asserted at source level by `goal-condition-boundary.test.ts`).
 *
 * ── Why a machine-key projection ───────────────────────────────────────────
 * FOLLOW-02's parity method: two surfaces are proven to tell the same story by
 * reading the SAME VALUES from each, never by comparing the sentences they
 * happen to draw. `goalStoryFacts` is that value — one flat, JSON-safe record
 * with a fixed key set — so a cross-surface test is an equality assertion
 * rather than a screenshot diff.
 */

import type { GoalAlignment, GoalMovement } from "~/kernel/alignment";
import type { GoalCondition, GoalProgressEvaluation } from "~/kernel/goals";
import type { GoalContributionAcrossReviews } from "~/kernel/review-insights";

import { goalRowValue } from "./goal-progress-view";

/**
 * The STRUCTURAL context — how many Projects advance this Goal, and how many
 * are done.
 *
 * It is a real fact about the Goal and it stays visible; what it is not, and
 * must never be presented as, is the Goal's PROGRESS. That confusion is
 * DEBT-206 (an Area's Goal card drew `taskCompleted / taskTotal` as the Goal's
 * bar) and DEBT-25's older cousin, and it is the reason this field is named
 * after the structure rather than after a percentage.
 */
export interface GoalStoryContribution {
  readonly total: number;
  readonly completed: number;
  readonly active: number;
}

/**
 * One Goal's story, as every surface that tells it receives it. JSON-safe.
 *
 * `null` on `alignment` or `movement` means "this surface did not ask", never
 * "there is none": an unreadable movement arrives as a `GoalMovement` with
 * `available: false`, because "nothing moved" and "we could not look" are
 * different sentences (FOLLOW-02).
 */
export interface GoalStory {
  readonly id: string;
  readonly title: string;
  /** GOAL-02's derived measurement answer — the unmeasured shape when there is none. */
  readonly progress: GoalProgressEvaluation;
  /** ADR-040's derived alignment state, or `null` when the surface did not ask. */
  readonly alignment: GoalAlignment | null;
  /** FOLLOW-02's derived movement, or `null` when the surface did not ask. */
  readonly movement: GoalMovement | null;
  /** STEER-02's OWNER-set condition. `null` is "Pursuing" — the unstored default. */
  readonly condition: GoalCondition | null;
  /** The Goal-owned target date (`YYYY-MM-DD`), or `null`. */
  readonly targetDate: string | null;
  /** The structural contribution, where the surface reads it. */
  readonly contribution: GoalStoryContribution | null;
  /**
   * V2.9 INS-02 — how this Goal's contribution has been classified ACROSS the
   * owner's recent Reviews, or `null` when the surface did not ask.
   *
   * `null` here means the same thing it means on `alignment` and `movement`:
   * this surface did not read it, never "there is none". The Review's Goals
   * step reads it because the snapshot series is already loaded there for the
   * evidence panel; the Area record, `/goals` and search do not, because
   * reading it would mean a workspace-wide snapshot read on three routes to
   * add one line — a cost no surface has asked for. The story composes it
   * WHEREVER a caller supplies it, which is what ADR-111 decision 6 requires:
   * one story, told from one place, showing what each surface asked for.
   */
  readonly contributionAcrossReviews: GoalContributionAcrossReviews | null;
}

/**
 * The machine keys a cross-surface parity test compares. Stated once so a test
 * cannot quietly compare a subset and call two surfaces equal.
 */
export const GOAL_STORY_FACT_KEYS = [
  "measurementStatus",
  "measurementValue",
  "measurementTarget",
  "progressPercent",
  "rowValue",
  "alignmentState",
  "movementAvailable",
  "movementMoved",
  "movementPeriodStart",
  "movementPeriodEnd",
  "condition",
  "targetDate",
  "contributionAcrossReviews",
  "contributionAcrossReviewsOf",
  "contributionAcrossReviewsWindow",
] as const;

export type GoalStoryFactKey = (typeof GOAL_STORY_FACT_KEYS)[number];

/** The flat, comparable projection of a Goal's story. */
export type GoalStoryFacts = Readonly<
  Record<GoalStoryFactKey, string | number | boolean | null>
>;

/**
 * Project a Goal's story to its comparable facts.
 *
 * Every value here is READ from a derived answer; none is computed. A surface
 * that shows fewer facts than another still projects the same values for the
 * ones it shows, which is what makes "the Area record and `/goals` tell the
 * same story about this Goal" an equality assertion.
 */
export function goalStoryFacts(story: GoalStory): GoalStoryFacts {
  const { progress, movement } = story;
  return {
    measurementStatus: progress.status,
    measurementValue: progress.current,
    measurementTarget: progress.target,
    progressPercent: progress.progressPercent,
    rowValue: goalRowValue(progress),
    alignmentState: story.alignment?.state ?? null,
    movementAvailable: movement === null ? null : movement.available,
    movementMoved: movement === null ? null : movement.moved,
    movementPeriodStart: movement?.window.periodStart ?? null,
    movementPeriodEnd: movement?.window.periodEnd ?? null,
    // The unstored default is projected as the WORD it means, so a Goal nobody
    // has spoken about and one explicitly returned to the fold compare equal.
    condition: story.condition ?? "pursuing",
    targetDate: story.targetDate,
    // V2.9 INS-02 — the classification and the number of Reviews it was read
    // over. Both are projected so a surface can never show the state without
    // the window that produced it (ADR-079 decision 6).
    contributionAcrossReviews: story.contributionAcrossReviews?.state ?? null,
    contributionAcrossReviewsOf: story.contributionAcrossReviews?.of ?? null,
    // The series length as well as the Reviews that recorded it, so two
    // surfaces reading different series lengths can never compare equal.
    contributionAcrossReviewsWindow:
      story.contributionAcrossReviews?.reviews ?? null,
  };
}

/**
 * Is this Goal set aside by its owner?
 *
 * Stated once, because it decides SCOPE on attention surfaces (ADR-111
 * decision 3) and nothing else. It never changes what any derived fact says.
 */
export function goalIsSetAside(story: {
  readonly condition: GoalCondition | null;
}): boolean {
  return story.condition === "set_aside";
}

/** IDENTITY-01's two owner-chosen halves, as a surface receives them. */
export interface GoalStoryIdentity {
  /** The Goal's OWN chosen glyph, or `null` — its Area's is the fallback. */
  readonly iconKey: string | null;
  /** The Goal's OWN chosen colour slot, or `null`. */
  readonly colourSlot: string | null;
}

/** A Goal's story as the shared bounded read returns it. JSON-safe. */
export type LoadedGoalStory = GoalStory & GoalStoryIdentity;

/**
 * The story's facts as DOM attributes, so a cross-surface parity test reads the
 * same machine values from each surface rather than comparing the sentences
 * they drew (FOLLOW-02's method, ADR-111 decision 6's requirement).
 *
 * Every surface that tells a Goal's story stamps these, from this one
 * projection — which is what makes "the Area record and `/goals` agree about
 * this Goal" an equality assertion a build can fail on.
 */
export function goalStoryDataAttributes(
  story: GoalStory,
): Record<string, string> {
  const facts = goalStoryFacts(story);
  const attributes: Record<string, string> = { "data-goal-story": story.id };
  for (const key of GOAL_STORY_FACT_KEYS) {
    const value = facts[key];
    attributes[`data-goal-${kebab(key)}`] = value === null ? "" : String(value);
  }
  return attributes;
}

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
