/**
 * AREA-01 — Area mutation endpoint (`POST /areas/:areaId/mutate`).
 */

import { env } from "cloudflare:workers";

import { SpineValidationError } from "~/kernel/spine";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/mutate";

export type AreaMutationResult =
  | { readonly kind: "rename"; readonly ok: true }
  | {
      readonly kind: "rename";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

function json(data: AreaMutationResult, status = 200): Response {
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
  const areaId = params.areaId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const area = await scope.spine.getById(areaId);
  if (!area || area.kind !== "area") {
    throw new Response("Not Found", { status: 404 });
  }

  if (intent !== "rename") {
    return json(
      { kind: "rename", ok: false, formError: "Unknown action." },
      400,
    );
  }

  try {
    await scope.spine.rename(areaId, String(form.get("title") ?? ""));
    return json({ kind: "rename", ok: true });
  } catch (cause) {
    if (cause instanceof SpineValidationError) {
      return json({
        kind: "rename",
        ok: false,
        fieldErrors: { title: cause.message },
      });
    }
    return json({
      kind: "rename",
      ok: false,
      formError: "That couldn't be saved. Please try again.",
    });
  }
}
