/**
 * TODAY-08 — the workspace-wide Recent Activity endpoint (`GET /today/activity`).
 *
 * A resource route (no UI) returning one bounded page of the SHARED FND-05 Activity
 * Feed — `activity.listForWorkspace(…)` is the sole authority, so this invents no
 * second history model and no `today_activity` table. It is the first product
 * consumer of the workspace-wide feed; the record → DS-05 `ActivityItem` mapping runs
 * here, where the workspace scope resolves each referenced subject's identity in ONE
 * bounded batch (no N+1). The trusted workspace is server-derived, never a client
 * value; a tampered/scope-mismatched cursor is a calm 400, not a 500.
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
  todayActivityDescriptors,
  TODAY_ACTIVITY_PAGE_SIZE,
  type SerializedTodayActivityItem,
  type TodayActivityPage,
} from "../landing/activity";
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

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  let page;
  try {
    page = await scope.activity.listForWorkspace({
      limit: TODAY_ACTIVITY_PAGE_SIZE,
      cursor,
    });
  } catch (error) {
    if (error instanceof InvalidActivityCursorError) {
      return json({ error: "invalid_cursor" }, 400);
    }
    throw error;
  }

  // Resolve every referenced subject's identity in ONE bounded batch (no N+1). A
  // referenced TASK opens in the SAME shared Task Drawer Today already hosts
  // (`?drawer=task:<id>`); every other kind carries its entity type + title so the
  // widget can link to its canonical record route.
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

  // Name every actor on the page through the ONE shared identity rule, in a
  // single bounded directory lookup (no N+1). Historic events keep the
  // identity of whoever performed them — never the current viewer's.
  const resolveActor = await createActivityActorResolver(
    scope.actors,
    page.items,
  );

  const items = toActivityItems(page.items, {
    resolveActor,
    descriptors: todayActivityDescriptors(),
    resolveEntity: (id) => resolved.get(id) ?? null,
  });

  const serialized: SerializedTodayActivityItem[] = items.map((item) => ({
    ...item,
    occurredAt: item.occurredAt.toISOString(),
  }));

  return json({
    items: serialized,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  } satisfies TodayActivityPage);
}
