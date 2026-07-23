/**
 * AREA-01 — canonical Area record route (`/areas/:areaId`).
 */

import { env } from "cloudflare:workers";
import { useCallback, useMemo } from "react";
import {
  isRouteErrorResponse,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { evaluateAreaMomentum } from "~/kernel/areas";
import { evaluateProjectHealth } from "~/kernel/project-health";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  DrawerProvider,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EntityIcon } from "~/shared/entity";
import { EmptyState } from "~/shared/empty-state";
import { createOwnerHealthContext } from "~/shared/project-health";
import { TaskRecordDrawer } from "~/shared/task-record/TaskRecordDrawer";

import { AreaActivityTab } from "../AreaActivityTab";
import { AreaOverviewView } from "../AreaOverview";
import { RenameAreaForm } from "../RenameAreaForm";
import {
  serializeAreaGoalItem,
  serializeAreaOverview,
  serializeAreaProjectItem,
  serializeAreaRollup,
} from "../area-view";
import type { Route } from "./+types/detail";

const RENAME_KEY = "rename";
const AREA_CHILD_PAGE_SIZE = 50;

type AreaTab = "goals" | "projects" | "activity";

export function meta() {
  return [{ title: "Area · DalyHub" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const areaId = params.areaId;
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const overview = await scope.areas.getAreaOverview(areaId);
  if (!overview) {
    throw new Response("Not Found", { status: 404 });
  }

  const [rollup, goalPage, projectPage] = await Promise.all([
    scope.spine.getRollup(areaId),
    scope.areas.listAreaGoals({ areaId, limit: AREA_CHILD_PAGE_SIZE }),
    scope.areas.listAreaProjects({ areaId, limit: AREA_CHILD_PAGE_SIZE }),
  ]);
  if (rollup.kind !== "area") {
    throw new Response("Not Found", { status: 404 });
  }

  const healthContext = createOwnerHealthContext(new Date());
  const factsById = await scope.projectHealth.listProjectHealthFacts(
    projectPage.items.map((project) => project.id),
    healthContext.todayIso,
  );
  const projects = projectPage.items.map((project) => {
    const facts = factsById.get(project.id) ?? {
      projectId: project.id,
      completedAt: project.completedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      taskTotal: project.taskTotal,
      taskCompleted: project.taskCompleted,
      waitingOpen: 0,
      overdueOpen: 0,
      slippedOpen: 0,
      upcomingDueOpen: 0,
      upcomingScheduledOpen: 0,
      oldestWaitingSince: null,
      lastMeaningfulActivityAt: null,
    };
    return serializeAreaProjectItem(
      project,
      evaluateProjectHealth(facts, healthContext),
    );
  });
  const evaluatedAtIso = healthContext.now.toISOString();
  const momentum = evaluateAreaMomentum(
    {
      rollup,
      projects: projects.map((project) => ({
        id: project.id,
        completedAt: project.completedAt,
        archivedAt: project.archivedAt,
        status: project.status,
        health: project.health,
      })),
    },
    { evaluatedAtIso },
  );

  return {
    overview: serializeAreaOverview(overview),
    rollup: serializeAreaRollup(rollup),
    momentum,
    goals: goalPage.items.map(serializeAreaGoalItem),
    goalsNextCursor: goalPage.nextCursor,
    projects,
    projectsNextCursor: projectPage.nextCursor,
  };
}

export default function AreaDetailRoute({ loaderData }: Route.ComponentProps) {
  const renderDrawer = useMemo(
    () =>
      createAreaDrawerRenderer(
        loaderData.overview.id,
        loaderData.overview.title,
      ),
    [loaderData.overview.id, loaderData.overview.title],
  );

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <AreaDetail {...loaderData} />
    </DrawerProvider>
  );
}

function createAreaDrawerRenderer(areaId: string, title: string) {
  return function render(entry: DrawerEntry): DrawerRenderResult | null {
    const separator = entry.key.indexOf(":");
    const kind = separator === -1 ? entry.key : entry.key.slice(0, separator);
    const id = separator === -1 ? "" : entry.key.slice(separator + 1);
    if (kind === "task" && id.length > 0) {
      return {
        title: "Task",
        description: "Task record",
        children: <TaskRecordDrawer taskId={id} />,
      };
    }
    if (entry.key === RENAME_KEY) {
      return {
        title: "Rename Area",
        description: "Give this Area a clearer name.",
        children: <RenameDrawerHost areaId={areaId} currentTitle={title} />,
      };
    }
    return null;
  };
}

function RenameDrawerHost({
  areaId,
  currentTitle,
}: {
  readonly areaId: string;
  readonly currentTitle: string;
}) {
  const { closeDrawer } = useDrawer();
  const revalidator = useRevalidator();
  return (
    <RenameAreaForm
      areaId={areaId}
      currentTitle={currentTitle}
      onDone={() => {
        revalidator.revalidate();
        closeDrawer();
      }}
      onCancel={closeDrawer}
    />
  );
}

function parseTab(value: string | null): AreaTab {
  return value === "projects" || value === "activity" ? value : "goals";
}

function AreaDetail(props: Awaited<ReturnType<typeof loader>>) {
  const { openDrawer } = useDrawer();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabId = parseTab(searchParams.get("tab"));
  const onTabChange = useCallback(
    (tabId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tabId === "goals") {
            next.delete("tab");
          } else {
            next.set("tab", tabId);
          }
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  return (
    <AreaOverviewView
      overview={props.overview}
      rollup={props.rollup}
      momentum={props.momentum}
      goals={props.goals}
      goalsNextCursor={props.goalsNextCursor}
      projects={props.projects}
      projectsNextCursor={props.projectsNextCursor}
      onRename={() => openDrawer(RENAME_KEY)}
      onOpenProject={(projectId) =>
        navigate(`/projects/${encodeURIComponent(projectId)}`)
      }
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      activityTab={
        <AreaActivityTab
          areaId={props.overview.id}
          reloadKey={props.overview.updatedAt}
        />
      }
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="dh-area-not-found">
        <EmptyState
          icon={<EntityIcon type="area" />}
          title="We couldn't find that Area"
          description="It may have been deleted, or the link is out of date."
          primaryAction={
            <a className="dh-btn dh-btn--primary" href="/areas">
              Back to Areas
            </a>
          }
        />
      </div>
    );
  }
  throw error;
}
