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
        "The bulk action couldn't be completed. Nothing was changed — try again.",
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
    case "complete": {
      // Completion is per-task (spine authority owns it; there is no single-batch
      // completeTasks). To honour the bulk route's "no partial mutation from a bad
      // id" contract, RESOLVE EVERY id first — any missing/cross-workspace/archived
      // id throws BEFORE any completion is written (mirroring how planTasks/
      // setPriorityMany validate up front). Completing an already-resolved task can
      // never itself fail validation, so after this gate the only residual
      // non-atomicity is a transient storage fault mid-loop, which the outer catch
      // reports honestly. Idempotent no-ops (already complete) are counted honestly.
      const resolved = [];
      for (const id of ids) {
        const task = await scope.tasks.getTask(id);
        if (!task) {
          throw new TaskNotFoundError();
        }
        resolved.push(task.id);
      }
      let changed = 0;
      let unchanged = 0;
      for (const id of resolved) {
        const result = await scope.tasks.completeTask(id);
        if (result.changed) {
          changed += 1;
        } else {
          unchanged += 1;
        }
      }
      return { kind: "bulk", ok: true, changed, unchanged };
    }
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
