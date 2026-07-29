/**
 * TASKS-03 — the `/tasks/views` resource route: every saved-view mutation.
 *
 * A resource route (no component) so the switcher's fetchers receive the action's
 * JSON directly, mirroring `/tasks/new` and `/tasks/bulk`.
 *
 * What crosses this boundary is a URL QUERY STRING, never a query: the client sends
 * the configuration it is currently looking at, exactly as it appears in the address
 * bar, and the server decodes it through the SAME validated codec the loader uses.
 * A client therefore cannot store a filter dimension, a sort expression, a column or
 * an operator the kernel does not already understand — anything unrecognised is
 * dropped before it reaches storage.
 *
 * Ownership is never taken from the request: the owner is the authenticated
 * session's subject and the workspace is the resolved scope, so a saved view cannot
 * be created for, read from or deleted from another owner or workspace.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
} from "~/platform/workspaces";
import {
  isTaskSystemViewId,
  TaskViewLimitError,
  TaskViewNameTakenError,
  TaskViewNotFoundError,
  TaskViewValidationError,
} from "~/kernel/task-views";
import { AppPreferencesValidationError } from "~/kernel/preferences";

import { configFromParams } from "../tasks-url-state";
import type { TasksViewResult } from "../tasks-contract";
import type { Route } from "./+types/views";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function ok(viewId: string | null, message: string): TasksViewResult {
  return { kind: "view", ok: true, viewId, message };
}

function fail(message: string): TasksViewResult {
  return { kind: "view", ok: false, formError: message };
}

/**
 * Decode the submitted query string into a validated configuration. The client
 * sends what its address bar holds; the server never trusts it as a query.
 */
function configFromForm(form: FormData) {
  const query = String(form.get("query") ?? "");
  // A bounded parse: an absurd query string is truncated by the URLSearchParams
  // decode and then reduced to known keys, so it can never become a large write.
  return configFromParams(new URLSearchParams(query.slice(0, 4096)));
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  try {
    return json(await dispatch(scope, session.user.subject, intent, form));
  } catch (cause) {
    if (cause instanceof TaskViewValidationError) {
      return json(fail(cause.message), 400);
    }
    if (cause instanceof TaskViewNameTakenError) {
      return json(fail(cause.message), 400);
    }
    if (cause instanceof TaskViewLimitError) {
      return json(fail(cause.message), 400);
    }
    if (cause instanceof TaskViewNotFoundError) {
      return json(fail("That view is no longer available."), 400);
    }
    if (cause instanceof AppPreferencesValidationError) {
      return json(fail(cause.message), 400);
    }
    return json(
      fail("That view couldn’t be saved. Nothing was changed — try again."),
      500,
    );
  }
}

async function dispatch(
  scope: WorkspaceScope,
  ownerId: string,
  intent: string,
  form: FormData,
): Promise<TasksViewResult> {
  const viewId = String(form.get("viewId") ?? "");

  switch (intent) {
    case "create": {
      const view = await scope.taskViews.create(ownerId, {
        name: String(form.get("name") ?? ""),
        config: configFromForm(form),
      });
      return ok(view.id, `Saved “${view.name}”.`);
    }
    case "update": {
      // A SYSTEM view is derived, not stored: there is nothing to update, and
      // pretending otherwise would let a built-in view silently drift.
      if (isTaskSystemViewId(viewId)) {
        return fail(
          "Built-in views can’t be changed. Save this as a new view instead.",
        );
      }
      const result = await scope.taskViews.update(ownerId, viewId, {
        config: configFromForm(form),
      });
      return ok(
        result.view.id,
        result.changed
          ? `Updated “${result.view.name}”.`
          : `“${result.view.name}” already matched this configuration.`,
      );
    }
    case "rename": {
      if (isTaskSystemViewId(viewId)) {
        return fail("Built-in views can’t be renamed.");
      }
      const result = await scope.taskViews.update(ownerId, viewId, {
        name: String(form.get("name") ?? ""),
      });
      return ok(result.view.id, `Renamed to “${result.view.name}”.`);
    }
    case "duplicate": {
      // Duplicating a BUILT-IN view is legitimate and useful — it is how a user
      // starts from "Overdue" and makes it their own — so it copies the derived
      // configuration into a new, ordinary, editable saved view.
      if (isTaskSystemViewId(viewId)) {
        return fail(
          "Open the built-in view, then use “Save as new view” to make it your own.",
        );
      }
      const view = await scope.taskViews.duplicate(
        ownerId,
        viewId,
        String(form.get("name") ?? ""),
      );
      return ok(view.id, `Duplicated as “${view.name}”.`);
    }
    case "delete": {
      if (isTaskSystemViewId(viewId)) {
        return fail("Built-in views can’t be deleted.");
      }
      const removed = await scope.taskViews.remove(ownerId, viewId);
      // Clearing a deleted view's default is part of the same user intent: leaving
      // the preference pointing at a view that no longer exists is a trap.
      const preferences = await scope.appPreferences.get(ownerId);
      if (preferences.defaultTaskViewId === viewId) {
        await scope.appPreferences.update(ownerId, { defaultTaskViewId: null });
      }
      return ok(
        null,
        removed ? "View deleted." : "That view was already deleted.",
      );
    }
    case "set_default": {
      // The default may name a BUILT-IN view or a saved one; an empty value clears
      // it. Existence is re-verified here so a stale id is never stored.
      if (viewId.length === 0) {
        await scope.appPreferences.update(ownerId, { defaultTaskViewId: null });
        return ok(null, "Default Tasks view cleared.");
      }
      if (!isTaskSystemViewId(viewId)) {
        const own = await scope.taskViews.get(ownerId, viewId);
        if (!own) throw new TaskViewNotFoundError();
      }
      await scope.appPreferences.update(ownerId, { defaultTaskViewId: viewId });
      return ok(viewId, "Default Tasks view set.");
    }
    default:
      return fail("Unknown view action.");
  }
}
