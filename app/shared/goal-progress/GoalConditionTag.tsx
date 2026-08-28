/**
 * STEER-03 — the OWNER's condition, read-only, wherever a Goal's story is told.
 *
 * `GoalConditionField` (the Goals module) is the EDITABLE control, and it stays
 * the only place the condition is set — the record and the `/goals` pane, the
 * two surfaces that own a Goal's fields. The Area record's Goals tab and the
 * guided Review's Goals step are reading surfaces: they must STATE the owner's
 * judgement, because otherwise a Goal the owner set aside for the winter is
 * indistinguishable from a neglected one in the ritual that exists to notice
 * the difference (ADR-111 decision 6) — but neither is an editor, and adding a
 * second write path for the same field is exactly the fork DEBT-192 closed.
 *
 * ── Why "Pursuing" renders NOTHING ─────────────────────────────────────────
 * "Pursuing" is the unstored default — what every Goal has always been. A tag
 * on every row saying so would be a column of absences, and the product's rule
 * is to render less where there is nothing truthful to add. The machine value
 * is still carried by the row's `data-goal-condition` attribute, so a parity
 * test compares the two surfaces' values whether or not either drew a word.
 *
 * It is a WORD, not a tone: `AGENTS.md` §15 forbids colour-alone state.
 */

import {
  GOAL_CONDITION_SET_ASIDE_LABEL,
  type GoalCondition,
} from "~/kernel/goals";
import { StatusPill } from "~/shared/pill";

export function GoalConditionTag({
  condition,
  className,
  "data-testid": testId = "goal-condition-tag",
}: {
  readonly condition: GoalCondition | null;
  readonly className?: string;
  readonly "data-testid"?: string;
}) {
  if (condition !== "set_aside") return null;
  return (
    <span className={className} data-testid={testId}>
      <StatusPill tone="neutral">{GOAL_CONDITION_SET_ASIDE_LABEL}</StatusPill>
    </span>
  );
}
