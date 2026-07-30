/**
 * MOBILE-01 — the shared Quick Capture context endpoint (`GET /capture/context`).
 *
 * A shell-owned JSON resource route (it renders no shell of its own, like
 * `/search`, `/commands` and `/links`) that serves the small amount of trusted,
 * owner-scoped context the shared capture sheet needs before it can show a
 * minimum-viable form:
 *
 *   - `timezone` — so a captured Meeting's default start is the OWNER's next
 *     quarter hour, not the travelling phone's;
 *   - `todayIso` — so a captured Diary entry says which day it lands on;
 *   - `defaultTaskParent` — the explicit chosen Task destination, re-validated
 *     server-side. Null means the title+Enter fast path creates an Inbox Task.
 *
 * It lives at the shell rather than inside Tasks because the capture sheet is a
 * SHELL surface serving four modules; a module route serving another module's
 * capture context would breach the module import boundary (AGENTS.md §9.1).
 * Nothing here is authoritative: every value is a convenience default that the
 * module's own creation route re-derives and re-verifies from trusted state.
 *
 * A preference-read failure degrades to the deterministic application defaults so
 * capture stays available — it never fails the sheet.
 */

import { env } from "cloudflare:workers";

import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

import type { Route } from "./+types/capture-context";

/** The trusted capture context the shared sheet consumes. */
export type CaptureContextPayload = {
  readonly timezone: string;
  readonly todayIso: string;
  readonly defaultTaskParent: {
    readonly id: string;
    readonly kind: "area" | "project";
    readonly title: string;
  } | null;
};

export async function loader({ context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);

  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  let defaultTaskParent: CaptureContextPayload["defaultTaskParent"] = null;

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const preferences = await scope.appPreferences.get(session.user.subject);
    timezone = preferences.timezone;
    if (
      preferences.defaultTaskDestination === "chosen_parent" &&
      preferences.defaultTaskCaptureParentId
    ) {
      // Re-verified server-side on every read: a parent that has since been
      // archived or deleted must not be offered as a silent capture target.
      const parent = await scope.tasks.getTaskParentCandidate(
        preferences.defaultTaskCaptureParentId,
      );
      if (parent) {
        defaultTaskParent = {
          id: parent.id,
          kind: parent.kind,
          title: parent.title,
        };
      }
    }
  } catch {
    // Capture must stay reachable even when the preference read fails; the sheet
    // simply asks for a parent explicitly.
  }

  const payload: CaptureContextPayload = {
    timezone,
    todayIso: ownerCalendarIso(new Date(), timezone),
    defaultTaskParent,
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
