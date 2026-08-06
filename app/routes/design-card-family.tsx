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
 * The data is obviously fictional. This route is added to the tree only when NOT
 * building for production, so it never reaches a deployed Worker.
 */

import {
  DashboardCard,
  EntityCard,
  EntityCardGrid,
  MetricRow,
  MetricRowItem,
  MetricTile,
  RecordRow,
  RecordRowList,
  Timeline,
  TimelineItem,
} from "~/shared/card";
import { EntityIcon } from "~/shared/entity";
import { PaneHeader } from "~/shared/shell";
import { CalendarIcon, CheckIcon, ProjectIcon, TaskIcon } from "~/shared/icons";

export default function DesignCardFamilyRoute() {
  return (
    <>
      <PaneHeader
        title="Card family"
        subtitle="DashboardCard · MetricTile · RecordRow · EntityCard · TimelineItem"
      />
      <div className="dh-pane-body" data-testid="card-family-fixture">
        <div className="dh-fixture-grid">
          <DashboardCard
            title="Daily summary"
            supporting="MetricRow"
            headerAction={
              <a className="dh-btn dh-btn--text" href="#daily">
                View all
              </a>
            }
          >
            <MetricRow>
              <MetricRowItem>
                <MetricTile
                  icon={<CheckIcon />}
                  tone="accent"
                  value="12"
                  label="Fixture tasks"
                  supporting={<a href="#tasks">8 remaining</a>}
                />
              </MetricRowItem>
              <MetricRowItem>
                <MetricTile
                  icon={<CalendarIcon />}
                  value="2"
                  label="Fixture meetings"
                  supporting="Next: 10:00 am"
                />
              </MetricRowItem>
              <MetricRowItem>
                <MetricTile
                  icon={<ProjectIcon />}
                  tone="success"
                  value="5"
                  label="Fixture projects"
                  supporting={<a href="#projects">2 updates due</a>}
                />
              </MetricRowItem>
              <MetricRowItem>
                {/* A bounded figure states its bound rather than implying a total. */}
                <MetricTile
                  icon={<TaskIcon />}
                  tone="warning"
                  value="50+"
                  label="Fixture backlog"
                  supporting="At least — count is bounded"
                />
              </MetricRowItem>
            </MetricRow>
          </DashboardCard>

          <DashboardCard
            title="Fixture rows"
            density="compact"
            footer={
              <a className="dh-btn dh-btn--text" href="#all">
                View all rows
              </a>
            }
          >
            <RecordRowList inset label="Fixture rows">
              <RecordRow
                lead={
                  <input
                    type="checkbox"
                    aria-label="Complete Fixture row one"
                  />
                }
                title="Fixture row one"
                supporting="Two-line row with a supporting line"
                meta="Due 7:00 am"
                status={<span className="dh-pill dh-pill--danger">High</span>}
                href="#row-1"
              />
              <RecordRow
                lead={
                  <input
                    type="checkbox"
                    aria-label="Complete Fixture row two"
                  />
                }
                title="Fixture row two"
                supporting="Another supporting line"
                meta="Due 9:00 am"
                status={
                  <span className="dh-pill dh-pill--warning">Medium</span>
                }
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
          </DashboardCard>

          <DashboardCard title="Fixture agenda" supporting="TimelineItem">
            <Timeline label="Fixture agenda">
              <TimelineItem
                time="10:00 am"
                endTime="11:00 am"
                tone="accent"
                title="Fixture timeline item"
                meta="60 min · A method"
                href="#timeline-1"
              />
              <TimelineItem
                time="1:00 pm"
                endTime="2:00 pm"
                tone="accent"
                title="Second timeline item"
                meta="60 min · A location"
                href="#timeline-2"
              />
              <TimelineItem
                time="4:00 pm"
                endTime="4:30 pm"
                tone="muted"
                title="A cancelled item"
                meta="30 min · Focus time"
                status={<span className="dh-pill">Cancelled</span>}
                muted
                href="#timeline-3"
              />
            </Timeline>
          </DashboardCard>

          <DashboardCard
            title="Empty"
            supporting="proportionate, not a viewport band"
            density="compact"
            isEmpty
            emptyState="No active work"
          />

          <DashboardCard title="Loading" density="compact" isLoading />
        </div>

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
