/**
 * STEER-02 — the owner-set Goal CONDITION, as ONE inline control.
 *
 * The Goal record and the `/goals` workspace pane both mount this component,
 * so the two surfaces cannot come to word, validate or persist the owner's
 * judgement differently — the same rule DEBT-192 applies to the measurement
 * composition, applied to the new field from the outset rather than after a
 * second copy appears.
 *
 * ── What it is, and what it is deliberately not ─────────────────────────────
 * The condition states the owner's INTENT — "am I currently pursuing this?" —
 * and never a verdict a derivation already computes (ADR-111 decision 2). So
 * the control offers exactly two states, "Pursuing" (the default, stored as no
 * value at all) and "Set aside", and it sits BESIDE the derived facts rather
 * than over them: nothing it does changes, hides or re-tones the measurement
 * status, the alignment state or the movement line (decision 3).
 *
 * It is an ordinary shared `InlineSelectField` — DEBT-183's own desired state,
 * verbatim: *"it becomes an ordinary `InlineSelectField` on the record and the
 * workspace pane; the machinery is already there."* No new interaction
 * pattern, no new primitive, and no new design-system component.
 *
 * The mutation is the canonical Goal path: `POST /goals/:goalId/mutate` with
 * the focused `set_condition` intent, posted by the caller through the same
 * `inlineSave` helper every other Goal field uses. This component owns the
 * vocabulary and the wording only.
 */

import {
  GOAL_CONDITION_PURSUING_LABEL,
  GOAL_CONDITION_SET_ASIDE_LABEL,
  type GoalCondition,
} from "~/kernel/goals";
import {
  InlineSelectField,
  type InlineSaveOutcome,
} from "~/shared/inline-edit";

/**
 * The option set, in the shared field's own grammar.
 *
 * `InlineSelectField` carries REAL values only and renders the unset state as
 * `emptyLabel`, so "Pursuing" — which stores nothing, because it is what every
 * Goal has always been — is the empty state rather than an option, and
 * returning to it is the field's clear command wearing the word "Pursuing"
 * instead of "Clear condition". That is the same shape a Task's optional
 * fields already have, and it keeps the stored vocabulary and the offered
 * vocabulary identical: one member, `set_aside`.
 */
const OPTIONS = [
  {
    value: "set_aside" satisfies GoalCondition,
    label: GOAL_CONDITION_SET_ASIDE_LABEL,
    description:
      "You are not pursuing this right now. It keeps its history and its facts, and stops asking for your attention.",
  },
] as const;

export type GoalConditionFieldProps = {
  /** The stored condition — `null` means "pursuing". */
  readonly condition: GoalCondition | null;
  /**
   * Persist the choice. `null` clears back to "pursuing". The caller posts the
   * canonical `set_condition` intent; a refusal comes back as the field's own
   * message and the previous value stays on screen.
   */
  readonly onSave: (next: GoalCondition | null) => Promise<InlineSaveOutcome>;
  /** `meta` on a pane's context line, `default` on the record's summary band. */
  readonly presentation?: "default" | "meta";
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function GoalConditionField({
  condition,
  onSave,
  presentation = "meta",
  className,
  "data-testid": testId = "goal-condition",
}: GoalConditionFieldProps) {
  return (
    /*
     * The wrapper carries the stable MACHINE FACT a test reads instead of
     * matching a sentence — FOLLOW-02's parity method, applied to the owner's
     * own value so the record and the pane can be proven equal rather than
     * merely similar. It is on a wrapper rather than passed through the shared
     * field because a generic primitive carries no product attributes
     * (AGENTS.md §6 — generic components know no domain).
     */
    <span
      className={className}
      data-goal-condition={condition ?? "pursuing"}
      data-testid={`${testId}-value`}
    >
      <InlineSelectField
        label="Condition"
        value={condition ?? ""}
        options={OPTIONS}
        emptyLabel={GOAL_CONDITION_PURSUING_LABEL}
        // Returning a rested Goal to the fold is offered as "Pursuing", not as
        // "Clear condition": the owner is choosing a state, not emptying a
        // field, and the word they read should be the one they mean.
        clearable
        clearLabel={GOAL_CONDITION_PURSUING_LABEL}
        onSave={(next) => onSave(next === "" ? null : ("set_aside" as const))}
        presentation={presentation}
        data-testid={testId}
      />
    </span>
  );
}
