/**
 * Gate D — the Area and Project collection STATES, as a development-only fixture.
 *
 * Why a fixture rather than the real routes: the empty, filtered-empty and
 * progress-extreme states cannot be produced from the seeded workspace without
 * destroying it. The e2e suite runs `workers: 1` against ONE shared local D1, so
 * a capture pass that deleted every Area to photograph "No Areas yet" would
 * poison every spec that ran after it. Everything here renders the SAME
 * `AreasCollectionView` / `ProjectsCollectionView` components the real routes
 * render, inside the real application shell — only the loader data is fictional.
 *
 * The ordinary desktop, tablet and phone captures are taken from `/areas` and
 * `/projects` against real seeded data. This route exists for the states that
 * data cannot reach.
 *
 * `?state=` selects which composition is shown, so each capture is one
 * navigation with no interaction to go wrong:
 *
 *   areas-empty        the true-empty Areas collection
 *   areas-icons        a chosen icon and the fallback, side by side
 *   projects-empty     the true-empty Projects collection
 *   projects-filtered  records exist, none match the chosen filter
 *   projects-progress  zero-task, partially complete and fully complete
 *   projects-icons     a chosen icon and the fallback, side by side
 *
 * Added to the route tree only when NOT building for production, so it never
 * reaches a deployed Worker.
 */

import { useSearchParams } from "react-router";

import { AreasCollectionView } from "~/modules/areas/AreasCollection";
import type { SerializedAreaListItem } from "~/modules/areas/area-view";
import { ProjectsCollectionView } from "~/modules/projects/ProjectsCollection";
import type { SerializedProjectListItem } from "~/modules/projects/project-view";
import { evaluateProjectHealth } from "~/kernel/project-health";
import { createOwnerHealthContext } from "~/shared/project-health/health-view";

export function meta() {
  return [{ title: "Collection states · DalyHub design fixtures" }];
}

/**
 * Health is EVALUATED from fictional facts by the real rules, never
 * hand-written. A fixture that hard-coded a health object would drift from the
 * evaluator the moment a threshold changed, and would then be showing a state
 * the product can no longer produce.
 *
 * A fixed instant, so the capture is byte-identical run to run: with the wall
 * clock, a Project would cross the 14-day staleness boundary mid-review and the
 * screenshots would disagree with each other for no reason anyone could see.
 */
const FIXTURE_NOW = new Date("2026-07-30T09:00:00.000Z");
const FIXTURE_HEALTH_CTX = createOwnerHealthContext(FIXTURE_NOW);

function health(taskTotal: number, taskCompleted: number, completed = false) {
  return evaluateProjectHealth(
    {
      projectId: "fixture",
      completedAt: completed ? new Date("2026-07-28T10:00:00.000Z") : null,
      createdAt: new Date("2026-07-20T09:00:00.000Z"),
      updatedAt: new Date("2026-07-29T10:00:00.000Z"),
      taskTotal,
      taskCompleted,
      waitingOpen: 0,
      overdueOpen: 0,
      slippedOpen: 0,
      upcomingDueOpen: 0,
      upcomingScheduledOpen: 0,
      oldestWaitingSince: null,
      lastMeaningfulActivityAt: new Date("2026-07-29T10:00:00.000Z"),
    },
    FIXTURE_HEALTH_CTX,
  );
}

function area(over: Partial<SerializedAreaListItem>): SerializedAreaListItem {
  return {
    id: "fixture-area",
    title: "Fixture Area",
    createdAt: "2026-07-18T09:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
    colourRank: 0,
    iconKey: null,
    activeProjectCount: 0,
    completedProjectCount: 0,
    rollup: {
      kind: "area",
      goals: { total: 0, completed: 0, ratio: null },
      projects: { total: 0, completed: 0, ratio: null },
      tasks: { total: 0, completed: 0, ratio: null },
    },
    ...over,
  };
}

function project(
  over: Partial<SerializedProjectListItem>,
): SerializedProjectListItem {
  return {
    id: "fixture-project",
    title: "Fixture project",
    createdAt: "2026-07-18T09:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
    completedAt: null,
    status: "active",
    archivedAt: null,
    area: { kind: "area", id: "fa", title: "Fixture Area" },
    goal: null,
    areaColourRank: 0,
    colourRank: 0,
    iconKey: null,
    taskTotal: 0,
    taskCompleted: 0,
    health: health(0, 0),
    healthVisible: true,
    ...over,
  };
}

export default function DesignCollectionStatesRoute() {
  const [params] = useSearchParams();
  const state = params.get("state") ?? "areas-empty";

  if (state === "areas-icons") {
    return (
      <AreasCollectionView
        areas={[
          area({
            id: "a-icon",
            title: "Health & Fitness",
            iconKey: "shield",
            colourRank: 0,
            activeProjectCount: 2,
            rollup: {
              kind: "area",
              goals: { total: 3, completed: 1, ratio: 1 / 3 },
              projects: { total: 2, completed: 0, ratio: 0 },
              tasks: { total: 9, completed: 4, ratio: 4 / 9 },
            },
          }),
          area({
            id: "a-plain",
            title: "Career & Work",
            iconKey: null,
            colourRank: 1,
            activeProjectCount: 1,
            rollup: {
              kind: "area",
              goals: { total: 1, completed: 0, ratio: 0 },
              projects: { total: 1, completed: 0, ratio: 0 },
              tasks: { total: 4, completed: 4, ratio: 1 },
            },
          }),
          area({
            id: "a-loose",
            title: "Home",
            iconKey: "property",
            colourRank: 2,
            rollup: {
              kind: "area",
              goals: { total: 0, completed: 0, ratio: null },
              projects: { total: 0, completed: 0, ratio: null },
              tasks: { total: 5, completed: 2, ratio: 0.4 },
            },
          }),
          area({ id: "a-empty", title: "Finances", colourRank: 3 }),
        ]}
        nextCursor={null}
        failed={false}
      />
    );
  }

  if (state === "areas-empty") {
    return <AreasCollectionView areas={[]} nextCursor={null} failed={false} />;
  }

  if (state === "projects-progress") {
    return (
      <ProjectsCollectionView
        projects={[
          // Zero tasks: no bar at all. An empty bar at 0% would read as
          // "nothing done yet" when the truth is "nothing planned yet".
          project({
            id: "p-zero",
            title: "Nothing planned yet",
            iconKey: "checklist",
            taskTotal: 0,
            taskCompleted: 0,
          }),
          // Partial: exact, and the percentage is rounded from the same pair.
          project({
            id: "p-partial",
            title: "Website relaunch",
            iconKey: "travel",
            areaColourRank: 1,
            colourRank: 1,
            goal: { kind: "goal", id: "g1", title: "Launch the site" },
            taskTotal: 18,
            taskCompleted: 12,
            health: health(18, 12),
          }),
          // Fully complete, and stated as complete rather than merely 100%.
          project({
            id: "p-full",
            title: "Kitchen renovation",
            iconKey: "property",
            areaColourRank: 2,
            colourRank: 2,
            completedAt: "2026-07-28T10:00:00.000Z",
            healthVisible: false,
            taskTotal: 6,
            taskCompleted: 6,
            health: health(6, 6, true),
          }),
        ]}
        nextCursor={null}
        parentOptions={[]}
        state="all"
        failed={false}
      />
    );
  }

  if (state === "projects-icons") {
    return (
      <ProjectsCollectionView
        projects={[
          project({
            id: "p-icon",
            title: "Europe trip 2026",
            iconKey: "travel",
            areaColourRank: 0,
            colourRank: 3,
            taskTotal: 12,
            taskCompleted: 5,
            health: health(12, 5),
          }),
          project({
            id: "p-plain",
            title: "Quarterly review pack",
            iconKey: null,
            areaColourRank: 1,
            colourRank: 4,
            taskTotal: 4,
            taskCompleted: 1,
            health: health(4, 1),
          }),
          project({
            id: "p-no-area",
            title: "Unfiled experiment",
            iconKey: "idea",
            area: null,
            areaColourRank: null,
            colourRank: 5,
            taskTotal: 2,
            taskCompleted: 0,
            health: health(2, 0),
          }),
        ]}
        nextCursor={null}
        parentOptions={[]}
        state="all"
        failed={false}
      />
    );
  }

  if (state === "projects-filtered") {
    return (
      <ProjectsCollectionView
        projects={[]}
        nextCursor={null}
        parentOptions={[]}
        state="archived"
        failed={false}
      />
    );
  }

  return (
    <ProjectsCollectionView
      projects={[]}
      nextCursor={null}
      parentOptions={[]}
      state="all"
      failed={false}
    />
  );
}
