/**
 * PEOPLE-01 / PEOPLE-02 — the Person relationship Timeline endpoint
 * (`GET /person/:personId/activity`).
 *
 * This is the ONE endpoint behind the ONE Person history surface. PEOPLE-01 served
 * the Person's own record events from `activity.listForEntity(personId)`;
 * PEOPLE-02 widens the SAME read to the Person's relationships — the Person plus
 * the records they are linked to — through the kernel's multi-anchor
 * `activity.listForEntities(anchorIds)`. It stays one bounded, cursor-paginated,
 * display-ready JSON page over the one FND-05 stream: no second timeline, no
 * relationship-event store, no copied record content.
 *
 * Trust boundary: the workspace is fixed server-side from the authenticated
 * session and is never taken from input; the anchor set is DERIVED server-side
 * from the Person's own EntityLinks (the client can never name the records whose
 * history it reads); every id is resolved through the workspace-bound
 * repositories, so a cross-workspace record cannot enter the stream. Fails closed
 * with a calm 404 for a missing / wrong-type / cross-workspace Person and a calm
 * 400 for a cursor this endpoint did not issue for this Person.
 *
 * Privacy: only structural facts cross the boundary — event type, actor, time,
 * referenced-record identity (title + type, resolved in ONE batch) and the safe
 * presentation the descriptors produce. No Note body, Diary entry, meeting agenda,
 * task description or `person_details` field is read or serialised here, and
 * cross-module Activity payloads are never rendered (see `person-activity.ts`).
 */

import { env } from "cloudflare:workers";

import {
  ActivitySubjectUnavailableError,
  InvalidActivityCursorError,
} from "~/kernel/activity";
import { discoverModuleRegistry } from "~/modules/discover-modules";
import { createActivityActorResolver } from "~/platform/activity";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  toActivityItems,
  type ResolvedEntity,
} from "~/shared/activity-feed/model";
import { entityDestination } from "~/shared/entity/destination";

import {
  buildPersonTimelineDescriptors,
  PERSON_ACTIVITY_PAGE_SIZE,
  type PersonActivityPage,
  type SerializedPersonActivityItem,
} from "../person-activity";
import {
  decodePersonTimelineCursor,
  encodePersonTimelineCursor,
  resolvePersonTimelineAnchors,
} from "../person-timeline-anchors";
import type { Route } from "./+types/activity";

/**
 * The descriptor map is derived from the BUILD-TIME module registry, so it is
 * identical for every request and every workspace — resolve it once per isolate
 * rather than rebuilding it per page read.
 */
let cachedDescriptors: ReturnType<
  typeof buildPersonTimelineDescriptors
> | null = null;

function personTimelineDescriptors() {
  cachedDescriptors ??= buildPersonTimelineDescriptors(
    discoverModuleRegistry().listActivityTypes(),
  );
  return cachedDescriptors;
}

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
  const cursor = new URL(request.url).searchParams.get("cursor");
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // The anchor Person must exist in THIS workspace. A soft-deleted Person keeps a
  // readable history (the kernel allows it), so deleted rows are included here.
  const anchor = await scope.entities.getById(personId, {
    includeDeleted: true,
  });
  if (!anchor || anchor.type !== "person") {
    return json({ error: "not_found" }, 404);
  }

  // Page 1 derives the anchor set from the Person's live relationships; later
  // pages replay the set the first page was read at, so pagination is a stable
  // snapshot rather than a shifting target (see `person-timeline-anchors.ts`).
  let anchorIds: readonly string[];
  let activityCursor: string | undefined;
  let relatedRecordCount: number;
  let relatedRecordsTruncated: boolean;

  if (cursor === null) {
    const anchors = await resolvePersonTimelineAnchors(
      scope.entityLinks,
      personId,
    );
    anchorIds = anchors.anchorIds;
    relatedRecordCount = anchors.relatedIds.length;
    relatedRecordsTruncated = anchors.truncated;
  } else {
    const decoded = decodePersonTimelineCursor(cursor, personId);
    if (!decoded) {
      return json({ error: "invalid_cursor" }, 400);
    }
    anchorIds = decoded.anchorIds;
    activityCursor = decoded.activityCursor;
    relatedRecordCount = decoded.anchorIds.length - 1;
    relatedRecordsTruncated = decoded.truncated;
  }

  let page;
  try {
    page = await scope.activity.listForEntities(anchorIds, {
      limit: PERSON_ACTIVITY_PAGE_SIZE,
      ...(activityCursor ? { cursor: activityCursor } : {}),
    });
  } catch (error) {
    if (error instanceof InvalidActivityCursorError) {
      return json({ error: "invalid_cursor" }, 400);
    }
    if (error instanceof ActivitySubjectUnavailableError) {
      // A record named by a replayed cursor was permanently removed between
      // pages. Fail the page closed rather than silently reading a smaller set.
      return json({ error: "invalid_cursor" }, 400);
    }
    throw error;
  }

  // Resolve every referenced entity ONCE, up front (DS-05's batch resolver — the
  // UI never fetches per item, so there is no N+1).
  const ids = new Set<string>();
  for (const record of page.items) {
    for (const subject of record.subjects) {
      ids.add(subject.entityId);
    }
  }
  const entities = await scope.entities.getByIds([...ids], {
    includeDeleted: true,
  });
  // Where each referenced record opens comes from the ONE shared destination
  // helper, so a Meeting, Note, Asset or Task on this timeline is navigable back
  // to its canonical record without this module knowing any other module's
  // routes, and a type with no genuine destination degrades to plain text.
  const resolved = new Map<string, ResolvedEntity>();
  for (const [id, entity] of entities) {
    const destination = entityDestination(entity.type, id);
    resolved.set(id, {
      entityId: id,
      entityType: entity.type,
      label: entity.title,
      ...(destination?.kind === "drawer"
        ? { drawerKey: destination.drawerKey }
        : {}),
      ...(destination?.kind === "route" ? { href: destination.to } : {}),
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
    descriptors: personTimelineDescriptors(),
    resolveEntity: (id) => resolved.get(id) ?? null,
    anchorEntityId: personId,
  });
  const serialized: SerializedPersonActivityItem[] = items.map((item) => ({
    ...item,
    occurredAt: item.occurredAt.toISOString(),
  }));

  return json({
    items: serialized,
    nextCursor: page.nextCursor
      ? encodePersonTimelineCursor(
          personId,
          anchorIds,
          page.nextCursor,
          relatedRecordsTruncated,
        )
      : null,
    hasMore: page.hasMore,
    relatedRecordCount,
    relatedRecordsTruncated,
  } satisfies PersonActivityPage);
}
