/**
 * TODAY-04 — the planning endpoint (`/today/plan`).
 *
 * A resource route (no UI) that is the trusted server boundary for planning one OR
 * many tasks from the Today surface — the per-card quick actions (Plan today / Move
 * to tomorrow / Remove from today / Choose date) and the multi-select bulk action
 * bar. It reuses the SAME authenticated composition path as the other task routes:
 * the Worker boundary authenticates first, `requireAuthenticatedSession` re-checks
 * and fails 401, and the workspace scope is resolved from TRUSTED server config
 * (`resolveAuthenticatedWorkspaceScope` → `env.DEFAULT_WORKSPACE_ID`), never the
 * client (ADR-010/ADR-016).
 *
 *   - `intent=plan` with a `scheduledDate` plans every submitted `id` to that date
 *     (`tasks.planTasks`, ONE atomic batch).
 *   - `intent=clear_plan` removes the plan from every submitted `id`
 *     (`tasks.clearPlans`, ONE atomic batch).
 *
 * Bulk planning is ATOMIC and workspace-isolated: any id that is not a task in this
 * workspace rejects the WHOLE operation (nothing is partially applied), which the
 * client renders as a calm error. Planning NEVER changes a task's due date, waiting
 * state or completion. A successful mutation revalidates the /today loader so the
 * planning sections and summary update with no hard reload.
 */

import { env } from "cloudflare:workers";

import {
  TaskNotFoundError,
  TaskProjectArchivedError,
  TaskValidationError,
} from "~/kernel/tasks";
import { requireAuthenticatedSession } from "~/platform/request";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
} from "~/platform/workspaces";

import type { Route } from "./+types/plan";

/** The discriminated planning outcomes the client consumes. */
export type PlanActionData =
  | {
      readonly kind: "plan";
      readonly status: "success";
      readonly changed: number;
      readonly unchanged: number;
    }
  | {
      readonly kind: "plan";
      readonly status: "error";
      readonly message: string;
    };

function json(data: unknown, status = 200): Response {
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
  const intent = String(form.get("intent") ?? "");
  const ids = form.getAll("id").map((value) => String(value));

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  switch (intent) {
    case "plan":
      return json(
        await runPlan(scope, ids, String(form.get("scheduledDate") ?? "")),
      );
    case "clear_plan":
      return json(await runClear(scope, ids));
    default:
      return json(
        { kind: "plan", status: "error", message: "Unknown action." },
        400,
      );
  }
}

async function runPlan(
  scope: WorkspaceScope,
  ids: readonly string[],
  scheduledDate: string,
): Promise<PlanActionData> {
  try {
    const result = await scope.tasks.planTasks(ids, { scheduledDate });
    return {
      kind: "plan",
      status: "success",
      changed: result.changed,
      unchanged: result.unchanged,
    };
  } catch (cause) {
    return { kind: "plan", status: "error", message: planErrorMessage(cause) };
  }
}

async function runClear(
  scope: WorkspaceScope,
  ids: readonly string[],
): Promise<PlanActionData> {
  try {
    const result = await scope.tasks.clearPlans(ids);
    return {
      kind: "plan",
      status: "success",
      changed: result.changed,
      unchanged: result.unchanged,
    };
  } catch (cause) {
    return { kind: "plan", status: "error", message: planErrorMessage(cause) };
  }
}

/** A calm, safe message for a planning failure — never raw storage/SQL details. */
function planErrorMessage(cause: unknown): string {
  if (cause instanceof TaskValidationError) {
    return cause.message;
  }
  if (cause instanceof TaskNotFoundError) {
    return "One of those tasks is no longer available. Nothing was changed.";
  }
  if (cause instanceof TaskProjectArchivedError) {
    return "One of those tasks belongs to an archived project. Nothing was changed.";
  }
  return "That couldn't be saved. Your work is safe — try again.";
}
