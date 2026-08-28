/**
 * STEER-03 (DEBT-206) — the product's Goal-progress renderings, ENUMERATED.
 *
 * ADR-111 decision 6, made a build failure rather than an audit finding:
 *
 *   > No surface introduces a measure of a Goal that the vocabulary does not
 *   > define — the Area tab's Task roll-up bar (DEBT-206) is the counterexample
 *   > this clause retires.
 *
 * A rule of that shape needs two halves, and a list alone is only the first:
 *
 *   1. **The inventory** — every place in the product that draws a Goal figure,
 *      named, with the shared authority it must obtain it from. If one of them
 *      starts computing its own, this fails.
 *   2. **The completeness guard** — a scan of every component in `app/` for the
 *      SHAPE of a Goal progress rendering. If a new one appears and is not in
 *      the inventory, this fails. Without it the inventory would only ever
 *      describe the past.
 *
 * The guard is deliberately generous about what counts as a candidate (any
 * component that both speaks about a Goal's progress and draws a meter), so its
 * failure mode is "a new rendering must be declared", never "a new rendering
 * slipped through".
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The complete inventory. `via` is the shared authority the file must reach the
 * figure through — never an arithmetic of its own.
 */
const GOAL_PROGRESS_RENDERINGS: readonly {
  readonly file: string;
  readonly via: string;
  readonly what: string;
}[] = [
  {
    file: "app/shared/goal-progress/GoalProgressReadout.tsx",
    via: "goalProgressMeterStatus",
    what: "the shared readout Today and the record's hero both render",
  },
  {
    file: "app/shared/goal-progress/GoalStatTrio.tsx",
    via: "GoalStat",
    what: "the shared stat trio (three figures, no bar of its own)",
  },
  {
    file: "app/shared/goal-progress/GoalStoryRow.tsx",
    via: "goalProgressMeter",
    what: "the shared Goal-story row: `/goals` and the Area record",
  },
  {
    file: "app/modules/areas/AreaOverview.tsx",
    via: "GoalStoryRow",
    what: "an Area's Goals tab — the surface DEBT-206 was raised about",
  },
  {
    file: "app/modules/goals/GoalWorkspace.tsx",
    via: "GoalStoryRow",
    what: "the `/goals` workspace list",
  },
  {
    file: "app/modules/goals/GoalsCollection.tsx",
    via: "GoalProgressEvaluation",
    what: "the collection's serialised row shape (it draws nothing itself)",
  },
  {
    file: "app/modules/projects/GoalSummarySection.tsx",
    via: "goalProgressMeter",
    what: "the Projects page's compact Goal rail",
  },
  {
    file: "app/modules/today/day/TodayScreen.tsx",
    via: "GoalProgressReadout",
    what: "Today's Goal panel",
  },
  {
    file: "app/modules/today/routes/index.tsx",
    via: "GoalCheckInSheet",
    what: "Today's check-in sheet, which reads the evaluation and writes a reading",
  },
  {
    file: "app/modules/goals/GoalMeasurementPanel.tsx",
    via: "goalProgressStatusLabel",
    what: "the record's measurement workspace — chart, pace and history",
  },
  {
    file: "app/modules/goals/GoalMeasurementSection.tsx",
    via: "GoalMeasurementPanel",
    what: "the ONE measurement composition the record and the pane share",
  },
  {
    file: "app/modules/goals/GoalWorkspacePane.tsx",
    via: "GoalMeasurementSection",
    what: "the `/goals` detail pane",
  },
  {
    file: "app/modules/goals/routes/detail.tsx",
    via: "evaluateGoalFromSeries",
    what: "the Goal record's loader, which derives once and hands it on",
  },
  {
    file: "app/modules/reviews/guided/ReviewGuideSteps.tsx",
    via: "goalProgressStatusLabel",
    what: "the guided Review's Goals step (STEER-03: words and a value, no bar)",
  },
  {
    /*
     * The one figure on this list that is NOT the Goal's measurement, and it is
     * on the list for that reason. It is the Project CONTRIBUTION meter, from
     * `goalContributionProgress`, and it is labelled "Project contribution" —
     * a different question from "how is the outcome going?", which the record
     * answers separately in its `feature` region. Two questions, two figures,
     * both named; that is the opposite of the DEBT-206 defect, which was one
     * question answered three different ways.
     */
    file: "app/modules/goals/GoalOverview.tsx",
    via: "goalContributionProgress",
    what: "the record's Project-contribution meter (a different question)",
  },
];

/**
 * A component that TOUCHES a Goal's derived progress — draws it, formats it,
 * types it or hands it on.
 *
 * Deliberately broader than "draws a bar". A rendering that computes its own
 * figure and prints it as a sentence would be exactly the DEBT-206 defect
 * without a `<progressbar>` in sight, and a detector keyed to the bar would
 * have missed it. Every match must appear in the inventory above with the
 * shared authority it reaches the figure through.
 */
const TOUCHES_GOAL_PROGRESS =
  /GoalProgressEvaluation|goalProgressMeter\b|GoalProgressReadout|GoalStatTrio|GoalStoryRow|GoalMeasurementSection|goalContributionProgress|goal\.progress|progress\.progressPercent|goalRowValue|goalProgressMeterStatus|goalProgressStatusLabel|goalProgressSummaryText/;

function componentFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...componentFiles(path));
    } else if (entry.name.endsWith(".tsx")) {
      found.push(path);
    }
  }
  return found;
}

describe("every Goal progress figure in the product comes from the shared evaluators", () => {
  const candidates = componentFiles("app")
    .filter((file) => TOUCHES_GOAL_PROGRESS.test(readFileSync(file, "utf8")))
    .sort();

  it("has exactly the declared inventory — a new rendering must be declared", () => {
    expect(candidates).toEqual(
      GOAL_PROGRESS_RENDERINGS.map((entry) => entry.file).sort(),
    );
  });

  it.each(GOAL_PROGRESS_RENDERINGS)(
    "$file draws $what through $via",
    ({ file, via }) => {
      expect(readFileSync(file, "utf8")).toContain(via);
    },
  );

  it("has no Goal figure built from a Task or Project roll-up", () => {
    /*
     * The DEBT-206 defect, stated as a source-level rule.
     *
     * A Goal's bar took `taskCompleted / taskTotal` — a count of Tasks — and
     * presented it as the Goal's progress. Any Goal-progress rendering that
     * mentions a roll-up count is either doing that again or is one edit away
     * from it, so the inventory forbids the combination outright. The Area
     * record still READS those counts; it states them as counts of Projects and
     * Tasks on the row's context line, which is a different file's concern and
     * a different sentence.
     */
    for (const { file } of GOAL_PROGRESS_RENDERINGS) {
      const text = readFileSync(file, "utf8");
      const goalBarFromRollup =
        /progress=\{[^}]*task(Completed|Total)/s.test(text) ||
        /Task roll-up[^"]*"\s*,?\s*\}\s*:\s*undefined/s.test(text);
      expect({ file, goalBarFromRollup }).toEqual({
        file,
        goalBarFromRollup: false,
      });
    }
  });
});
