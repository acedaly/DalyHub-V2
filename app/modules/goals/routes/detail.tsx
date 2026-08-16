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

import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import type { IdentityColourSlot } from "~/kernel/entities/identity-colour-slots";
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
  GoalCheckInSheet,
  GoalMeasurementSetupSheet,
  evaluateGoalFromSeries,
  goalCheckInLabel,
  serializeGoalMeasurement,
  serializeGoalMilestone,
  type GoalCheckInValues,
  type GoalMeasurementSetupValues,
  type SerializedGoalMeasurement,
} from "~/shared/goal-progress";
import { ownerCalendarIso } from "~/shared/datetime";
import { UNMEASURED_GOAL } from "~/kernel/goals";

import { GoalMeasurementPanel } from "../GoalMeasurementPanel";

import {
  serializeGoalDetails,
  serializeGoalOverview,
  serializeGoalProjectContribution,
  serializeGoalProjectItem,
} from "../goal-view";
import type { GoalMeasurementMutationResult } from "./measurements";
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

  // AUDIT-14 — the owner's day, from the one scope-level authority. The zone
  // travels with `todayIso` to the client so the evidence labels below are
  // computed in the SAME calendar the alignment state was evaluated in.
  const timeZone = await scope.ownerTimeZone();
  const { evaluation, recentWindowStartIso } = createOwnerAlignmentContext(
    new Date(),
    timeZone,
  );

  /*
   * GOAL-02 — the FULL measurement series is read here and nowhere else.
   *
   * This is the one surface that draws a trend, so it is the one surface that
   * pays for the history; every collection reads the bounded summary instead
   * (`listMeasurementSummaries`). The read is still capped by the repository.
   */
  const [
    details,
    contribution,
    projectPage,
    activityFacts,
    evidencePage,
    measurements,
    milestones,
  ] = await Promise.all([
    scope.goalDetails.get(goalId),
    scope.goals.getGoalProjectContribution(goalId),
    scope.goals.listGoalProjects({ goalId, limit: GOAL_PROJECT_PAGE_SIZE }),
    scope.alignment.getGoalAlignmentFacts(goalId, { recentWindowStartIso }),
    scope.alignment.listGoalAlignmentEvidence(
      goalId,
      GOAL_ALIGNMENT_EVIDENCE_LIMIT,
    ),
    scope.goalMeasurements.listMeasurements(goalId),
    scope.goalMeasurements.listMilestones(goalId),
  ]);

  const alignmentFacts = composeGoalAlignmentFacts({
    goalId,
    completedAt: overview.completedAt,
    contribution,
    activity: activityFacts ?? undefined,
  });
  const alignment = evaluateGoalAlignment(alignmentFacts, evaluation);

  /*
   * Progress is DERIVED on every read, never stored. The evaluator is the
   * kernel's, and the same one the collections and Today use, so this page can
   * never disagree with a card about the same Goal.
   */
  const measurement = details?.measurement ?? UNMEASURED_GOAL;
  const milestoneSummary = {
    goalId,
    total: milestones.length,
    completed: milestones.filter((item) => item.completedAt !== null).length,
    totalWeight: milestones.reduce((sum, item) => sum + item.weight, 0),
    completedWeight: milestones
      .filter((item) => item.completedAt !== null)
      .reduce((sum, item) => sum + item.weight, 0),
  };
  const progress = evaluateGoalFromSeries({
    config: measurement,
    targetDate: details?.targetDate ?? null,
    measurements: measurements.map((item) => ({
      value: item.value,
      measuredOn: item.measuredOn,
    })),
    milestones: milestoneSummary,
    // The Goal's own creation day is the schedule's origin when there is no
    // earlier reading, so "on track" is measured against real elapsed time.
    startedOn: ownerCalendarIso(overview.createdAt, timeZone),
    completed: overview.completedAt !== null,
    todayIso: evaluation.todayIso,
  });

  return {
    overview: serializeGoalOverview(overview),
    details: serializeGoalDetails(details),
    progress,
    measurements: measurements.map(serializeGoalMeasurement),
    milestones: milestones.map(serializeGoalMilestone),
    contribution: serializeGoalProjectContribution(contribution),
    projects: projectPage.items.map(serializeGoalProjectItem),
    projectsNextCursor: projectPage.nextCursor,
    todayIso: evaluation.todayIso,
    timeZone,
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

  /* ---------------------------------------------------------------------- */
  /* GOAL-02 — measurements                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * The check-in and the measurement-configuration sheets are owned HERE rather
   * than inside the panel, because both post to trusted endpoints and both must
   * revalidate the loader afterwards — the two responsibilities the panel is
   * deliberately kept free of. `opener` travels with the request so the shared
   * Sheet can return focus to the exact control that opened it.
   */
  const [checkIn, setCheckIn] = useState<{
    readonly opener: HTMLElement | null;
    readonly measurement: SerializedGoalMeasurement | null;
  } | null>(null);
  const [setupOpener, setSetupOpener] = useState<HTMLElement | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const postMeasurement = useCallback(
    async (body: FormData): Promise<GoalMeasurementMutationResult | null> => {
      try {
        const response = await fetch(
          `/goals/${encodeURIComponent(props.overview.id)}/measurements`,
          { method: "POST", body },
        );
        return (await response.json()) as GoalMeasurementMutationResult;
      } catch {
        return null;
      }
    },
    [props.overview.id],
  );

  const submitCheckIn = useCallback(
    async (values: GoalCheckInValues) => {
      const body = new FormData();
      const editing = checkIn?.measurement ?? null;
      body.set("intent", editing ? "update_measurement" : "log_measurement");
      if (editing) body.set("measurementId", editing.id);
      body.set("value", values.value);
      body.set("measuredOn", values.measuredOn);
      body.set("note", values.note);
      const result = await postMeasurement(body);
      if (result && result.ok) {
        revalidator.revalidate();
        notifySuccess(editing ? "Measurement updated." : "Measurement saved.");
        return { ok: true as const };
      }
      return {
        ok: false as const,
        formError:
          (result && !result.ok ? result.formError : undefined) ??
          "That couldn’t be saved. Your change is still here — try again.",
        fieldErrors:
          result && !result.ok
            ? // The kernel's field names are the form's field names, so a
              // validation refusal lands on the control that caused it.
              (result.fieldErrors as Record<string, string> | undefined)
            : undefined,
      };
    },
    [checkIn, postMeasurement, revalidator, notifySuccess],
  );

  const deleteMeasurement = useCallback(
    async (measurementId: string) => {
      const body = new FormData();
      body.set("intent", "delete_measurement");
      body.set("measurementId", measurementId);
      const result = await postMeasurement(body);
      if (result && result.ok) {
        revalidator.revalidate();
        return true;
      }
      return false;
    },
    [postMeasurement, revalidator],
  );

  const toggleMilestone = useCallback(
    async (milestoneId: string, completed: boolean) => {
      const body = new FormData();
      body.set("intent", "update_milestone");
      body.set("milestoneId", milestoneId);
      body.set("completed", completed ? "true" : "false");
      const result = await postMeasurement(body);
      if (result && result.ok) {
        revalidator.revalidate();
        return true;
      }
      notifyError("That couldn’t be saved. Please try again.");
      return false;
    },
    [postMeasurement, revalidator, notifyError],
  );

  const addMilestone = useCallback(
    async (title: string) => {
      const body = new FormData();
      body.set("intent", "add_milestone");
      body.set("title", title);
      const result = await postMeasurement(body);
      if (result && result.ok) {
        revalidator.revalidate();
        return true;
      }
      return false;
    },
    [postMeasurement, revalidator],
  );

  const deleteMilestone = useCallback(
    async (milestoneId: string) => {
      const body = new FormData();
      body.set("intent", "delete_milestone");
      body.set("milestoneId", milestoneId);
      const result = await postMeasurement(body);
      if (result && result.ok) {
        revalidator.revalidate();
        return true;
      }
      notifyError("That stage couldn’t be removed. Please try again.");
      return false;
    },
    [postMeasurement, revalidator, notifyError],
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

  /*
   * IDENTITY-01 — the Goal's own icon and colour, applied together.
   *
   * Both are sent every time, empty when unchosen: the server reads "" as
   * "reset to the Area's" and an ABSENT field as "this form has no such
   * control", and this form has both. `revalidate` rather than an optimistic
   * patch, because a Goal's identity is read by the header, the collection and
   * Today, and the loader is the one thing that knows all three.
   */
  const onSetIdentity = useCallback(
    async (identity: {
      readonly iconKey: EntityIconKey | null;
      readonly colourSlot: IdentityColourSlot | null;
    }) => {
      const body = new FormData();
      body.set("intent", "set_identity");
      body.set("iconKey", identity.iconKey ?? "");
      body.set("colourSlot", identity.colourSlot ?? "");
      const result = await postMutation(body);
      if (result.kind !== "set_identity" || !result.ok) {
        throw new Error(
          result.kind === "set_identity" && !result.ok
            ? result.formError
            : "That couldn’t be saved. Please try again.",
        );
      }
      revalidator.revalidate();
    },
    [postMutation, revalidator],
  );

  const onSetDefinitionOfDone = useCallback(
    (definitionOfDone: string) =>
      inlineSave("set_definition_of_done", { definitionOfDone }),
    [inlineSave],
  );

  /**
   * Saving the measurement configuration reuses the SAME `/mutate` endpoint and
   * the same partial-patch rule as every other Goal-owned field: the wire values
   * become a validated patch server-side, merged over the current configuration
   * and renormalised by the kernel.
   */
  const submitMeasurementSetup = useCallback(
    async (values: GoalMeasurementSetupValues) => {
      const body = new FormData();
      body.set("intent", "set_measurement");
      body.set("measurementType", values.measurementType);
      body.set("unit", values.unit);
      body.set("baselineValue", values.baselineValue);
      body.set("targetValue", values.targetValue);
      let result: GoalMutationResult;
      try {
        result = await postMutation(body);
      } catch {
        return {
          ok: false as const,
          formError: "That couldn’t be saved. Please try again.",
        };
      }
      if (result.kind === "set_measurement" && result.ok) {
        revalidator.revalidate();
        notifySuccess("Measurement saved.");
        return { ok: true as const };
      }
      return {
        ok: false as const,
        formError:
          result.kind === "set_measurement" && !result.ok
            ? result.formError
            : "That couldn’t be saved. Please try again.",
        fieldErrors:
          result.kind === "set_measurement" && !result.ok
            ? result.fieldErrors
            : undefined,
      };
    },
    [postMutation, revalidator, notifySuccess],
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
    <>
      <GoalOverview
        overview={props.overview}
        details={props.details}
        contribution={props.contribution}
        projects={props.projects}
        projectsNextCursor={props.projectsNextCursor}
        todayIso={props.todayIso}
        timeZone={props.timeZone}
        alignment={props.alignment}
        alignmentEvidence={props.alignmentEvidence}
        alignmentEvidenceHasMore={props.alignmentEvidenceHasMore}
        completionPending={completionPending}
        onToggleComplete={(complete) => void onToggleComplete(complete)}
        onRename={onRename}
        onSetTargetDate={onSetTargetDate}
        onSetIdentity={onSetIdentity}
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
        /*
         * GOAL-02 — the progress section leads the Summary.
         *
         * It is passed as a SLOT rather than as ten more props, so `GoalOverview`
         * stays the record's composition and knows nothing about measurements,
         * sheets or fetches. Everything it needs was derived server-side.
         */
        progressSlot={
          <GoalMeasurementPanel
            goalTitle={props.overview.title}
            progress={props.progress}
            measurements={props.measurements}
            milestones={props.milestones}
            todayIso={props.todayIso}
            onRecord={(trigger, measurement) =>
              setCheckIn({ opener: trigger, measurement: measurement ?? null })
            }
            onConfigure={(trigger) => {
              setSetupOpener(trigger);
              setSetupOpen(true);
            }}
            onDeleteMeasurement={deleteMeasurement}
            onToggleMilestone={toggleMilestone}
            onAddMilestone={addMilestone}
            onDeleteMilestone={deleteMilestone}
          />
        }
      />
      {checkIn ? (
        <GoalCheckInSheet
          goalTitle={props.overview.title}
          actionLabel={goalCheckInLabel(
            props.progress.type,
            props.progress.unit,
          )}
          unit={props.progress.unit}
          currentValue={props.progress.current}
          todayIso={props.todayIso}
          mode={checkIn.measurement ? "correct" : "record"}
          initial={
            checkIn.measurement
              ? {
                  value: String(checkIn.measurement.value),
                  measuredOn: checkIn.measurement.measuredOn,
                  note: checkIn.measurement.note ?? "",
                }
              : undefined
          }
          opener={checkIn.opener}
          onClose={() => setCheckIn(null)}
          onSubmit={submitCheckIn}
        />
      ) : null}
      {setupOpen ? (
        <GoalMeasurementSetupSheet
          goalTitle={props.overview.title}
          initial={{
            measurementType: props.details.measurement.type ?? undefined,
            unit: props.details.measurement.unit ?? "",
            baselineValue:
              props.details.measurement.baselineValue === null
                ? ""
                : String(props.details.measurement.baselineValue),
            targetValue:
              props.details.measurement.targetValue === null
                ? ""
                : String(props.details.measurement.targetValue),
          }}
          opener={setupOpener}
          onClose={() => setSetupOpen(false)}
          onSubmit={submitMeasurementSetup}
        />
      ) : null}
    </>
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
