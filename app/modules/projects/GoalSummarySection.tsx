/**
 * REDESIGN-04 §5.3 — the compact Goals section on the Projects page.
 *
 * `mockup3.png` draws a Goals panel beneath the Projects gallery, and its
 * handset frame draws the same thing as a stack of compact rows under a
 * "Goals / View all" heading. §5.3 reads that as two obligations: the Goals
 * MODULE becomes the master–detail workspace (that is `/goals`), and the
 * Projects index gains the summary half of it.
 *
 * What makes it affordable is the read, not the markup. Every figure here comes
 * from `loadGoalSummaries` — the bounded, grouped read Today has made for its
 * own Goal rail since GOAL-02, promoted into `~/shared/goal-progress` by this
 * pass precisely so a second surface could reuse it rather than add a second
 * read. A page of Goals, then three grouped statements over that page's ids. No
 * history, and no query per Goal.
 *
 * What it is NOT:
 *
 *   - not a second Goals collection. Three rows, and `View all` is the route to
 *     the real one. It carries no filters, no lifecycle tabs and no creation.
 *   - not a place a figure is computed. Each row's value is the kernel
 *     evaluator's own output, formatted by the shared goal-progress view model,
 *     so a row here and the Goal's record can never disagree.
 *   - not shown when it would be noise. The caller hides it while the gallery
 *     is narrowed or on a non-default lifecycle tab, and it renders nothing at
 *     all when there are no measurable Goals — an empty panel teaches less than
 *     no panel.
 */

import { Link } from "react-router";

import { ProgressRow, ProgressRowList } from "~/shared/card";
import { AccentIcon } from "~/shared/entity";
import {
  goalProgressSummaryText,
  goalRowValue,
  type GoalSummary,
} from "~/shared/goal-progress";

export function GoalSummarySection({
  goals,
}: {
  readonly goals: readonly GoalSummary[];
}) {
  return (
    <section className="dh-goal-summary" aria-labelledby="projects-goals-title">
      <div className="dh-goal-summary__head">
        <h2 className="dh-goal-summary__title" id="projects-goals-title">
          Goals
        </h2>
        <Link className="dh-goal-summary__all" to="/goals">
          View all
          <span className="dh-visually-hidden"> Goals</span>
        </Link>
      </div>
      <ProgressRowList label="Goals">
        {goals.map((goal) => (
          <ProgressRow
            key={goal.id}
            icon={
              <AccentIcon
                entityType="goal"
                iconKey={goal.areaIconKey}
                colourRank={goal.areaColourRank}
                size="sm"
              />
            }
            title={goal.title}
            headingLevel={3}
            context={goal.areaTitle}
            accent={goal.areaColourRank}
            progress={
              goal.progress.progressPercent === null
                ? undefined
                : {
                    percent: goal.progress.progressPercent,
                    valueText: goalProgressSummaryText(goal.progress),
                  }
            }
            value={goalRowValue(goal.progress)}
            href={`/goals/${encodeURIComponent(goal.id)}`}
            openAriaLabel={`Open ${goal.title}`}
          />
        ))}
      </ProgressRowList>
    </section>
  );
}
