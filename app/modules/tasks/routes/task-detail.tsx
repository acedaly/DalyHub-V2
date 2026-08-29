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
  DEFAULT_TASK_RECURRENCE_WEEKEND_RULE,
  MAX_TASK_RECURRENCE_COUNT,
  TASK_RECURRENCE_ORDINALS,
  TASK_RECURRENCE_WEEKEND_RULES,
  TaskChecklistFullError,
  TaskChecklistItemNotFoundError,
  TaskDependencyCycleError,
  TaskDependencyLimitError,
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
  type TaskRecurrenceOrdinal,
  type TaskRecurrenceWeekendRule,
  type SetWaitingInput,
  type TaskChecklistItem,
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

import { parseEntityTagInput, tagLabels } from "~/kernel/tags";
import {
  serializeChecklist,
  serializeChecklistItem,
  serializeTaskDependencies,
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

  const [links, checklist, dependencies] = await Promise.all([
    listActiveLinks(pickerDeps(scope), {
      anchorId: taskId,
      direction: "outgoing",
      linkTypes: [TASK_RELATES_TO],
    }),
    // TASKS-13 — ONE bounded, ordered read for THIS Task's checklist. A record
    // read may fetch its own record's children directly; what it may never do is
    // fetch one per row of a list, which is why the collection surfaces go
    // through the aggregate instead.
    scope.tasks.listChecklist(taskId),
    // TASKS-12 — ONE bounded read for BOTH directions of this Task's
    // dependencies, with each counterpart's title and completion resolved. A
    // record may read its own relationships directly; what it may never do is
    // read one per row of a list, which is why the collection surfaces go through
    // `listBlockedSummaries` instead.
    scope.tasks.listTaskDependencies(taskId),
  ]);

  return json({
    task: serializeTaskView(task),
    links,
    checklist: serializeChecklist(checklist),
    dependencies: serializeTaskDependencies(dependencies),
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
    /*
     * TASKS-13 — a queued checklist tick contends over an ITEM, not over the
     * Task.
     *
     * Two consequences, and both are load-bearing. The value the conflict rule
     * compares is that item's own tick, read here from the canonical checklist.
     * And the id the RECEIPT is filed under is the ITEM's, so a receipt written
     * for "tick step 2" can never be satisfied by a request naming step 3 — the
     * guard the receipt table exists for stays as tight for a checklist as it is
     * for a Task.
     */
    const targetId =
      replay.operation === "set_checklist_completed"
        ? nullable(form.get("itemId"))
        : null;
    const targetItem =
      targetId === null
        ? null
        : ((await scope.tasks.listChecklist(taskId)).find(
            (candidate) => candidate.id === targetId,
          ) ?? null);
    if (targetId !== null && targetItem === null) {
      // The item was deleted on another device. Terminal for this change, and
      // said in the owner's words — the same treatment a deleted Task gets.
      return json(
        {
          kind: "checklist",
          status: "error",
          formError: OFFLINE_CHECKLIST_ITEM_GONE,
          offline: { kind: "gone", message: OFFLINE_CHECKLIST_ITEM_GONE },
        } satisfies TaskActionData & OfflineReplayEnvelope,
        404,
      );
    }
    const outcome = await withTaskMutationReplay(
      {
        db: env.DB,
        workspaceId: scope.context.workspaceId,
        ownerSubject: session.user.subject,
        entityId: targetId ?? taskId,
        operation: replay.operation,
        now: new Date(),
      },
      replay,
      currentFieldValue(task, replay.operation, targetItem),
      () => dispatchTaskIntent(scope, taskId, task, intent, form),
      taskResultApplied,
      taskResultRefusal,
    );
    return json({
      ...(outcome.applied
        ? outcome.result
        : await replayedTaskResult(
            scope,
            taskId,
            intent,
            await scope.tasks.getTask(taskId),
            task,
          )),
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
    // TASKS-13 — the five checklist mutations. They live on the TASK's own route
    // because a checklist item has no address of its own: it is reachable only
    // through the Task that owns it, and routing it that way is what makes the
    // workspace + Task ownership check impossible to skip.
    case "checklist_add":
      return handleChecklistAdd(scope, taskId, form);
    case "checklist_rename":
      return handleChecklistRename(scope, taskId, form);
    case "checklist_set_completed":
      return handleChecklistCompleted(scope, taskId, form);
    case "checklist_delete":
      return handleChecklistDelete(scope, taskId, form);
    case "checklist_reorder":
      return handleChecklistReorder(scope, taskId, form);
    // TASKS-12 — the two dependency mutations. They live on the BLOCKED Task's
    // own route because that is the Task the relationship changes, and routing
    // them here is what makes the workspace + Task ownership check impossible to
    // skip. The blocker end is re-verified inside the write.
    case "dependency_add":
      return handleDependencyAdd(scope, taskId, form);
    case "dependency_remove":
      return handleDependencyRemove(scope, taskId, form);
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
  // TASKS-13 — the queued tick arrives as the SAME intent the online control
  // posts, carrying the same `itemId` + `completed` pair. Replay gets no verb of
  // its own here either.
  set_checklist_completed: ["checklist_set_completed"],
} as const satisfies Record<OfflineMutationOperation, readonly string[]>;

/** The form key each replace-style operation writes, per intent. */
const REPLAY_FORM_KEYS: Readonly<Record<string, string>> = {
  rename: "title",
  update: "",
  plan: "scheduledDate",
  clear_plan: "",
  // TASKS-13 — the flag field. `nullable()` reads "" back as null, and the
  // conflict rule normalises null and "" to the same absence, so "not done"
  // compares equal however it crossed the wire.
  checklist_set_completed: "completed",
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

/**
 * Did the Task domain actually apply this intent?
 *
 * The handlers above report an EXPECTED refusal — a title the domain will not
 * accept, an archived parent Project, a date it rejects — by returning an error
 * result rather than by throwing. Replay must not record one of those as applied
 * and let the client drop the owner's queued change: nothing was written, and
 * the owner's intent is still the only copy.
 */
function taskResultApplied(result: TaskActionData): boolean {
  switch (result.kind) {
    case "completion":
    case "link":
    case "unlink":
      return result.ok;
    case "update":
    case "planning":
    case "waiting":
    case "checklist":
    // TASKS-12 — a dependency mutation is not an OFFLINE operation (there is no
    // queued verb for one, see `PWA_AND_OFFLINE.md`), so this arm is only ever
    // reached by the exhaustiveness check. Listing it keeps the switch total, so
    // adding an offline dependency verb later cannot silently fall through.
    case "dependency":
      return result.status === "success";
  }
}

/** The domain's own wording for a refusal, for the replay report. */
function taskResultRefusal(result: TaskActionData): string {
  const fallback = "DalyHub could not accept this change.";
  if (result.kind === "completion") {
    return result.ok ? fallback : result.message;
  }
  if (
    result.kind === "update" ||
    result.kind === "planning" ||
    result.kind === "waiting" ||
    result.kind === "checklist" ||
    result.kind === "dependency"
  ) {
    if (result.status === "error") {
      return (
        result.formError ??
        Object.values(result.fieldErrors ?? {})[0] ??
        fallback
      );
    }
  }
  return fallback;
}

/** The refusal for a replay whose own fields do not agree with each other. */
/**
 * TASKS-13 — the wording for a queued tick whose checklist item no longer exists.
 *
 * Its own sentence rather than `OFFLINE_TARGET_GONE`, because the Task is still
 * there and telling the owner it was deleted would be untrue.
 */
const OFFLINE_CHECKLIST_ITEM_GONE =
  "This checklist item was deleted on another device, so this change could not be applied.";

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
  /** TASKS-13 — the addressed checklist item, when the operation names one. */
  item: TaskChecklistItem | null = null,
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
    case "set_checklist_completed":
      // The SAME "1" / "" flag the form carries, so the base, the intent and the
      // server value are all one representation and the comparison is exact.
      return item?.completed ? "1" : "";
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
async function replayedTaskResult(
  scope: WorkspaceScope,
  taskId: string,
  intent: string,
  fresh: TaskView | null,
  fallback: TaskView,
): Promise<TaskActionData> {
  // TASKS-13 — a checklist replay that applied nothing still answers with the
  // checklist as it stands NOW, so the surface reconciles against the truth
  // rather than against a guess about what an earlier attempt did.
  if (intent === "checklist_set_completed") {
    return {
      kind: "checklist",
      status: "success",
      checklist: serializeChecklist(await scope.tasks.listChecklist(taskId)),
    };
  }
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
      // `description` is Markdown source, and — like every other key above — an
      // ABSENT field means unchanged while a present empty one clears it.
      //
      // It was the one field that read absence as `null`, which was harmless for
      // as long as the only submission reaching here was the Details form (which
      // always carries it). PWA-12 introduced a second: a replayed offline
      // priority or due-date change carries ONLY the field it changed, and would
      // otherwise have silently erased the Task's description alongside applying
      // it. Making it a PATCH key like its neighbours fixes that at the cause,
      // and leaves the Details form byte-for-byte unchanged.
      description: form.has("description")
        ? String(form.get("description"))
        : undefined,
      /*
       * V2.6 FIND-03 — the Task's tags, a PATCH key like every other field
       * above: absent means unchanged, and a present empty array clears them.
       *
       * Parsed by the ONE tag parser, which accepts the JSON array every shared
       * form posts and, defensively, a comma list — so a no-JavaScript
       * submission behaves rather than silently dropping the owner's tags.
       */
      tags: form.has("tags")
        ? tagLabels(parseEntityTagInput(form.get("tags")))
        : undefined,
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

/* -------------------------------------------------------------------------- */
/* TASKS-13 — the checklist handlers                                          */
/*                                                                            */
/* Five thin translations between a form submission and the ONE checklist      */
/* authority (`scope.tasks.*Checklist*`). They validate nothing themselves —   */
/* the kernel does that, at the boundary every caller passes through — and     */
/* every one of them answers with the WHOLE checklist as the server now holds  */
/* it, so the section reconciles rather than accumulating a second opinion.    */
/* -------------------------------------------------------------------------- */

/** The checklist as it stands now, for a success answer. */
async function checklistSuccess(
  scope: WorkspaceScope,
  taskId: string,
  item?: TaskChecklistItem,
): Promise<TaskActionData> {
  return {
    kind: "checklist",
    status: "success",
    checklist: serializeChecklist(await scope.tasks.listChecklist(taskId)),
    ...(item ? { item: serializeChecklistItem(item) } : {}),
  };
}

/**
 * The ONE typed-error translation every checklist operation uses.
 *
 * A refusal the surface can ACT on carries the current checklist with it: an
 * item another device deleted, or an order composed against a list that has
 * since changed, is not something the owner can fix by retrying, so the section
 * is corrected in the same response that refuses. An ordinary validation
 * refusal does not, because nothing moved and the owner's draft is the only
 * thing to change.
 */
async function checklistFailure(
  scope: WorkspaceScope,
  taskId: string,
  cause: unknown,
): Promise<TaskActionData> {
  if (cause instanceof TaskValidationError) {
    return {
      kind: "checklist",
      status: "error",
      fieldErrors: { [cause.field]: cause.message },
    };
  }
  if (cause instanceof TaskChecklistFullError) {
    return { kind: "checklist", status: "error", formError: cause.message };
  }
  if (cause instanceof TaskChecklistItemNotFoundError) {
    return {
      kind: "checklist",
      status: "error",
      formError: cause.message,
      checklist: serializeChecklist(await scope.tasks.listChecklist(taskId)),
    };
  }
  if (cause instanceof TaskNotFoundError) {
    return {
      kind: "checklist",
      status: "error",
      formError: "This task is no longer available.",
    };
  }
  if (cause instanceof TaskProjectArchivedError) {
    return { kind: "checklist", status: "error", formError: cause.message };
  }
  return {
    kind: "checklist",
    status: "error",
    formError: "That couldn’t be saved. Nothing was changed — try again.",
  };
}

async function handleChecklistAdd(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  try {
    const item = await scope.tasks.createChecklistItem(taskId, {
      title: String(form.get("title") ?? ""),
    });
    return await checklistSuccess(scope, taskId, item);
  } catch (cause) {
    return await checklistFailure(scope, taskId, cause);
  }
}

async function handleChecklistRename(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  try {
    const result = await scope.tasks.renameChecklistItem(
      taskId,
      String(form.get("itemId") ?? ""),
      String(form.get("title") ?? ""),
    );
    return await checklistSuccess(scope, taskId, result.item);
  } catch (cause) {
    return await checklistFailure(scope, taskId, cause);
  }
}

async function handleChecklistCompleted(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  try {
    const result = await scope.tasks.setChecklistItemCompleted(
      taskId,
      String(form.get("itemId") ?? ""),
      // The wire value is the same "1" / "" every DalyHub form uses for a flag,
      // so the online control and a replayed offline tick send the same body.
      checklistFlag(form.get("completed")),
    );
    return await checklistSuccess(scope, taskId, result.item);
  } catch (cause) {
    return await checklistFailure(scope, taskId, cause);
  }
}

async function handleChecklistDelete(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  try {
    await scope.tasks.deleteChecklistItem(
      taskId,
      String(form.get("itemId") ?? ""),
    );
    return await checklistSuccess(scope, taskId);
  } catch (cause) {
    return await checklistFailure(scope, taskId, cause);
  }
}

async function handleChecklistReorder(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  try {
    // The order arrives as repeated `itemId` fields — an ordinary form list, so
    // the same submission works from a fetcher, a plain form and a replay.
    await scope.tasks.reorderChecklist(
      taskId,
      form.getAll("itemId").map((value) => String(value)),
    );
    return await checklistSuccess(scope, taskId);
  } catch (cause) {
    return await checklistFailure(scope, taskId, cause);
  }
}

/** Read a checklist completion flag from a form field. "1" is true; all else false. */
function checklistFlag(value: FormDataEntryValue | null): boolean {
  return String(value ?? "") === "1";
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
    /*
     * TASKS-12 — the four advanced fields.
     *
     * Each is OPTIONAL and each absent value is the documented default, so an
     * older client (or an offline replay queued before this shipped) posting the
     * TASKS-07 field set still means exactly the rule it meant then. Every value
     * is checked against its closed set HERE, at the trusted boundary, before the
     * kernel validates the rule as a whole — the client's own checks are a
     * courtesy, never the authority.
     */
    const ordinalRaw = nullable(form.get("ordinal"));
    if (
      ordinalRaw !== null &&
      !(TASK_RECURRENCE_ORDINALS as readonly string[]).includes(ordinalRaw)
    ) {
      return {
        kind: "update",
        status: "error",
        fieldErrors: { recurrence: "Choose which weekday of the month." },
      };
    }
    const weekendRaw =
      nullable(form.get("weekendRule")) ?? DEFAULT_TASK_RECURRENCE_WEEKEND_RULE;
    if (
      !(TASK_RECURRENCE_WEEKEND_RULES as readonly string[]).includes(weekendRaw)
    ) {
      return {
        kind: "update",
        status: "error",
        fieldErrors: {
          recurrence: "Choose what happens when it falls at a weekend.",
        },
      };
    }
    const endsAfterRaw = nullable(form.get("endsAfterCount"));
    const endsAfterCount = endsAfterRaw === null ? null : Number(endsAfterRaw);
    if (
      endsAfterCount !== null &&
      (!Number.isInteger(endsAfterCount) ||
        endsAfterCount < 1 ||
        endsAfterCount > MAX_TASK_RECURRENCE_COUNT)
    ) {
      return {
        kind: "update",
        status: "error",
        fieldErrors: {
          recurrence: `Enter how many times it repeats, from 1 to ${MAX_TASK_RECURRENCE_COUNT}.`,
        },
      };
    }
    const endsOnDate = nullable(form.get("endsOnDate"));
    recurrence = {
      frequency: frequency as TaskRecurrenceFrequency,
      dateKind: dateKind as TaskRecurrenceDateKind,
      mode: modeRaw as TaskRecurrenceMode,
      interval,
      weekdays,
      ordinal: ordinalRaw as TaskRecurrenceOrdinal | null,
      weekendRule: weekendRaw as TaskRecurrenceWeekendRule,
      endsAfterCount,
      endsOnDate,
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

/* -------------------------------------------------------------------------- */
/* TASKS-12 — dependencies                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Add "this Task is blocked by <blockerId>".
 *
 * The route validates NOTHING about the graph. Every dependency invariant —
 * Task-only live endpoints, no self-edge, no duplicate, no cycle and both bounds
 * — is enforced inside the repository's write, so a hand-made POST meets exactly
 * the same answer the picker does. This handler's whole job is to turn each typed
 * refusal into a sentence the owner can act on, and to answer with the Task's
 * dependencies as the server now holds them, so the section is self-correcting.
 */
async function handleDependencyAdd(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  const blockerId = nullable(form.get("blockerId"));
  if (blockerId === null) {
    return {
      kind: "dependency",
      status: "error",
      fieldErrors: { dependency: "Choose the task this one waits on." },
    };
  }
  try {
    await scope.tasks.addTaskDependency(taskId, blockerId);
    return await dependencyResult(scope, taskId);
  } catch (cause) {
    return dependencyRefusal(cause);
  }
}

/** Remove one dependency edge. Idempotent: removing what is gone is success. */
async function handleDependencyRemove(
  scope: WorkspaceScope,
  taskId: string,
  form: FormData,
): Promise<TaskActionData> {
  const blockerId = nullable(form.get("blockerId"));
  if (blockerId === null) {
    return {
      kind: "dependency",
      status: "error",
      fieldErrors: { dependency: "Choose the task to remove." },
    };
  }
  try {
    await scope.tasks.removeTaskDependency(taskId, blockerId);
    return await dependencyResult(scope, taskId);
  } catch (cause) {
    return dependencyRefusal(cause);
  }
}

/** The Task's dependencies as the server holds them NOW, in both directions. */
async function dependencyResult(
  scope: WorkspaceScope,
  taskId: string,
): Promise<TaskActionData> {
  return {
    kind: "dependency",
    status: "success",
    dependencies: serializeTaskDependencies(
      await scope.tasks.listTaskDependencies(taskId),
    ),
  };
}

/** Each typed dependency refusal, in the owner's words. */
function dependencyRefusal(cause: unknown): TaskActionData {
  if (
    cause instanceof TaskDependencyCycleError ||
    cause instanceof TaskDependencyLimitError
  ) {
    // Both already read as sentences addressed to the owner, and neither
    // discloses anything about a record they cannot see.
    return {
      kind: "dependency",
      status: "error",
      fieldErrors: { dependency: cause.message },
    };
  }
  if (cause instanceof TaskValidationError) {
    return {
      kind: "dependency",
      status: "error",
      fieldErrors: { dependency: cause.message },
    };
  }
  if (cause instanceof TaskNotFoundError) {
    // A missing, deleted, non-Task or cross-workspace endpoint — all
    // indistinguishable, disclosing nothing about another workspace.
    return {
      kind: "dependency",
      status: "error",
      formError: "That task is no longer available.",
    };
  }
  if (cause instanceof TaskProjectArchivedError) {
    return { kind: "dependency", status: "error", formError: cause.message };
  }
  return {
    kind: "dependency",
    status: "error",
    formError: "That couldn’t be saved. Please try again.",
  };
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
