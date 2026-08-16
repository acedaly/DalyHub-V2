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
import {
  NoteDetailsConflictError,
  NoteDetailsValidationError,
  parseNoteTagInput,
  type UpdateNoteContentOptions,
} from "~/kernel/notes";
import { reconcileNoteReferences } from "~/platform/entity-links/note-references";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/mutate";

/*
 * A GET on this mutation endpoint renders DalyHub's error boundary rather
 * than React Router's internal error object and stack trace.
 */
import { actionOnlyLoader } from "~/platform/request";

export const loader = actionOnlyLoader;

/** The discriminated Note-mutation outcomes the client consumes. */
export type NoteMutationResult =
  | { readonly kind: "rename"; readonly ok: true }
  | {
      readonly kind: "rename";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "update_content";
      readonly ok: true;
      /**
       * The stored content version AFTER this save, so a long editing session
       * keeps quoting a current base rather than the one it first loaded.
       */
      readonly contentUpdatedAt: string | null;
    }
  | {
      readonly kind: "update_content";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
      /**
       * AUDIT-08 — true when the save was refused because the Note changed
       * somewhere else. Distinct from every other failure: nothing is wrong
       * with the request or the storage, the text simply moved on. The newer
       * stored content travels with it so the editor can OFFER it without a
       * second round trip, and the caller's own draft is untouched.
       */
      readonly conflict?: true;
      readonly serverContent?: string;
      readonly contentUpdatedAt?: string | null;
    }
  | { readonly kind: "delete"; readonly ok: true }
  | { readonly kind: "delete"; readonly ok: false; readonly formError: string }
  | { readonly kind: "restore"; readonly ok: true }
  | {
      readonly kind: "restore";
      readonly ok: false;
      readonly formError: string;
    }
  | { readonly kind: "archive"; readonly ok: true }
  | { readonly kind: "archive"; readonly ok: false; readonly formError: string }
  | { readonly kind: "unarchive"; readonly ok: true }
  | {
      readonly kind: "unarchive";
      readonly ok: false;
      readonly formError: string;
    }
  | { readonly kind: "set_tags"; readonly ok: true }
  | {
      readonly kind: "set_tags";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
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
    const content = String(form.get("content") ?? "");
    /*
     * AUDIT-08 — the content version this edit was written against.
     *
     * The FIELD's presence is what opts a caller in, so the key being absent
     * keeps the previous behaviour exactly (the capture panel writes the first
     * body of a note it just created, and has nothing to be stale about). An
     * EMPTY value is a real, distinct answer: "the note had no saved content
     * when I opened it".
     *
     * A value that is present but UNPARSEABLE is refused, and the write does not
     * happen. This deliberately reverses an earlier reading of "never cost the
     * owner their writing": a `400` costs them nothing — the draft has not left
     * the editor and is offered back with the error — whereas degrading a
     * malformed precondition to "no precondition" hands a stale client a way to
     * skip the compare-and-set and destroy the newer STORED version, which is
     * the exact loss this whole mechanism exists to prevent. A guard with an
     * opt-out is not a guard.
     */
    const precondition = readContentPrecondition(
      form.get("expectedContentUpdatedAt"),
    );
    if (!precondition.ok) {
      return json(
        {
          kind: "update_content",
          ok: false,
          formError:
            "That couldn’t be saved. Reload the note and try again — your text is still here.",
          fieldErrors: {
            expectedContentUpdatedAt:
              "Not a valid content version. Reload the note before saving.",
          },
        },
        400,
      );
    }
    try {
      const saved = await scope.noteDetails.update(
        noteId,
        content,
        precondition.options,
      );
      // NOTES-02: the note's `[[Wiki Link]]` references become REAL, typed
      // EntityLinks, reconciled against the saved body. This runs AFTER the
      // content write and never fails the save: the Markdown source is the
      // canonical record, and a workspace hiccup while writing derived
      // relationships must not cost the user their writing. The next save
      // reconciles again from the same source, so nothing drifts permanently.
      try {
        await reconcileNoteReferences(scope, noteId, content);
      } catch {
        // Intentionally swallowed — see above.
      }
      return json({
        kind: "update_content",
        ok: true,
        contentUpdatedAt: saved.details.contentUpdatedAt?.toISOString() ?? null,
      });
    } catch (cause) {
      if (cause instanceof NoteDetailsValidationError) {
        return json({
          kind: "update_content",
          ok: false,
          fieldErrors: { content: cause.message },
        });
      }
      /*
       * AUDIT-08 — an expected concurrency outcome, answered as `409` with the
       * newer stored text. NOT a 500: nothing failed. The response deliberately
       * does not carry the submitted draft anywhere — that text never left the
       * editor, and the stored content was never touched, so both versions still
       * exist and the owner chooses between them.
       */
      if (cause instanceof NoteDetailsConflictError) {
        const stored = await scope.noteDetails.get(noteId);
        return json(
          {
            kind: "update_content",
            ok: false,
            conflict: true,
            formError: cause.message,
            serverContent: stored?.content ?? "",
            contentUpdatedAt: stored?.contentUpdatedAt?.toISOString() ?? null,
          },
          409,
        );
      }
      return json({
        kind: "update_content",
        ok: false,
        formError: "That couldn’t be saved. Please try again.",
      });
    }
  }

  if (intent === "archive" || intent === "unarchive") {
    try {
      await scope.noteDetails.setArchived(noteId, intent === "archive");
      return json({ kind: intent, ok: true });
    } catch {
      return json({
        kind: intent,
        ok: false,
        formError: "That couldn’t be saved. Please try again.",
      });
    }
  }

  if (intent === "set_tags") {
    try {
      await scope.noteDetails.setTags(
        noteId,
        parseNoteTagInput(form.get("tags")),
      );
      return json({ kind: "set_tags", ok: true });
    } catch (cause) {
      if (cause instanceof NoteDetailsValidationError) {
        return json({
          kind: "set_tags",
          ok: false,
          fieldErrors: { tags: cause.message },
        });
      }
      return json({
        kind: "set_tags",
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

/**
 * The outcome of reading the base-content version: either a usable set of
 * options, or a refusal. `ok: false` is NOT "no precondition" — the two must
 * stay distinguishable, because conflating them is what would let a malformed
 * value disable the compare-and-set.
 */
type ContentPreconditionRead =
  | { readonly ok: true; readonly options: UpdateNoteContentOptions }
  | { readonly ok: false };

/**
 * AUDIT-08 — read the optional base-content version from the submitted form.
 *
 * Four answers, deliberately distinct:
 *   - the key is ABSENT → no precondition (the previous behaviour, unchanged,
 *     for a caller that has nothing to be stale about);
 *   - the key is present and EMPTY → the note had no saved content when the
 *     editor loaded it — a real base version, checked as such;
 *   - the key is a valid timestamp → compare-and-set against that version;
 *   - the key is present and UNPARSEABLE (including a non-string form part) →
 *     REFUSED. The write must not proceed: silently treating it as "no
 *     precondition" would let a stale caller opt out of the guard and overwrite
 *     newer stored content, and no client of this route can produce such a value
 *     except by being wrong about which version it holds.
 */
function readContentPrecondition(
  raw: FormDataEntryValue | null,
): ContentPreconditionRead {
  if (raw === null) return { ok: true, options: {} };
  if (typeof raw !== "string") return { ok: false };
  if (raw.length === 0) {
    return { ok: true, options: { expectedContentUpdatedAt: null } };
  }
  const at = new Date(raw);
  return Number.isNaN(at.getTime())
    ? { ok: false }
    : { ok: true, options: { expectedContentUpdatedAt: at } };
}
