/**
 * FOLLOW-02 — the ONE way a Goal's movement is drawn.
 *
 * Today, the Goals collection (row and pane) and the Goal record all render
 * THIS component from the SAME `GoalMovement` value, so "the identical sentence
 * appears on all three" is a property of the code rather than a promise in a
 * review. Nothing here derives anything: the words come from
 * `goalMovementStatement`, which is the kernel's, beside the evaluator.
 *
 * ── Meaning is never carried by colour ─────────────────────────────────────
 * There is no red/green badge here and there is deliberately no badge at all.
 * Movement is a SENTENCE, because "moved" and "no movement recorded" are facts
 * about a window rather than a good/bad verdict, and a two-colour chip would
 * turn a bounded observation into a grade — which is precisely what [ADR-110]
 * decision 4 forbids. The only visual distinction is a `data-movement` hook that
 * carries the machine key, used for weight and for tests, never for hue alone.
 *
 * ── The machine key is on the DOM on purpose ───────────────────────────────
 * `data-goal-movement` is the stable fact three surfaces publish identically.
 * A test asserts the KEY across Today, `/goals` and the record rather than
 * comparing three independently authored strings, which is the difference
 * between proving one derivation and proving three sentences happen to match
 * today.
 */

import {
  goalMovementStatement,
  goalMovementWindowLabel,
  type GoalMovement,
} from "~/kernel/alignment";

export interface GoalMovementLineProps {
  readonly movement: GoalMovement;
  /**
   * `glance` — Today's tile and the collection row: the headline, with the
   * evidence as its quiet second line.
   * `record` — the Goal record and the workspace pane: the same two lines plus
   * the window's actual days, because the record is the one surface with room
   * to say which seven days "this week" means.
   */
  readonly size?: "glance" | "record";
  /**
   * Formats a `YYYY-MM-DD` for the `record` size. Passed in rather than
   * imported so this component stays free of the owner's locale plumbing, the
   * same seam every other shared presentation piece uses.
   */
  readonly formatDay?: (dayIso: string) => string;
  /**
   * A heading for the block, when the surface wants one. Rendered as a quiet
   * label above the sentence; omitted entirely where the sentence is the label
   * (a row, a tile).
   */
  readonly label?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}

export function GoalMovementLine({
  movement,
  size = "glance",
  formatDay,
  label,
  className,
  "data-testid": testId = "goal-movement",
}: GoalMovementLineProps) {
  const statement = goalMovementStatement(movement);
  const windowLabel =
    size === "record" && formatDay
      ? goalMovementWindowLabel(movement, formatDay)
      : null;

  return (
    <div
      className={["dh-goal-movement", className].filter(Boolean).join(" ")}
      data-size={size}
      data-goal-movement={movement.key}
      /*
       * The counts, as machine-readable facts beside the key. A product test
       * asserting "2 contributing Projects moved" reads these rather than
       * parsing the sentence, so a wording change is never a test failure and a
       * FACT change always is.
       */
      data-goal-movement-events={movement.eventCount}
      data-goal-movement-projects={movement.movedProjectCount}
      data-testid={testId}
    >
      {label ? <p className="dh-goal-movement__label">{label}</p> : null}
      <p className="dh-goal-movement__headline">{statement.headline}</p>
      {statement.detail ? (
        <p className="dh-goal-movement__detail">{statement.detail}</p>
      ) : null}
      {windowLabel ? (
        <p className="dh-goal-movement__window">{windowLabel}</p>
      ) : null}
    </div>
  );
}
