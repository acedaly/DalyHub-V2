/**
 * AREA-02 — create-Goal endpoint (`POST /goals/new`).
 *
 * Verifies the given Area exists, is active and lives in the trusted
 * (server-resolved) workspace BEFORE creating — a missing/deleted/wrong-kind/
 * cross-workspace `areaId` fails closed with a calm field error, never a
 * partial creation. Creation itself goes through the single
 * `SpineRepository.createGoal` authority, which is already atomic (entity,
 * spine row, the `goal.belongs_to_area` link and `entity.created` +
 * `entity_link.created` Activity all in one transaction). Collects only a
 * title — see `~/shared/goal-creation/NewGoalForm.tsx` for why target date and
 * definition of done are a post-creation edit, not part of this atomic step.
 */

import { env } from "cloudflare:workers";

import {
  SpineParentUnavailableError,
  SpineValidationError,
} from "~/kernel/spine";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/new";

export type CreateGoalResult =
  | { readonly ok: true; readonly goalId: string }
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
    const goal = await scope.spine.createGoal({ title, areaId });
    return json({ ok: true, goalId: goal.id });
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
      formError: "That Goal couldn't be created. Please try again.",
    });
  }
}
