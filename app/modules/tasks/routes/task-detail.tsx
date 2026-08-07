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

import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { SpineParentUnavailableError } from "~/kernel/spine";
import {
  TASK_RECURRENCE_DATE_KINDS,
  TASK_RECURRENCE_FREQUENCIES,
  TaskNotFoundError,
  TaskProjectArchivedError,
  TaskValidationError,
  type CommitmentState,
  type SetTaskParentInput,
  type SetTaskRecurrenceInput,
  type TaskRecurrenceDateKind,
  type TaskRecurrenceFrequency,
  type SetWaitingInput,
  type TaskPriority,
  type TaskStatus,
  type TaskView,
  type TimeSector,
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
import { ownerCalendarIso } from "~/shared/datetime";

import {
  serializeTaskView,
  TASK_RELATE_TARGET_TYPES,
  TASK_RELATES_TO,
} from "~/shared/task-record/task-view";
import type {
  TaskActionData,
  TaskDetailData,
} from "~/shared/task-record/contract";

import type { Route } from "./+types/task-detail";

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
  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  try {
    timezone = (await scope.appPreferences.get(session.user.subject)).timezone;
  } catch {
    // Keep the record reachable with the deterministic default.
  }
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
    // Server-derived owner calendar date (ADR-022) so the Drawer's urgency chip
    // never computes "Overdue"/"Due today" in browser-local time (TASKS-02).
    todayIso: ownerCalendarIso(new Date(), timezone),
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
  const task = await scope.tasks.getTask(taskId);
  if (!task) {
    return json({ error: "not_found" }, 404);
  }

  switch (intent) {
    case "update":
      return json(await handleUpdate(scope, taskId, form));
    case "rename":
      return json(await handleRename(scope, taskId, form));
    case "complete":
    case "reopen":
      return json(
        await handleCompletion(
          scope,
          taskId,
          intent,
          await ownerTodayIsoFor(scope, session.user.subject),
        ),
      );
    case "link":
      return json(await handleLink(scope, task, form));
    case "unlink":
      return json(await handleUnlink(scope, task, form));
    case "set_waiting":
      return json(await handleSetWaiting(scope, taskId, form));
    case "clear_waiting":
      return json(await handleClearWaiting(scope, taskId));
    case "plan":
      return json(await handlePlan(scope, taskId, form));
    case "clear_plan":
      return json(await handleClearPlan(scope, taskId));
    case "set_parent":
      return json(await handleSetParent(scope, taskId, form));
    case "set_recurrence":
      return json(await handleSetRecurrence(scope, taskId, form));
    default:
      return json(
        { kind: "update", status: "error", formError: "Unknown action." },
        400,
      );
  }
}

async function handleRename(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  try {
    const result = await scope.tasks.updateTask(taskId, {
      title: String(form.get("title") ?? ""),
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
        fieldErrors: { title: cause.message },
      };
    }
    if (cause instanceof TaskNotFoundError) {
      return {
        kind: "update",
        status: "error",
        formError: "This task is no longer available.",
      };
    }
    if (cause instanceof TaskProjectArchivedError) {
      return { kind: "update", status: "error", formError: cause.message };
    }
    return {
      kind: "update",
      status: "error",
      formError: "That title couldn’t be saved. Your text is safe — try again.",
    };
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
    // Delegation is only touched when the form carries a `delegateTo` field: an
    // empty value clears delegation, a present value records it (dates/note
    // optional). Omitting the field leaves delegation unchanged.
    const delegation = form.has("delegateTo")
      ? nullable(form.get("delegateTo")) === null
        ? null
        : {
            to: String(form.get("delegateTo")),
            delegatedOn: nullable(form.get("delegatedOn")),
            followUpOn: nullable(form.get("followUpOn")),
            note: nullable(form.get("delegateNote")),
          }
      : undefined;
    // EDIT-02 — every field here is now a PATCH key: a field the submission does
    // not carry is left unchanged rather than coerced to a default. The Details
    // form stopped carrying `title`, `priority` and the two dates when those
    // moved onto the record itself, and a whole-record write would have let
    // pressing "Save changes" revert an inline edit made while the form was
    // open. `UpdateTaskInput` has always treated an omitted key as unchanged;
    // only this handler was filling the gaps in.
    const result = await scope.tasks.updateTask(taskId, {
      title: form.has("title") ? String(form.get("title")) : undefined,
      status: form.has("status")
        ? (String(form.get("status")) as TaskStatus)
        : undefined,
      priority: form.has("priority")
        ? (nullable(form.get("priority")) as TaskPriority | null)
        : undefined,
      dueDate: form.has("dueDate") ? nullable(form.get("dueDate")) : undefined,
      scheduledDate: form.has("scheduledDate")
        ? nullable(form.get("scheduledDate"))
        : undefined,
      timeSector: form.has("timeSector")
        ? (nullable(form.get("timeSector")) as TimeSector | null)
        : undefined,
      commitmentState: form.has("commitmentState")
        ? (String(form.get("commitmentState")) as CommitmentState)
        : undefined,
      delegation,
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
    if (cause instanceof TaskProjectArchivedError) {
      return { kind: "update", status: "error", formError: cause.message };
    }
    return {
      kind: "update",
      status: "error",
      formError:
        "Your changes couldn’t be saved. Your work is safe — try again.",
    };
  }
}

async function handleCompletion(
  scope: WorkspaceScope,
  taskId: string,
  intent: "complete" | "reopen",
  ownerTodayIso: string,
): Promise<TaskActionData> {
  try {
    if (intent === "complete") {
      // Completing a task, clearing any active waiting state AND creating the ONE
      // next occurrence of a repeating task is ONE atomic task-domain operation
      // (ADR-029 / ADR-062). The route never coordinates those through several calls.
      const result = await scope.tasks.completeTask(taskId, { ownerTodayIso });
      return {
        kind: "completion",
        ok: true,
        task: serializeTaskView(result.task),
        recurrence:
          result.successor == null
            ? undefined
            : {
                outcome: "created",
                taskId: result.successor.id,
                scheduledDate: result.successor.scheduledDate,
                dueDate: result.successor.dueDate,
              },
      };
    }
    // Reopening is the task-domain UNDO: the spine's completion SQL clears the
    // completion, and an untouched successor created by that completion is withdrawn
    // in the SAME transaction. A successor the owner has since changed is retained
    // and reported, never silently destroyed. Waiting is never restored.
    const result = await scope.tasks.reopenTask(taskId);
    return {
      kind: "completion",
      ok: true,
      task: serializeTaskView(result.task),
      recurrence:
        result.successorOutcome === "none"
          ? undefined
          : { outcome: result.successorOutcome },
    };
  } catch (cause) {
    if (
      cause instanceof TaskProjectArchivedError ||
      cause instanceof SpineParentUnavailableError
    ) {
      return {
        kind: "completion",
        ok: false,
        message:
          "This project is archived and read-only — restore it to make changes.",
      };
    }
    return {
      kind: "completion",
      ok: false,
      message: "That couldn’t be saved. Please try again.",
    };
  }
}

/**
 * The OWNER's calendar day (ADR-022), resolved from their stored timezone. Recurrence
 * schedules the next occurrence relative to the day the owner actually completed the
 * task, never the server's UTC day or a browser guess.
 */
async function ownerTodayIsoFor(
  scope: WorkspaceScope,
  subject: string,
): Promise<string> {
  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  try {
    timezone = (await scope.appPreferences.get(subject)).timezone;
  } catch {
    // Keep the mutation working on the deterministic default.
  }
  return ownerCalendarIso(new Date(), timezone);
}

/**
 * TASKS-04 — set, change or remove the Task's recurrence rule. Every value is a
 * closed-set token bound server-side; the kernel validates the rule against the
 * Task's own anchor date, so a rule that could never repeat is refused with a field
 * error the control can show.
 */
async function handleSetRecurrence(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  const frequency = nullable(form.get("frequency"));
  const dateKind = nullable(form.get("dateKind")) ?? "scheduled";
  const intervalRaw = nullable(form.get("interval"));
  const weekdaysRaw = nullable(form.get("weekdays"));

  let recurrence: SetTaskRecurrenceInput = null;
  if (frequency !== null) {
    if (
      !(TASK_RECURRENCE_FREQUENCIES as readonly string[]).includes(frequency)
    ) {
      return {
        kind: "update",
        status: "error",
        fieldErrors: { recurrence: "Choose how often this repeats." },
      };
    }
    if (!(TASK_RECURRENCE_DATE_KINDS as readonly string[]).includes(dateKind)) {
      return {
        kind: "update",
        status: "error",
        fieldErrors: { recurrence: "Choose the date this repeats from." },
      };
    }
    const interval = intervalRaw === null ? 1 : Number(intervalRaw);
    if (!Number.isInteger(interval) || interval < 1 || interval > 99) {
      return {
        kind: "update",
        status: "error",
        fieldErrors: { recurrence: "Repeat every 1 to 99." },
      };
    }
    // Only whole 0-6 tokens; a blank segment is dropped rather than coerced to 0
    // (which would silently mean "every Sunday").
    const weekdays = (weekdaysRaw ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => /^[0-6]$/.test(part))
      .map(Number);
    recurrence = {
      frequency: frequency as TaskRecurrenceFrequency,
      dateKind: dateKind as TaskRecurrenceDateKind,
      interval,
      weekdays,
    };
  }

  try {
    const result = await scope.tasks.setTaskRecurrence(taskId, recurrence);
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
        fieldErrors: { recurrence: cause.message },
      };
    }
    if (cause instanceof TaskNotFoundError) {
      return {
        kind: "update",
        status: "error",
        formError: "This task is no longer available.",
      };
    }
    if (cause instanceof TaskProjectArchivedError) {
      return { kind: "update", status: "error", formError: cause.message };
    }
    return {
      kind: "update",
      status: "error",
      formError: "That repeat couldn’t be saved. Please try again.",
    };
  }
}

async function handleSetParent(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  const parentKind = nullable(form.get("parentKind"));
  const parentId = nullable(form.get("parentId"));
  try {
    if (
      parentKind !== null &&
      parentId !== null &&
      parentKind !== "area" &&
      parentKind !== "project"
    ) {
      return {
        kind: "update",
        status: "error",
        fieldErrors: { parentId: "Choose an Area, Project or Unassigned." },
      };
    }
    let parent: SetTaskParentInput = null;
    if (parentId !== null && parentKind === "area") {
      parent = { kind: "area", id: parentId };
    } else if (parentId !== null && parentKind === "project") {
      parent = { kind: "project", id: parentId };
    }
    const result = await scope.tasks.setTaskParent(taskId, parent);
    return {
      kind: "update",
      status: "success",
      task: serializeTaskView(result.task),
    };
  } catch (cause) {
    if (cause instanceof TaskNotFoundError) {
      return {
        kind: "update",
        status: "error",
        formError: "This task is no longer available.",
      };
    }
    if (
      cause instanceof SpineParentUnavailableError ||
      cause instanceof TaskProjectArchivedError
    ) {
      return {
        kind: "update",
        status: "error",
        formError: "That Project or Area is no longer available.",
      };
    }
    return {
      kind: "update",
      status: "error",
      formError: "That parent change couldn’t be saved. Please try again.",
    };
  }
}

/**
 * `link`/`unlink` go through the generic EntityLink policy (`createLinkWithPolicy`/
 * `unlinkWithPolicy`), NOT `D1TaskRepository` — so the repository-level
 * `#rejectIfParentProjectArchived` guard is never reached for these two intents.
 * This is the shared, Task-specific check that closes that gap: an archived
 * Project's structural children are read-only until restored, so a related-record
 * link cannot be added or removed either. Checked BEFORE any policy call, so a
 * rejection creates no link mutation and no Activity event.
 */
async function rejectIfParentProjectArchived(
  scope: WorkspaceScope,
  task: TaskView,
): Promise<string | null> {
  if (task.project === null) return null;
  const settings = await scope.projectSettings.get(task.project.id);
  return settings?.archivedAt
    ? "This task’s project is archived and read-only — restore it to make changes."
    : null;
}

async function handleLink(
  scope: WorkspaceScope,
  task: TaskView,
  form: FormData,
): Promise<TaskActionData> {
  const archivedMessage = await rejectIfParentProjectArchived(scope, task);
  if (archivedMessage) {
    return { kind: "link", ok: false, message: archivedMessage };
  }
  const result = await createLinkWithPolicy(
    pickerDeps(scope),
    relatesToPolicy(task.id),
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
  task: TaskView,
  form: FormData,
): Promise<TaskActionData> {
  const archivedMessage = await rejectIfParentProjectArchived(scope, task);
  if (archivedMessage) {
    return { kind: "unlink", ok: false, message: archivedMessage };
  }
  const result = await unlinkWithPolicy(
    pickerDeps(scope),
    relatesToPolicy(task.id),
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
    if (cause instanceof TaskProjectArchivedError) {
      return { kind: "waiting", status: "error", formError: cause.message };
    }
    return {
      kind: "waiting",
      status: "error",
      formError: "That couldn’t be saved. Your work is safe — try again.",
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
    if (cause instanceof TaskProjectArchivedError) {
      return { kind: "waiting", status: "error", formError: cause.message };
    }
    return {
      kind: "waiting",
      status: "error",
      formError: "That couldn’t be saved. Please try again.",
    };
  }
}

async function handlePlan(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  try {
    const result = await scope.tasks.planTask(taskId, {
      scheduledDate: String(form.get("scheduledDate") ?? ""),
    });
    return {
      kind: "planning",
      status: "success",
      task: serializeTaskView(result.task),
    };
  } catch (cause) {
    if (cause instanceof TaskValidationError) {
      return {
        kind: "planning",
        status: "error",
        fieldErrors: { scheduledDate: cause.message },
      };
    }
    if (cause instanceof TaskNotFoundError) {
      return {
        kind: "planning",
        status: "error",
        formError: "This task is no longer available.",
      };
    }
    if (cause instanceof TaskProjectArchivedError) {
      return { kind: "planning", status: "error", formError: cause.message };
    }
    return {
      kind: "planning",
      status: "error",
      formError: "That couldn’t be saved. Your work is safe — try again.",
    };
  }
}

async function handleClearPlan(
  scope: WorkspaceScope,
  taskId: string,
): Promise<TaskActionData> {
  try {
    const result = await scope.tasks.clearPlan(taskId);
    return {
      kind: "planning",
      status: "success",
      task: serializeTaskView(result.task),
    };
  } catch (cause) {
    if (cause instanceof TaskValidationError) {
      // A rejected state (e.g. the task is completed — planning is open-work only).
      return {
        kind: "planning",
        status: "error",
        formError: cause.message,
      };
    }
    if (cause instanceof TaskNotFoundError) {
      return {
        kind: "planning",
        status: "error",
        formError: "This task is no longer available.",
      };
    }
    if (cause instanceof TaskProjectArchivedError) {
      return { kind: "planning", status: "error", formError: cause.message };
    }
    return {
      kind: "planning",
      status: "error",
      formError: "That couldn’t be saved. Please try again.",
    };
  }
}
