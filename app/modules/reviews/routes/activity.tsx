import { env } from "cloudflare:workers";

import { InvalidActivityCursorError } from "~/kernel/activity";
import { createActivityActorResolver } from "~/platform/activity";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  toActivityItems,
  type ResolvedEntity,
} from "~/shared/activity-feed/model";

import {
  REVIEW_ACTIVITY_PAGE_SIZE,
  REVIEWS_ACTIVITY_DESCRIPTORS,
  type ReviewActivityPage,
  type SerializedReviewActivityItem,
} from "../review-activity";
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
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const reviewId = params.reviewId;
  const anchor = await scope.entities.getById(reviewId, {
    includeDeleted: true,
  });
  if (!anchor || anchor.type !== "review") {
    return json({ error: "not_found" }, 404);
  }
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  let page;
  try {
    page = await scope.activity.listForEntity(reviewId, {
      limit: REVIEW_ACTIVITY_PAGE_SIZE,
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
    for (const subject of record.subjects) ids.add(subject.entityId);
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

  // Name every actor on the page through the ONE shared identity rule, in a
  // single bounded directory lookup (no N+1). Historic events keep the
  // identity of whoever performed them — never the current viewer's.
  const resolveActor = await createActivityActorResolver(
    scope.actors,
    page.items,
  );

  const items = toActivityItems(page.items, {
    resolveActor,
    descriptors: REVIEWS_ACTIVITY_DESCRIPTORS,
    resolveEntity: (id) => resolved.get(id) ?? null,
    anchorEntityId: reviewId,
  });
  const serialized: SerializedReviewActivityItem[] = items.map((item) => ({
    ...item,
    occurredAt: item.occurredAt.toISOString(),
  }));

  return json({
    items: serialized,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  } satisfies ReviewActivityPage);
}
