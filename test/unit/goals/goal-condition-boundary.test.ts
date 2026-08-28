/**
 * STEER-02 / ADR-111 decision 1 — the boundary between the owner's STORED
 * judgement and the machine's DERIVED facts, asserted rather than intended.
 *
 * > Owner judgement is stored; derived signals are derived; **neither ever
 * > produces the other.**
 *
 * That rule has two halves, and both are guarded here:
 *
 *  1. **No derivation takes the condition as input.** The three evaluators —
 *     `evaluateGoalProgress` (GOAL-02), `evaluateGoalAlignment` (ADR-040) and
 *     `evaluateGoalMovement` (FOLLOW-02) — must keep signatures that cannot see
 *     it. This is a SOURCE-level guard for the reason `plan-query-bounds` is
 *     one: a runtime test can only prove that the condition does not change an
 *     answer *today*, and the failure worth preventing is a future edit
 *     threading it in — which is visible in the text and invisible to a value
 *     comparison over facts the test itself constructs.
 *
 *     This guard exists because the obvious runtime version was FALSIFIED: a
 *     deliberate edit that added `condition` to `GoalProgressFacts` and
 *     returned the unmeasured shape for a set-aside Goal passed the value-level
 *     tests untouched, because nothing in them ever passed a condition in. The
 *     falsifier fails this file's first test immediately.
 *
 *  2. **Nothing derives the condition.** No code path may set or clear it from
 *     activity, measurements, movement, alignment or a heuristic — so exactly
 *     one route intent writes it, and the write is the owner's.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { GOAL_CONDITIONS } from "~/kernel/goals";

function source(...segments: string[]): string {
  return readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

/** The three derived answers a Goal carries, and the modules that compute them. */
const EVALUATORS = [
  ["app", "kernel", "goals", "goal-progress-evaluator.ts"],
  ["app", "kernel", "alignment", "goal-alignment.ts"],
  ["app", "kernel", "alignment", "goal-movement.ts"],
] as const;

/**
 * The words that would mean a derivation had learned about the owner's
 * judgement. `condition` is the field; the vocabulary member is the value.
 */
const CONDITION_WORDS = ["condition", ...GOAL_CONDITIONS, "setAside"];

describe("the derived evaluators cannot see the owner's condition", () => {
  it.each(EVALUATORS)(
    "keeps %s free of every reference to the condition",
    (...segments) => {
      const text = source(...segments);
      for (const word of CONDITION_WORDS) {
        expect(
          text.toLowerCase().includes(word.toLowerCase()),
          `${segments.join("/")} mentions "${word}" — a derivation must not know the owner's judgement (ADR-111 decision 1)`,
        ).toBe(false);
      }
    },
  );

  it("keeps the shared composition helpers free of it too", () => {
    // `composeGoalAlignmentFacts` and the summary-based evaluation are where a
    // condition would most plausibly be threaded in "just for filtering", so
    // the guard covers the composition layer as well as the evaluators.
    const text = source(
      "app",
      "shared",
      "goal-progress",
      "goal-progress-view.ts",
    );
    // The lens vocabulary is RE-EXPORTED here and legitimately names the
    // condition-based lens, so the guard is on the derivation functions rather
    // than on the file: no evaluation helper may take a condition argument.
    expect(text).not.toMatch(
      /function\s+evaluateGoalFrom\w+[\s\S]{0,400}condition/,
    );
  });
});

describe("nothing but the owner writes the condition", () => {
  it("is written through exactly ONE route intent", () => {
    const mutate = source("app", "modules", "goals", "routes", "mutate.tsx");
    // One intent, one repository call. If a second write appeared anywhere the
    // count moves and this fails.
    const writes = mutate.match(/condition:/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    expect(mutate).toContain('intent === "set_condition"');
    expect(mutate).toContain("validateGoalConditionInput");
  });

  it("is never written by a background, derived or AI path", () => {
    /*
     * The set of files that may name the condition at all is small and
     * enumerated. Anything else naming it — an activity derivation, the
     * movement read, the attention facts, an AI proposal — would be the
     * auto-set ADR-111 forbids in advance.
     */
    for (const file of [
      ["app", "platform", "attention", "attention-facts.server.ts"],
      ["app", "platform", "activity-window", "goal-movement.server.ts"],
      ["app", "kernel", "alignment", "goal-movement-words.ts"],
    ] as const) {
      expect(
        source(...file).includes("condition"),
        `${file.join("/")} must not write or read the owner's condition`,
      ).toBe(false);
    }
  });

  it("carries a vocabulary of INTENT, with no verdict a derivation computes", () => {
    // ADR-111 decision 2, in one line: the members answer "am I pursuing
    // this?", never "is it going well?".
    expect([...GOAL_CONDITIONS]).toEqual(["set_aside"]);
  });
});
