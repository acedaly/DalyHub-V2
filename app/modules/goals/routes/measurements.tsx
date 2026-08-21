/**
 * GOAL-02 — the Goal measurement endpoint (`POST /goals/:goalId/measurements`).
 *
 * An action-only resource route (no UI), mirroring `mutate.tsx` exactly: the
 * `goalId` is verified to be an ACTIVE GOAL in the server-resolved workspace
 * BEFORE any dispatch, so a Task/Project/Area id — or a cross-workspace one —
 * gets the calm not-found and nothing is written. Every write goes through the
 * single `goalMeasurements` repository, which is atomic with its own Activity
 * event.
 *
 * It is a SEPARATE endpoint from `mutate` deliberately. `mutate` changes the
 * Goal record (its title, its dates, how it is measured); this changes the
 * READINGS taken against it. Folding both into one action would put "correct
 * last Tuesday's weigh-in" and "change the target to 68 kg" behind the same
 * intent switch, and the two have different authorities, different Activity
 * events and different failure modes.
 *
 * Every measurement and milestone id is verified to belong to THIS Goal before
 * it is touched, so a measurement id from another Goal (or another workspace)
 * cannot be edited through a Goal the caller can see.
 */

import { env } from "cloudflare:workers";

import {
  GoalMeasurementNotFoundError,
  GoalMeasurementValidationError,
  GoalMilestoneOrderStaleError,
  validateGoalMeasurementDate,
  validateGoalMeasurementValue,
  validateGoalMilestoneWeight,
} from "~/kernel/goals";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  serializeGoalMeasurement,
  serializeGoalMilestone,
  type SerializedGoalMeasurement,
  type SerializedGoalMilestone,
} from "~/shared/goal-progress";

import type { Route } from "./+types/measurements";

/*
 * A GET on this mutation endpoint renders DalyHub's error boundary rather
 * than React Router's internal error object and stack trace.
 */
import { actionOnlyLoader } from "~/platform/request";

export const loader = actionOnlyLoader;

export type GoalMeasurementMutationResult =
  | {
      readonly kind: "log_measurement";
      readonly ok: true;
      readonly measurement: SerializedGoalMeasurement;
    }
  | {
      readonly kind: "update_measurement";
      readonly ok: true;
      readonly measurement: SerializedGoalMeasurement;
    }
  | { readonly kind: "delete_measurement"; readonly ok: true }
  | {
      readonly kind: "add_milestone";
      readonly ok: true;
      readonly milestone: SerializedGoalMilestone;
    }
  | {
      readonly kind: "update_milestone";
      readonly ok: true;
      readonly milestone: SerializedGoalMilestone;
    }
  | { readonly kind: "delete_milestone"; readonly ok: true }
  | { readonly kind: "reorder_milestones"; readonly ok: true }
  | {
      readonly kind: GoalMeasurementIntent | "unknown";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

export type GoalMeasurementIntent =
  | "log_measurement"
  | "update_measurement"
  | "delete_measurement"
  | "add_milestone"
  | "update_milestone"
  | "delete_milestone"
  | "reorder_milestones";

const INTENTS: readonly GoalMeasurementIntent[] = [
  "log_measurement",
  "update_measurement",
  "delete_measurement",
  "add_milestone",
  "update_milestone",
  "delete_milestone",
  "reorder_milestones",
];

function json(data: GoalMeasurementMutationResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length === 0 ? null : text;
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const goalId = params.goalId;
  const form = await request.formData();
  const raw = String(form.get("intent") ?? "");
  const intent = INTENTS.includes(raw as GoalMeasurementIntent)
    ? (raw as GoalMeasurementIntent)
    : null;
  if (intent === null) {
    return json(
      { kind: "unknown", ok: false, formError: "Unknown action." },
      400,
    );
  }

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const goal = await scope.spine.getById(goalId);
  if (!goal || goal.kind !== "goal") {
    throw new Response("Not Found", { status: 404 });
  }

  try {
    switch (intent) {
      case "log_measurement": {
        // Wire strings become domain values through the KERNEL validators, so a
        // bad number produces the same typed field error here as it would from
        // any other caller — the route never parses on its own.
        const measurement = await scope.goalMeasurements.createMeasurement(
          goalId,
          {
            value: validateGoalMeasurementValue(form.get("value")),
            measuredOn: validateGoalMeasurementDate(form.get("measuredOn")),
            note: optionalText(form.get("note")),
          },
        );
        return json({
          kind: intent,
          ok: true,
          measurement: serializeGoalMeasurement(measurement),
        });
      }
      case "update_measurement": {
        const measurementId = String(form.get("measurementId") ?? "");
        await requireOwnedMeasurement(scope, goalId, measurementId);
        const measurement = await scope.goalMeasurements.updateMeasurement(
          measurementId,
          {
            value: validateGoalMeasurementValue(form.get("value")),
            measuredOn: validateGoalMeasurementDate(form.get("measuredOn")),
            note: optionalText(form.get("note")),
          },
        );
        return json({
          kind: intent,
          ok: true,
          measurement: serializeGoalMeasurement(measurement),
        });
      }
      case "delete_measurement": {
        const measurementId = String(form.get("measurementId") ?? "");
        await requireOwnedMeasurement(scope, goalId, measurementId);
        await scope.goalMeasurements.deleteMeasurement(measurementId);
        return json({ kind: intent, ok: true });
      }
      case "add_milestone": {
        const milestone = await scope.goalMeasurements.createMilestone(goalId, {
          title: String(form.get("title") ?? ""),
          weight: validateGoalMilestoneWeight(form.get("weight")),
        });
        return json({
          kind: intent,
          ok: true,
          milestone: serializeGoalMilestone(milestone),
        });
      }
      case "update_milestone": {
        const milestoneId = String(form.get("milestoneId") ?? "");
        await requireOwnedMilestone(scope, goalId, milestoneId);
        const completedRaw = form.get("completed");
        const milestone = await scope.goalMeasurements.updateMilestone(
          milestoneId,
          {
            ...(form.get("title") === null
              ? {}
              : { title: String(form.get("title")) }),
            ...(form.get("weight") === null
              ? {}
              : { weight: validateGoalMilestoneWeight(form.get("weight")) }),
            ...(completedRaw === null
              ? {}
              : { completed: String(completedRaw) === "true" }),
          },
        );
        return json({
          kind: intent,
          ok: true,
          milestone: serializeGoalMilestone(milestone),
        });
      }
      case "delete_milestone": {
        const milestoneId = String(form.get("milestoneId") ?? "");
        await requireOwnedMilestone(scope, goalId, milestoneId);
        await scope.goalMeasurements.deleteMilestone(milestoneId);
        return json({ kind: intent, ok: true });
      }
      /*
       * DHDS-11 — the ONE stage-order mutation, shared by the drag and by the
       * item menu's Move up / Move down.
       *
       * The order arrives as repeated `milestoneId` fields — an ordinary form
       * list, so the same submission works from a fetcher and from a plain
       * form. Every id is verified to belong to THIS Goal before anything is
       * written, exactly as the single-milestone intents above are, and the
       * repository re-checks membership inside the transaction: an order naming
       * a stage of another Goal is a 404 rather than a silently-ignored id.
       */
      case "reorder_milestones": {
        const milestoneIds = form
          .getAll("milestoneId")
          .map((value) => String(value));
        for (const milestoneId of milestoneIds) {
          await requireOwnedMilestone(scope, goalId, milestoneId);
        }
        await scope.goalMeasurements.reorderMilestones(goalId, milestoneIds);
        return json({ kind: intent, ok: true });
      }
    }
  } catch (cause) {
    if (cause instanceof Response) throw cause;
    if (cause instanceof GoalMeasurementValidationError) {
      return json({
        kind: intent,
        ok: false,
        fieldErrors: { [cause.field]: cause.message },
      });
    }
    if (cause instanceof GoalMilestoneOrderStaleError) {
      // NOT a 404: the Goal and its stages exist, the submitted ORDER is stale.
      // The owner is told so in the server's own words and nothing was written.
      return json({ kind: intent, ok: false, formError: cause.message });
    }
    if (cause instanceof GoalMeasurementNotFoundError) {
      throw new Response("Not Found", { status: 404 });
    }
    return json({
      kind: intent,
      ok: false,
      formError: "That couldn’t be saved. Please try again.",
    });
  }
}

type Scope = Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>;

/**
 * Refuse a measurement id that does not belong to THIS Goal.
 *
 * The repository already scopes every write to the workspace, so this closes the
 * remaining gap: without it, an owner with two Goals could edit Goal B's reading
 * by posting its id to Goal A's endpoint. It fails with the same calm 404 as an
 * unknown Goal, disclosing nothing about which case occurred.
 */
async function requireOwnedMeasurement(
  scope: Scope,
  goalId: string,
  measurementId: string,
): Promise<void> {
  const measurements = await scope.goalMeasurements.listMeasurements(goalId);
  if (!measurements.some((measurement) => measurement.id === measurementId)) {
    throw new Response("Not Found", { status: 404 });
  }
}

async function requireOwnedMilestone(
  scope: Scope,
  goalId: string,
  milestoneId: string,
): Promise<void> {
  const milestones = await scope.goalMeasurements.listMilestones(goalId);
  if (!milestones.some((milestone) => milestone.id === milestoneId)) {
    throw new Response("Not Found", { status: 404 });
  }
}
