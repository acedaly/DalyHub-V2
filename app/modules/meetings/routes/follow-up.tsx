/**
 * MEET-02 — the meeting follow-up / Task-conversion endpoint
 * (`/meeting/:meetingId/follow-up`).
 *
 * A resource route (no UI) — the trusted server boundary for turning a meeting item
 * (or a direct follow-up) into a canonical Task. It authenticates, resolves the
 * workspace scope from trusted server config (the client never supplies a workspace
 * or actor), and delegates the multi-write conversion to the documented
 * orchestration in `~/platform/meetings`. Every Task field flows through the
 * canonical Task authority; this route writes no Task rows itself.
 */

import { env } from "cloudflare:workers";

import {
  SpineInvalidParentKindError,
  SpineParentUnavailableError,
  SpineValidationError,
} from "~/kernel/spine";
import {
  TaskProjectArchivedError,
  TaskValidationError,
  type CommitmentState,
  type TaskPriority,
  type TaskStatus,
  type TimeSector,
} from "~/kernel/tasks";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import {
  convertMeetingItemToTask,
  createMeetingFollowUpTask,
  MeetingArchivedError,
  MeetingItemNotFoundError,
  MeetingNotFoundError,
  type FollowUpTaskFields,
} from "~/platform/meetings";
import type { Route } from "./+types/follow-up";

/*
 * A GET on this mutation endpoint renders DalyHub's error boundary rather
 * than React Router's internal error object and stack trace.
 */
import { actionOnlyLoader } from "~/platform/request";

export const loader = actionOnlyLoader;

export type MeetingFollowUpResult =
  | { readonly ok: true; readonly taskId: string; readonly created: boolean }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Record<string, string>;
    };

function json(data: MeetingFollowUpResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Empty string → undefined so an unset optional field is left at its default. */
function optional(value: FormDataEntryValue | null): string | undefined {
  const s = value === null ? "" : String(value).trim();
  return s.length === 0 ? undefined : s;
}

function readFields(form: FormData): FollowUpTaskFields {
  const parentKind = String(form.get("parentKind") ?? "");
  return {
    title: String(form.get("title") ?? ""),
    // This surface REQUIRES a parent and always submits one. The id is passed
    // through exactly as it arrived — including empty — so an absent parent
    // still fails the spine's own validation here rather than silently becoming
    // an Inbox Task, which is the behaviour this route has always had.
    parent: {
      kind: parentKind === "area" ? "area" : "project",
      id: String(form.get("parentId") ?? ""),
    },
    priority: optional(form.get("priority")) as TaskPriority | undefined,
    dueDate: optional(form.get("dueDate")) ?? null,
    scheduledDate: optional(form.get("scheduledDate")) ?? null,
    timeSector: optional(form.get("timeSector")) as TimeSector | undefined,
    commitmentState: optional(form.get("commitmentState")) as
      CommitmentState | undefined,
    status: optional(form.get("status")) as TaskStatus | undefined,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const meetingId = params.meetingId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  try {
    if (intent === "remove_follow_up") {
      // Association removal — the canonical Task is never touched.
      await scope.meetings.removeFollowUpTask(String(form.get("taskId") ?? ""));
      return json({
        ok: true,
        taskId: String(form.get("taskId") ?? ""),
        created: false,
      });
    }

    const fields = readFields(form);
    const result =
      intent === "convert_item"
        ? await convertMeetingItemToTask(
            scope,
            meetingId,
            String(form.get("itemId") ?? ""),
            fields,
          )
        : await createMeetingFollowUpTask(scope, meetingId, fields);

    return json({ ok: true, taskId: result.taskId, created: result.created });
  } catch (cause) {
    return json(mapError(cause));
  }
}

function mapError(cause: unknown): MeetingFollowUpResult {
  if (cause instanceof TaskValidationError) {
    return { ok: false, fieldErrors: { [cause.field]: cause.message } };
  }
  if (cause instanceof SpineValidationError) {
    return { ok: false, fieldErrors: { title: cause.message } };
  }
  if (cause instanceof SpineInvalidParentKindError) {
    return {
      ok: false,
      fieldErrors: { parentId: "Choose a Project or Area for this task." },
    };
  }
  if (
    cause instanceof SpineParentUnavailableError ||
    cause instanceof TaskProjectArchivedError
  ) {
    return {
      ok: false,
      formError: "That Project or Area is no longer available.",
    };
  }
  if (cause instanceof MeetingArchivedError) {
    return { ok: false, formError: cause.message };
  }
  if (
    cause instanceof MeetingNotFoundError ||
    cause instanceof MeetingItemNotFoundError
  ) {
    return { ok: false, formError: cause.message };
  }
  return {
    ok: false,
    formError:
      "That follow-up couldn’t be saved. Your work is safe — try again.",
  };
}
