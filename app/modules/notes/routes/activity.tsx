/**
 * NOTES-01B — the Note Activity Timeline endpoint (`GET /notes/:noteId/activity`).
 *
 * A resource route (no UI) returning one bounded page of the Note's shared
 * FND-05 Activity Timeline, mapped through the DS-05 view-model server-side.
 * `activity.listForEntity(noteId, …)` is the sole event authority — no second
 * Note Activity store. Mirrors `~/modules/goals/routes/activity.tsx` exactly.
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
  NOTE_ACTIVITY_DESCRIPTOR_MAP,
  NOTE_ACTIVITY_PAGE_SIZE,
  type NoteActivityPage,
  type SerializedNoteActivityItem,
} from "../note-activity";
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
  const noteId = params.noteId;
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // The anchor must be an ACTIVE note in THIS workspace. `getById` returns
  // null for a missing id, a soft-deleted entity and a cross-workspace id
  // alike — the calm not-found that never discloses whether the id exists
  // elsewhere; the explicit `type` check rejects a wrong-type id too.
  const note = await scope.entities.getById(noteId);
  if (!note || note.type !== "note") {
    return json({ error: "not_found" }, 404);
  }

  let page;
  try {
    page = await scope.activity.listForEntity(noteId, {
      limit: NOTE_ACTIVITY_PAGE_SIZE,
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
    descriptors: NOTE_ACTIVITY_DESCRIPTOR_MAP,
    resolveEntity: (id) => resolved.get(id) ?? null,
    anchorEntityId: noteId,
  });

  const serialized: SerializedNoteActivityItem[] = items.map((item) => ({
    ...item,
    occurredAt: item.occurredAt.toISOString(),
  }));

  return json({
    items: serialized,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  } satisfies NoteActivityPage);
}
