/**
 * PROJ-01 — the project mutation endpoint (`POST /projects/:projectId/mutate`).
 *
 * An action-only resource route (no UI) — the trusted server boundary for the basic
 * project actions the spine already owns (rename, complete, reopen) and for creating
 * a task WITHIN the project. Same authenticated composition path as the other
 * routes; the workspace scope is trusted server config, never a client value.
 *
 * The `projectId` is verified to be a PROJECT in this workspace BEFORE dispatch, so a
 * task/goal/area id (or a cross-workspace id) can never reach `spine.complete`/
 * `rename` (which also act on Goals/Projects/Tasks) — it gets the calm not-found and
 * nothing is mutated. Every mutation goes through the `SpineRepository` (the single
 * completion + parentage authority); a new task binds its parent to THIS project
 * server-side (the client cannot substitute a different project id). Returns a real
 * JSON Response so the DS-06 forms/actions post with a plain `fetch`.
 */

import { env } from "cloudflare:workers";

import { SpineValidationError } from "~/kernel/spine";
import {
  ProjectArchiveBlockedError,
  ProjectSettingsValidationError,
  parseProjectWorkflowStatus,
} from "~/kernel/project-settings";
import {
  createLinkWithPolicy,
  unlinkWithPolicy,
  type EntityLinkPickerDeps,
  type EntityLinkPickerPolicy,
} from "~/platform/entity-links";
import {
  readEntityIconField,
  readIdentityColourField,
  requireAuthenticatedSession,
} from "~/platform/request";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
} from "~/platform/workspaces";

import {
  PROJECT_RELATES_TO,
  PROJECT_RELATE_TARGET_TYPES,
} from "../project-links";
import type { Route } from "./+types/mutate";

/*
 * A GET on this mutation endpoint renders DalyHub's error boundary rather
 * than React Router's internal error object and stack trace.
 */
import { actionOnlyLoader } from "~/platform/request";

export const loader = actionOnlyLoader;

/** The discriminated project-mutation outcomes the client consumes. */
export type ProjectMutationResult =
  | {
      readonly kind: "setIdentity";
      readonly ok: true;
      /** The slot that now applies — `null` when reset to Automatic. */
      readonly colourSlot: string | null;
      /** The key that now applies — `null` when reset to the entity default. */
      readonly iconKey: string | null;
    }
  | {
      readonly kind: "setIdentity";
      readonly ok: false;
      readonly formError: string;
    }
  | { readonly kind: "rename"; readonly ok: true }
  | {
      readonly kind: "rename";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "completion";
      readonly ok: true;
      readonly completed: boolean;
    }
  | {
      readonly kind: "completion";
      readonly ok: false;
      readonly message: string;
    }
  | { readonly kind: "create_task"; readonly ok: true; readonly taskId: string }
  | {
      readonly kind: "create_task";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | { readonly kind: "link"; readonly ok: boolean; readonly message?: string }
  | { readonly kind: "unlink"; readonly ok: boolean; readonly message?: string }
  | {
      readonly kind: "settings";
      readonly ok: boolean;
      readonly outcome:
        | "changed"
        | "unchanged"
        | "moved"
        | "archived"
        | "restored"
        | "blocked"
        | "archived_rejected"
        | "invalid";
      readonly message?: string;
    };

function pickerDeps(scope: WorkspaceScope): EntityLinkPickerDeps {
  return { entities: scope.entities, entityLinks: scope.entityLinks };
}

/** The trusted server policy for the project's "related records" picker. */
function relatesToPolicy(anchorId: string): EntityLinkPickerPolicy {
  return {
    anchorId,
    allowedDirections: ["outgoing"],
    linkTypes: [
      {
        type: PROJECT_RELATES_TO,
        allowedTargetTypes: [...PROJECT_RELATE_TARGET_TYPES],
      },
    ],
    multiple: true,
  };
}

function json(data: ProjectMutationResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const projectId = params.projectId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // Verify the id is a PROJECT in this workspace before dispatching, so a non-project
  // id can never be completed/renamed as a project. Non-projects get the calm 404.
  const project = await scope.spine.getById(projectId);
  if (!project || project.kind !== "project") {
    throw new Response("Not Found", { status: 404 });
  }

  const settings = await scope.projectSettings.get(projectId);
  if (!settings) throw new Response("Not Found", { status: 404 });
  if (settings.archivedAt && intent !== "restore" && intent !== "archive") {
    return json({
      kind: "settings",
      ok: false,
      outcome: "archived_rejected",
      message: "Archived projects can only be restored.",
    });
  }

  switch (intent) {
    case "rename":
      return json(await handleRename(scope, projectId, form));
    case "complete":
    case "reopen":
      return json(await handleCompletion(scope, projectId, intent));
    case "create_task":
      return json(await handleCreateTask(scope, projectId, form));
    case "link":
      return json(await handleLink(scope, projectId, form));
    case "unlink":
      return json(await handleUnlink(scope, projectId, form));
    case "set_status":
      return json(
        await handleStatus(scope, projectId, String(form.get("status") ?? "")),
      );
    case "move":
      return json(
        await handleMove(scope, projectId, String(form.get("parentId") ?? "")),
      );
    case "set_identity":
      return json(await handleSetIdentity(scope, projectId, form));
    case "archive":
      return json(await handleArchive(scope, projectId));
    case "restore":
      return json(await handleRestore(scope, projectId));
    default:
      return json(
        { kind: "rename", ok: false, formError: "Unknown action." },
        400,
      );
  }
}

/**
 * Choose or clear the Project's IDENTITY — its icon and its colour.
 *
 * No archived guard of its own: the dispatcher above already refuses every
 * non-restore intent on an archived Project, and `set_identity` is deliberately
 * routed through that same gate rather than carrying a second, divergent copy
 * of the rule.
 *
 * A key this build does not recognise is REFUSED rather than quietly stored as
 * "no icon", so an owner whose choice cannot be honoured is told, instead of
 * being shown a success message and then a default glyph.
 */
async function handleSetIdentity(
  scope: WorkspaceScope,
  projectId: string,
  form: FormData,
): Promise<ProjectMutationResult> {
  const icon = readEntityIconField(form);
  if (!icon.ok) {
    return { kind: "setIdentity", ok: false, formError: icon.message };
  }
  const colour = readIdentityColourField(form);
  if (!colour.ok) {
    return { kind: "setIdentity", ok: false, formError: colour.message };
  }
  try {
    // IDENTITY-01 — one write for both fields. The owner picks them together
    // and applies them once, so two writes would let a half-applied identity
    // exist and give one optimistic update two failures to reconcile.
    const updated = await scope.projectSettings.setIdentity(projectId, {
      iconKey: icon.iconKey,
      colourSlot: colour.colourSlot,
    });
    return {
      kind: "setIdentity",
      ok: true,
      iconKey: updated.iconKey,
      colourSlot: updated.colourSlot,
    };
  } catch {
    return {
      kind: "setIdentity",
      ok: false,
      formError: "That couldn’t be saved. Please try again.",
    };
  }
}

async function handleRename(
  scope: WorkspaceScope,
  projectId: string,
  form: FormData,
): Promise<ProjectMutationResult> {
  try {
    await scope.spine.rename(projectId, String(form.get("title") ?? ""));
    return { kind: "rename", ok: true };
  } catch (cause) {
    if (cause instanceof SpineValidationError) {
      return {
        kind: "rename",
        ok: false,
        fieldErrors: { title: cause.message },
      };
    }
    return {
      kind: "rename",
      ok: false,
      formError: "That couldn’t be saved. Please try again.",
    };
  }
}

async function handleCompletion(
  scope: WorkspaceScope,
  projectId: string,
  intent: "complete" | "reopen",
): Promise<ProjectMutationResult> {
  try {
    if (intent === "complete") {
      // Completing the project does NOT complete or alter its tasks (the spine never
      // cascades completion, ADR-014); its roll-up simply reflects the tasks' own
      // states.
      await scope.spine.complete(projectId);
      return { kind: "completion", ok: true, completed: true };
    }
    // Reopening the project does NOT alter its tasks either.
    await scope.spine.reopen(projectId);
    return { kind: "completion", ok: true, completed: false };
  } catch {
    return {
      kind: "completion",
      ok: false,
      message: "That couldn’t be saved. Please try again.",
    };
  }
}

async function handleCreateTask(
  scope: WorkspaceScope,
  projectId: string,
  form: FormData,
): Promise<ProjectMutationResult> {
  try {
    // The parent is bound to THIS project server-side — the client cannot substitute
    // a different project id (it never sends one; only the title).
    const task = await scope.spine.createTask({
      title: String(form.get("title") ?? ""),
      parent: { kind: "project", id: projectId },
    });
    return { kind: "create_task", ok: true, taskId: task.id };
  } catch (cause) {
    if (cause instanceof SpineValidationError) {
      return {
        kind: "create_task",
        ok: false,
        fieldErrors: { title: cause.message },
      };
    }
    return {
      kind: "create_task",
      ok: false,
      formError: "That task couldn’t be created. Please try again.",
    };
  }
}

async function handleLink(
  scope: WorkspaceScope,
  projectId: string,
  form: FormData,
): Promise<ProjectMutationResult> {
  const result = await createLinkWithPolicy(
    pickerDeps(scope),
    relatesToPolicy(projectId),
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
  projectId: string,
  form: FormData,
): Promise<ProjectMutationResult> {
  const result = await unlinkWithPolicy(
    pickerDeps(scope),
    relatesToPolicy(projectId),
    String(form.get("linkId") ?? ""),
  );
  return result.ok
    ? { kind: "unlink", ok: true }
    : { kind: "unlink", ok: false, message: result.message };
}

async function handleStatus(
  scope: WorkspaceScope,
  id: string,
  value: string,
): Promise<ProjectMutationResult> {
  try {
    const result = await scope.projectSettings.setStatus(
      id,
      parseProjectWorkflowStatus(value),
    );
    return {
      kind: "settings",
      ok: true,
      outcome: result.changed ? "changed" : "unchanged",
    };
  } catch (cause) {
    return {
      kind: "settings",
      ok: false,
      outcome: "invalid",
      message:
        cause instanceof ProjectSettingsValidationError
          ? cause.message
          : "That couldn’t be saved. Please try again.",
    };
  }
}
async function handleMove(
  scope: WorkspaceScope,
  id: string,
  parentId: string,
): Promise<ProjectMutationResult> {
  const parent = await scope.spine.getById(parentId);
  if (!parent || (parent.kind !== "area" && parent.kind !== "goal"))
    return {
      kind: "settings",
      ok: false,
      outcome: "invalid",
      message: "Choose an available Area or Goal.",
    };
  try {
    const result = await scope.spine.move(id, {
      kind: parent.kind,
      id: parent.id,
    });
    return {
      kind: "settings",
      ok: true,
      outcome: result.changed ? "moved" : "unchanged",
    };
  } catch {
    return {
      kind: "settings",
      ok: false,
      outcome: "invalid",
      message: "That couldn’t be saved. Please try again.",
    };
  }
}
async function handleArchive(
  scope: WorkspaceScope,
  id: string,
): Promise<ProjectMutationResult> {
  try {
    const result = await scope.projectSettings.archive(id);
    return {
      kind: "settings",
      ok: true,
      outcome: result.changed ? "archived" : "unchanged",
    };
  } catch (cause) {
    return {
      kind: "settings",
      ok: false,
      outcome:
        cause instanceof ProjectArchiveBlockedError ? "blocked" : "invalid",
      message:
        cause instanceof ProjectArchiveBlockedError
          ? cause.message
          : "That couldn’t be saved. Please try again.",
    };
  }
}
async function handleRestore(
  scope: WorkspaceScope,
  id: string,
): Promise<ProjectMutationResult> {
  try {
    const result = await scope.projectSettings.restore(id);
    return {
      kind: "settings",
      ok: true,
      outcome: result.changed ? "restored" : "unchanged",
    };
  } catch {
    return {
      kind: "settings",
      ok: false,
      outcome: "invalid",
      message: "That couldn’t be saved. Please try again.",
    };
  }
}
