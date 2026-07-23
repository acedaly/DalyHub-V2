/**
 * AREA-01 — create-Area endpoint (`POST /areas/new`).
 */

import { env } from "cloudflare:workers";

import { SpineValidationError } from "~/kernel/spine";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/new";

export type CreateAreaResult =
  | { readonly ok: true; readonly areaId: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

function json(data: CreateAreaResult, status = 200): Response {
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

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const area = await scope.spine.createArea({ title });
    return json({ ok: true, areaId: area.id });
  } catch (cause) {
    if (cause instanceof SpineValidationError) {
      return json({
        ok: false,
        fieldErrors: { title: cause.message },
      });
    }
    return json({
      ok: false,
      formError: "That Area couldn't be created. Please try again.",
    });
  }
}
