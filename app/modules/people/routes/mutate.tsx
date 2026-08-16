/**
 * PEOPLE-01 — Person mutation endpoint (`POST /person/:personId/mutate`).
 *
 * An action-only resource route (no UI) and the single Person edit path. Every
 * intent verifies the `personId` is a real Person in this workspace BEFORE any
 * dispatch, so a task/project/note id (or a cross-workspace id) can never reach a
 * mutation — it gets the calm not-found. Split ownership: TITLE (rename) and
 * lifecycle DELETE go through the generic `EntityRepository` (the single authority
 * for identity/title/soft-delete); structured detail edits and the archive
 * lifecycle go through the authoritative `PersonRepository`. Returns a real JSON
 * Response so the DS-06 forms and quick actions post with a plain `fetch`.
 */

import { env } from "cloudflare:workers";

import { EntityValidationError } from "~/kernel/entities";
import { PersonValidationError, type UpdatePersonInput } from "~/kernel/people";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/mutate";

/*
 * A GET on this mutation endpoint renders DalyHub's error boundary rather
 * than React Router's internal error object and stack trace.
 */
import { actionOnlyLoader } from "~/platform/request";

export const loader = actionOnlyLoader;

/** The discriminated Person-mutation outcomes the client consumes. */
export type PersonMutationResult =
  | { readonly kind: "rename"; readonly ok: true }
  | {
      readonly kind: "rename";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | { readonly kind: "update"; readonly ok: true }
  | {
      readonly kind: "update";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | { readonly kind: "archive"; readonly ok: true }
  | { readonly kind: "archive"; readonly ok: false; readonly formError: string }
  | { readonly kind: "restore"; readonly ok: true }
  | { readonly kind: "restore"; readonly ok: false; readonly formError: string }
  | { readonly kind: "delete"; readonly ok: true }
  | { readonly kind: "delete"; readonly ok: false; readonly formError: string }
  | {
      readonly kind: "unknown";
      readonly ok: false;
      readonly formError: string;
    };

function json(data: PersonMutationResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** The scalar detail keys a form may submit for an `update`. */
const SCALAR_KEYS = [
  "preferredName",
  "firstName",
  "middleName",
  "lastName",
  "pronouns",
  "organisation",
  "role",
  "department",
  "email",
  "secondaryEmail",
  "mobile",
  "workPhone",
  "address",
  "website",
  "birthday",
  "relationship",
  "notes",
  "favouriteContactMethod",
  "followUpFrequency",
  "nextFollowUp",
  "lastInteraction",
  "photoUrl",
] as const;

/** Build an `UpdatePersonInput` from ONLY the fields a form actually submitted, so
 * a partial form (e.g. the Notes tab) touches only its own fields; a submitted
 * empty string clears that field. */
function buildUpdate(form: FormData): UpdatePersonInput {
  const input: Record<string, unknown> = {};
  for (const key of SCALAR_KEYS) {
    if (form.has(key)) {
      input[key] = String(form.get(key) ?? "");
    }
  }
  if (form.has("tags")) {
    try {
      const parsed: unknown = JSON.parse(String(form.get("tags") ?? "[]"));
      input.tags = Array.isArray(parsed)
        ? parsed.filter((t): t is string => typeof t === "string")
        : [];
    } catch {
      input.tags = [];
    }
  }
  return input as UpdatePersonInput;
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const personId = params.personId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // `delete` anchors on the person regardless of lifecycle state so a repeat call
  // stays the idempotent no-op the generic `softDelete` guarantees.
  if (intent === "delete") {
    const anchor = await scope.entities.getById(personId, {
      includeDeleted: true,
    });
    if (!anchor || anchor.type !== "person") {
      throw new Response("Not Found", { status: 404 });
    }
    try {
      await scope.entities.softDelete(personId);
      return json({ kind: "delete", ok: true });
    } catch {
      return json({
        kind: "delete",
        ok: false,
        formError: "That couldn’t be deleted. Please try again.",
      });
    }
  }

  // Every other intent requires an active (not deleted) Person; `get` returns an
  // archived Person too (archive is not deletion), so restore can find it.
  const person = await scope.people.get(personId);
  if (!person) {
    throw new Response("Not Found", { status: 404 });
  }

  if (intent === "rename") {
    try {
      await scope.entities.update(personId, {
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

  if (intent === "update") {
    try {
      await scope.people.update(personId, buildUpdate(form));
      return json({ kind: "update", ok: true });
    } catch (cause) {
      if (cause instanceof PersonValidationError) {
        return json({
          kind: "update",
          ok: false,
          fieldErrors: { [cause.field]: cause.message },
        });
      }
      return json({
        kind: "update",
        ok: false,
        formError: "That couldn’t be saved. Please try again.",
      });
    }
  }

  if (intent === "archive") {
    try {
      await scope.people.archive(personId);
      return json({ kind: "archive", ok: true });
    } catch {
      return json({
        kind: "archive",
        ok: false,
        formError: "That couldn’t be archived. Please try again.",
      });
    }
  }

  if (intent === "restore") {
    try {
      await scope.people.restore(personId);
      return json({ kind: "restore", ok: true });
    } catch {
      return json({
        kind: "restore",
        ok: false,
        formError: "That couldn’t be restored. Please try again.",
      });
    }
  }

  return json(
    { kind: "unknown", ok: false, formError: "Unknown action." },
    400,
  );
}
