/**
 * DIARY-01 — the real Diary Timeline route (`/diary`).
 *
 * Replaces the PX-03 `ModuleComingSoon` placeholder with the Interstitial
 * Journal: a chronological Timeline of meaningful moments plus a sub-ten-second
 * quick capture. The trusted server boundary reads the workspace-bound,
 * RESERVED `DiaryRepository` (never the generic entity collection) through the
 * authenticated composition seam, lists a BOUNDED, cursor-paginated page in
 * deterministic `(occurred_at, id)` order, and groups it into local-day sections
 * with the kernel's pure `groupEntriesByDay` resolved in the explicit display
 * time zone. Entry-type and occurred-at-range filters are URL-backed so they
 * survive refresh and Back/Forward; a malformed or scope-mismatched cursor
 * degrades calmly rather than 500-ing (mirrors `~/modules/notes/routes/index`).
 */

import { env } from "cloudflare:workers";

import { toLocalDayKey } from "~/kernel/diary";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { DiaryTimelineView } from "../DiaryTimeline";
import {
  parseEntryTypeFilter,
  serializeTimelinePage,
  type SerializedDayGroup,
} from "../diary-view";
import {
  DIARY_DISPLAY_TIME_ZONE,
  endOfLocalDayUtc,
  startOfLocalDayUtc,
} from "../occurred-time";
import type { Route } from "./+types/index";

/** The Timeline page size — bounded and modest so pagination is exercised early. */
const DIARY_TIMELINE_PAGE_SIZE = 25;

export function meta() {
  return [
    { title: "Diary · DalyHub" },
    {
      name: "description",
      content:
        "Your interstitial journal — a chronological history of meaningful moments.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const entryTypes = parseEntryTypeFilter(url.searchParams.getAll("type"));
  const fromParam = url.searchParams.get("from") ?? "";
  const toParam = url.searchParams.get("to") ?? "";
  // The lower bound is the local day's start; the upper bound is the INCLUSIVE
  // last instant of the local day (the next local midnight minus 1 ms), so an
  // inclusive `occurredTo` covers the whole day, not just up to 23:59:00.
  const occurredFrom = fromParam
    ? (startOfLocalDayUtc(fromParam, DIARY_DISPLAY_TIME_ZONE) ?? undefined)
    : undefined;
  const occurredTo = toParam
    ? (endOfLocalDayUtc(toParam, DIARY_DISPLAY_TIME_ZONE) ?? undefined)
    : undefined;

  const isFiltered =
    entryTypes !== undefined ||
    occurredFrom !== undefined ||
    occurredTo !== undefined;

  const now = new Date();
  const base = {
    displayTimeZone: DIARY_DISPLAY_TIME_ZONE,
    nowIso: now.toISOString(),
    todayKey: toLocalDayKey(now, DIARY_DISPLAY_TIME_ZONE),
    activeTypes: entryTypes ?? [],
    from: fromParam,
    to: toParam,
    isFiltered,
  };

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const page = await scope.diary.list({
      order: "newest",
      limit: DIARY_TIMELINE_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
      ...(entryTypes ? { entryTypes } : {}),
      ...(occurredFrom ? { occurredFrom } : {}),
      ...(occurredTo ? { occurredTo } : {}),
    });
    return {
      ...base,
      groups: serializeTimelinePage(page.items, DIARY_DISPLAY_TIME_ZONE),
      nextCursor: page.nextCursor,
      failed: false,
    };
  } catch {
    // A storage fault OR a malformed/scope-mismatched cursor: degrade to a calm
    // error so the shell stays usable — never a 500.
    return {
      ...base,
      groups: [] as SerializedDayGroup[],
      nextCursor: null as string | null,
      failed: true,
    };
  }
}

export default function DiaryRoute({ loaderData }: Route.ComponentProps) {
  return <DiaryTimelineView {...loaderData} />;
}
