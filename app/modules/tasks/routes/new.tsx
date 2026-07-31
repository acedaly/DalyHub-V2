/**
 * TASKS-01 — the `/tasks/new` create resource route.
 *
 * A resource route (NO component) so a programmatic `fetch("/tasks/new", …)` from
 * the quick-capture form receives the action's JSON directly — mirroring the
 * `/projects/new` and `/notes/new` create endpoints. (A POST to the `/tasks` page
 * route, which HAS a component, would render the document instead of returning the
 * action result.) Creation is ONE atomic repository operation: the task's identity
 * and its initial planning fields commit together. A structural Area/Project context
 * is still bound and re-verified server-side; otherwise a missing submitted parent
 * creates an intentional Unassigned Task in Inbox.
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
  TASK_RECURRENCE_DATE_KINDS,
  TASK_RECURRENCE_FREQUENCIES,
  TaskValidationError,
  type CommitmentState,
  type TaskPriority,
  type TaskRecurrenceDateKind,
  type TaskRecurrenceFrequency,
  type TaskRecurrenceInput,
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
  if (submittedParentId.trim().length === 0) return null;
  return { kind: submittedParentKind, id: submittedParentId };
}

/**
 * A comma-separated weekday list from an untrusted form field, accepting only whole
 * numbers 0-6. Empty and blank segments are DROPPED rather than coerced — `Number("")`
 * is 0, which would silently turn "no selected weekdays" into "every Sunday".
 */
function parseWeekdayList(value: FormDataEntryValue | null): number[] {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^[0-6]$/.test(part))
    .map(Number);
}

/**
 * Read the OPTIONAL recurrence fields off a create submission, accepting only
 * closed-set tokens. Returns null when no recurrence was requested; an unrecognised
 * frequency is treated as "no recurrence requested" rather than a silent guess, and
 * the kernel still validates the rule against the task's anchor date.
 */
function readRecurrenceFields(form: FormData): TaskRecurrenceInput | null {
  const frequency = String(form.get("recurrenceFrequency") ?? "");
  if (!(TASK_RECURRENCE_FREQUENCIES as readonly string[]).includes(frequency)) {
    return null;
  }
  const dateKindRaw = String(form.get("recurrenceDateKind") ?? "scheduled");
  const dateKind = (TASK_RECURRENCE_DATE_KINDS as readonly string[]).includes(
    dateKindRaw,
  )
    ? (dateKindRaw as TaskRecurrenceDateKind)
    : "scheduled";
  const intervalRaw = Number(form.get("recurrenceInterval") ?? 1);
  const interval =
    Number.isInteger(intervalRaw) && intervalRaw >= 1 && intervalRaw <= 99
      ? intervalRaw
      : 1;
  const weekdays = parseWeekdayList(form.get("recurrenceWeekdays"));
  return {
    frequency: frequency as TaskRecurrenceFrequency,
    dateKind,
    interval,
    weekdays,
  };
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
  // — never a spine create followed by a separate detail write, so a failure can
  // never leave a created-but-unplanned task. With no parent, the result is a valid
  // Unassigned Task, not an orphan.
  const priority = form.get("priority");
  const sector = form.get("timeSector");
  const commitment = form.get("commitmentState");
  const dueDate = form.get("dueDate");
  const scheduledDate = form.get("scheduledDate");
  const rawCaptureContext = form.get("captureContext");
  // TASKS-04 — the recurrence the deterministic parser recognised, bound from closed
  // sets and written in the SAME create batch. A captured "every Monday" is either
  // persisted WITH its rule or not created at all: parsing without applying would be
  // a promise the product does not keep.
  const recurrence = readRecurrenceFields(form);
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
      ...(recurrence ? { recurrence } : {}),
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
