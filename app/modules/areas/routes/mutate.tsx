/**
 * AREA-01 / AREA-05 — Area mutation endpoint (`POST /areas/:areaId/mutate`).
 *
 * The single trusted server action for every Area mutation. AREA-01 shipped
 * `rename`; AREA-05 adds the lifecycle intents `archive`, `restore` and the
 * irreversible `delete`. Each intent resolves the workspace and actor server-side
 * (no client-supplied workspace/actor), verifies the id is an Area in this
 * workspace, and returns a typed JSON outcome. Non-lifecycle mutations (rename)
 * are refused while the Area is archived — an archived Area is read-only until
 * restored. Permanent deletion is delegated to `SpineRepository.permanentlyDelete
 * Area`, whose atomic guard re-checks emptiness at commit; a blocked delete comes
 * back as a structured `blocked` outcome, never a leaked D1 error.
 */

import { env } from "cloudflare:workers";

import { SpineHasDependentsError, SpineValidationError } from "~/kernel/spine";
import { AreaArchivedError } from "~/kernel/area-settings";
import {
  readEntityIconField,
  requireAuthenticatedSession,
} from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/mutate";

export type AreaMutationResult =
  | { readonly kind: "rename"; readonly ok: true }
  | {
      readonly kind: "rename";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | { readonly kind: "archive"; readonly ok: true }
  | { readonly kind: "archive"; readonly ok: false; readonly formError: string }
  | { readonly kind: "restore"; readonly ok: true }
  | { readonly kind: "restore"; readonly ok: false; readonly formError: string }
  | { readonly kind: "delete"; readonly ok: true }
  | {
      readonly kind: "delete";
      readonly ok: false;
      readonly blocked: boolean;
      readonly formError: string;
    }
  | {
      readonly kind: "setIcon";
      readonly ok: true;
      /** The key that now applies — `null` when reset to the entity default. */
      readonly iconKey: string | null;
    }
  | {
      readonly kind: "setIcon";
      readonly ok: false;
      readonly formError: string;
    };

function json(data: AreaMutationResult, status = 200): Response {
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
  const areaId = params.areaId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const area = await scope.spine.getById(areaId);
  if (!area || area.kind !== "area") {
    throw new Response("Not Found", { status: 404 });
  }

  switch (intent) {
    case "rename":
      return handleRename(scope, areaId, form);
    case "archive":
      return handleArchive(scope, areaId);
    case "restore":
      return handleRestore(scope, areaId);
    case "delete":
      return handleDelete(scope, areaId);
    case "setIcon":
      return handleSetIcon(scope, areaId, form);
    default:
      return json(
        { kind: "rename", ok: false, formError: "Unknown action." },
        400,
      );
  }
}

type Scope = Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>;

async function handleRename(
  scope: Scope,
  areaId: string,
  form: FormData,
): Promise<Response> {
  // An archived Area is read-only: guard the non-lifecycle mutation server-side,
  // not only by hiding the UI control (never trust the client — AGENTS.md §17).
  const settings = await scope.areaSettings.get(areaId);
  if (settings?.archivedAt) {
    return json({
      kind: "rename",
      ok: false,
      formError:
        "This Area is archived and read-only. Restore it to rename it.",
    });
  }
  try {
    await scope.spine.rename(areaId, String(form.get("title") ?? ""));
    return json({ kind: "rename", ok: true });
  } catch (cause) {
    if (cause instanceof SpineValidationError) {
      return json({
        kind: "rename",
        ok: false,
        fieldErrors: { title: cause.message },
      });
    }
    return json({
      kind: "rename",
      ok: false,
      formError: "That couldn’t be saved. Please try again.",
    });
  }
}

async function handleArchive(scope: Scope, areaId: string): Promise<Response> {
  try {
    await scope.areaSettings.archive(areaId);
    return json({ kind: "archive", ok: true });
  } catch {
    return json({
      kind: "archive",
      ok: false,
      formError: "That couldn’t be saved. Please try again.",
    });
  }
}

async function handleRestore(scope: Scope, areaId: string): Promise<Response> {
  try {
    await scope.areaSettings.restore(areaId);
    return json({ kind: "restore", ok: true });
  } catch {
    return json({
      kind: "restore",
      ok: false,
      formError: "That couldn’t be saved. Please try again.",
    });
  }
}

/**
 * Choose or clear the Area's icon.
 *
 * Guarded like `rename` rather than like `archive`: it is a non-lifecycle
 * mutation, so an archived Area refuses it server-side and not merely by hiding
 * the control (AGENTS.md §17 — never trust the client).
 *
 * A key this build does not recognise is REFUSED, never quietly stored as
 * "no icon". `readEntityIconField` draws that line; the point is that an owner
 * whose choice cannot be honoured is told so, instead of being shown a success
 * message and then a default glyph.
 */
async function handleSetIcon(
  scope: Scope,
  areaId: string,
  form: FormData,
): Promise<Response> {
  const settings = await scope.areaSettings.get(areaId);
  if (settings?.archivedAt) {
    return json({
      kind: "setIcon",
      ok: false,
      formError:
        "This Area is archived and read-only. Restore it to change its icon.",
    });
  }

  const icon = readEntityIconField(form);
  if (!icon.ok) {
    return json({ kind: "setIcon", ok: false, formError: icon.message });
  }

  try {
    const updated = await scope.areaSettings.setIcon(areaId, icon.iconKey);
    return json({ kind: "setIcon", ok: true, iconKey: updated.iconKey });
  } catch {
    return json({
      kind: "setIcon",
      ok: false,
      formError: "That couldn’t be saved. Please try again.",
    });
  }
}

async function handleDelete(scope: Scope, areaId: string): Promise<Response> {
  try {
    await scope.spine.permanentlyDeleteArea(areaId);
    return json({ kind: "delete", ok: true });
  } catch (cause) {
    if (cause instanceof SpineHasDependentsError) {
      return json({
        kind: "delete",
        ok: false,
        blocked: true,
        formError:
          "This Area still has records. Move, archive or delete them first, then try again.",
      });
    }
    if (cause instanceof AreaArchivedError) {
      // Defensive: never reached today (delete is allowed on archived Areas), but
      // keeps the mapping exhaustive if the guard tightens.
      return json({
        kind: "delete",
        ok: false,
        blocked: true,
        formError: "Restore this Area before deleting it.",
      });
    }
    return json({
      kind: "delete",
      ok: false,
      blocked: false,
      formError: "That couldn’t be completed. Please try again.",
    });
  }
}
