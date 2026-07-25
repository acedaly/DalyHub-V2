/**
 * DIARY-01 — the single-entry read endpoint (`GET /diary/:entryId`).
 *
 * A resource route (no default export/UI): the trusted server boundary the
 * route-backed editor Drawer fetches to populate its form, including on a deep
 * link to `/diary?drawer=edit:<id>` where the entry may not be on the loaded
 * Timeline page. Fails CLOSED — a missing, soft-deleted, wrong-type or
 * cross-workspace id all return the same calm 404 (the `DiaryRepository.get`
 * contract never distinguishes them, disclosing nothing about ids the caller
 * may not see).
 *
 * The entry's occurred instant is returned BOTH as the stored UTC ISO string and
 * as the owner-local wall-clock the editor's `datetime-local` control edits, so
 * the client never re-derives the display zone. Body content is the EXACT stored
 * Markdown source.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { DIARY_DISPLAY_TIME_ZONE, utcToOwnerLocal } from "../occurred-time";
import type { Route } from "./+types/entry";

/** The entry payload the editor Drawer reads. */
export type DiaryEntryEditData = {
  readonly id: string;
  readonly title: string;
  readonly entryType: string;
  readonly bodySource: string;
  readonly occurredAtIso: string;
  /** The occurred instant as an owner-local `YYYY-MM-DDTHH:MM` wall-clock. */
  readonly occurredLocal: string;
  readonly timezone: string;
};

export type DiaryEntryEditResponse = { readonly entry: DiaryEntryEditData };

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const entry = await scope.diary.get(params.entryId);
  if (!entry) {
    throw new Response("Not Found", { status: 404 });
  }

  const payload: DiaryEntryEditResponse = {
    entry: {
      id: entry.id,
      title: entry.title,
      entryType: entry.entryType,
      bodySource: entry.body ?? "",
      occurredAtIso: entry.occurredAt.toISOString(),
      occurredLocal: utcToOwnerLocal(entry.occurredAt, DIARY_DISPLAY_TIME_ZONE),
      timezone: entry.timezone,
    },
  };
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
