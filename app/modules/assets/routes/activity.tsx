/**
 * ASSET-01 — Asset Activity Timeline endpoint (`GET /asset/:assetId/activity`).
 *
 * Serves the Asset's accumulated history (create, detail edits, status changes,
 * archive/restore/disposal, plus any linked-record events) as a bounded, paginated,
 * display-ready JSON page the shared Timeline consumes. Asset-owned event types are
 * described via `ASSETS_ACTIVITY_DESCRIPTORS`; kernel lifecycle events use their
 * defaults. Fails closed with a calm 404 for a missing/wrong-type/cross-workspace id.
 */

import { env } from "cloudflare:workers";

import { InvalidActivityCursorError } from "~/kernel/activity";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  toActivityItems,
  type ResolvedEntity,
} from "~/shared/activity-feed/model";

import {
  ASSETS_ACTIVITY_DESCRIPTORS,
  ASSET_ACTIVITY_PAGE_SIZE,
  type AssetActivityPage,
  type SerializedAssetActivityItem,
} from "../asset-activity";
import type { Route } from "./+types/activity";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const assetId = params.assetId;
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const anchor = await scope.entities.getById(assetId, {
    includeDeleted: true,
  });
  if (!anchor || anchor.type !== "asset") {
    return json({ error: "not_found" }, 404);
  }

  let page;
  try {
    page = await scope.activity.listForEntity(assetId, {
      limit: ASSET_ACTIVITY_PAGE_SIZE,
      cursor,
    });
  } catch (error) {
    if (error instanceof InvalidActivityCursorError) {
      return json({ error: "invalid_cursor" }, 400);
    }
    throw error;
  }

  const ids = new Set<string>();
  for (const record of page.items) {
    for (const subject of record.subjects) {
      ids.add(subject.entityId);
    }
  }
  const entities = await scope.entities.getByIds([...ids], {
    includeDeleted: true,
  });
  const resolved = new Map<string, ResolvedEntity>();
  for (const [id, entity] of entities) {
    resolved.set(id, {
      entityId: id,
      entityType: entity.type,
      label: entity.title,
      drawerKey: entity.type === "task" ? `task:${id}` : undefined,
    });
  }

  const items = toActivityItems(page.items, {
    descriptors: ASSETS_ACTIVITY_DESCRIPTORS,
    resolveEntity: (id) => resolved.get(id) ?? null,
    anchorEntityId: assetId,
  });
  const serialized: SerializedAssetActivityItem[] = items.map((item) => ({
    ...item,
    occurredAt: item.occurredAt.toISOString(),
  }));

  return json({
    items: serialized,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  } satisfies AssetActivityPage);
}
