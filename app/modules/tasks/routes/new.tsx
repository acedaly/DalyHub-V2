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
  applyCaptureRelationship,
  compensateCapturedRecord,
  type ValidatedCaptureContext,
  validateCaptureContextForCreate,
} from "~/platform/capture/capture-context.server";
import {
  captureRelationshipPlan,
  parseCaptureContextContract,
} from "~/shared/capture/capture-context";
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

type TaskCreateParent =
  | { readonly kind: "area"; readonly id: string }
  | { readonly kind: "project"; readonly id: string };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

export function structuralTaskParentContextWasSubmitted(raw: unknown): boolean {
  const parsed = parseCaptureContextContract(raw);
  if (!parsed) return false;
  return (
    captureRelationshipPlan("task", parsed.sourceEntityType).kind ===
    "task_parent"
  );
}

export function resolveTaskCreateParent(
  captureContext: ValidatedCaptureContext | null,
  submittedParentKind: string,
  submittedParentId: string,
): TaskCreateParent | null {
  if (captureContext?.plan.kind === "task_parent") {
    return {
      kind: captureContext.plan.parentKind,
      id: captureContext.contract.sourceEntityId,
    };
  }
  if (submittedParentKind !== "area" && submittedParentKind !== "project") {
    return null;
  }
  return { kind: submittedParentKind, id: submittedParentId };
}

/** Create a task AND its quick-capture planning fields in ONE atomic operation. */
async function handleCreate(
  scope: WorkspaceScope,
  form: FormData,
): Promise<TasksCreateResult> {
  const title = String(form.get("title") ?? "");
  const parentId = String(form.get("parentId") ?? "");
  const parentKind = String(form.get("parentKind") ?? "");

  // The task AND its planning fields are created in ONE atomic repository operation
  // (ADR-043 §13 / decision 15) — never a spine create followed by a separate detail
  // write, so a failure can never leave a created-but-unplanned or orphaned task.
  const priority = form.get("priority");
  const sector = form.get("timeSector");
  const commitment = form.get("commitmentState");
  const dueDate = form.get("dueDate");
  const scheduledDate = form.get("scheduledDate");
  const rawCaptureContext = form.get("captureContext");
  try {
    const captureContext = await validateCaptureContextForCreate(
      scope,
      "task",
      rawCaptureContext,
    );
    if (
      !captureContext &&
      structuralTaskParentContextWasSubmitted(rawCaptureContext)
    ) {
      return {
        kind: "create",
        ok: false,
        formError:
          "That capture context is no longer available. Create the task from the record again or remove the context.",
      };
    }
    const parent = resolveTaskCreateParent(
      captureContext,
      parentKind,
      parentId,
    );
    if (!parent) {
      return {
        kind: "create",
        ok: false,
        fieldErrors: { parentId: "Choose a Project or Area for this task." },
      };
    }
    const task = await scope.tasks.createTask({
      title,
      parent,
      ...(priority ? { priority: String(priority) as TaskPriority } : {}),
      ...(sector ? { timeSector: String(sector) as TimeSector } : {}),
      ...(commitment
        ? { commitmentState: String(commitment) as CommitmentState }
        : {}),
      ...(dueDate ? { dueDate: String(dueDate) } : {}),
      ...(scheduledDate ? { scheduledDate: String(scheduledDate) } : {}),
    });
    try {
      await applyCaptureRelationship(scope, task.id, captureContext);
    } catch {
      const compensated = await compensateCapturedRecord(
        scope,
        task.id,
        "task",
      );
      return {
        kind: "create",
        ok: false,
        formError: compensated
          ? "The task couldn’t be linked to that context, so it was not kept. Try again from the record or create it without the context."
          : "The task was created but could not be linked to that context. Open the created task and link it manually.",
        createdId: task.id,
      } as TasksCreateResult;
    }
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
