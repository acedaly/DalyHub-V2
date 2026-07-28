/**
 * TASKS-01 — the `/tasks/bulk` resource route: bounded, atomic, server-authoritative
 * bulk actions over the workspace-bound TaskRepository (ADR-043 §16). Every action
 * resolves and validates every id first, so a cross-workspace/missing id rejects the
 * WHOLE operation — nothing is partially applied. Partial no-ops are reported
 * honestly (`changed`/`unchanged`), never pretended to be an all-or-nothing success.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
} from "~/platform/workspaces";
import {
  TaskNotFoundError,
  TaskProjectArchivedError,
  TaskValidationError,
  type BulkFieldResult,
  type BulkPlanResult,
  type CommitmentState,
  type TaskPriority,
  type TaskStatus,
  type TimeSector,
} from "~/kernel/tasks";

import type { TasksBulkResult } from "../tasks-contract";
import type { Route } from "./+types/bulk";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function ok(result: BulkFieldResult | BulkPlanResult): TasksBulkResult {
  return {
    kind: "bulk",
    ok: true,
    changed: result.changed,
    unchanged: result.unchanged,
  };
}

function fail(message: string): TasksBulkResult {
  return { kind: "bulk", ok: false, formError: message };
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const ids = form.getAll("id").map(String);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  try {
    return json(await dispatch(scope, intent, ids, form));
  } catch (cause) {
    if (cause instanceof TaskValidationError) {
      return json(fail(cause.message), 400);
    }
    if (cause instanceof TaskNotFoundError) {
      return json(
        fail("One or more of those tasks is no longer available."),
        400,
      );
    }
    if (cause instanceof TaskProjectArchivedError) {
      return json(fail(cause.message), 400);
    }
    return json(
      fail(
        "The bulk action couldn’t be completed. Nothing was changed — try again.",
      ),
      500,
    );
  }
}

async function dispatch(
  scope: WorkspaceScope,
  intent: string,
  ids: readonly string[],
  form: FormData,
): Promise<TasksBulkResult> {
  switch (intent) {
    case "complete":
      // Genuinely atomic (ADR-043 §16): the kernel resolves+validates every id, then
      // completes the whole selection (with any waiting cleared, ADR-029) in ONE D1
      // batch. A storage fault mid-batch rolls the transaction back, so the selection
      // can never be left partially completed — the outer catch's "nothing was
      // changed" is then factually correct. Already-complete tasks count `unchanged`.
      return ok(await scope.tasks.completeTasks(ids));
    case "set_priority":
      return ok(
        await scope.tasks.setPriorityMany(
          ids,
          emptyToNull(form.get("priority")) as TaskPriority | null,
        ),
      );
    case "set_sector":
      return ok(
        await scope.tasks.setSectorMany(
          ids,
          emptyToNull(form.get("sector")) as TimeSector | null,
        ),
      );
    case "set_commitment":
      return ok(
        await scope.tasks.setCommitmentMany(
          ids,
          String(form.get("commitment") ?? "active") as CommitmentState,
        ),
      );
    case "set_status":
      return ok(
        await scope.tasks.setStatusMany(
          ids,
          String(form.get("status") ?? "todo") as TaskStatus,
        ),
      );
    case "plan": {
      const date = String(form.get("scheduledDate") ?? "");
      return ok(await scope.tasks.planTasks(ids, { scheduledDate: date }));
    }
    case "clear_plan":
      return ok(await scope.tasks.clearPlans(ids));
    default:
      return fail("Unknown bulk action.");
  }
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const s = value === null ? "" : String(value);
  return s.length === 0 ? null : s;
}
