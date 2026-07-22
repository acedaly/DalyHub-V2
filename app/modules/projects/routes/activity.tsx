/**
 * PROJ-04 — the project Activity Timeline endpoint (`GET /projects/:projectId/activity`).
 *
 * A resource route (no UI) that returns one bounded page of the project's shared
 * FND-05 Activity Timeline, mapped through the DS-05 view-model server-side so the
 * Activity tab can feed it straight into the shared `Timeline`. The kernel Activity
 * model is the ONLY event source — `activity.listForEntity(projectId, …)` is the sole
 * authority — so this invents no second history, no `project_activity` table and no
 * bespoke Projects timeline. It uses the same trusted authenticated composition
 * boundary as the other project routes; the workspace scope is trusted server config,
 * never a client value.
 *
 * Scope: the project's Timeline is the events for which the PROJECT is an authorised
 * Activity subject — its `entity.created`, `entity.updated` (rename), the
 * `entity_link.*` events for its structural parent and its Key links, a child task's
 * `task.belongs_to_project` link (the project is that event's `target`), and
 * `project.completed` / `project.reopened`. It deliberately does NOT scrape child-task
 * LIFECYCLE events (a task's own completion/planning/waiting name the task, not the
 * project) — the subject model (ADR-012) stays authoritative, and no event is
 * duplicated to make the Timeline look busier.
 *
 * The record → `ActivityItem` mapping runs here, where the workspace scope resolves
 * each referenced subject's identity in ONE bounded batch (no N+1). Items are
 * JSON-serialised (the one `Date`, `occurredAt`, → ISO string); the browser
 * re-hydrates it before handing the page to `Timeline`.
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
  PROJECT_ACTIVITY_DESCRIPTOR_MAP,
  PROJECT_ACTIVITY_PAGE_SIZE,
  type ProjectActivityPage,
  type SerializedProjectActivityItem,
} from "../project-activity";
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
  const projectId = params.projectId;
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // The anchor must be an ACTIVE project in THIS workspace. `getProjectOverview`
  // returns null for a missing id, a soft-deleted project, a non-project (task /
  // goal / area) id and a cross-workspace id alike — the calm not-found that never
  // discloses whether the id exists elsewhere.
  const overview = await scope.projects.getProjectOverview(projectId);
  if (!overview) {
    return json({ error: "not_found" }, 404);
  }

  let page;
  try {
    page = await scope.activity.listForEntity(projectId, {
      limit: PROJECT_ACTIVITY_PAGE_SIZE,
      cursor,
    });
  } catch (error) {
    // A tampered, cross-workspace, cross-project or otherwise scope-mismatched
    // cursor is a client error, not a 500 — the Timeline surfaces a calm retry and
    // recovers by re-reading the first page. Cursor internals stay opaque.
    if (error instanceof InvalidActivityCursorError) {
      return json({ error: "invalid_cursor" }, 400);
    }
    throw error;
  }

  // Resolve every referenced subject's identity in ONE bounded batch (no N+1) — a
  // single chunked `IN (...)` read, not a query per id. A referenced TASK opens in
  // the SAME shared Task Drawer the project record already hosts
  // (`?drawer=task:<id>`); every other kind — the project itself, its Area / Goal —
  // renders as calm non-link text (no cross-module Drawer is invented here).
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
    descriptors: PROJECT_ACTIVITY_DESCRIPTOR_MAP,
    resolveEntity: (id) => resolved.get(id) ?? null,
    anchorEntityId: projectId,
  });

  const serialized: SerializedProjectActivityItem[] = items.map((item) => ({
    ...item,
    occurredAt: item.occurredAt.toISOString(),
  }));

  return json({
    items: serialized,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  } satisfies ProjectActivityPage);
}
