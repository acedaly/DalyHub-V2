/**
 * AREA-01 — create-Area endpoint (`POST /areas/new`).
 */

import { env } from "cloudflare:workers";

import { SpineValidationError } from "~/kernel/spine";
import {
  readEntityIconField,
  readIdentityColourField,
  requireAuthenticatedSession,
} from "~/platform/request";
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

  // Validated BEFORE the Area is created, so a bad key never produces a
  // half-made record: an Area that exists with the wrong icon and an error
  // message is worse than one that was never created.
  const icon = readEntityIconField(form);
  if (!icon.ok) {
    return json({ ok: false, fieldErrors: { iconKey: icon.message } });
  }
  const colour = readIdentityColourField(form);
  if (!colour.ok) {
    return json({ ok: false, fieldErrors: { colourSlot: colour.message } });
  }

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const area = await scope.spine.createArea({ title });
    // A second write rather than a creation parameter: identity belongs to the
    // spine and the chosen icon and colour belong to the Areas module's own
    // detail table (ADR-037/039), so `createArea` has no business knowing about
    // glyphs. The Area is already usable without either, which is why a failure
    // here does not undo the creation — it is reported and the Area keeps its
    // default icon and its derived colour.
    if (icon.iconKey !== null || colour.colourSlot !== null) {
      await scope.areaSettings.setIdentity(area.id, {
        iconKey: icon.iconKey,
        colourSlot: colour.colourSlot,
      });
    }
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
      formError: "That Area couldn’t be created. Please try again.",
    });
  }
}
