/**
 * V2.9 INS-04 — the workspace-wide "What changed" endpoint
 * (`GET /analytics/activity`).
 *
 * **Moved here from `/today/activity`, which had no consumer** (DEBT-103).
 * TODAY-08 built that route for a Today widget the redesign later removed, and
 * a resource route nothing renders is a door onto the history stream that
 * nobody maintains. It now belongs to the module whose whole question is "what
 * happened over this period?", and the Today route was retired in the same
 * change rather than left as a second door.
 *
 * Two things changed with the move, and both are the point of it:
 *
 *   - it reads **`listInWindow`** (INS-01) rather than `listForWorkspace`, so
 *     the events are the events inside the window the Insight page is showing —
 *     an unwindowed feed beside a windowed page would be two different answers
 *     to one question;
 *   - the window travels in the query string as the SAME `window` vocabulary
 *     the page's address bar uses, so the panel, a bookmark and the page itself
 *     cannot disagree about which period is on screen.
 *
 * A resource route (no UI) returning one bounded page of the SHARED FND-05
 * Activity Feed; `activity` is the sole authority, so this invents no second
 * history model and no `activity_page` table. The record → DS-05 `ActivityItem`
 * mapping runs here, where the workspace scope resolves each referenced
 * subject's identity in ONE bounded batch (no N+1). The trusted workspace is
 * server-derived, never a client value; a tampered or window-mismatched cursor
 * is a calm 400, not a 500.
 */

import { env } from "cloudflare:workers";

import {
  InvalidActivityCursorError,
  type ActivityPage,
} from "~/kernel/activity";
import { insightWindowDays, parseInsightWindow } from "~/kernel/analytics";
import { buildActivityWindow } from "~/kernel/history";
import { createActivityActorResolver } from "~/platform/activity";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { WorkspaceScope } from "~/platform/workspaces";
import {
  toActivityItems,
  type ResolvedEntity,
} from "~/shared/activity-feed/model";
import { ownerCalendarIso, ownerLocalToUtc } from "~/shared/datetime";

import {
  insightActivityDescriptors,
  INSIGHT_ACTIVITY_PAGE_SIZE,
  type InsightActivityPage,
  type SerializedActivityItem,
} from "../activity-feed";
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

/**
 * The half-open instant window a `window=` parameter names.
 *
 * The SAME parser and the same owner-day rule the page uses — never a pair of
 * raw dates from the client, which would let a caller ask this route for a span
 * the surface does not offer. An unrecognised value falls back to the default
 * rather than being rejected: a stale bookmark should show the default period,
 * not an error.
 */
function activityWindowFor(
  value: string | null,
  todayIso: string,
  timezone: string,
): { readonly startsAt: Date; readonly endsAt: Date } {
  const span = insightWindowDays(parseInsightWindow(value), todayIso);
  const window = buildActivityWindow({
    periodStart: span.startIso,
    periodEnd: span.endIso,
    startOfOwnerDay: (dayIso) => ownerLocalToUtc(`${dayIso}T00:00`, timezone),
  });
  return {
    startsAt: new Date(window.startInstantIso),
    endsAt: new Date(window.endInstantIso),
  };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const params = new URL(request.url).searchParams;
  const cursor = params.get("cursor") ?? undefined;

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const preferences = await scope.appPreferences.get(session.user.subject);
  const todayIso = ownerCalendarIso(new Date(), preferences.timezone);
  const window = activityWindowFor(
    params.get("window"),
    todayIso,
    preferences.timezone,
  );

  let page: ActivityPage;
  try {
    page = await scope.activity.listInWindow({
      ...window,
      limit: INSIGHT_ACTIVITY_PAGE_SIZE,
      cursor,
    });
  } catch (error) {
    if (error instanceof InvalidActivityCursorError) {
      return json({ error: "invalid_cursor" }, 400);
    }
    throw error;
  }

  return json(await serializeActivityPage(scope, page));
}

/**
 * One page of records, turned into the DS-05 items the shared feed renders.
 *
 * This route is the ONLY caller, and deliberately so: the Insight page's panel
 * fetches every page — including its first — from here rather than having the
 * page's own loader render one and this route serve the rest. Two producers of
 * the same list is two things that can drift, and the shared `ActivityStream`
 * loads its first page itself anyway, so a server-rendered first page would be
 * replaced on mount rather than reused.
 */
async function serializeActivityPage(
  scope: WorkspaceScope,
  page: ActivityPage,
): Promise<InsightActivityPage> {
  // Resolve every referenced subject's identity in ONE bounded batch (no N+1). A
  // referenced TASK opens in the SAME shared Task Drawer (`?drawer=task:<id>`);
  // every other kind carries its entity type + title so the feed can link to its
  // canonical record route.
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
    descriptors: insightActivityDescriptors(),
    resolveEntity: (id) => resolved.get(id) ?? null,
  });

  const serialized: SerializedActivityItem[] = items.map((item) => ({
    ...item,
    occurredAt: item.occurredAt.toISOString(),
  }));

  return {
    items: serialized,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}
