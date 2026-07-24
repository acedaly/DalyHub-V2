/**
 * NOTES-01B — the create-note endpoint (`POST /notes/new`).
 *
 * An action-only resource route (no UI) — the trusted server boundary for
 * creating a Note. Uses the SAME authenticated composition path the kernel
 * tests cover: the Worker boundary authenticates before this runs,
 * `requireAuthenticatedSession` re-checks and fails 401, and the workspace
 * scope is resolved from TRUSTED server config
 * (`resolveAuthenticatedWorkspaceScope`) — the client never supplies a
 * workspace id (ADR-010/ADR-016 §5.6).
 *
 * Creation goes through the generic `EntityRepository.create` — `note` is not
 * a reserved spine entity type, so nothing else is involved. Creation
 * requires only a title; NOTES-01A established that no `note_details` row is
 * written to represent an empty body, so this route never touches
 * `noteDetails`. Returns a real JSON Response so the DS-06 form posts with a
 * plain `fetch` (mirrors `app/modules/projects/routes/new.tsx`, minus the
 * parent resolution Notes don't have).
 */

import { env } from "cloudflare:workers";

import { EntityValidationError } from "~/kernel/entities";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/new";

/** The discriminated create-note outcome the form consumes. */
export type CreateNoteResult =
  | { readonly ok: true; readonly noteId: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

function json(data: CreateNoteResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();
  const title = String(form.get("title") ?? "");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  try {
    const note = await scope.entities.create({ type: "note", title });
    return json({ ok: true, noteId: note.id });
  } catch (cause) {
    if (cause instanceof EntityValidationError) {
      return json({ ok: false, fieldErrors: { title: cause.message } });
    }
    return json({
      ok: false,
      formError: "That note couldn't be created. Please try again.",
    });
  }
}
