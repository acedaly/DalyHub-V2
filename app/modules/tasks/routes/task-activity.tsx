/**
 * TODAY-02 — the task Timeline endpoint (`/today/task/:taskId/activity`).
 *
 * A resource route (no UI) that returns one page of the task's shared Activity
 * Timeline, mapped through the DS-05 view-model server-side so the Drawer can feed
 * it straight into the `Timeline` component. The kernel Activity model (FND-05) is
 * the ONLY event source — this invents nothing. It uses the same trusted
 * authenticated composition boundary as the other task routes.
 *
 * The record → `ActivityItem` mapping (`toActivityItems`) runs here, where the
 * workspace scope can resolve each subject's entity identity in a bounded batch (no
 * N+1). Items are JSON-serialised (the one `Date`, `occurredAt`, → ISO string); the
 * browser re-hydrates it before handing the page to `Timeline`.
 */

import { env } from "cloudflare:workers";

import { TASK_COMPLETED, TASK_REOPENED } from "~/kernel/spine";
import {
  TASK_PLAN_CLEARED,
  TASK_PLANNED,
  TASK_RECURRENCE_OCCURRENCE_CREATED,
  TASK_RECURRENCE_OCCURRENCE_SKIPPED,
  TASK_RECURRENCE_OCCURRENCE_WITHDRAWN,
  TASK_RESCHEDULED,
  TASK_WAITING_CHANGED,
  TASK_WAITING_CLEARED,
  TASK_WAITING_STARTED,
} from "~/kernel/tasks";
import { createActivityActorResolver } from "~/platform/activity";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  buildWorkspaceActivityDescriptors,
  toActivityItems,
  type ActivityTypeDescriptor,
  type ResolvedEntity,
} from "~/shared/activity-feed/model";
import type {
  SerializedActivityItem,
  TaskActivityPage,
} from "~/shared/task-record/contract";

import type { Route } from "./+types/task-activity";

/** How many events a single Timeline page loads. Bounded — never "load everything". */
const PAGE_SIZE = 30;

/** Task-specific descriptors layered over the kernel lifecycle defaults. */
const TASK_DESCRIPTORS: Record<string, ActivityTypeDescriptor> = {
  [TASK_COMPLETED]: {
    label: "Completed task",
    entityType: "task",
    tone: "success",
  },
  [TASK_REOPENED]: { label: "Reopened task", entityType: "task" },
  [TASK_WAITING_STARTED]: {
    label: "Started waiting",
    entityType: "task",
    tone: "warning",
  },
  [TASK_WAITING_CHANGED]: {
    label: "Changed what it’s waiting on",
    entityType: "task",
    tone: "warning",
  },
  [TASK_WAITING_CLEARED]: { label: "Stopped waiting", entityType: "task" },
  [TASK_PLANNED]: {
    label: "Planned",
    entityType: "task",
    tone: "accent",
  },
  [TASK_RESCHEDULED]: {
    label: "Rescheduled",
    entityType: "task",
    tone: "accent",
  },
  [TASK_PLAN_CLEARED]: { label: "Plan cleared", entityType: "task" },
  [TASK_RECURRENCE_OCCURRENCE_CREATED]: {
    label: "Created the next occurrence",
    entityType: "task",
    tone: "accent",
  },
  [TASK_RECURRENCE_OCCURRENCE_WITHDRAWN]: {
    label: "Withdrew the next occurrence",
    entityType: "task",
  },
  // Deliberately NOT worded as a completion: a skipped occurrence is work that did
  // not happen, and the history has to keep saying so.
  [TASK_RECURRENCE_OCCURRENCE_SKIPPED]: {
    label: "Skipped this occurrence",
    entityType: "task",
    tone: "warning",
  },
};

// Kernel lifecycle defaults → the shared cross-module set (so a Meeting-owned or
// Asset-owned event recorded against this Task still reads as a sentence) → the
// Task's own, warmer record-scoped wording.
const DESCRIPTORS = buildWorkspaceActivityDescriptors([], TASK_DESCRIPTORS);

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
  const taskId = params.taskId;
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // A soft-deleted task's Timeline stays queryable; a non-task/cross-workspace id
  // is a calm 404 (never disclosing existence elsewhere).
  const task = await scope.tasks.getTask(taskId, { includeDeleted: true });
  if (!task) {
    return json({ error: "not_found" }, 404);
  }

  const page = await scope.activity.listForEntity(taskId, {
    limit: PAGE_SIZE,
    cursor,
  });

  // Resolve every referenced entity's identity in ONE bounded batch (no N+1).
  const ids = new Set<string>();
  for (const record of page.items) {
    for (const subject of record.subjects) {
      ids.add(subject.entityId);
    }
  }
  const resolved = new Map<string, ResolvedEntity>();
  for (const id of ids) {
    const entity = await scope.entities.getById(id, { includeDeleted: true });
    if (entity) {
      resolved.set(id, {
        entityId: id,
        entityType: entity.type,
        label: entity.title,
        // Only tasks open in the Today Drawer today; other kinds render as calm
        // non-link text (no cross-module drawer is built here).
        drawerKey: entity.type === "task" ? `task:${id}` : undefined,
      });
    }
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
    descriptors: DESCRIPTORS,
    resolveEntity: (id) => resolved.get(id) ?? null,
    anchorEntityId: taskId,
  });

  const serialized: SerializedActivityItem[] = items.map((item) => ({
    ...item,
    occurredAt: item.occurredAt.toISOString(),
  }));

  return json({
    items: serialized,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  } satisfies TaskActivityPage);
}
