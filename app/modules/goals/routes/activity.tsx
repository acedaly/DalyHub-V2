/**
 * AREA-02 — the Goal Activity Timeline endpoint (`GET /goals/:goalId/activity`).
 *
 * A resource route (no UI) returning one bounded page of the Goal's shared
 * FND-05 Activity Timeline, mapped through the DS-05 view-model server-side.
 * `activity.listForEntity(goalId, …)` is the sole event authority — no second
 * Goal Activity store. Mirrors
 * `~/modules/projects/routes/activity.tsx` exactly.
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
  GOAL_ACTIVITY_DESCRIPTOR_MAP,
  GOAL_ACTIVITY_PAGE_SIZE,
  type GoalActivityPage,
  type SerializedGoalActivityItem,
} from "../goal-activity";
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
  const goalId = params.goalId;
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // The anchor must be an ACTIVE goal in THIS workspace. `getGoalOverview`
  // returns null for a missing id, a soft-deleted goal, a non-goal id and a
  // cross-workspace id alike — the calm not-found that never discloses
  // whether the id exists elsewhere.
  const overview = await scope.goals.getGoalOverview(goalId);
  if (!overview) {
    return json({ error: "not_found" }, 404);
  }

  let page;
  try {
    page = await scope.activity.listForEntity(goalId, {
      limit: GOAL_ACTIVITY_PAGE_SIZE,
      cursor,
    });
  } catch (error) {
    if (error instanceof InvalidActivityCursorError) {
      return json({ error: "invalid_cursor" }, 400);
    }
    throw error;
  }

  // Resolve every referenced subject's identity in ONE bounded batch (no N+1).
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
    });
  }

  const items = toActivityItems(page.items, {
    descriptors: GOAL_ACTIVITY_DESCRIPTOR_MAP,
    resolveEntity: (id) => resolved.get(id) ?? null,
    anchorEntityId: goalId,
  });

  const serialized: SerializedGoalActivityItem[] = items.map((item) => ({
    ...item,
    occurredAt: item.occurredAt.toISOString(),
  }));

  return json({
    items: serialized,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  } satisfies GoalActivityPage);
}
