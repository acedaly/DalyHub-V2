/**
 * HABITS-01 — the Habit Activity Timeline endpoint
 * (`GET /habits/:habitId/activity`).
 *
 * A resource route (no UI) returning one bounded page of the Habit's shared
 * FND-05 Activity Timeline, mapped through the DS-05 view-model server-side.
 * `activity.listForEntity(habitId, …)` is the sole event authority — no second
 * Habit activity store. Mirrors `~/modules/goals/routes/activity.tsx` exactly.
 */

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
  HABIT_ACTIVITY_DESCRIPTOR_MAP,
  HABIT_ACTIVITY_PAGE_SIZE,
  type HabitActivityPage,
  type SerializedHabitActivityItem,
} from "../habit-activity";
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
  const habitId = params.habitId;
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // The anchor must be a Habit in THIS workspace. `get` returns null for a
  // missing id, a soft-deleted Habit, a non-Habit id and a cross-workspace id
  // alike — the calm not-found that never discloses existence elsewhere.
  const habit = await scope.habits.get(habitId);
  if (!habit) {
    return json({ error: "not_found" }, 404);
  }

  let page;
  try {
    page = await scope.activity.listForEntity(habitId, {
      limit: HABIT_ACTIVITY_PAGE_SIZE,
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
    });
  }

  const resolveActor = await createActivityActorResolver(
    scope.actors,
    page.items,
  );

  const items = toActivityItems(page.items, {
    resolveActor,
    descriptors: HABIT_ACTIVITY_DESCRIPTOR_MAP,
    resolveEntity: (id) => resolved.get(id) ?? null,
    anchorEntityId: habitId,
  });

  const serialized: SerializedHabitActivityItem[] = items.map((item) => ({
    ...item,
    occurredAt: item.occurredAt.toISOString(),
  }));

  return json({
    items: serialized,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  } satisfies HabitActivityPage);
}
