/**
 * PROJECT-02 — the template mutation endpoint
 * (`POST /projects/templates/:templateId/mutate`).
 *
 * An action-only resource route (no UI) — the trusted server boundary for every
 * change to a template. Same authenticated composition path as the other
 * project routes: the Worker boundary authenticates, `requireAuthenticatedSession`
 * re-checks, and the workspace scope is resolved from TRUSTED server config
 * (ADR-010 / ADR-016 §5.6). The client never supplies a workspace id, and a
 * template in another workspace is indistinguishable from one that never
 * existed.
 *
 * Every intent routes to `scope.projectTemplates`, which is the single
 * authority: no route writes a template row, a template task row or a checklist
 * row directly, so the bounds and the atomicity guarantees cannot be bypassed
 * from here.
 */

import { env } from "cloudflare:workers";

import {
  ProjectTemplateChecklistFullError,
  ProjectTemplateFullError,
  ProjectTemplateNotFoundError,
  ProjectTemplateParentUnavailableError,
  ProjectTemplateTaskNotFoundError,
  ProjectTemplateValidationError,
} from "~/kernel/project-templates";
import { TaskValidationError } from "~/kernel/tasks";
import {
  actionOnlyLoader,
  readEntityIconField,
  readIdentityColourField,
  requireAuthenticatedSession,
} from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/template-mutate";

export const loader = actionOnlyLoader;

/** The discriminated outcome every template action returns. */
export type TemplateMutationResult =
  | { readonly ok: true; readonly projectId?: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

function json(data: TemplateMutationResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * Map a kernel refusal to a message the owner can act on.
 *
 * Every branch names the actual limit or the actual missing thing. A bound is
 * never reported as "something went wrong": the whole point of refusing rather
 * than silently truncating is that the owner is told what the ceiling is.
 */
function refusal(cause: unknown): Response {
  if (cause instanceof ProjectTemplateValidationError) {
    return json({ ok: false, fieldErrors: { [cause.field]: cause.message } });
  }
  if (cause instanceof TaskValidationError) {
    return json({ ok: false, fieldErrors: { title: cause.message } });
  }
  if (cause instanceof ProjectTemplateNotFoundError) {
    return json({ ok: false, formError: "That template is no longer here." });
  }
  if (cause instanceof ProjectTemplateTaskNotFoundError) {
    return json({ ok: false, formError: cause.message });
  }
  if (
    cause instanceof ProjectTemplateFullError ||
    cause instanceof ProjectTemplateChecklistFullError
  ) {
    return json({ ok: false, formError: cause.message });
  }
  if (cause instanceof ProjectTemplateParentUnavailableError) {
    return json({ ok: false, fieldErrors: { parentId: cause.message } });
  }
  return json({
    ok: false,
    formError: "That change couldn’t be saved. Please try again.",
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const templateId = params.templateId ?? "";
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const templates = scope.projectTemplates;

  try {
    switch (intent) {
      case "rename": {
        await templates.updateTemplate(templateId, {
          name: String(form.get("name") ?? ""),
        });
        return json({ ok: true });
      }
      case "describe": {
        await templates.updateTemplate(templateId, {
          description: String(form.get("description") ?? ""),
        });
        return json({ ok: true });
      }
      case "setDefaultParent": {
        const parentId = String(form.get("parentId") ?? "").trim();
        await templates.updateTemplate(templateId, {
          defaultParent: parentId.length === 0 ? null : { id: parentId },
        });
        return json({ ok: true });
      }
      case "setIdentity": {
        // Validated BEFORE the write, so a bad key never half-applies.
        const icon = readEntityIconField(form);
        if (!icon.ok) {
          return json({ ok: false, fieldErrors: { iconKey: icon.message } });
        }
        const colour = readIdentityColourField(form);
        if (!colour.ok) {
          return json({
            ok: false,
            fieldErrors: { colourSlot: colour.message },
          });
        }
        await templates.updateTemplate(templateId, {
          iconKey: icon.iconKey,
          colourSlot: colour.colourSlot,
        });
        return json({ ok: true });
      }
      case "delete": {
        await templates.deleteTemplate(templateId);
        return json({ ok: true });
      }
      case "addTask": {
        await templates.addTask(templateId, {
          title: String(form.get("title") ?? ""),
        });
        return json({ ok: true });
      }
      case "renameTask": {
        await templates.updateTask(
          templateId,
          String(form.get("taskId") ?? ""),
          { title: String(form.get("title") ?? "") },
        );
        return json({ ok: true });
      }
      case "setTaskPriority": {
        const raw = String(form.get("priority") ?? "");
        await templates.updateTask(
          templateId,
          String(form.get("taskId") ?? ""),
          { priority: raw.length === 0 ? null : (raw as never) },
        );
        return json({ ok: true });
      }
      case "deleteTask": {
        await templates.deleteTask(
          templateId,
          String(form.get("taskId") ?? ""),
        );
        return json({ ok: true });
      }
      case "reorderTasks": {
        await templates.reorderTasks(
          templateId,
          form.getAll("taskId").map(String),
        );
        return json({ ok: true });
      }
      case "addChecklistItem": {
        await templates.addChecklistItem(
          templateId,
          String(form.get("taskId") ?? ""),
          { title: String(form.get("title") ?? "") },
        );
        return json({ ok: true });
      }
      case "renameChecklistItem": {
        await templates.renameChecklistItem(
          templateId,
          String(form.get("itemId") ?? ""),
          String(form.get("title") ?? ""),
        );
        return json({ ok: true });
      }
      case "deleteChecklistItem": {
        await templates.deleteChecklistItem(
          templateId,
          String(form.get("itemId") ?? ""),
        );
        return json({ ok: true });
      }
      case "reorderChecklist": {
        await templates.reorderChecklist(
          templateId,
          String(form.get("taskId") ?? ""),
          form.getAll("itemId").map(String),
        );
        return json({ ok: true });
      }
      case "instantiate": {
        /*
         * The one intent that creates real work. The Project's title and its
         * Area/Goal come from the owner; everything else comes from the
         * template, and the repository writes it as ONE atomic batch.
         */
        const rawTitle = String(form.get("title") ?? "").trim();
        const result = await templates.instantiate(templateId, {
          title: rawTitle.length === 0 ? undefined : rawTitle,
          parentId: String(form.get("parentId") ?? "").trim(),
        });
        return json({ ok: true, projectId: result.projectId });
      }
      default:
        return json({ ok: false, formError: "Unknown action." }, 400);
    }
  } catch (cause) {
    return refusal(cause);
  }
}
