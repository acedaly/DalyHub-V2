/**
 * V2.13 RPT-04 — the `/reports/saved` resource route: every saved-report
 * mutation.
 *
 * A resource route (no component) so the page's fetchers receive the action's
 * JSON directly, mirroring `/views/saved` and `/tasks/views`.
 *
 * What crosses this boundary is a URL QUERY STRING, never a query: the client
 * sends the definition it is currently looking at, exactly as it appears in the
 * address bar, and the server decodes it through the SAME total codec the
 * loader uses. A client therefore cannot store a source, a measure, a grain, a
 * group or a filter the kernel does not already understand — and unlike a
 * cross-module view, anything unrecognised is REFUSED rather than dropped,
 * because dropping a filter would store a broader question than the owner
 * asked (ADR-121 decision 1).
 *
 * Ownership is never taken from the request: the owner is the authenticated
 * session's subject and the workspace is the resolved scope, so a report cannot
 * be created for, read from or deleted from another owner or workspace.
 */

import { env } from "cloudflare:workers";

import { isBuiltInReportId } from "~/kernel/reports";
import {
  SavedViewLimitError,
  SavedViewNameTakenError,
  SavedViewNotFoundError,
  SavedViewValidationError,
} from "~/kernel/views";
import {
  actionOnlyLoader,
  requireAuthenticatedSession,
} from "~/platform/request";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
} from "~/platform/workspaces";

import { definitionFromParams } from "../reports-url-state";
import type { Route } from "./+types/saved";

/*
 * A GET on this mutation endpoint renders DalyHub's error boundary rather than
 * React Router's internal error object and stack trace.
 */
export const loader = actionOnlyLoader;

/** What a saved-report mutation answers with. */
export interface ReportsSavedResult {
  readonly kind: "report";
  readonly ok: boolean;
  readonly reportId?: string | null;
  readonly message?: string;
  readonly formError?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function ok(reportId: string | null, message: string): ReportsSavedResult {
  return { kind: "report", ok: true, reportId, message };
}

function fail(message: string): ReportsSavedResult {
  return { kind: "report", ok: false, formError: message };
}

/**
 * Decode the submitted query string into a definition.
 *
 * A bounded parse: an absurd query string is truncated by the `URLSearchParams`
 * decode and then reduced to known keys, so it can never become a large write.
 */
function definitionFromForm(form: FormData) {
  const query = String(form.get("query") ?? "");
  return definitionFromParams(new URLSearchParams(query.slice(0, 4096)));
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
    if (cause instanceof SavedViewValidationError) {
      return json(fail(cause.message), 400);
    }
    if (cause instanceof SavedViewNameTakenError) {
      return json(fail(cause.message), 400);
    }
    if (cause instanceof SavedViewLimitError)
      return json(fail(cause.message), 400);
    if (cause instanceof SavedViewNotFoundError) {
      return json(fail("That report is no longer available."), 400);
    }
    return json(
      fail("That report couldn’t be saved. Nothing was changed — try again."),
      500,
    );
  }
}

async function dispatch(
  scope: WorkspaceScope,
  ownerId: string,
  intent: string,
  form: FormData,
): Promise<ReportsSavedResult> {
  const reportId = String(form.get("reportId") ?? "");

  switch (intent) {
    case "create": {
      const definition = definitionFromForm(form);
      if (!definition.ok) {
        return fail(
          "That question could not be understood, so nothing was saved.",
        );
      }
      const view = await scope.reports.create(ownerId, {
        name: String(form.get("name") ?? ""),
        config: definition,
      });
      return ok(view.id, `Saved “${view.name}”.`);
    }
    case "update": {
      // A BUILT-IN is derived, not stored: there is nothing to update, and
      // pretending otherwise would let it silently drift for every future
      // opening.
      if (isBuiltInReportId(reportId)) {
        return fail(
          "Built-in reports can’t be changed. Save this as a new report instead.",
        );
      }
      const definition = definitionFromForm(form);
      if (!definition.ok) {
        return fail(
          "That question could not be understood, so nothing was changed.",
        );
      }
      const result = await scope.reports.update(ownerId, reportId, {
        config: definition,
      });
      return ok(
        result.view.id,
        result.changed
          ? `Updated “${result.view.name}”.`
          : `“${result.view.name}” already asked exactly this.`,
      );
    }
    case "rename": {
      if (isBuiltInReportId(reportId)) {
        return fail("Built-in reports can’t be renamed.");
      }
      /*
       * A rename re-serialises whatever the row currently holds, so a
       * definition this build cannot read would be rewritten by a name change.
       * The definition is preserved verbatim by the codec, and this refuses
       * anyway: a report whose question we cannot read is a report we do not
       * touch at all.
       */
      const current = await scope.reports.get(ownerId, reportId);
      if (!current) return fail("That report is no longer available.");
      if (!current.config.ok) {
        return fail(
          "This report was saved by a different version of DalyHub, so it can’t be renamed here. Its definition has been left exactly as it is.",
        );
      }
      const result = await scope.reports.update(ownerId, reportId, {
        name: String(form.get("name") ?? ""),
      });
      return ok(result.view.id, `Renamed to “${result.view.name}”.`);
    }
    case "duplicate": {
      if (isBuiltInReportId(reportId)) {
        return fail(
          "Open the built-in report, then use “Save as a new report” to make it your own.",
        );
      }
      const view = await scope.reports.duplicate(
        ownerId,
        reportId,
        String(form.get("name") ?? ""),
      );
      return ok(view.id, `Duplicated as “${view.name}”.`);
    }
    case "delete": {
      if (isBuiltInReportId(reportId)) {
        return fail("Built-in reports can’t be deleted.");
      }
      const removed = await scope.reports.remove(ownerId, reportId);
      return ok(
        null,
        removed ? "Report deleted." : "That report was already deleted.",
      );
    }
    default:
      return fail("Unknown report action.");
  }
}
