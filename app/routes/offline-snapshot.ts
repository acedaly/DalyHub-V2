/**
 * PWA-04 — the seven-day snapshot endpoint (`GET /offline/snapshot`).
 *
 * A shell-owned JSON resource route (it renders no shell of its own, like
 * `/search`, `/links` and `/capture/context`). It lives at the shell rather than
 * inside a module because the snapshot spans Tasks, Notes, Diary and Meetings —
 * a module route reading three other modules' data would breach the module import
 * boundary (`AGENTS.md §9.1`). It reads only through the workspace-scoped
 * repositories, so isolation is the same isolation every online loader gets.
 *
 * ── What leaves the server ───────────────────────────────────────────────────
 * The minimised `OfflineSnapshot` and nothing else. Specifically NOT: the
 * workspace id, the Access subject, any token or header, note/diary bodies in
 * full, Activity, EntityLink graphs, soft-delete metadata, or any field the
 * offline views do not render. The identity is represented ONLY by an opaque
 * namespace digest.
 *
 * The response is `private, no-store` (the Worker boundary enforces this anyway)
 * and is never cached by the service worker — the device's copy lives in
 * IndexedDB under a namespace key, which is the storage the offline policy is
 * actually written against.
 */

import { env } from "cloudflare:workers";

import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { buildOfflineSnapshot } from "~/platform/offline";
import {
  getDisplayIdentity,
  requireAuthenticatedSession,
} from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/offline-snapshot";

/**
 * The workspace's display label. DalyHub is single-workspace today and the
 * `workspaces` table deliberately holds no name (FND-03 keeps it a minimal
 * security record), so this is the product name rather than a fabricated one. It
 * is a LABEL, never the workspace id — the id must not reach a device.
 */
const WORKSPACE_LABEL = "DalyHub";

export async function loader({ context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const { email } = getDisplayIdentity(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  try {
    const preferences = await scope.appPreferences.get(session.user.subject);
    timezone = preferences.timezone;
  } catch {
    // The snapshot's window must still be computed in a sensible timezone if the
    // preference read fails; the deterministic default is correct and honest.
  }

  const snapshot = await buildOfflineSnapshot({
    scope,
    subject: session.user.subject,
    identityLabel: email,
    workspaceLabel: WORKSPACE_LABEL,
    timezone,
    now: new Date(),
  });

  return new Response(JSON.stringify(snapshot), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-dalyhub-authenticated": "1",
      "cache-control": "no-store",
    },
  });
}
