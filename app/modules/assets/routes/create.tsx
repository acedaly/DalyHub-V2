/**
 * ASSET-01 — the create-asset endpoint (`POST /assets/create`).
 *
 * An action-only resource route (no UI) — the trusted server boundary for creating
 * an Asset. It is deliberately SEPARATE from the `/new/asset` page: a route that
 * also exports a UI component is a document route, so a `fetch` POST to it
 * re-renders HTML rather than returning the action's JSON (the DS-06 forms need
 * JSON). Creation goes through the authoritative `AssetRepository.create` — `asset`
 * is reserved, so the entity row, its detail slice and the `asset.created` event are
 * written atomically. The client never supplies workspace or actor data (ADR-010).
 */

import { env } from "cloudflare:workers";

import { AssetValidationError, type CreateAssetInput } from "~/kernel/assets";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { ASSET_FORM_STRING_KEYS, parseTagsField } from "../asset-form-fields";
import type { Route } from "./+types/create";

/** The discriminated create-asset outcome the forms consume. */
export type CreateAssetResult =
  | { readonly ok: true; readonly assetId: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

function json(data: CreateAssetResult, status = 200): Response {
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

  const input: Record<string, unknown> = {};
  for (const key of ASSET_FORM_STRING_KEYS) {
    if (form.has(key)) {
      input[key] = String(form.get(key) ?? "");
    }
  }
  if (form.has("tags")) {
    input.tags = parseTagsField(String(form.get("tags") ?? "[]"));
  }
  input.title = String(form.get("title") ?? "");
  input.assetType = String(form.get("assetType") ?? "");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  try {
    const asset = await scope.assets.create(input as CreateAssetInput);
    return json({ ok: true, assetId: asset.id });
  } catch (cause) {
    if (cause instanceof AssetValidationError) {
      return json({ ok: false, fieldErrors: { [cause.field]: cause.message } });
    }
    return json({
      ok: false,
      formError: "That asset couldn’t be created. Please try again.",
    });
  }
}
