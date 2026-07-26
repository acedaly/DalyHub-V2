/**
 * PEOPLE-01 — Person Activity Timeline endpoint (`GET /person/:personId/activity`).
 *
 * Serves the person's accumulated relationship history (create, detail edits,
 * archive/restore, plus any linked-record events) as a bounded, paginated,
 * display-ready JSON page the shared Timeline consumes. People-owned event types
 * are described via `PEOPLE_ACTIVITY_DESCRIPTORS`; kernel lifecycle events use
 * their defaults. Fails closed with a calm 404 for a missing/wrong-type/
 * cross-workspace id.
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
  PEOPLE_ACTIVITY_DESCRIPTORS,
  PERSON_ACTIVITY_PAGE_SIZE,
  type PersonActivityPage,
  type SerializedPersonActivityItem,
} from "../person-activity";
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
  const personId = params.personId;
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const anchor = await scope.entities.getById(personId, {
    includeDeleted: true,
  });
  if (!anchor || anchor.type !== "person") {
    return json({ error: "not_found" }, 404);
  }

  let page;
  try {
    page = await scope.activity.listForEntity(personId, {
      limit: PERSON_ACTIVITY_PAGE_SIZE,
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
    descriptors: PEOPLE_ACTIVITY_DESCRIPTORS,
    resolveEntity: (id) => resolved.get(id) ?? null,
    anchorEntityId: personId,
  });
  const serialized: SerializedPersonActivityItem[] = items.map((item) => ({
    ...item,
    occurredAt: item.occurredAt.toISOString(),
  }));

  return json({
    items: serialized,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  } satisfies PersonActivityPage);
}
