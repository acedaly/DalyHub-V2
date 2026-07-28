/**
 * PEOPLE-01 — the create-person endpoint (`POST /people/create`).
 *
 * An action-only resource route (no UI) — the trusted server boundary for
 * creating a Person. It is deliberately SEPARATE from the `/new/person` page: a
 * route that also exports a UI component is a document route, so a `fetch` POST to
 * it re-renders HTML rather than returning the action's JSON (the DS-06 forms need
 * JSON). Both the collection's drawer quick-add and the `/new/person` page post
 * here. Creation goes through the authoritative `PersonRepository.create` —
 * `person` is reserved, so the entity row, its detail slice and the
 * `person.created` event are written atomically. Uses the SAME authenticated
 * composition path the kernel tests cover (ADR-010 / ADR-016 §5.6).
 */

import { env } from "cloudflare:workers";

import { PersonValidationError } from "~/kernel/people";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/create";

/** The discriminated create-person outcome the forms consume. */
export type CreatePersonResult =
  | { readonly ok: true; readonly personId: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

function json(data: CreatePersonResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function parseTags(raw: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string")
      : [];
  } catch {
    return [];
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();
  const str = (key: string): string => String(form.get(key) ?? "");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  try {
    const person = await scope.people.create({
      title: str("title"),
      preferredName: str("preferredName"),
      organisation: str("organisation"),
      role: str("role"),
      email: str("email"),
      mobile: str("mobile"),
      relationship: str("relationship"),
      tags: form.has("tags") ? parseTags(str("tags")) : undefined,
    });
    return json({ ok: true, personId: person.id });
  } catch (cause) {
    if (cause instanceof PersonValidationError) {
      return json({ ok: false, fieldErrors: { [cause.field]: cause.message } });
    }
    return json({
      ok: false,
      formError: "That person couldn’t be created. Please try again.",
    });
  }
}
