/**
 * PROJ-01 — the create-project endpoint (`POST /projects/new`).
 *
 * An action-only resource route (no UI) — the trusted server boundary for creating a
 * project. It uses the SAME authenticated composition path the kernel tests cover:
 * the Worker boundary authenticates before this runs, `requireAuthenticatedSession`
 * re-checks and fails 401, and the workspace scope is resolved from TRUSTED server
 * config (`resolveAuthenticatedWorkspaceScope` → `env.DEFAULT_WORKSPACE_ID`) — the
 * client never supplies a workspace id (ADR-010/ADR-016 §5.6).
 *
 * Creation goes through `SpineRepository.createProject` (the single authority) — never
 * a direct insert into `entities`/`spine_records`/structural links. The parent must be
 * an Area OR a Goal; its KIND is resolved SERVER-SIDE from the id (`spine.getById`),
 * so the client cannot assert a project's kind or parent ownership. When a Goal is
 * chosen the Area is derived by the hierarchy (createProject links only the Goal) —
 * never stored twice. Returns a real JSON Response so the DS-06 form posts with a
 * plain `fetch`.
 */

import { env } from "cloudflare:workers";

import {
  SpineInvalidParentKindError,
  SpineParentUnavailableError,
  SpineNotFoundError,
  SpineValidationError,
} from "~/kernel/spine";
import {
  ProjectTemplateNotFoundError,
  ProjectTemplateParentUnavailableError,
  ProjectTemplateValidationError,
} from "~/kernel/project-templates";
import {
  readEntityIconField,
  readIdentityColourField,
  requireAuthenticatedSession,
} from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/new";

/*
 * A GET on this mutation endpoint renders DalyHub's error boundary rather
 * than React Router's internal error object and stack trace.
 */
import { actionOnlyLoader } from "~/platform/request";

export const loader = actionOnlyLoader;

/** The discriminated create-project outcome the form consumes. */
export type CreateProjectResult =
  | { readonly ok: true; readonly projectId: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

function json(data: CreateProjectResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const PARENT_ERROR = "Choose an Area or a Goal for this project.";

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();
  const title = String(form.get("title") ?? "");
  const parentId = String(form.get("parentId") ?? "").trim();
  const templateId = String(form.get("templateId") ?? "").trim();

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  if (parentId.length === 0) {
    return json({ ok: false, fieldErrors: { parentId: PARENT_ERROR } });
  }

  /*
   * PROJECT-02 — creating FROM a template is a different write, so it takes a
   * different path rather than a flag through this one.
   *
   * A blank Project is `spine.createProject` plus an optional identity write:
   * two small mutations, and the second failing costs an icon. A Project made
   * from a template is a Project, N Tasks, N links, N detail rows and every
   * checklist item, and those must arrive together or not at all — so the whole
   * thing is ONE atomic batch inside the template repository, and this route
   * hands it the two values the owner chose and gets back an id.
   *
   * Everything below this branch is EXACTLY the code that ran before templates
   * existed. Blank creation is not routed through a template code path, is not
   * slowed by one, and cannot be broken by one.
   */
  if (templateId.length > 0) {
    try {
      const created = await scope.projectTemplates.instantiate(templateId, {
        title: title.trim().length === 0 ? undefined : title,
        parentId,
      });
      return json({ ok: true, projectId: created.projectId });
    } catch (cause) {
      if (cause instanceof ProjectTemplateNotFoundError) {
        // A malformed id, a template deleted on another device, or one from
        // another workspace — all indistinguishable, and all the same calm
        // message against the field that names it.
        return json({
          ok: false,
          fieldErrors: { templateId: "That template is no longer here." },
        });
      }
      if (cause instanceof ProjectTemplateParentUnavailableError) {
        return json({ ok: false, fieldErrors: { parentId: PARENT_ERROR } });
      }
      if (cause instanceof ProjectTemplateValidationError) {
        const field = cause.field === "name" ? "title" : cause.field;
        return json({ ok: false, fieldErrors: { [field]: cause.message } });
      }
      return json({
        ok: false,
        formError: "That project couldn\u2019t be created. Please try again.",
      });
    }
  }

  // Resolve the parent's KIND server-side — the client never asserts it. A missing,
  // soft-deleted or cross-workspace id resolves to null (never disclosed); a wrong
  // kind (e.g. a Project or Task) is rejected as an invalid parent.
  const parent = await scope.spine.getById(parentId);
  if (!parent || (parent.kind !== "area" && parent.kind !== "goal")) {
    return json({ ok: false, fieldErrors: { parentId: PARENT_ERROR } });
  }

  // Validated BEFORE creation, so a bad key never leaves a half-made Project.
  const icon = readEntityIconField(form);
  if (!icon.ok) {
    return json({ ok: false, fieldErrors: { iconKey: icon.message } });
  }
  const colour = readIdentityColourField(form);
  if (!colour.ok) {
    return json({ ok: false, fieldErrors: { colourSlot: colour.message } });
  }

  try {
    const project = await scope.spine.createProject({
      title,
      parent: { kind: parent.kind, id: parentId },
    });
    // See the Area equivalent: identity is the spine's, the chosen icon and
    // colour are the module's detail row, so this is a second write rather than
    // a creation parameter.
    if (icon.iconKey !== null || colour.colourSlot !== null) {
      await scope.projectSettings.setIdentity(project.id, {
        iconKey: icon.iconKey,
        colourSlot: colour.colourSlot,
      });
    }
    return json({ ok: true, projectId: project.id });
  } catch (cause) {
    if (cause instanceof SpineValidationError) {
      // Title (or another field) failed validation — surface against that field.
      const field = cause.field === "title" ? "title" : "parentId";
      return json({ ok: false, fieldErrors: { [field]: cause.message } });
    }
    if (
      cause instanceof SpineParentUnavailableError ||
      cause instanceof SpineInvalidParentKindError ||
      cause instanceof SpineNotFoundError
    ) {
      return json({ ok: false, fieldErrors: { parentId: PARENT_ERROR } });
    }
    return json({
      ok: false,
      formError: "That project couldn’t be created. Please try again.",
    });
  }
}
