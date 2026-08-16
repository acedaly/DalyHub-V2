/**
 * AREA-02 — create-Goal endpoint (`POST /goals/new`).
 *
 * Verifies the given Area exists, is active and lives in the trusted
 * (server-resolved) workspace BEFORE creating — a missing/deleted/wrong-kind/
 * cross-workspace `areaId` fails closed with a calm field error, never a
 * partial creation. Creation itself goes through the single
 * `SpineRepository.createGoal` authority, which is already atomic (entity,
 * spine row, the `goal.belongs_to_area` link and `entity.created` +
 * `entity_link.created` Activity all in one transaction).
 *
 * GOAL-02 — creation now also accepts a target date and a measurement
 * configuration. Those live on the Goal-owned `goal_details` slice, so they are
 * applied by a SECOND call after the spine write. There is deliberately no
 * cross-table transaction: the spine write is the one that must not be lost, and
 * inventing a two-table creation transaction for two optional fields would be a
 * kernel change this feature does not need.
 *
 * The consequence is reported rather than hidden. If the configuration write
 * fails, the response is still `ok` (the Goal exists — refusing it would be a
 * lie) with `configured: false`, and the owner lands on a record where every one
 * of those fields is editable. Nothing is silently dropped.
 */

import { env } from "cloudflare:workers";

import {
  SpineParentUnavailableError,
  SpineValidationError,
} from "~/kernel/spine";
import { validateGoalMeasurementPatch } from "~/kernel/goals";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/new";

/*
 * A GET on this mutation endpoint renders DalyHub's error boundary rather
 * than React Router's internal error object and stack trace.
 */
import { actionOnlyLoader } from "~/platform/request";

export const loader = actionOnlyLoader;

export type CreateGoalResult =
  | {
      readonly ok: true;
      readonly goalId: string;
      /** False when the Goal was created but its details could not be applied. */
      readonly configured: boolean;
    }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

function json(data: CreateGoalResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();
  const title = String(form.get("title") ?? "");
  const areaId = String(form.get("areaId") ?? "");

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const area = await scope.spine.getById(areaId);
    if (!area || area.kind !== "area") {
      return json({
        ok: false,
        formError: "That Area is unavailable. Please try again.",
      });
    }
    // AREA-05: an archived Area is read-only — it cannot gain new Goals. The UI
    // hides its "New Goal" action; this refuses the mutation server-side too.
    const settings = await scope.areaSettings.get(areaId);
    if (settings?.archivedAt) {
      return json({
        ok: false,
        formError: "That Area is archived. Restore it before adding Goals.",
      });
    }
    const goal = await scope.spine.createGoal({ title, areaId });

    // The optional Goal-owned slice. Validation happens through the SAME kernel
    // validators the record's own edits use, so a malformed target value is a
    // field error here exactly as it would be there.
    const targetDate = String(form.get("targetDate") ?? "");
    const measurementType = form.get("measurementType");
    const wantsDetails =
      targetDate.trim().length > 0 || measurementType !== null;
    if (!wantsDetails) {
      return json({ ok: true, goalId: goal.id, configured: true });
    }
    try {
      const measurement =
        measurementType === null
          ? undefined
          : validateGoalMeasurementPatch({
              measurementType,
              unit: form.get("unit"),
              baselineValue: form.get("baselineValue"),
              targetValue: form.get("targetValue"),
            });
      await scope.goalDetails.update(goal.id, {
        ...(targetDate.trim().length > 0 ? { targetDate } : {}),
        ...(measurement ? { measurement } : {}),
      });
      return json({ ok: true, goalId: goal.id, configured: true });
    } catch {
      return json({ ok: true, goalId: goal.id, configured: false });
    }
  } catch (cause) {
    if (cause instanceof SpineValidationError) {
      return json({ ok: false, fieldErrors: { title: cause.message } });
    }
    if (cause instanceof SpineParentUnavailableError) {
      return json({
        ok: false,
        formError: "That Area is unavailable. Please try again.",
      });
    }
    return json({
      ok: false,
      formError: "That Goal couldn’t be created. Please try again.",
    });
  }
}
