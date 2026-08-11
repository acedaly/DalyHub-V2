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

import { SpineParentUnavailableError } from "~/kernel/spine";
import {
  DEFAULT_TASK_RECURRENCE_MODE,
  TASK_RECURRENCE_DATE_KINDS,
  TASK_RECURRENCE_FREQUENCIES,
  TASK_RECURRENCE_MODES,
  TaskNotFoundError,
  TaskProjectArchivedError,
  TaskValidationError,
  type CommitmentState,
  type SetTaskParentInput,
  type SetTaskRecurrenceInput,
  type TaskRecurrenceDateKind,
  type TaskRecurrenceFrequency,
  type TaskRecurrenceMode,
  type SetWaitingInput,
  type TaskPriority,
  type TaskStatus,
  type TaskView,
  type TimeSector,
} from "~/kernel/tasks";
import {
  OFFLINE_TARGET_GONE,
  type OfflineMutationOperation,
  type OfflineMutationValue,
  type OfflineReplayEnvelope,
} from "~/kernel/offline";
import {
  createLinkWithPolicy,
  listActiveLinks,
  unlinkWithPolicy,
  type EntityLinkPickerDeps,
  type EntityLinkPickerPolicy,
} from "~/platform/entity-links";
import {
  OFFLINE_REPLAY_FIELDS,
  readTaskReplayRequest,
  withTaskMutationReplay,
  type TaskReplayRequest,
} from "~/platform/offline";
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
  // AUDIT-14 — the owner's timezone from the ONE scope-level authority,
  // resolved once per request and shared with every other module that
  // asks what day it is. Degrades to the documented default on a read
  // failure, so a missing preference never takes the page down.
  const timezone = await scope.ownerTimeZone();
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

  // PWA-12 — a REPLAYED offline mutation carries the key it was queued with and
  // the value the device believed the field held. It is arbitrated and applied
  // through this same authenticated route, with this same workspace scope and the
  // same domain handlers below; the only thing replay adds is the receipt and the
  // conflict decision. An ONLINE submission carries no key, takes the unchanged
  // path, and its response shape is untouched.
  const replay = readTaskReplay(form, intent);
  if (replay !== null) {
    if (replay === "malformed") {
      return json(malformedReplay(), 400);
    }
    if (!task) {
      // A queued change whose Task was deleted elsewhere. Terminal, and said in
      // the owner's words rather than as a bare 404 — the replay engine reads
      // the envelope, the sync surface reads the message.
      return json(
        {
          kind: "update",
          status: "error",
          formError: OFFLINE_TARGET_GONE,
          offline: { kind: "gone", message: OFFLINE_TARGET_GONE },
        } satisfies TaskActionData & OfflineReplayEnvelope,
        404,
      );
    }
    const outcome = await withTaskMutationReplay(
      {
        db: env.DB,
        workspaceId: scope.context.workspaceId,
        ownerSubject: session.user.subject,
        entityId: taskId,
        operation: replay.operation,
        now: new Date(),
      },
      replay,
      currentFieldValue(task, replay.operation),
      () => dispatchTaskIntent(scope, taskId, task, intent, form),
    );
    return json({
      ...(outcome.applied
        ? outcome.result
        : replayedTaskResult(intent, await scope.tasks.getTask(taskId), task)),
      offline: outcome.report,
    });
  }

  if (!task) {
    return json({ error: "not_found" }, 404);
  }
  return json(await dispatchTaskIntent(scope, taskId, task, intent, form));
}

/**
 * The intent dispatch, shared by the online path and offline replay.
 *
 * Extracted so there is literally one switch: a replayed mutation runs the SAME
 * handler, with the same validation, the same Activity and the same workspace
 * scoping as the control the owner used online (`AGENTS.md §9.8`). There is no
 * second Task authority anywhere in PWA-12.
 */
async function dispatchTaskIntent(
  scope: WorkspaceScope,
  taskId: string,
  task: TaskView,
  intent: string,
  form: FormData,
): Promise<TaskActionData> {
  switch (intent) {
    case "update":
      return handleUpdate(scope, taskId, form);
    case "rename":
      return handleRename(scope, taskId, form);
    case "complete":
    case "reopen":
      return handleCompletion(
        scope,
        taskId,
        intent,
        await ownerTodayIsoFor(scope),
      );
    case "link":
      return handleLink(scope, task, form);
    case "unlink":
      return handleUnlink(scope, task, form);
    case "set_waiting":
      return handleSetWaiting(scope, taskId, form);
    case "clear_waiting":
      return handleClearWaiting(scope, taskId);
    case "plan":
      return handlePlan(scope, taskId, form);
    case "clear_plan":
      return handleClearPlan(scope, taskId);
    case "set_parent":
      return handleSetParent(scope, taskId, form);
    case "set_recurrence":
      return handleSetRecurrence(scope, taskId, form);
    case "move_occurrence":
      return handleMoveOccurrence(scope, taskId, form);
    case "skip_occurrence":
      return handleSkipOccurrence(scope, taskId, await ownerTodayIsoFor(scope));
    default:
      return { kind: "update", status: "error", formError: "Unknown action." };
  }
}

/* -------------------------------------------------------------------------- */
/* PWA-12 — the offline replay seam                                           */
/* -------------------------------------------------------------------------- */

/**
 * The canonical `intent` each offline operation is carried by.
 *
 * Replay does not get its own verbs. A queued completion arrives as
 * `intent=complete`, a queued rename as `intent=rename`, and the three field
 * edits as `intent=update` with exactly the one PATCH key they change — which is
 * what makes an unrelated server edit to a DIFFERENT field merge rather than
 * conflict (§18). This table is also the GUARD: a submission whose declared
 * operation does not match its intent is refused, so a stolen or hand-made
 * `offlineKey` cannot be attached to an intent it was not issued for.
 */
const REPLAY_INTENTS = {
  complete: ["complete"],
  reopen: ["reopen"],
  set_title: ["rename"],
  set_priority: ["update"],
  set_due: ["update"],
  // The PLANNED date has its own domain authority (`planTask`/`clearPlan`, kept
  // strictly separate from the due date by ADR-043 §3), so its replay carries
  // that authority's two intents rather than a generic field write. Replay uses
  // the SAME domain path the online control uses; it never finds a shortcut.
  set_planned: ["plan", "clear_plan"],
} as const satisfies Record<OfflineMutationOperation, readonly string[]>;

/** The form key each replace-style operation writes, per intent. */
const REPLAY_FORM_KEYS: Readonly<Record<string, string>> = {
  rename: "title",
  update: "",
  plan: "scheduledDate",
  clear_plan: "",
};

/** The `update` PATCH key each field operation is allowed to carry. */
const REPLAY_UPDATE_KEYS = {
  set_priority: "priority",
  set_due: "dueDate",
} as const;

/**
 * Read and VALIDATE the replay fields on a Task submission.
 *
 * Returns null for every online submission (the overwhelmingly common case, and
 * the one that must cost nothing), `"malformed"` when the fields are present but
 * inconsistent, and the request otherwise.
 */
function readTaskReplay(
  form: FormData,
  intent: string,
): TaskReplayRequest | null | "malformed" {
  // The value this submission actually carries, read from the key the INTENT
  // owns. Reading it from the declared operation instead would let a request
  // name one operation and carry another's field.
  const valueKey =
    intent === "update"
      ? (REPLAY_UPDATE_KEYS[
          form.get(
            OFFLINE_REPLAY_FIELDS.operation,
          ) as keyof typeof REPLAY_UPDATE_KEYS
        ] ?? "")
      : (REPLAY_FORM_KEYS[intent] ?? "");
  const intended = valueKey === "" ? null : nullable(form.get(valueKey));

  const replay = readTaskReplayRequest(form, intended);
  if (replay === null || replay === "malformed") return replay;

  // The declared operation must be one this intent actually performs, and it must
  // carry ITS field and no other. Both are checked here, before a claim is
  // written, so a hand-made `offlineKey` cannot be attached to an intent it was
  // never issued for.
  const allowed: readonly string[] = REPLAY_INTENTS[replay.operation];
  if (!allowed.includes(intent)) return "malformed";
  if (valueKey !== "" && !form.has(valueKey)) return "malformed";
  if (intent === "plan" && intended === null) return "malformed";
  return replay;
}

/** The refusal for a replay whose own fields do not agree with each other. */
function malformedReplay(): TaskActionData & OfflineReplayEnvelope {
  const message = "That change could not be read, so nothing was applied.";
  return {
    kind: "update",
    status: "error",
    formError: message,
    offline: { kind: "invalid", message },
  };
}

/** The CURRENT server value of the field an operation contends over. */
function currentFieldValue(
  task: TaskView,
  operation: OfflineMutationOperation,
): OfflineMutationValue {
  switch (operation) {
    case "complete":
    case "reopen":
      return task.completedAt ? task.completedAt.toISOString() : null;
    case "set_title":
      return task.title;
    case "set_priority":
      return task.priority;
    case "set_due":
      return task.dueDate;
    case "set_planned":
      return task.scheduledDate;
  }
}

/**
 * The result reported for a replay that applied NOTHING — because an earlier
 * attempt already did, or because the record already held the intended state.
 *
 * It reports the task as it stands NOW, re-read after the decision, so the client
 * reconciles against the truth rather than against a guess about what an earlier
 * attempt did. The pre-read record is the fallback for the one case a re-read can
 * fail: the Task being deleted between the decision and this line.
 */
function replayedTaskResult(
  intent: string,
  fresh: TaskView | null,
  fallback: TaskView,
): TaskActionData {
  const task = serializeTaskView(fresh ?? fallback);
  // The recurrence consequence is deliberately NOT restated here. Only the
  // completion that actually ran knows whether it created a successor, and a
  // replay that applied nothing must not claim one — the client reconciles the
  // series by re-reading, which is the only honest source.
  if (intent === "complete" || intent === "reopen") {
    return { kind: "completion", ok: true, task };
  }
  // The result KIND matches the intent's own online answer, so a replay is
  // indistinguishable from the mutation it stands in for.
  return intent === "plan" || intent === "clear_plan"
    ? { kind: "planning", status: "success", task }
    : { kind: "update", status: "success", task };
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
async function ownerTodayIsoFor(scope: WorkspaceScope): Promise<string> {
  // AUDIT-14 — one authority for the owner's day, resolved once per request
  // and shared with every other module that asks. Degrades to the documented
  // default on a read failure, so a missing preference never blocks a mutation.
  return scope.ownerTodayIso();
}

/**
 * TASKS-04 — set, change or remove the Task's recurrence rule. Every value is a
 * closed-set token bound server-side; the kernel validates the rule against the
 * Task's own anchor date, so a rule that could never repeat is refused with a field
 * error the control can show.
 */
/**
 * TASKS-07 — move a recurring occurrence's anchor date at an explicit SERIES SCOPE.
 *
 * The scope is required, never inferred: "this occurrence" and "this and future
 * occurrences" are different decisions, and silently picking one is exactly the
 * failure this intent exists to prevent. Completed occurrences are never rewritten.
 */
async function handleMoveOccurrence(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  const date = nullable(form.get("date"));
  const seriesScope = nullable(form.get("scope"));
  if (date === null) {
    return {
      kind: "update",
      status: "error",
      fieldErrors: { recurrence: "Choose the new date." },
    };
  }
  if (seriesScope !== "occurrence" && seriesScope !== "series") {
    return {
      kind: "update",
      status: "error",
      fieldErrors: {
        recurrence:
          "Choose whether this changes only this occurrence or this and future occurrences.",
      },
    };
  }
  try {
    const result = await scope.tasks.moveTaskOccurrence(taskId, {
      date,
      scope: seriesScope,
    });
    return {
      kind: "update",
      status: "success",
      task: serializeTaskView(result.task),
    };
  } catch (cause) {
    return recurrenceFailure(
      cause,
      "That change couldn’t be saved. Nothing was changed — try again.",
    );
  }
}

/**
 * TASKS-07 — SKIP this occurrence: advance it one step along the series without
 * completing it. Never a completion, so the history never claims work happened that
 * did not.
 */
async function handleSkipOccurrence(
  scope: WorkspaceScope,
  taskId: string,
  ownerTodayIso: string,
): Promise<TaskActionData> {
  try {
    const result = await scope.tasks.skipTaskOccurrence(taskId, {
      ownerTodayIso,
    });
    return {
      kind: "update",
      status: "success",
      task: serializeTaskView(result.task),
    };
  } catch (cause) {
    return recurrenceFailure(
      cause,
      "That occurrence couldn’t be skipped. Nothing was changed — try again.",
    );
  }
}

/** The ONE typed-error translation both series operations use. Never raw SQL. */
function recurrenceFailure(cause: unknown, fallback: string): TaskActionData {
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
  return { kind: "update", status: "error", formError: fallback };
}

async function handleSetRecurrence(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  const frequency = nullable(form.get("frequency"));
  const dateKind = nullable(form.get("dateKind")) ?? "scheduled";
  const intervalRaw = nullable(form.get("interval"));
  const weekdaysRaw = nullable(form.get("weekdays"));
  // TASKS-07: the scheduling MODE is explicit. An absent field means the documented
  // default (`fixed`), which is what every rule authored before TASKS-07 means, so an
  // older client cannot accidentally convert a routine into an interval.
  const modeRaw = nullable(form.get("mode")) ?? DEFAULT_TASK_RECURRENCE_MODE;

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
    if (!(TASK_RECURRENCE_MODES as readonly string[]).includes(modeRaw)) {
      return {
        kind: "update",
        status: "error",
        fieldErrors: {
          recurrence:
            "Choose whether this keeps a fixed schedule or repeats after completion.",
        },
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
      mode: modeRaw as TaskRecurrenceMode,
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
