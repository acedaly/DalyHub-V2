/**
 * FOLLOW-02 — the OWNER-FACING WORDS for a Goal's movement.
 *
 * The vocabulary lives beside the derivation for the reason [ADR-110] decision 6
 * gives and FOLLOW-01 already established for the plan account: one derivation
 * per question, shared by every consumer. Today, the Goals collection and the
 * Goal record must not describe the same Goal's week in three sentences, and the
 * only way to guarantee that is for none of them to own the sentence.
 *
 * ── What the words may not do ───────────────────────────────────────────────
 * No percentage, no score, no momentum figure, no streak, no grade, and no
 * moralising label — no *failing*, *poor*, *bad* or *neglected*. ("Neglected" is
 * ADR-040's own alignment answer and stays there; movement never borrows it.)
 * Counts, with what they count printed beside them, in the product's own nouns.
 *
 * ── Two sentences this file must never be able to produce ───────────────────
 * A window that has not begun is never described as stalled, and a window still
 * running is never described as having failed. Both are structural rather than
 * editorial: `evaluateGoalMovement` decides the key from the phase, and this
 * file only looks the key up.
 *
 * ── "Stalled" is deliberately not in the vocabulary ─────────────────────────
 * Seven days without a qualifying outcome does not prove a Goal has stalled — it
 * proves that this window holds no evidence of movement, which is a smaller and
 * truer thing. So the words say exactly that, and they name the window while
 * they do it.
 */

import type {
  GoalMovement,
  GoalMovementEvidence,
  GoalMovementKind,
} from "./goal-movement";

/** "1 Task" / "3 Tasks" — the product's own noun, pluralised once. */
function plural(count: number, one: string, many: string): string {
  return count === 1 ? `${count} ${one}` : `${count} ${many}`;
}

/** The noun a surface calls its period. Every statement names its window. */
export interface GoalMovementWordsOptions {
  /**
   * "this week" by default — the one period all three FOLLOW-02 consumers use.
   * A future consumer over another window passes its own noun rather than
   * re-wording the sentences.
   */
  readonly periodNoun?: string;
}

const DEFAULT_PERIOD_NOUN = "this week";

/** One kind of evidence, in words. */
export function goalMovementEvidenceText(
  evidence: GoalMovementEvidence,
): string {
  switch (evidence.kind) {
    case "task_completed":
      return `${plural(evidence.count, "Task", "Tasks")} completed`;
    case "project_completed":
      return `${plural(evidence.count, "Project", "Projects")} completed`;
    case "measurement_logged":
      return `${plural(evidence.count, "measurement", "measurements")} recorded`;
    case "milestone_completed":
      return `${plural(evidence.count, "milestone", "milestones")} completed`;
    case "goal_completed":
      return "Goal completed";
  }
}

/** Every kind, in the canonical order, as separate phrases. */
export function goalMovementEvidenceTexts(
  movement: GoalMovement,
): readonly string[] {
  return movement.evidence.map(goalMovementEvidenceText);
}

/** The whole statement, in words. */
export interface GoalMovementStatement {
  /** The one sentence every surface shows. Names its own window. */
  readonly headline: string;
  /**
   * The evidence behind it, or null when there is none to give. Never "0
   * Tasks completed" and never a denominator the facts cannot support.
   */
  readonly detail: string | null;
  /** Headline and detail as one string, for an accessible name or a title. */
  readonly accessible: string;
}

/**
 * The contributing-Project half of the detail line.
 *
 * It is stated only when Projects actually moved, and it always carries the
 * denominator the owner needs to read it: "2 of 3 Projects contributed" is a
 * fact; "2 Projects contributed" invites the reader to supply a total that may
 * be four or may be two.
 */
function projectPhrase(movement: GoalMovement): string | null {
  if (movement.movedProjectCount <= 0) return null;
  if (
    movement.contributingProjectCount > 0 &&
    movement.contributingProjectCount !== movement.movedProjectCount
  ) {
    return `${movement.movedProjectCount} of ${plural(
      movement.contributingProjectCount,
      "Project",
      "Projects",
    )} contributed`;
  }
  return `${plural(
    movement.movedProjectCount,
    "Project",
    "Projects",
  )} contributed`;
}

/**
 * The one statement Today, `/goals` and the Goal record all print.
 *
 * `movement.key` is what decides the sentence, so a surface can never reach a
 * wording the derivation did not authorise, and a test can assert the KEY across
 * three surfaces instead of comparing three independently authored sentences.
 */
export function goalMovementStatement(
  movement: GoalMovement,
  options: GoalMovementWordsOptions = {},
): GoalMovementStatement {
  const noun = options.periodNoun ?? DEFAULT_PERIOD_NOUN;

  const headline = ((): string => {
    switch (movement.key) {
      case "unavailable":
        return "Movement could not be read.";
      case "not_started":
        // A period that has not happened is not a period with no movement.
        return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} has not started.`;
      case "moved":
        return `Moved ${noun}.`;
      case "no_movement_yet":
        return `No movement yet ${noun}.`;
      case "no_movement":
        // Absence of evidence INSIDE a bounded window, described as exactly
        // that — never as proof the Goal has stalled.
        return `No movement recorded ${noun}.`;
    }
  })();

  const detail = ((): string | null => {
    if (movement.key !== "moved") return null;
    const parts = [
      projectPhrase(movement),
      ...goalMovementEvidenceTexts(movement),
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(" · ") : null;
  })();

  return {
    headline,
    detail,
    accessible: detail === null ? headline : `${headline} ${detail}`,
  };
}

/**
 * The window in the owner's own words, for the one surface with room to state
 * it explicitly (the Goal record).
 *
 * The headline already names the period; this names its DAYS, so a reader who
 * wants to know which seven days "this week" means can see them without leaving
 * the record.
 */
export function goalMovementWindowLabel(
  movement: GoalMovement,
  formatDay: (dayIso: string) => string,
): string {
  return `${formatDay(movement.window.periodStart)} – ${formatDay(
    movement.window.periodEnd,
  )}`;
}

/**
 * A page's movement recap: how many of the Goals on it moved.
 *
 * Two integers and their window, and NO percentage — the ADR-104 rule the plan
 * account already follows. It is a count of what is on screen, so the caller
 * passes the set it is describing rather than a workspace-wide claim.
 */
export function goalMovementRecap(
  movements: readonly GoalMovement[],
  options: GoalMovementWordsOptions = {},
): string | null {
  const readable = movements.filter((movement) => movement.available);
  if (readable.length === 0) return null;
  const moved = readable.filter((movement) => movement.moved).length;
  return `${moved} of ${readable.length} moved ${options.periodNoun ?? DEFAULT_PERIOD_NOUN}`;
}

/** The kinds a statement may mention, exported so tests can enumerate them. */
export type { GoalMovementKind };
