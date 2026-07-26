/**
 * The Universal Relationship System — the shared links endpoint (`/links`).
 *
 * ONE authenticated JSON resource route (no UI) that every record's shared
 * Linked Items section talks to, so no module needs its own link-search /
 * link-mutate routes. It mirrors the app-level `/search` and `/commands`
 * resource routes: it renders no shell and stays OUTSIDE the app-shell layout.
 *
 * Trusted composition boundary, identical to `/search`:
 *   - `requireAuthenticatedSession` — a missing session is 401, never data;
 *   - `resolveAuthenticatedWorkspaceScope(env, session)` — the workspace is
 *     derived from trusted server config and verified in D1; the client cannot
 *     supply or influence it. The `anchor` id the client sends is an ENTITY id,
 *     not a workspace: a cross-workspace anchor resolves to nothing and every
 *     operation fails closed, disclosing nothing.
 *
 * GET operations (`op`):
 *   - `list`    → the anchor's Linked Items (`{ items }`).
 *   - `search`  → link-target candidates for the picker (`{ options }`).
 *   - `summary` → a safe hover-card summary of one target (`{ summary }`).
 * POST intents:
 *   - `link`    → create a `link.related` link, policy-enforced (`{ ok, message? }`).
 *   - `unlink`  → remove a link the anchor owns, policy-enforced (`{ ok, message? }`).
 */

import { env } from "cloudflare:workers";

import {
  buildUniversalLinkPolicy,
  createLinkWithPolicy,
  loadLinkedItems,
  loadLinkSummary,
  searchLinkTargets,
  SUPPORTED_LINK_ENTITY_TYPES,
  UNIVERSAL_RELATED_LINK,
  unlinkWithPolicy,
  type EntityLinkPickerDeps,
  type LinkedItem,
  type LinkSummary,
} from "~/platform/entity-links";
import { requireAuthenticatedSession } from "~/platform/request";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
} from "~/platform/workspaces";
import type { EntityLinkTargetOption } from "~/shared/forms/model";

import type { Route } from "./+types/links";

/** The GET responses, discriminated by the requested `op`. */
export type LinksLoaderData =
  | { readonly op: "list"; readonly items: readonly LinkedItem[] }
  | { readonly op: "search"; readonly options: readonly EntityLinkTargetOption[] }
  | { readonly op: "summary"; readonly summary: LinkSummary | null };

/** The POST responses, discriminated by intent. */
export type LinksActionData =
  | { readonly intent: "link"; readonly ok: boolean; readonly message?: string }
  | { readonly intent: "unlink"; readonly ok: boolean; readonly message?: string };

function pickerDeps(scope: WorkspaceScope): EntityLinkPickerDeps {
  return { entities: scope.entities, entityLinks: scope.entityLinks };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const anchor = url.searchParams.get("anchor") ?? "";
  const op = url.searchParams.get("op") ?? "list";
  if (!anchor) return json({ error: "missing_anchor" }, 400);

  let scope: WorkspaceScope;
  try {
    scope = await resolveAuthenticatedWorkspaceScope(env, session);
  } catch {
    // Fail closed on a missing/invalid/nonexistent workspace or a D1 failure.
    return json({ error: "unavailable" }, 200);
  }

  // The anchor must be an accessible, active entity in this workspace. A missing,
  // deleted or cross-workspace anchor is the calm not-found — never disclosed.
  const anchorEntity = await scope.entities.getById(anchor);
  if (!anchorEntity) return json({ error: "not_found" }, 404);

  switch (op) {
    case "search": {
      const query = url.searchParams.get("q") ?? "";
      const options = await searchLinkTargets(pickerDeps(scope), {
        anchorId: anchor,
        query,
        targetTypes: [...SUPPORTED_LINK_ENTITY_TYPES],
      });
      return json({ op: "search", options } satisfies LinksLoaderData);
    }
    case "summary": {
      const target = url.searchParams.get("target") ?? "";
      const summary = await loadLinkSummary(pickerDeps(scope), target);
      return json({ op: "summary", summary } satisfies LinksLoaderData);
    }
    case "list":
    default: {
      const items = await loadLinkedItems(pickerDeps(scope), anchor);
      return json({ op: "list", items } satisfies LinksLoaderData);
    }
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const anchor = String(form.get("anchor") ?? "");
  if (!anchor) return json({ error: "missing_anchor" }, 400);

  let scope: WorkspaceScope;
  try {
    scope = await resolveAuthenticatedWorkspaceScope(env, session);
  } catch {
    return json({ intent, ok: false, message: "That couldn't be saved." }, 200);
  }

  // The anchor must resolve in this workspace before any mutation.
  const anchorEntity = await scope.entities.getById(anchor);
  if (!anchorEntity) throw new Response("Not Found", { status: 404 });

  const policy = buildUniversalLinkPolicy(anchor);

  if (intent === "link") {
    const result = await createLinkWithPolicy(pickerDeps(scope), policy, {
      targetId: String(form.get("targetId") ?? ""),
      // The relationship type is fixed server-side; the client never picks it.
      linkType: UNIVERSAL_RELATED_LINK,
      direction: String(form.get("direction") ?? "outgoing"),
    });
    return json(
      result.ok
        ? ({ intent: "link", ok: true } satisfies LinksActionData)
        : ({
            intent: "link",
            ok: false,
            message: result.message,
          } satisfies LinksActionData),
    );
  }

  if (intent === "unlink") {
    const result = await unlinkWithPolicy(
      pickerDeps(scope),
      policy,
      String(form.get("linkId") ?? ""),
    );
    return json(
      result.ok
        ? ({ intent: "unlink", ok: true } satisfies LinksActionData)
        : ({
            intent: "unlink",
            ok: false,
            message: result.message,
          } satisfies LinksActionData),
    );
  }

  return json({ intent, ok: false, message: "Unknown action." }, 400);
}
