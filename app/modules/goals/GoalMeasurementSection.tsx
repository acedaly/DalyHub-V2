/**
 * REDESIGN-04 — the Goal's measurement workspace, sheets and all, in ONE place.
 *
 * The record route used to own this: the panel as a slot, the check-in sheet,
 * the configuration sheet, the four `fetch`es behind them and the revalidation
 * that follows each. `mockup3.png`'s master–detail means `/goals` now needs the
 * same thing on the right of its list — including the ability to record a
 * measurement and watch the stat trio and the chart change, which is one of the
 * journeys §11 asks the E2E suite to cover.
 *
 * Two copies of that would be two places for the intent names, the error
 * wording and the revalidation to drift, so it is extracted here and both
 * surfaces mount it. Nothing about the behaviour changed in the move: the same
 * trusted `/goals/:id/measurements` and `/goals/:id/mutate` endpoints, the same
 * intents, the same optimistic-free "post, then revalidate" rule, the same
 * `opener` handling so a closing Sheet returns focus to the control that opened
 * it.
 */

import { useCallback, useState } from "react";
import { useRevalidator } from "react-router";

import { useFeedback } from "~/shared/feedback";
import {
  GoalCheckInSheet,
  GoalMeasurementSetupSheet,
  goalCheckInLabel,
  type GoalCheckInValues,
  type GoalMeasurementSetupValues,
  type SerializedGoalMeasurement,
  type SerializedGoalMilestone,
} from "~/shared/goal-progress";
import type { GoalProgressEvaluation } from "~/kernel/goals";
import type { SerializedGoalDetails } from "./goal-view";

import { GoalMeasurementPanel } from "./GoalMeasurementPanel";
import type { GoalMeasurementMutationResult } from "./routes/measurements";
import type { GoalMutationResult } from "./routes/mutate";

export type GoalMeasurementSectionProps = {
  readonly goalId: string;
  readonly goalTitle: string;
  readonly details: SerializedGoalDetails;
  readonly progress: GoalProgressEvaluation;
  readonly measurements: readonly SerializedGoalMeasurement[];
  readonly milestones: readonly SerializedGoalMilestone[];
  readonly todayIso: string;
};

export function GoalMeasurementSection({
  goalId,
  goalTitle,
  details,
  progress,
  measurements,
  milestones,
  todayIso,
}: GoalMeasurementSectionProps) {
  const revalidator = useRevalidator();
  const { notifySuccess, notifyError } = useFeedback();

  /**
   * The check-in and configuration sheets are owned here rather than inside the
   * panel, because both post to trusted endpoints and both must revalidate the
   * loader afterwards — the two responsibilities the panel is deliberately kept
   * free of. `opener` travels with the request so the shared Sheet can return
   * focus to the exact control that opened it.
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
          `/goals/${encodeURIComponent(goalId)}/measurements`,
          { method: "POST", body },
        );
        return (await response.json()) as GoalMeasurementMutationResult;
      } catch {
        return null;
      }
    },
    [goalId],
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
      notifyError("That couldn’t be saved. Please try again.");
      return false;
    },
    [postMeasurement, revalidator, notifyError],
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
      notifyError("That couldn’t be saved. Please try again.");
      return false;
    },
    [postMeasurement, revalidator, notifyError],
  );

  /**
   * DHDS-11 — write a complete new stage order.
   *
   * The whole order is submitted, never one stage's new position, so the server
   * can refuse a list that no longer describes this Goal rather than applying
   * half a move. A refusal is stated in the SERVER'S own words — "these stages
   * changed somewhere else" is a different fact from "that couldn't be saved",
   * and the owner needs the first one to understand that nothing was lost.
   *
   * There is no optimistic paint: the list revalidates, exactly like every other
   * milestone mutation on this surface. What the drag already showed the owner
   * is the gap, and the gap is a property of the drag rather than a claim about
   * the server.
   */
  const reorderMilestones = useCallback(
    async (orderedMilestoneIds: readonly string[]) => {
      const body = new FormData();
      body.set("intent", "reorder_milestones");
      for (const milestoneId of orderedMilestoneIds) {
        body.append("milestoneId", milestoneId);
      }
      const result = await postMeasurement(body);
      if (result && result.ok) {
        revalidator.revalidate();
        return true;
      }
      notifyError(
        (result && !result.ok ? result.formError : undefined) ??
          "That order couldn’t be saved. Please try again.",
      );
      // The truthful order is whatever the server holds, so the list is
      // re-read rather than left showing an order that was refused.
      revalidator.revalidate();
      return false;
    },
    [postMeasurement, revalidator, notifyError],
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
        const response = await fetch(
          `/goals/${encodeURIComponent(goalId)}/mutate`,
          { method: "POST", body },
        );
        result = (await response.json()) as GoalMutationResult;
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
    [goalId, revalidator, notifySuccess],
  );

  return (
    <>
      <GoalMeasurementPanel
        goalTitle={goalTitle}
        progress={progress}
        measurements={measurements}
        milestones={milestones}
        todayIso={todayIso}
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
        onReorderMilestones={reorderMilestones}
      />
      {checkIn ? (
        <GoalCheckInSheet
          goalTitle={goalTitle}
          actionLabel={goalCheckInLabel(progress.type, progress.unit)}
          unit={progress.unit}
          currentValue={progress.current}
          todayIso={todayIso}
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
          goalTitle={goalTitle}
          initial={{
            measurementType: details.measurement.type ?? undefined,
            unit: details.measurement.unit ?? "",
            baselineValue:
              details.measurement.baselineValue === null
                ? ""
                : String(details.measurement.baselineValue),
            targetValue:
              details.measurement.targetValue === null
                ? ""
                : String(details.measurement.targetValue),
          }}
          opener={setupOpener}
          onClose={() => setSetupOpen(false)}
          onSubmit={submitMeasurementSetup}
        />
      ) : null}
    </>
  );
}
