/**
 * NOTES-01B/NOTES-01C — Note mutation endpoint (`POST /notes/:noteId/mutate`).
 *
 * An action-only resource route (no UI). `rename` and `update_content` verify
 * the `noteId` is an ACTIVE NOTE in this workspace BEFORE any dispatch, so a
 * task/project/area/goal id (or a cross-workspace id, OR A DELETED NOTE) can
 * never reach `entities.update`/`noteDetails.update` through this endpoint —
 * it gets the calm not-found and nothing is mutated (mirrors
 * `~/modules/goals/routes/mutate.tsx`'s `spine.getById` guard, using the
 * generic `entities.getById` since Notes are not a spine type). A deleted Note
 * is therefore never editable through its active canonical route.
 *
 * `delete`/`restore` (NOTES-01C) use their OWN anchor check with
 * `includeDeleted: true` — restore must be able to find an already-deleted
 * Note, and a repeated delete/restore must stay the idempotent no-op the
 * underlying `EntityRepository.softDelete`/`.restore` already guarantees, so
 * this endpoint never turns a repeat call into a spurious 404. Notes use the
 * generic, kernel-owned lifecycle directly — no second Notes-specific
 * deletion column or model (see NOTES_PERSISTENCE.md / ADR-042).
 *
 * Title goes through the generic `EntityRepository` (the single authority for
 * identity/title/lifecycle); Markdown content goes through the Note-owned
 * `noteDetails` repository, atomic with its own `note.content_updated`
 * Activity event. Returns a real JSON Response so the DS-06 forms post with a
 * plain `fetch`.
 */

import { env } from "cloudflare:workers";

import { EntityValidationError } from "~/kernel/entities";
import { NoteDetailsValidationError } from "~/kernel/notes";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/mutate";

/** The discriminated Note-mutation outcomes the client consumes. */
export type NoteMutationResult =
  | { readonly kind: "rename"; readonly ok: true }
  | {
      readonly kind: "rename";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | { readonly kind: "update_content"; readonly ok: true }
  | {
      readonly kind: "update_content";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | { readonly kind: "delete"; readonly ok: true }
  | { readonly kind: "delete"; readonly ok: false; readonly formError: string }
  | { readonly kind: "restore"; readonly ok: true }
  | {
      readonly kind: "restore";
      readonly ok: false;
      readonly formError: string;
    }
  | {
      readonly kind: "unknown";
      readonly ok: false;
      readonly formError: string;
    };

function json(data: NoteMutationResult, status = 200): Response {
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
  const noteId = params.noteId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // `delete`/`restore` anchor on the note REGARDLESS of its current lifecycle
  // state (`includeDeleted: true`) — restore must find an already-deleted
  // Note, and a repeat delete/restore call must stay the idempotent no-op
  // `EntityRepository.softDelete`/`.restore` already guarantee, never a 404.
  // Missing, wrong-type and cross-workspace ids still fail closed with the
  // same calm not-found.
  if (intent === "delete" || intent === "restore") {
    const anchor = await scope.entities.getById(noteId, {
      includeDeleted: true,
    });
    if (!anchor || anchor.type !== "note") {
      throw new Response("Not Found", { status: 404 });
    }
    try {
      if (intent === "delete") {
        await scope.entities.softDelete(noteId);
        return json({ kind: "delete", ok: true });
      }
      await scope.entities.restore(noteId);
      return json({ kind: "restore", ok: true });
    } catch {
      return json({
        kind: intent,
        ok: false,
        formError: "That couldn’t be saved. Please try again.",
      });
    }
  }

  // The anchor for `rename`/`update_content` must be an ACTIVE Note in THIS
  // workspace — `getById` returns null for a missing id, a soft-deleted
  // entity and a cross-workspace id alike (the calm not-found that never
  // discloses which case occurred), so a deleted Note is never editable
  // through its active canonical route, and the explicit `type` check stops
  // this endpoint from ever mutating a wrong-type entity (a Task/Project/
  // Area/Goal id).
  const note = await scope.entities.getById(noteId);
  if (!note || note.type !== "note") {
    throw new Response("Not Found", { status: 404 });
  }

  if (intent === "rename") {
    try {
      await scope.entities.update(noteId, {
        title: String(form.get("title") ?? ""),
      });
      return json({ kind: "rename", ok: true });
    } catch (cause) {
      if (cause instanceof EntityValidationError) {
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

  if (intent === "update_content") {
    try {
      await scope.noteDetails.update(noteId, String(form.get("content") ?? ""));
      return json({ kind: "update_content", ok: true });
    } catch (cause) {
      if (cause instanceof NoteDetailsValidationError) {
        return json({
          kind: "update_content",
          ok: false,
          fieldErrors: { content: cause.message },
        });
      }
      return json({
        kind: "update_content",
        ok: false,
        formError: "That couldn’t be saved. Please try again.",
      });
    }
  }

  return json(
    { kind: "unknown", ok: false, formError: "Unknown action." },
    400,
  );
}
