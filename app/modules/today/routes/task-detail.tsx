/**
 * TODAY-02 — the task Drawer's data endpoint (`/today/task/:taskId`).
 *
 * A resource route (no UI) that is the trusted server boundary for one task. It
 * uses the SAME authenticated composition path the kernel tests cover: the Worker
 * boundary authenticates before this runs, `requireAuthenticatedSession` re-checks
 * and fails 401, and the workspace scope is resolved from TRUSTED server config
 * (`resolveAuthenticatedWorkspaceScope` → `env.DEFAULT_WORKSPACE_ID`, D1-verified)
 * — the client never supplies a workspace id (ADR-010/ADR-016 §5.6).
 *
 *   - `loader` (GET) returns the full task view + its active "related records"
 *     links, or a 404 for a missing/deleted/cross-workspace/non-task id (the calm
 *     not-found the Drawer renders).
 *   - `action` (POST) handles the task mutations by `intent`: `update` (the Details
 *     form; server-authoritative validation), `complete`/`reopen` (through the
 *     spine — the single completion authority), and `link`/`unlink` (policy-enforced
 *     `task.relates_to` associations, respecting workspace isolation).
 *
 * Every value is bound server-side; a raw repository/SQL error never escapes. A
 * successful mutation revalidates the /today loader (React Router), so a Drawer
 * edit or completion appears on Today with no hard reload.
 */

import { env } from "cloudflare:workers";

import {
  TaskNotFoundError,
  TaskValidationError,
  type SetWaitingInput,
} from "~/kernel/tasks";
import {
  createLinkWithPolicy,
  listActiveLinks,
  unlinkWithPolicy,
  type EntityLinkPickerDeps,
  type EntityLinkPickerPolicy,
} from "~/platform/entity-links";
import { requireAuthenticatedSession } from "~/platform/request";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
} from "~/platform/workspaces";
import type { EntityLinkSelection } from "~/shared/forms/model";

import {
  serializeTaskView,
  TASK_RELATE_TARGET_TYPES,
  TASK_RELATES_TO,
  type SerializedTaskView,
} from "../task/task-view";
import type { Route } from "./+types/task-detail";

/** The loader payload for a task Drawer: the task and its related-record links. */
export interface TaskDetailData {
  readonly task: SerializedTaskView;
  readonly links: readonly EntityLinkSelection[];
}

/** The discriminated action outcomes the Drawer client consumes. */
export type TaskActionData =
  | {
      readonly kind: "update";
      readonly status: "success";
      readonly task: SerializedTaskView;
    }
  | {
      readonly kind: "update";
      readonly status: "error";
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "completion";
      readonly ok: true;
      readonly task: SerializedTaskView;
    }
  | {
      readonly kind: "completion";
      readonly ok: false;
      readonly message: string;
    }
  | { readonly kind: "link"; readonly ok: boolean; readonly message?: string }
  | {
      readonly kind: "unlink";
      readonly ok: boolean;
      readonly message?: string;
    }
  | {
      readonly kind: "waiting";
      readonly status: "success";
      readonly task: SerializedTaskView;
    }
  | {
      readonly kind: "waiting";
      readonly status: "error";
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
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

function pickerDeps(scope: WorkspaceScope): EntityLinkPickerDeps {
  return { entities: scope.entities, entityLinks: scope.entityLinks };
}

/** The trusted server policy for the Drawer's "related records" picker. */
function relatesToPolicy(anchorId: string): EntityLinkPickerPolicy {
  return {
    anchorId,
    allowedDirections: ["outgoing"],
    linkTypes: [
      {
        type: TASK_RELATES_TO,
        allowedTargetTypes: [...TASK_RELATE_TARGET_TYPES],
      },
    ],
    multiple: true,
  };
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const taskId = params.taskId;

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const task = await scope.tasks.getTask(taskId);
  if (!task) {
    // A missing, soft-deleted, non-task or cross-workspace id — the calm 404 the
    // Drawer renders. Never discloses whether it exists in another workspace.
    return json({ error: "not_found" }, 404);
  }

  const links = await listActiveLinks(pickerDeps(scope), {
    anchorId: taskId,
    direction: "outgoing",
    linkTypes: [TASK_RELATES_TO],
  });

  return json({
    task: serializeTaskView(task),
    links,
  } satisfies TaskDetailData);
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const taskId = params.taskId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // Every mutation here is addressed by a TASK id. Verify the id resolves to a
  // task in this workspace BEFORE dispatching, so a project/goal/area id can never
  // reach `spine.complete`/`reopen` (which also complete Goals/Projects) or become
  // a `task.relates_to` picker anchor. Non-tasks get the same calm not-found, and
  // nothing is mutated. (`update` is also self-guarded by `updateTask`.)
  if (!(await scope.tasks.getTask(taskId))) {
    return json({ error: "not_found" }, 404);
  }

  switch (intent) {
    case "update":
      return json(await handleUpdate(scope, taskId, form));
    case "complete":
    case "reopen":
      return json(await handleCompletion(scope, taskId, intent));
    case "link":
      return json(await handleLink(scope, taskId, form));
    case "unlink":
      return json(await handleUnlink(scope, taskId, form));
    case "set_waiting":
      return json(await handleSetWaiting(scope, taskId, form));
    case "clear_waiting":
      return json(await handleClearWaiting(scope, taskId));
    default:
      return json(
        { kind: "update", status: "error", formError: "Unknown action." },
        400,
      );
  }
}

/** Empty-string form fields become `null` so a cleared field clears the value. */
function nullable(value: FormDataEntryValue | null): string | null {
  const s = value === null ? "" : String(value);
  return s.trim().length === 0 ? null : s;
}

async function handleUpdate(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  try {
    const result = await scope.tasks.updateTask(taskId, {
      title: String(form.get("title") ?? ""),
      status: String(form.get("status") ?? "todo") as "todo" | "in_progress",
      priority: nullable(form.get("priority")) as
        "low" | "medium" | "high" | null,
      dueDate: nullable(form.get("dueDate")),
      scheduledDate: nullable(form.get("scheduledDate")),
      // `description` is Markdown source; an empty field clears it.
      description:
        form.get("description") === null
          ? null
          : String(form.get("description")),
    });
    return {
      kind: "update",
      status: "success",
      task: serializeTaskView(result.task),
    };
  } catch (cause) {
    if (cause instanceof TaskValidationError) {
      return {
        kind: "update",
        status: "error",
        fieldErrors: { [cause.field]: cause.message },
      };
    }
    if (cause instanceof TaskNotFoundError) {
      return {
        kind: "update",
        status: "error",
        formError: "This task is no longer available.",
      };
    }
    return {
      kind: "update",
      status: "error",
      formError:
        "Your changes couldn't be saved. Your work is safe — try again.",
    };
  }
}

async function handleCompletion(
  scope: WorkspaceScope,
  taskId: string,
  intent: "complete" | "reopen",
): Promise<TaskActionData> {
  try {
    if (intent === "complete") {
      // Completing a task AND clearing any active waiting state is ONE atomic
      // task-domain operation (ADR-029): a completed task can never be left still
      // waiting. The route no longer coordinates this invariant through two calls.
      const result = await scope.tasks.completeTask(taskId);
      return {
        kind: "completion",
        ok: true,
        task: serializeTaskView(result.task),
      };
    }
    // Reopening goes through the spine (the completion authority) and does NOT
    // restore a prior waiting state (the documented default).
    await scope.spine.reopen(taskId);
    const task = await scope.tasks.getTask(taskId);
    if (!task) {
      return {
        kind: "completion",
        ok: false,
        message: "This task is no longer available.",
      };
    }
    return { kind: "completion", ok: true, task: serializeTaskView(task) };
  } catch {
    return {
      kind: "completion",
      ok: false,
      message: "That couldn't be saved. Please try again.",
    };
  }
}

async function handleLink(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  const result = await createLinkWithPolicy(
    pickerDeps(scope),
    relatesToPolicy(taskId),
    {
      targetId: String(form.get("targetId") ?? ""),
      linkType: String(form.get("linkType") ?? ""),
      direction: String(form.get("direction") ?? "outgoing"),
    },
  );
  return result.ok
    ? { kind: "link", ok: true }
    : { kind: "link", ok: false, message: result.message };
}

async function handleUnlink(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  const result = await unlinkWithPolicy(
    pickerDeps(scope),
    relatesToPolicy(taskId),
    String(form.get("linkId") ?? ""),
  );
  return result.ok
    ? { kind: "unlink", ok: true }
    : { kind: "unlink", ok: false, message: result.message };
}

async function handleSetWaiting(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  const mode = String(form.get("waitingMode") ?? "");
  const input: SetWaitingInput =
    mode === "entity"
      ? {
          target: {
            kind: "entity",
            targetId: String(form.get("waitingTargetId") ?? ""),
          },
        }
      : {
          target: { kind: "text", note: String(form.get("waitingNote") ?? "") },
        };
  try {
    const result = await scope.tasks.setWaiting(taskId, input);
    return {
      kind: "waiting",
      status: "success",
      task: serializeTaskView(result.task),
    };
  } catch (cause) {
    if (cause instanceof TaskValidationError) {
      // Surface the failure against the control the owner was editing.
      const field =
        cause.field === "waitingNote" ? "waitingNote" : "waitingTargetId";
      return {
        kind: "waiting",
        status: "error",
        fieldErrors: { [field]: cause.message },
      };
    }
    if (cause instanceof TaskNotFoundError) {
      return {
        kind: "waiting",
        status: "error",
        formError: "This task is no longer available.",
      };
    }
    return {
      kind: "waiting",
      status: "error",
      formError: "That couldn't be saved. Your work is safe — try again.",
    };
  }
}

async function handleClearWaiting(
  scope: WorkspaceScope,
  taskId: string,
): Promise<TaskActionData> {
  try {
    const result = await scope.tasks.clearWaiting(taskId);
    return {
      kind: "waiting",
      status: "success",
      task: serializeTaskView(result.task),
    };
  } catch (cause) {
    if (cause instanceof TaskNotFoundError) {
      return {
        kind: "waiting",
        status: "error",
        formError: "This task is no longer available.",
      };
    }
    return {
      kind: "waiting",
      status: "error",
      formError: "That couldn't be saved. Please try again.",
    };
  }
}
