/**
 * AREA-01 — Area Activity Timeline endpoint (`GET /areas/:areaId/activity`).
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
  AREA_ACTIVITY_PAGE_SIZE,
  type AreaActivityPage,
  type SerializedAreaActivityItem,
} from "../area-activity";
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
  const areaId = params.areaId;
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const overview = await scope.areas.getAreaOverview(areaId);
  if (!overview) {
    return json({ error: "not_found" }, 404);
  }

  let page;
  try {
    page = await scope.activity.listForEntity(areaId, {
      limit: AREA_ACTIVITY_PAGE_SIZE,
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
    resolveEntity: (id) => resolved.get(id) ?? null,
    anchorEntityId: areaId,
  });
  const serialized: SerializedAreaActivityItem[] = items.map((item) => ({
    ...item,
    occurredAt: item.occurredAt.toISOString(),
  }));

  return json({
    items: serialized,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  } satisfies AreaActivityPage);
}
