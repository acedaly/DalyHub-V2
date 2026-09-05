/**
 * V2.10 LIFE-02 — the obligation CREATE endpoint (`/obligations/create`).
 *
 * An action-only resource route, deliberately separate from `/obligations/new`:
 * a route that also exports a UI component is a document route, so a `fetch`
 * POST to it re-renders HTML rather than returning the action's JSON, and the
 * DS-06 forms need JSON. Same split as `/assets/create`.
 *
 * The SUBJECT is optional here and everywhere. An empty `subjectEntityId` is not
 * a missing value to be defaulted — it is the ordinary case V2.10 exists for.
 */

import { env } from "cloudflare:workers";

import { ObligationValidationError } from "~/kernel/obligations";
import {
  actionOnlyLoader,
  requireAuthenticatedSession,
} from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/create";

export type ObligationCreateResult =
  | { readonly ok: true; readonly obligationId: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Read a field only when it was submitted, so an omitted field stays omitted. */
function field(form: FormData, key: string): string | undefined {
  return form.has(key) ? String(form.get(key) ?? "") : undefined;
}

/*
 * A GET on a mutation endpoint is reachable — a shared link, a prefetch, a Back
 * onto a POST — and React Router's own answer is a 400 carrying its internal
 * error object and a stack trace naming absolute build paths. This answers 405
 * with an `Allow` header instead.
 */
export const loader = actionOnlyLoader;

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const form = await request.formData();

  const subjectEntityId = (form.get("subjectEntityId") ?? "").toString().trim();

  try {
    const obligation = await scope.obligations.create({
      // An empty string means "about nothing", which is a legitimate answer and
      // not a validation failure.
      subjectEntityId: subjectEntityId.length > 0 ? subjectEntityId : null,
      category: String(form.get("category") ?? "reminder"),
      title: String(form.get("title") ?? ""),
      description: field(form, "description"),
      dueDate: field(form, "dueDate"),
      leadDays: field(form, "leadDays"),
      recurrenceKind: field(form, "recurrenceKind"),
      recurrenceInterval: field(form, "recurrenceInterval"),
      meterThreshold: field(form, "meterThreshold"),
      meterInterval: field(form, "meterInterval"),
      meterUnit: field(form, "meterUnit"),
      expectedAmount: field(form, "expectedAmount"),
      currencyCode: field(form, "currencyCode"),
    });
    return json({
      ok: true,
      obligationId: obligation.id,
    } satisfies ObligationCreateResult);
  } catch (cause) {
    if (cause instanceof ObligationValidationError) {
      return json({
        ok: false,
        formError: cause.message,
        fieldErrors: { [cause.field]: cause.message },
      } satisfies ObligationCreateResult);
    }
    throw cause;
  }
}
