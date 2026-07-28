/**
 * ASSET-01 — Asset mutation endpoint (`POST /asset/:assetId/mutate`).
 *
 * An action-only resource route (no UI) and the single Asset edit path. Every
 * intent verifies the `assetId` is a real Asset in this workspace BEFORE any
 * dispatch, so a task/note id (or a cross-workspace id) can never reach a mutation
 * — it gets the calm not-found. Split ownership: TITLE (rename) goes through the
 * generic `EntityRepository` (the single authority for identity/title); structured
 * detail edits, the real-world status and the archive lifecycle go through the
 * authoritative `AssetRepository`; permanent (hard) DELETE is the guarded
 * `AssetRepository.permanentlyDelete`. Returns a real JSON Response so the DS-06
 * forms and quick actions post with a plain `fetch`.
 */

import { env } from "cloudflare:workers";

import { AssetValidationError, type UpdateAssetInput } from "~/kernel/assets";
import { EntityValidationError } from "~/kernel/entities";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { ASSET_FORM_STRING_KEYS, parseTagsField } from "../asset-form-fields";
import type { Route } from "./+types/mutate";

/** The discriminated Asset-mutation outcomes the client consumes. */
export type AssetMutationResult =
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
  | {
      readonly kind: "delete";
      readonly ok: false;
      readonly formError: string;
      readonly blockedReason?: "has_links";
      readonly linkCount?: number;
    }
  | {
      readonly kind: "unknown";
      readonly ok: false;
      readonly formError: string;
    };

function json(data: AssetMutationResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Build an `UpdateAssetInput` from ONLY the fields a form actually submitted. */
function buildUpdate(form: FormData): UpdateAssetInput {
  const input: Record<string, unknown> = {};
  for (const key of ASSET_FORM_STRING_KEYS) {
    if (form.has(key)) {
      input[key] = String(form.get(key) ?? "");
    }
  }
  if (form.has("tags")) {
    input.tags = parseTagsField(String(form.get("tags") ?? "[]"));
  }
  return input as UpdateAssetInput;
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const assetId = params.assetId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // `delete` anchors on the asset regardless of lifecycle state.
  if (intent === "delete") {
    const anchor = await scope.entities.getById(assetId, {
      includeDeleted: true,
    });
    if (!anchor || anchor.type !== "asset") {
      throw new Response("Not Found", { status: 404 });
    }
    try {
      const result = await scope.assets.permanentlyDelete(assetId);
      if (result.deleted) {
        return json({ kind: "delete", ok: true });
      }
      if (result.blockedReason === "has_links") {
        return json({
          kind: "delete",
          ok: false,
          blockedReason: "has_links",
          linkCount: result.linkCount,
          formError:
            "Unlink this asset’s related records before deleting it permanently.",
        });
      }
      // Already gone: treat as success (idempotent).
      return json({ kind: "delete", ok: true });
    } catch {
      return json({
        kind: "delete",
        ok: false,
        formError: "That couldn’t be deleted. Please try again.",
      });
    }
  }

  // Every other intent requires an active (not deleted) Asset; `get` returns an
  // archived Asset too (archive is not deletion), so restore can find it.
  const asset = await scope.assets.get(assetId);
  if (!asset) {
    throw new Response("Not Found", { status: 404 });
  }

  if (intent === "rename") {
    try {
      await scope.entities.update(assetId, {
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
      await scope.assets.update(assetId, buildUpdate(form));
      return json({ kind: "update", ok: true });
    } catch (cause) {
      if (cause instanceof AssetValidationError) {
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
      await scope.assets.archive(assetId);
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
      await scope.assets.restore(assetId);
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
