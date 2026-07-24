/**
 * AREA-02 — Goal mutation endpoint (`POST /goals/:goalId/mutate`).
 *
 * An action-only resource route (no UI). The `goalId` is verified to be an
 * ACTIVE GOAL in this workspace BEFORE any dispatch, so a task/project/area id
 * (or a cross-workspace id) can never reach `spine.complete`/`rename` (which
 * also act on Projects/Tasks) — it gets the calm not-found and nothing is
 * mutated. Title/completion go through `SpineRepository` (the single
 * authority); target date and definition of done go through the Goal-owned
 * `goalDetails` repository, atomic with its own Activity event. Returns a real
 * JSON Response so the DS-06 forms post with a plain `fetch`.
 */

import { env } from "cloudflare:workers";

import { SpineValidationError } from "~/kernel/spine";
import { GoalDetailsValidationError } from "~/kernel/goals";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/mutate";

/** The discriminated Goal-mutation outcomes the client consumes. */
export type GoalMutationResult =
  | { readonly kind: "rename"; readonly ok: true }
  | {
      readonly kind: "rename";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | { readonly kind: "update_details"; readonly ok: true }
  | {
      readonly kind: "update_details";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "completion";
      readonly ok: true;
      readonly completed: boolean;
    }
  | {
      readonly kind: "completion";
      readonly ok: false;
      readonly formError?: string;
    }
  | {
      readonly kind: "unknown";
      readonly ok: false;
      readonly formError: string;
    };

function json(data: GoalMutationResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
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
  const intent = String(form.get("intent") ?? "");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const goal = await scope.spine.getById(goalId);
  if (!goal || goal.kind !== "goal") {
    throw new Response("Not Found", { status: 404 });
  }

  if (intent === "rename") {
    try {
      await scope.spine.rename(goalId, String(form.get("title") ?? ""));
      return json({ kind: "rename", ok: true });
    } catch (cause) {
      if (cause instanceof SpineValidationError) {
        return json({
          kind: "rename",
          ok: false,
          fieldErrors: { title: cause.message },
        });
      }
      return json({
        kind: "rename",
        ok: false,
        formError: "That couldn't be saved. Please try again.",
      });
    }
  }

  if (intent === "update_details") {
    try {
      await scope.goalDetails.update(goalId, {
        targetDate: emptyToNull(form.get("targetDate")),
        definitionOfDone: emptyToNull(form.get("definitionOfDone")),
      });
      return json({ kind: "update_details", ok: true });
    } catch (cause) {
      if (cause instanceof GoalDetailsValidationError) {
        return json({
          kind: "update_details",
          ok: false,
          fieldErrors: { [cause.field]: cause.message },
        });
      }
      return json({
        kind: "update_details",
        ok: false,
        formError: "That couldn't be saved. Please try again.",
      });
    }
  }

  if (intent === "complete" || intent === "reopen") {
    try {
      const result =
        intent === "complete"
          ? await scope.spine.complete(goalId)
          : await scope.spine.reopen(goalId);
      return json({
        kind: "completion",
        ok: true,
        completed: result.record.completedAt !== null,
      });
    } catch {
      return json({
        kind: "completion",
        ok: false,
        formError: "That couldn't be saved. Please try again.",
      });
    }
  }

  return json(
    { kind: "unknown", ok: false, formError: "Unknown action." },
    400,
  );
}
