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

import {
  evaluateAreaMomentum,
  type AreaMomentumProjectFacts,
} from "~/kernel/areas";
import {
  evaluateProjectHealth,
  isProjectHealthVisible,
  type ProjectHealthFacts,
  type ProjectHealthRepository,
} from "~/kernel/project-health";
import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
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
import { NewGoalForm } from "~/shared/goal-creation/NewGoalForm";
import { LinkedItemsTab } from "~/shared/linked-items";
import { createOwnerHealthContext } from "~/shared/project-health";
import { TaskRecordDrawer } from "~/shared/task-record/TaskRecordDrawer";

import { AreaActivityTab } from "../AreaActivityTab";
import { NEW_GOAL_KEY, AreaOverviewView } from "../AreaOverview";
import { AreaSettingsTab } from "../AreaSettingsTab";
import { RenameAreaForm } from "../RenameAreaForm";
import {
  serializeAreaGoalItem,
  serializeAreaOverview,
  serializeAreaProjectItem,
  serializeAreaRollup,
} from "../area-view";
import type { AreaMutationResult } from "./mutate";
import type { Route } from "./+types/detail";

const RENAME_KEY = "rename";
const AREA_CHILD_PAGE_SIZE = 50;

/**
 * `ProjectHealthRepository.listProjectHealthFacts` caps a single read at 100 ids
 * (`MAX_HEALTH_BATCH`) as a bounded-collection-page safety ceiling, and internally
 * fans a batch out into ≤40-id chunks with a small number of concurrent queries
 * per chunk. The COMPLETE momentum boundary must cover every aligned Project
 * regardless of count, so this chunks the (unbounded) aligned-Project id set into
 * ≤100-id batches and calls the SAME batched, N+1-free operation per batch — never
 * a query per Project, and never an arbitrary cap that would silently drop a
 * Project from the aggregate. Batches are read SEQUENTIALLY (not `Promise.all`)
 * so total in-flight D1 concurrency stays bounded to one batch's own internal
 * fan-out — an Area with hundreds of active Projects issues more ROUND TRIPS, not
 * unbounded simultaneous D1 work.
 */
const HEALTH_FACTS_BATCH_SIZE = 100;

type AreaTab = "goals" | "projects" | "linked" | "activity" | "settings";

export function meta() {
  return [{ title: "Area · DalyHub" }];
}

async function collectProjectHealthFacts(
  projectHealth: ProjectHealthRepository,
  ids: readonly string[],
  todayIso: string,
): Promise<Map<string, ProjectHealthFacts>> {
  const merged = new Map<string, ProjectHealthFacts>();
  for (let i = 0; i < ids.length; i += HEALTH_FACTS_BATCH_SIZE) {
    const batch = ids.slice(i, i + HEALTH_FACTS_BATCH_SIZE);
    const page = await projectHealth.listProjectHealthFacts(batch, todayIso);
    for (const [id, facts] of page) {
      merged.set(id, facts);
    }
  }
  return merged;
}

function fallbackHealthFacts(project: {
  readonly id: string;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): ProjectHealthFacts {
  return {
    projectId: project.id,
    completedAt: project.completedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    taskTotal: 0,
    taskCompleted: 0,
    waitingOpen: 0,
    overdueOpen: 0,
    slippedOpen: 0,
    upcomingDueOpen: 0,
    upcomingScheduledOpen: 0,
    oldestWaitingSince: null,
    lastMeaningfulActivityAt: null,
  };
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const areaId = params.areaId;
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const overview = await scope.areas.getAreaOverview(areaId);
  if (!overview) {
    throw new Response("Not Found", { status: 404 });
  }

  const settings = await scope.areaSettings.get(areaId);

  const [rollup, goalPage, projectPage, momentumFacts, dependencies] =
    await Promise.all([
      scope.spine.getRollup(areaId),
      scope.areas.listAreaGoals({ areaId, limit: AREA_CHILD_PAGE_SIZE }),
      scope.areas.listAreaProjects({ areaId, limit: AREA_CHILD_PAGE_SIZE }),
      scope.areas.getAreaMomentumFacts(areaId),
      scope.areas.getAreaDependencySummary(areaId),
    ]);
  if (rollup.kind !== "area") {
    throw new Response("Not Found", { status: 404 });
  }

  const healthContext = createOwnerHealthContext(new Date());

  // The DISPLAYED (bounded) card page — a separate concern from momentum.
  const displayedFactsById = await collectProjectHealthFacts(
    scope.projectHealth,
    projectPage.items.map((project) => project.id),
    healthContext.todayIso,
  );
  const projects = projectPage.items.map((project) => {
    const facts =
      displayedFactsById.get(project.id) ?? fallbackHealthFacts(project);
    return serializeAreaProjectItem(
      project,
      evaluateProjectHealth(facts, healthContext),
    );
  });

  // The COMPLETE momentum boundary: every Project aligned to the Area, independent
  // of the card page above. Health is only ever needed (and only ever fetched) for
  // the visible active subset — Planned/On-hold/completed/archived Projects never
  // create an active warning, so they never need a health read. A visible active
  // Project that is ALSO on the displayed card page reuses the facts already
  // fetched above instead of being queried a second time.
  const visibleActiveIds = momentumFacts.projects
    .filter((project) => isProjectHealthVisible(project))
    .map((project) => project.id);
  const idsNotAlreadyLoaded = visibleActiveIds.filter(
    (id) => !displayedFactsById.has(id),
  );
  const additionalFactsById = await collectProjectHealthFacts(
    scope.projectHealth,
    idsNotAlreadyLoaded,
    healthContext.todayIso,
  );
  const momentumFactsById = new Map([
    ...displayedFactsById,
    ...additionalFactsById,
  ]);
  const momentumProjects: AreaMomentumProjectFacts[] =
    momentumFacts.projects.map((project) => {
      if (!isProjectHealthVisible(project)) {
        return {
          id: project.id,
          status: project.status,
          completedAt: project.completedAt,
          archivedAt: project.archivedAt,
        };
      }
      const facts =
        momentumFactsById.get(project.id) ?? fallbackHealthFacts(project);
      return {
        id: project.id,
        status: project.status,
        completedAt: project.completedAt,
        archivedAt: project.archivedAt,
        health: evaluateProjectHealth(facts, healthContext),
      };
    });

  const evaluatedAtIso = healthContext.now.toISOString();
  const momentum = evaluateAreaMomentum(
    {
      goals: {
        openTotal: rollup.goals.total - rollup.goals.completed,
        completedTotal: rollup.goals.completed,
      },
      directTasks: momentumFacts.directTasks,
      projects: momentumProjects,
    },
    { evaluatedAtIso },
  );

  return {
    // The KEY only. The settings repository has already normalised it, so a
    // key this build no longer recognises arrives as `null` and the Area
    // renders its entity default rather than an empty box.
    overview: serializeAreaOverview(overview, settings?.iconKey ?? null),
    rollup: serializeAreaRollup(rollup),
    momentum,
    goals: goalPage.items.map(serializeAreaGoalItem),
    goalsNextCursor: goalPage.nextCursor,
    projects,
    projectsNextCursor: projectPage.nextCursor,
    dependencies,
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
    if (entry.key === NEW_GOAL_KEY) {
      return {
        title: "New Goal",
        description: "Give this Area a Goal.",
        children: <NewGoalDrawerHost areaId={areaId} />,
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

function NewGoalDrawerHost({ areaId }: { readonly areaId: string }) {
  const navigate = useNavigate();
  const { closeDrawer } = useDrawer();
  return (
    <NewGoalForm
      areaId={areaId}
      onCreated={(goalId) => navigate(`/goals/${encodeURIComponent(goalId)}`)}
      onCancel={closeDrawer}
    />
  );
}

function parseTab(value: string | null): AreaTab {
  return value === "projects" ||
    value === "linked" ||
    value === "activity" ||
    value === "settings"
    ? value
    : "goals";
}

async function postAreaMutation(
  areaId: string,
  fields: Record<string, string>,
): Promise<AreaMutationResult> {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value);
  }
  const response = await fetch(`/areas/${encodeURIComponent(areaId)}/mutate`, {
    method: "POST",
    body,
    headers: { accept: "application/json" },
  });
  return (await response.json()) as AreaMutationResult;
}

function AreaDetail(props: Awaited<ReturnType<typeof loader>>) {
  const { openDrawer } = useDrawer();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabId = parseTab(searchParams.get("tab"));
  const areaId = props.overview.id;
  const archived = props.overview.archivedAt !== null;

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

  const onArchive = useCallback(async () => {
    const result = await postAreaMutation(areaId, { intent: "archive" });
    if (!result.ok) {
      throw new Error(
        ("formError" in result && result.formError) ||
          "That couldn’t be saved. Please try again.",
      );
    }
    revalidator.revalidate();
  }, [areaId, revalidator]);

  const onSetIcon = useCallback(
    async (iconKey: EntityIconKey | null) => {
      const result = await postAreaMutation(areaId, {
        intent: "setIcon",
        // Empty means reset-to-default, which is a real choice the server
        // honours — not an omission.
        iconKey: iconKey ?? "",
      });
      if (!result.ok) {
        throw new Error(
          ("formError" in result && result.formError) ||
            "That couldn’t be saved. Please try again.",
        );
      }
      revalidator.revalidate();
    },
    [areaId, revalidator],
  );

  const onRestore = useCallback(async () => {
    const result = await postAreaMutation(areaId, { intent: "restore" });
    if (!result.ok) {
      throw new Error(
        ("formError" in result && result.formError) ||
          "That couldn’t be saved. Please try again.",
      );
    }
    revalidator.revalidate();
  }, [areaId, revalidator]);

  const onDelete = useCallback(async () => {
    const result = await postAreaMutation(areaId, { intent: "delete" });
    if (!result.ok) {
      throw new Error(
        ("formError" in result && result.formError) ||
          "That couldn’t be completed. Please try again.",
      );
    }
    // Redirect to the collection; the deleted Area no longer exists.
    navigate("/areas");
  }, [areaId, navigate]);

  return (
    <AreaOverviewView
      overview={props.overview}
      rollup={props.rollup}
      momentum={props.momentum}
      goals={props.goals}
      goalsNextCursor={props.goalsNextCursor}
      projects={props.projects}
      projectsNextCursor={props.projectsNextCursor}
      archived={archived}
      onRename={() => openDrawer(RENAME_KEY)}
      onOpenGoal={(goalId) => navigate(`/goals/${encodeURIComponent(goalId)}`)}
      onOpenProject={(projectId) =>
        navigate(`/projects/${encodeURIComponent(projectId)}`)
      }
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      linkedTab={
        <LinkedItemsTab
          anchorId={props.overview.id}
          anchorType="area"
          readOnly={archived}
          linkCommandTarget={{
            kind: "route",
            to: `/areas/${props.overview.id}?tab=linked`,
          }}
        />
      }
      activityTab={
        <AreaActivityTab
          areaId={props.overview.id}
          reloadKey={props.overview.updatedAt}
        />
      }
      onArchive={onArchive}
      onRestore={onRestore}
      onDelete={onDelete}
      deletable={props.dependencies.deletable}
      settingsTab={
        <AreaSettingsTab
          overview={props.overview}
          dependencies={props.dependencies}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
          onSetIcon={onSetIcon}
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
          title="We couldn’t find that Area"
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
