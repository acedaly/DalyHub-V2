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
import { LinkedItemsTab } from "~/shared/linked-items";
import type { InlineSaveOutcome } from "~/shared/inline-edit";
import { useFeedback } from "~/shared/feedback";
import { useReversibleDelete } from "~/shared/record-lifecycle";
import { TaskRecordDrawer } from "~/shared/task-record/TaskRecordDrawer";

import { GoalActivityTab } from "../GoalActivityTab";
import { GoalOverview } from "../GoalOverview";
import {
  serializeGoalDetails,
  serializeGoalOverview,
  serializeGoalProjectContribution,
  serializeGoalProjectItem,
} from "../goal-view";
import type { GoalMutationResult } from "./mutate";
import type { Route } from "./+types/detail";

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
  const renderDrawer = useMemo(() => createGoalDrawerRenderer(), []);

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <GoalDetail {...loaderData} />
    </DrawerProvider>
  );
}

/**
 * EDIT-02 — the Goal Drawer now hosts ONE thing: a Task record opened from the
 * alignment evidence. The rename and details forms are gone, because the values
 * they edited are edited on the record itself.
 */
function createGoalDrawerRenderer() {
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
    return null;
  };
}

function parseTab(value: string | null): "projects" | "linked" | "activity" {
  return value === "activity" || value === "linked" ? value : "projects";
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

  /**
   * DS-16 — one helper for the three inline fields.
   *
   * Each posts its OWN focused intent to the SAME trusted endpoint the Drawer
   * forms used, so every server-side rule is untouched: the workspace is
   * resolved server-side, the id is verified to be an active Goal in it, and
   * `SpineValidationError`/`GoalDetailsValidationError` still produce the field
   * message. A refusal is RETURNED rather than thrown, because `useInlineEdit`
   * keeps the user's draft in the field and shows the message — the behaviour
   * closing a Drawer could never offer.
   */
  const inlineSave = useCallback(
    async (
      kind: "rename" | "set_target_date" | "set_definition_of_done",
      fields: Record<string, string>,
    ): Promise<InlineSaveOutcome> => {
      const body = new FormData();
      body.set("intent", kind);
      for (const [key, value] of Object.entries(fields)) body.set(key, value);
      let result: GoalMutationResult;
      try {
        result = await postMutation(body);
      } catch {
        return {
          ok: false,
          message:
            "That couldn’t be saved. Your change is still here — try again.",
        };
      }
      if (result.kind === kind && result.ok) {
        revalidator.revalidate();
        return { ok: true };
      }
      const fieldErrors =
        result.kind === kind && !result.ok ? result.fieldErrors : undefined;
      const formError =
        result.kind === kind && !result.ok ? result.formError : undefined;
      return {
        ok: false,
        message:
          (fieldErrors ? Object.values(fieldErrors)[0] : undefined) ??
          formError ??
          "That couldn’t be saved. Your change is still here — try again.",
      };
    },
    [postMutation, revalidator],
  );

  const onRename = useCallback(
    (title: string) => inlineSave("rename", { title }),
    [inlineSave],
  );

  const onSetTargetDate = useCallback(
    (targetDate: string | null) =>
      // An empty string is the endpoint's own "clear it" wire form
      // (`emptyToNull`), so clearing needs no second intent.
      inlineSave("set_target_date", { targetDate: targetDate ?? "" }),
    [inlineSave],
  );

  const onSetDefinitionOfDone = useCallback(
    (definitionOfDone: string) =>
      inlineSave("set_definition_of_done", { definitionOfDone }),
    [inlineSave],
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
          notifyError("That couldn’t be saved. Please try again.");
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
        notifyError("That couldn’t be saved. Please try again.");
      } finally {
        setCompletionPending(false);
      }
    },
    [submitCompletion, notifyUndo, notifySuccess, notifyError],
  );

  const postLifecycle = useCallback(
    async (intent: "delete" | "restore") => {
      const body = new FormData();
      body.set("intent", intent);
      const result = await postMutation(body);
      if (result.kind === intent && result.ok) {
        return { ok: true };
      }
      // The route already explains what to do first — a Goal that still owns
      // active Projects, or one whose Area is gone — so pass that recovery
      // through rather than collapsing it to a generic "try again" the user
      // cannot act on (AGENTS.md §6).
      const error =
        result.kind === intent && !result.ok ? result.formError : undefined;
      return { ok: false, error };
    },
    [postMutation],
  );

  // PX-04 — reversible removal, through the ONE shared implementation: a real
  // server soft-delete, a redirect back to the collection, and a DS-10 Undo
  // toast whose handler calls the mirror `restore` intent.
  const { remove: onDelete, pending: deletePending } = useReversibleDelete({
    entityType: "goal",
    title: props.overview.title,
    post: postLifecycle,
    redirectTo: "/goals",
  });

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
      onRename={onRename}
      onSetTargetDate={onSetTargetDate}
      onSetDefinitionOfDone={onSetDefinitionOfDone}
      onDelete={onDelete}
      deletePending={deletePending}
      onOpenProject={(projectId) =>
        navigate(`/projects/${encodeURIComponent(projectId)}`)
      }
      onOpenTask={(taskId) => openDrawer(`task:${taskId}`)}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      linkedTab={
        <LinkedItemsTab
          anchorId={props.overview.id}
          anchorType="goal"
          linkCommandTarget={{
            kind: "route",
            to: `/goals/${props.overview.id}?tab=linked`,
          }}
        />
      }
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
          title="We couldn’t find that Goal"
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
