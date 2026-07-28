/**
 * TASKS-01 — the `/tasks/new` create resource route.
 *
 * A resource route (NO component) so a programmatic `fetch("/tasks/new", …)` from
 * the quick-capture form receives the action's JSON directly — mirroring the
 * `/projects/new` and `/notes/new` create endpoints. (A POST to the `/tasks` page
 * route, which HAS a component, would render the document instead of returning the
 * action result.) Creation is ONE atomic repository operation: the task's identity
 * and its initial planning fields commit together (ADR-043 §13), the parent is
 * bound and re-verified server-side, and every failure returns a calm typed result.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
} from "~/platform/workspaces";
import {
  SpineParentUnavailableError,
  SpineValidationError,
} from "~/kernel/spine";
import {
  TaskValidationError,
  type CommitmentState,
  type TaskPriority,
  type TimeSector,
} from "~/kernel/tasks";

import type { TasksCreateResult } from "../tasks-contract";
import type { Route } from "./+types/new";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

/** Create a task AND its quick-capture planning fields in ONE atomic operation. */
async function handleCreate(
  scope: WorkspaceScope,
  form: FormData,
): Promise<TasksCreateResult> {
  const title = String(form.get("title") ?? "");
  const parentId = String(form.get("parentId") ?? "");
  const parentKind = String(form.get("parentKind") ?? "");
  if (parentKind !== "area" && parentKind !== "project") {
    return {
      kind: "create",
      ok: false,
      fieldErrors: { parentId: "Choose a Project or Area for this task." },
    };
  }

  // The task AND its planning fields are created in ONE atomic repository operation
  // (ADR-043 §13 / decision 15) — never a spine create followed by a separate detail
  // write, so a failure can never leave a created-but-unplanned or orphaned task.
  const priority = form.get("priority");
  const sector = form.get("timeSector");
  const commitment = form.get("commitmentState");
  const dueDate = form.get("dueDate");
  const scheduledDate = form.get("scheduledDate");
  try {
    const task = await scope.tasks.createTask({
      title,
      parent: { kind: parentKind, id: parentId },
      ...(priority ? { priority: String(priority) as TaskPriority } : {}),
      ...(sector ? { timeSector: String(sector) as TimeSector } : {}),
      ...(commitment
        ? { commitmentState: String(commitment) as CommitmentState }
        : {}),
      ...(dueDate ? { dueDate: String(dueDate) } : {}),
      ...(scheduledDate ? { scheduledDate: String(scheduledDate) } : {}),
    });
    return { kind: "create", ok: true, taskId: task.id };
  } catch (cause) {
    if (cause instanceof TaskValidationError) {
      return {
        kind: "create",
        ok: false,
        fieldErrors: { [cause.field]: cause.message },
      };
    }
    if (cause instanceof SpineValidationError) {
      return {
        kind: "create",
        ok: false,
        fieldErrors: { title: cause.message },
      };
    }
    if (cause instanceof SpineParentUnavailableError) {
      return {
        kind: "create",
        ok: false,
        formError: "That Project or Area is no longer available.",
      };
    }
    return {
      kind: "create",
      ok: false,
      formError: "The task couldn’t be created. Your text is safe — try again.",
    };
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  return json(await handleCreate(scope, form));
}
