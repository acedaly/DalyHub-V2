/**
 * The shared card FAMILY fixture — development-only, like its siblings.
 *
 * It has its own route rather than sharing `/design/cards-filters`. That was the
 * first attempt and it was wrong twice over: the DS-04/DS-07 spec on that route
 * asserts against the cards IT renders, so a second set of cards on the same page
 * broke five of its assertions — including two through a record title this
 * fixture happened to reuse. A fixture that changes another fixture's contract is
 * not a fixture.
 *
 * ── UNTITLED-18 — what this route may draw ──────────────────────────────────
 *
 * It drew eight components the PRODUCT no longer had a consumer for —
 * `DashboardCard`, `MetricTile`, `MetricRow`, `StatCard` and this directory's
 * own `Timeline`/`TimelineItem` among them — and being drawn here was the only
 * thing keeping them alive. A design gallery that publishes an obsolete
 * generation is worse than no gallery: it is a catalogue a future agent shops
 * from, and every component in it looks equally current.
 *
 * So the rule for this route, and for its siblings: **a fixture may only draw
 * what the product draws.** When the last product consumer of a component goes,
 * its fixture goes with it in the same change — otherwise the fixture becomes
 * the consumer and the deletion never happens.
 *
 * What is left is the two surfaces this family still has: `RecordRow` (the
 * two-line row inside a bounded list) and `EntityCard` (the in-flow card), both
 * of which real collections draw. Two E2E specs pin their contracts here —
 * `projects.spec.ts` on the card's action/link boundary and `visual-system.spec.ts`
 * on the card surface — precisely because a fixture is immune to whichever
 * collection last changed its presentation.
 *
 * The data is obviously fictional. This route is added to the tree only when NOT
 * building for production, so it never reaches a deployed Worker.
 */

import {
  EntityCard,
  EntityCardGrid,
  RecordRow,
  RecordRowList,
} from "~/shared/card";
import { EntityIcon } from "~/shared/entity";
import { PaneHeader } from "~/shared/shell";
import { buttonClassName } from "~/shared/ui";

export default function DesignCardFamilyRoute() {
  return (
    <>
      <PaneHeader title="Card family" subtitle="RecordRow · EntityCard" />
      <div className="dh-pane-body" data-testid="card-family-fixture">
        <h2>RecordRow, in its list</h2>
        <RecordRowList inset label="Fixture rows">
          <RecordRow
            lead={
              <input type="checkbox" aria-label="Complete Fixture row one" />
            }
            title="Fixture row one"
            supporting="Two-line row with a supporting line"
            meta="Due 7:00 am"
            status={<span className="dh-pill dh-pill--danger">High</span>}
            href="#row-1"
          />
          <RecordRow
            lead={
              <input type="checkbox" aria-label="Complete Fixture row two" />
            }
            title="Fixture row two"
            supporting="Another supporting line"
            meta="Due 9:00 am"
            status={<span className="dh-pill dh-pill--warning">Medium</span>}
            href="#row-2"
          />
          <RecordRow
            lead={
              <input
                type="checkbox"
                defaultChecked
                aria-label="Reopen Fixture row three"
              />
            }
            title="Fixture row three"
            supporting="The completed treatment"
            meta="Completed 8:15 am"
            completed
            href="#row-3"
          />
        </RecordRowList>

        <h2>EntityCard, in its grid</h2>
        <EntityCardGrid label="Fixture entity cards">
          <EntityCard
            icon={<EntityIcon type="project" variant="badge" />}
            title="Fixture entity card"
            subtitle="With progress and a footer"
            status={<span className="dh-pill dh-pill--warning">At risk</span>}
            progress={{ value: 1, max: 2, label: "50%" }}
            meta={
              <>
                <span>Due 30 May</span>
                <span>1 of 2 tasks</span>
              </>
            }
            footer="Updated 19 Jul 2026"
            /*
             * A real control inside the card, so the "an action is NOT the
             * card" contract is testable. The whole-card link covers the card;
             * this must stay above it and stay separately clickable, while the
             * non-interactive status chip beside it must NOT block the link.
             */
            overflow={
              <button
                type="button"
                className={buttonClassName({ variant: "subtle" })}
                data-testid="entity-card-fixture-action"
                onClick={(event) => {
                  event.currentTarget.dataset.clicked = "true";
                }}
              >
                More
              </button>
            }
            href="#entity-1"
          />
          <EntityCard
            icon={<EntityIcon type="area" variant="badge" />}
            title="Fixture area card"
            subtitle="With a primary metric"
            metric={{ value: "8", label: "open tasks" }}
            meta={<span>3 active projects</span>}
            href="#entity-2"
          />
          <EntityCard
            icon={<EntityIcon type="goal" variant="badge" />}
            title="Fixture muted card"
            subtitle="The archived treatment"
            status={<span className="dh-pill">Archived</span>}
            progress={{ value: 0, max: 1, label: "0%" }}
            meta={<span>No active work</span>}
            muted
            href="#entity-3"
          />
        </EntityCardGrid>
      </div>
    </>
  );
}
