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
import {
  applyCaptureRelationship,
  compensateCapturedRecord,
  validateCaptureContextForCreate,
} from "~/platform/capture/capture-context.server";
import { readIdempotencyKey, withReplayGuard } from "~/platform/offline";
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
      readonly createdId?: string;
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

/** Create the note. Unchanged NOTES-01B behaviour, extracted so the PWA-05
 * replay guard can wrap it without touching how a note is created. */
async function handleCreate(
  scope: Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>,
  form: FormData,
): Promise<CreateNoteResult> {
  const title = String(form.get("title") ?? "");
  try {
    const captureContext = await validateCaptureContextForCreate(
      scope,
      "note",
      form.get("captureContext"),
    );
    const note = await scope.entities.create({ type: "note", title });
    try {
      await applyCaptureRelationship(scope, note.id, captureContext);
    } catch {
      const compensated = await compensateCapturedRecord(
        scope,
        note.id,
        "note",
      );
      return {
        ok: false,
        createdId: note.id,
        formError: compensated
          ? "The note couldn’t be linked to that context, so it was not kept. Try again from the record or create it without the context."
          : "The note was created but could not be linked to that context. Open the note and link it manually.",
      };
    }
    return { ok: true, noteId: note.id };
  } catch (cause) {
    if (cause instanceof EntityValidationError) {
      return { ok: false, fieldErrors: { title: cause.message } };
    }
    return {
      ok: false,
      formError: "That note couldn’t be created. Please try again.",
    };
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  // PWA-05 — a replayed offline capture carries the key it was queued with, so a
  // retry returns the already-created note instead of creating a second one.
  return json(
    await withReplayGuard(
      {
        db: env.DB,
        workspaceId: scope.context.workspaceId,
        ownerSubject: session.user.subject,
        kind: "note",
        now: new Date(),
      },
      readIdempotencyKey(form),
      () => handleCreate(scope, form),
      (result) => (result.ok ? result.noteId : null),
      (noteId) => ({ ok: true, noteId }),
      (reason) => ({ ok: false, formError: reason }),
    ),
  );
}
