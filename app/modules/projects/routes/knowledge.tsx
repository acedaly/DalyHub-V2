/**
 * PROJ-03 — the Project Knowledge endpoint
 * (`GET|POST /projects/:projectId/knowledge`).
 *
 * A resource route (no UI). The Knowledge tab's first page is server-rendered by
 * the project record loader; this serves further pages, the note search behind
 * the "Add an existing note" picker, and the three mutations.
 *
 * Every request re-derives the workspace server-side and re-verifies the anchor
 * is an ACTIVE `project` in it before dispatching, so a crafted note id, a
 * cross-workspace id, a wrong-type id or a deleted project all fail closed with
 * the same calm outcome — the client names ids, never a workspace, and never a
 * link type.
 */

import { env } from "cloudflare:workers";

import { EntityValidationError } from "~/kernel/entities";
import {
  DEFAULT_KNOWLEDGE_PAGE,
  linkNoteToProject,
  loadProjectKnowledge,
  unlinkNoteFromProject,
} from "~/platform/entity-links/project-knowledge";
import { requireAuthenticatedSession } from "~/platform/request";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
} from "~/platform/workspaces";

import type { Route } from "./+types/knowledge";

/** The discriminated Knowledge outcomes the client consumes. */
export type ProjectKnowledgeResult =
  | { readonly kind: "add"; readonly ok: true }
  | { readonly kind: "add"; readonly ok: false; readonly formError: string }
  | {
      readonly kind: "create";
      readonly ok: true;
      readonly noteId: string;
    }
  | {
      readonly kind: "create";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | { readonly kind: "remove"; readonly ok: true }
  | { readonly kind: "remove"; readonly ok: false; readonly formError: string }
  | {
      readonly kind: "unknown";
      readonly ok: false;
      readonly formError: string;
    };

const GENERIC_FAILURE = "That couldn’t be saved. Please try again.";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** The anchor must be an ACTIVE project in the trusted workspace. */
async function requireProject(scope: WorkspaceScope, projectId: string) {
  const entity = await scope.entities.getById(projectId);
  if (!entity || entity.type !== "project") {
    throw new Response("Not Found", { status: 404 });
  }
  return entity;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const project = await requireProject(scope, params.projectId);

  // `op=search` powers the "Add an existing note" picker. It searches NOTES
  // ONLY — the picker must never offer a task or a person as project knowledge
  // — and returns bounded, display-ready options with no note bodies.
  if (url.searchParams.get("op") === "search") {
    const query = (url.searchParams.get("q") ?? "").trim();
    if (query === "") return json({ options: [] });
    const hits = await scope.notes.search({
      text: query,
      limit: 20,
      includeArchived: true,
    });
    return json({
      options: hits.map((hit) => ({
        id: hit.id,
        type: "note",
        title: hit.title,
      })),
    });
  }

  const page = await loadProjectKnowledge(scope, project.id, {
    limit: DEFAULT_KNOWLEDGE_PAGE,
    ...(url.searchParams.get("cursor")
      ? { cursor: url.searchParams.get("cursor")! }
      : {}),
  });
  return json(page);
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const project = await requireProject(scope, params.projectId);

  if (intent === "add") {
    const noteId = String(form.get("noteId") ?? "");
    // The target must be an ACTIVE note in THIS workspace. Verifying it here
    // (rather than trusting the kernel's generic endpoint check) keeps the
    // failure a calm, typed outcome and refuses a wrong-type id outright.
    const note = await scope.entities.getById(noteId);
    if (!note || note.type !== "note") {
      return json({ kind: "add", ok: false, formError: GENERIC_FAILURE });
    }
    try {
      await linkNoteToProject(scope, project.id, note.id);
      return json({ kind: "add", ok: true });
    } catch {
      return json({ kind: "add", ok: false, formError: GENERIC_FAILURE });
    }
  }

  if (intent === "create") {
    // Creating a Note from a Project keeps the Project relationship
    // automatically (§8): the note is created and linked in the same request, so
    // the user never has to remember to attach it.
    let note;
    try {
      note = await scope.entities.create({
        type: "note",
        title: String(form.get("title") ?? ""),
      });
    } catch (cause) {
      if (cause instanceof EntityValidationError) {
        return json({
          kind: "create",
          ok: false,
          fieldErrors: { title: cause.message },
        });
      }
      return json({ kind: "create", ok: false, formError: GENERIC_FAILURE });
    }

    // The two writes are separate repository calls (each atomic with its own
    // Activity), so there is no shared transaction to lean on. If the LINK
    // fails, the note already exists — reporting a plain failure would be a lie
    // that leaves an orphan behind and mints another one on every retry. So
    // compensate: put the note back the way it was.
    try {
      await linkNoteToProject(scope, project.id, note.id);
    } catch {
      try {
        await scope.entities.softDelete(note.id);
      } catch {
        // Even the compensation failed. The note DOES exist and is not linked,
        // so say that rather than claiming nothing happened — the user can find
        // it in `/notes` and attach it, instead of creating duplicates.
        return json({
          kind: "create",
          ok: false,
          formError:
            "The note was created, but we couldn’t link it to this project. You’ll find it in Notes.",
        });
      }
      return json({ kind: "create", ok: false, formError: GENERIC_FAILURE });
    }

    return json({ kind: "create", ok: true, noteId: note.id });
  }

  if (intent === "remove") {
    const noteId = String(form.get("noteId") ?? "");
    try {
      // Removes the ASSOCIATION only — never the Note (§8).
      await unlinkNoteFromProject(scope, project.id, noteId);
      return json({ kind: "remove", ok: true });
    } catch {
      return json({ kind: "remove", ok: false, formError: GENERIC_FAILURE });
    }
  }

  return json(
    { kind: "unknown", ok: false, formError: "Unknown action." },
    400,
  );
}
