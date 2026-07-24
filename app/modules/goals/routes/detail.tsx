/**
 * AREA-02 — canonical Goal record route (`/goals/:goalId`).
 */

import { env } from "cloudflare:workers";
import { useCallback, useMemo, useState } from "react";
import {
  isRouteErrorResponse,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  composeGoalAlignmentFacts,
  createOwnerAlignmentContext,
  evaluateGoalAlignment,
  serializeGoalAlignmentEvidence,
} from "~/shared/alignment";
import {
  DrawerProvider,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import { TaskRecordDrawer } from "~/shared/task-record/TaskRecordDrawer";

import { GoalActivityTab } from "../GoalActivityTab";
import { GoalDetailsForm } from "../GoalDetailsForm";
import { GoalOverview } from "../GoalOverview";
import { RenameGoalForm } from "../RenameGoalForm";
import {
  serializeGoalDetails,
  serializeGoalOverview,
  serializeGoalProjectContribution,
  serializeGoalProjectItem,
} from "../goal-view";
import type { GoalMutationResult } from "./mutate";
import type { Route } from "./+types/detail";

const RENAME_KEY = "rename";
const EDIT_DETAILS_KEY = "edit-details";
const GOAL_PROJECT_PAGE_SIZE = 50;
/** A calm handful of real contributing Tasks — enough to be useful, small
 * enough to stay scannable in a Summary panel (ADR-040 §40.6). */
const GOAL_ALIGNMENT_EVIDENCE_LIMIT = 5;

export function meta() {
  return [{ title: "Goal · DalyHub" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const goalId = params.goalId;
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const overview = await scope.goals.getGoalOverview(goalId);
  if (!overview) {
    throw new Response("Not Found", { status: 404 });
  }

  const { evaluation, recentWindowStartIso } = createOwnerAlignmentContext(
    new Date(),
  );

  const [details, contribution, projectPage, activityFacts, evidencePage] =
    await Promise.all([
      scope.goalDetails.get(goalId),
      scope.goals.getGoalProjectContribution(goalId),
      scope.goals.listGoalProjects({ goalId, limit: GOAL_PROJECT_PAGE_SIZE }),
      scope.alignment.getGoalAlignmentFacts(goalId, { recentWindowStartIso }),
      scope.alignment.listGoalAlignmentEvidence(
        goalId,
        GOAL_ALIGNMENT_EVIDENCE_LIMIT,
      ),
    ]);

  const alignmentFacts = composeGoalAlignmentFacts({
    goalId,
    completedAt: overview.completedAt,
    contribution,
    activity: activityFacts ?? undefined,
  });
  const alignment = evaluateGoalAlignment(alignmentFacts, evaluation);

  return {
    overview: serializeGoalOverview(overview),
    details: serializeGoalDetails(details),
    contribution: serializeGoalProjectContribution(contribution),
    projects: projectPage.items.map(serializeGoalProjectItem),
    projectsNextCursor: projectPage.nextCursor,
    todayIso: evaluation.todayIso,
    alignment,
    alignmentEvidence: evidencePage.items.map(serializeGoalAlignmentEvidence),
    alignmentEvidenceHasMore: evidencePage.hasMore,
  };
}

export default function GoalDetailRoute({ loaderData }: Route.ComponentProps) {
  const renderDrawer = useMemo(
    () =>
      createGoalDrawerRenderer(
        loaderData.overview.id,
        loaderData.overview.title,
        loaderData.details.targetDate,
        loaderData.details.definitionOfDone,
      ),
    [
      loaderData.overview.id,
      loaderData.overview.title,
      loaderData.details.targetDate,
      loaderData.details.definitionOfDone,
    ],
  );

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <GoalDetail {...loaderData} />
    </DrawerProvider>
  );
}

function createGoalDrawerRenderer(
  goalId: string,
  title: string,
  targetDate: string | null,
  definitionOfDone: string | null,
) {
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
        title: "Rename Goal",
        description: "Give this Goal a clearer name.",
        children: <RenameDrawerHost goalId={goalId} currentTitle={title} />,
      };
    }
    if (entry.key === EDIT_DETAILS_KEY) {
      return {
        title: "Goal details",
        description: "Set a target date and definition of done.",
        children: (
          <DetailsDrawerHost
            goalId={goalId}
            currentTargetDate={targetDate}
            currentDefinitionOfDone={definitionOfDone}
          />
        ),
      };
    }
    return null;
  };
}

function RenameDrawerHost({
  goalId,
  currentTitle,
}: {
  readonly goalId: string;
  readonly currentTitle: string;
}) {
  const { closeDrawer } = useDrawer();
  const revalidator = useRevalidator();
  return (
    <RenameGoalForm
      goalId={goalId}
      currentTitle={currentTitle}
      onDone={() => {
        revalidator.revalidate();
        closeDrawer();
      }}
      onCancel={closeDrawer}
    />
  );
}

function DetailsDrawerHost({
  goalId,
  currentTargetDate,
  currentDefinitionOfDone,
}: {
  readonly goalId: string;
  readonly currentTargetDate: string | null;
  readonly currentDefinitionOfDone: string | null;
}) {
  const { closeDrawer } = useDrawer();
  const revalidator = useRevalidator();
  return (
    <GoalDetailsForm
      goalId={goalId}
      currentTargetDate={currentTargetDate}
      currentDefinitionOfDone={currentDefinitionOfDone}
      onDone={() => {
        revalidator.revalidate();
        closeDrawer();
      }}
      onCancel={closeDrawer}
    />
  );
}

function parseTab(value: string | null): "projects" | "activity" {
  return value === "activity" ? value : "projects";
}

function GoalDetail(props: Awaited<ReturnType<typeof loader>>) {
  const { openDrawer } = useDrawer();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const { notifySuccess, notifyError, notifyUndo } = useFeedback();
  const [searchParams, setSearchParams] = useSearchParams();
  const [completionPending, setCompletionPending] = useState(false);
  const activeTabId = parseTab(searchParams.get("tab"));

  const onTabChange = useCallback(
    (tabId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tabId === "projects") {
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

  const postMutation = useCallback(
    async (body: FormData): Promise<GoalMutationResult> => {
      const response = await fetch(
        `/goals/${encodeURIComponent(props.overview.id)}/mutate`,
        { method: "POST", body },
      );
      return (await response.json()) as GoalMutationResult;
    },
    [props.overview.id],
  );

  const submitCompletion = useCallback(
    async (intent: "complete" | "reopen") => {
      const body = new FormData();
      body.set("intent", intent);
      const result = await postMutation(body);
      if (result.kind === "completion" && result.ok) {
        revalidator.revalidate();
        return true;
      }
      return false;
    },
    [postMutation, revalidator],
  );

  const onToggleComplete = useCallback(
    async (complete: boolean) => {
      setCompletionPending(true);
      try {
        const ok = await submitCompletion(complete ? "complete" : "reopen");
        if (!ok) {
          notifyError("That couldn't be saved. Please try again.");
          return;
        }
        if (complete) {
          notifyUndo("Goal completed", {
            onUndo: () => void submitCompletion("reopen"),
          });
        } else {
          notifySuccess("Goal reopened.");
        }
      } catch {
        notifyError("That couldn't be saved. Please try again.");
      } finally {
        setCompletionPending(false);
      }
    },
    [submitCompletion, notifyUndo, notifySuccess, notifyError],
  );

  return (
    <GoalOverview
      overview={props.overview}
      details={props.details}
      contribution={props.contribution}
      projects={props.projects}
      projectsNextCursor={props.projectsNextCursor}
      todayIso={props.todayIso}
      alignment={props.alignment}
      alignmentEvidence={props.alignmentEvidence}
      alignmentEvidenceHasMore={props.alignmentEvidenceHasMore}
      completionPending={completionPending}
      onToggleComplete={(complete) => void onToggleComplete(complete)}
      onRename={() => openDrawer(RENAME_KEY)}
      onEditDetails={() => openDrawer(EDIT_DETAILS_KEY)}
      onOpenProject={(projectId) =>
        navigate(`/projects/${encodeURIComponent(projectId)}`)
      }
      onOpenTask={(taskId) => openDrawer(`task:${taskId}`)}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      activityTab={
        // `reloadKey` is the Goal's EFFECTIVE updatedAt (the later of the spine
        // entity's own `updated_at` and `goal_details.updated_at` — mirrors
        // ADR-037 §37.2 for Projects): a rename/complete/reopen bumps the spine
        // value, and a target-date/definition-of-done edit bumps `goal_details`
        // instead, so either one changes this key and revalidation re-reads the
        // first Activity page with the new event visible immediately.
        <GoalActivityTab
          goalId={props.overview.id}
          reloadKey={props.overview.updatedAt}
        />
      }
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="dh-goal-not-found">
        <EmptyState
          icon={<EntityIcon type="goal" />}
          title="We couldn't find that Goal"
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
