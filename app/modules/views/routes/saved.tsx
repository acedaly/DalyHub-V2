/**
 * X-02 — the `/views/saved` resource route: every cross-module saved-view mutation.
 *
 * A resource route (no component) so the switcher's fetchers receive the action's
 * JSON directly, mirroring `/tasks/views`.
 *
 * What crosses this boundary is a URL QUERY STRING, never a query: the client sends
 * the configuration it is currently looking at, exactly as it appears in the address
 * bar, and the server decodes it through the SAME validated codec the loader uses.
 * A client therefore cannot store a scope, a filter dimension, a sort expression, a
 * column or an operator the kernel does not already understand — anything
 * unrecognised is dropped before it reaches storage.
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
  isCrossViewSystemViewId,
  SavedViewLimitError,
  SavedViewNameTakenError,
  SavedViewNotFoundError,
  SavedViewValidationError,
} from "~/kernel/views";

import { configFromParams } from "../views-url-state";
import type { ViewsSavedResult } from "../views-contract";
import type { Route } from "./+types/saved";

/*
 * A GET on this mutation endpoint renders DalyHub's error boundary rather
 * than React Router's internal error object and stack trace.
 */
import { actionOnlyLoader } from "~/platform/request";

export const loader = actionOnlyLoader;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function ok(viewId: string | null, message: string): ViewsSavedResult {
  return { kind: "view", ok: true, viewId, message };
}

function fail(message: string): ViewsSavedResult {
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
    if (cause instanceof SavedViewValidationError)
      return json(fail(cause.message), 400);
    if (cause instanceof SavedViewNameTakenError)
      return json(fail(cause.message), 400);
    if (cause instanceof SavedViewLimitError)
      return json(fail(cause.message), 400);
    if (cause instanceof SavedViewNotFoundError) {
      return json(fail("That view is no longer available."), 400);
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
): Promise<ViewsSavedResult> {
  const viewId = String(form.get("viewId") ?? "");

  switch (intent) {
    case "create": {
      const view = await scope.crossViews.create(ownerId, {
        name: String(form.get("name") ?? ""),
        config: configFromForm(form),
      });
      return ok(view.id, `Saved “${view.name}”.`);
    }
    case "update": {
      // A BUILT-IN view is derived, not stored: there is nothing to update, and
      // pretending otherwise would let it silently drift.
      if (isCrossViewSystemViewId(viewId)) {
        return fail(
          "Built-in views can’t be changed. Save this as a new view instead.",
        );
      }
      const result = await scope.crossViews.update(ownerId, viewId, {
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
      if (isCrossViewSystemViewId(viewId)) {
        return fail("Built-in views can’t be renamed.");
      }
      const result = await scope.crossViews.update(ownerId, viewId, {
        name: String(form.get("name") ?? ""),
      });
      return ok(result.view.id, `Renamed to “${result.view.name}”.`);
    }
    case "duplicate": {
      if (isCrossViewSystemViewId(viewId)) {
        return fail(
          "Open the built-in view, then use “Save as new view” to make it your own.",
        );
      }
      const view = await scope.crossViews.duplicate(
        ownerId,
        viewId,
        String(form.get("name") ?? ""),
      );
      return ok(view.id, `Duplicated as “${view.name}”.`);
    }
    case "delete": {
      if (isCrossViewSystemViewId(viewId)) {
        return fail("Built-in views can’t be deleted.");
      }
      const removed = await scope.crossViews.remove(ownerId, viewId);
      return ok(
        null,
        removed ? "View deleted." : "That view was already deleted.",
      );
    }
    default:
      return fail("Unknown view action.");
  }
}
