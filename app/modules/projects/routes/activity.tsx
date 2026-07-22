/** PROJ-04 — bounded project Timeline resource route. */
import { env } from "cloudflare:workers";

import { PROJECT_COMPLETED, PROJECT_REOPENED } from "~/kernel/spine";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  createActivityDescriptorMap,
  DEFAULT_ACTIVITY_DESCRIPTORS,
  toActivityItems,
  type ActivityTypeDescriptor,
  type ResolvedEntity,
} from "~/shared/activity-feed/model";
import type {
  SerializedActivityItem,
  TaskActivityPage,
} from "~/shared/task-record/contract";
import type { Route } from "./+types/activity";

const PAGE_SIZE = 30;
const PROJECT_DESCRIPTORS: Record<string, ActivityTypeDescriptor> = {
  [PROJECT_COMPLETED]: {
    label: "Completed project",
    entityType: "project",
    tone: "success",
  },
  [PROJECT_REOPENED]: { label: "Reopened project", entityType: "project" },
};
const DESCRIPTORS = createActivityDescriptorMap(
  DEFAULT_ACTIVITY_DESCRIPTORS,
  PROJECT_DESCRIPTORS,
);
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
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  // Active-only overview verification deliberately makes deleted, wrong-kind and
  // cross-workspace anchors indistinguishable calm not-found responses.
  if (!(await scope.projects.getProjectOverview(projectId)))
    return json({ error: "not_found" }, 404);
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  try {
    const page = await scope.activity.listForEntity(projectId, {
      limit: PAGE_SIZE,
      cursor,
    });
    const ids = new Set<string>();
    page.items.forEach((record) =>
      record.subjects.forEach((subject) => ids.add(subject.entityId)),
    );
    // The existing entity repository is workspace-bound; this mirrors the task
    // Timeline's conservative resolver, retaining inaccessible/deleted subjects as text.
    const resolved = new Map<string, ResolvedEntity>();
    for (const id of ids) {
      const entity = await scope.entities.getById(id, { includeDeleted: true });
      if (entity && !entity.deletedAt)
        resolved.set(id, {
          entityId: id,
          entityType: entity.type,
          label: entity.title,
          drawerKey: entity.type === "task" ? `task:${id}` : undefined,
        });
    }
    const items: SerializedActivityItem[] = toActivityItems(page.items, {
      descriptors: DESCRIPTORS,
      resolveEntity: (id) => resolved.get(id) ?? null,
      anchorEntityId: projectId,
    }).map((item) => ({ ...item, occurredAt: item.occurredAt.toISOString() }));
    return json({
      items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    } satisfies TaskActivityPage);
  } catch {
    // Invalid/scope-mismatched opaque cursors are deliberately calm and disclose no internals.
    return json({ error: "invalid_request" }, 400);
  }
}
