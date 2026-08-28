/**
 * STEER-01 / STEER-03 — the ONE Goal identity projection, used by every Goal
 * surface in the product.
 *
 * A Goal's mark is its own choice where it has one and its Area's otherwise
 * (IDENTITY-01, migration `0042`). The rule itself is the shared
 * `resolveIdentity` ladder; what was missing was one place that says what a
 * GOAL feeds into it, and the absence showed: the `/goals` row resolved the
 * Goal's own identity with the Area inherited, while the pane beside it
 * resolved ONLY the Area's — so a Goal that had chosen a heart wore two
 * different marks on one screen (DEBT-208).
 *
 * `colourRank: null` is deliberate and is part of the rule: a Goal has no rank
 * of its own, so the derived-colour rung of the ladder belongs to its Area.
 *
 * ── Why it lives in `~/shared` (STEER-03) ──────────────────────────────────
 * STEER-01 stated the rule once — in `app/modules/goals/goal-view.ts`. That was
 * enough while only the Goals module told a Goal's story. STEER-03 propagates
 * the story to the **Area record** and the **guided Review**, and a module may
 * not import another module's internals (`MODULES.md`, asserted by
 * `test/unit/module-registry/module-import-boundary.test.ts`) — so a rule that
 * has to be the same everywhere has to live where everyone can reach it. It is
 * re-exported from `~/modules/goals/goal-view` so the Goals module's own import
 * paths are unchanged, and there is still exactly ONE implementation.
 *
 * Pure and React-free, so a test can assert that two surfaces resolve the same
 * mark by comparing values rather than pixels.
 */

import {
  resolveIdentity,
  type IdentitySource,
} from "~/shared/entity/identity-resolution";

/** What a Goal feeds into the shared identity ladder. */
export interface GoalIdentityInput {
  readonly own?: {
    readonly iconKey?: string | null;
    readonly colourSlot?: string | null;
  } | null;
  readonly area: {
    readonly iconKey?: string | null;
    readonly colourSlot?: string | null;
    readonly colourRank?: number | null;
  };
}

export function goalIdentitySource(goal: GoalIdentityInput): IdentitySource {
  return {
    colourSlot: goal.own?.colourSlot ?? null,
    iconKey: goal.own?.iconKey ?? null,
    // A Goal has no rank of its own; the Area's rank is the derived rung.
    colourRank: null,
    inherited: {
      colourSlot: goal.area.colourSlot ?? null,
      colourRank: goal.area.colourRank ?? null,
      iconKey: goal.area.iconKey ?? null,
    },
  };
}

/** The resolved mark for a Goal — the value every Goal surface paints from. */
export function resolveGoalIdentity(goal: GoalIdentityInput) {
  return resolveIdentity(goalIdentitySource(goal));
}
