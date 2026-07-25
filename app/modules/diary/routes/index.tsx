/**
 * DIARY-01 / DIARY-01B — the Diary workspace route (`/diary`).
 *
 * The Interstitial Journal presented as a timeline-first workspace with two real
 * modes:
 *
 *   - DAY (default): the entries for ONE selected local calendar day, defaulting
 *     to today unless a valid `?date=YYYY-MM-DD` is present. The day's occurred-at
 *     range is resolved with the existing display-zone helpers
 *     (`startOfLocalDayUtc`/`endOfLocalDayUtc`) — never re-derived in the browser —
 *     so a 23:30-local entry files under its local day, DST-correctly.
 *   - TIMELINE (`?mode=timeline`): the multi-day historical timeline with the
 *     bounded, cursor-paginated read model unchanged.
 *
 * The trusted server boundary reads the workspace-bound, RESERVED `DiaryRepository`
 * (never the generic entity collection) through the authenticated composition seam,
 * lists a BOUNDED, cursor-paginated page in deterministic `(occurred_at, id)`
 * order, and groups it into local-day sections with the kernel's pure
 * `groupEntriesByDay` resolved in the explicit display time zone. Entry-type and
 * mode/date are URL-backed so they survive refresh and Back/Forward; an invalid
 * `date` degrades to today, and a malformed or scope-mismatched cursor degrades
 * calmly rather than 500-ing (mirrors `~/modules/notes/routes/index`).
 */

import { env } from "cloudflare:workers";

import { toLocalDayKey } from "~/kernel/diary";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { DiaryWorkspaceView } from "../DiaryWorkspace";
import {
  parseEntryTypeFilter,
  serializeTimelinePage,
  type SerializedDayGroup,
} from "../diary-view";
import {
  DIARY_DISPLAY_TIME_ZONE,
  endOfLocalDayUtc,
  isValidDayKey,
  startOfLocalDayUtc,
} from "../occurred-time";
import type { Route } from "./+types/index";

/** The page size — bounded and modest so pagination is exercised early. */
const DIARY_TIMELINE_PAGE_SIZE = 25;

/** The Diary presentation mode. */
export type DiaryMode = "day" | "timeline";

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
  const mode: DiaryMode =
    url.searchParams.get("mode") === "timeline" ? "timeline" : "day";

  const now = new Date();
  const todayKey = toLocalDayKey(now, DIARY_DISPLAY_TIME_ZONE);

  // Day mode is anchored to a single valid local day. An absent or malformed
  // `?date=` degrades to today rather than a broken range (safe degradation).
  const dateParam = url.searchParams.get("date") ?? "";
  const selectedDate =
    mode === "day" &&
    dateParam &&
    isValidDayKey(dateParam, DIARY_DISPLAY_TIME_ZONE)
      ? dateParam
      : todayKey;

  const occurredFrom =
    mode === "day"
      ? (startOfLocalDayUtc(selectedDate, DIARY_DISPLAY_TIME_ZONE) ?? undefined)
      : undefined;
  const occurredTo =
    mode === "day"
      ? (endOfLocalDayUtc(selectedDate, DIARY_DISPLAY_TIME_ZONE) ?? undefined)
      : undefined;

  const isFiltered = entryTypes !== undefined;

  const base = {
    mode,
    displayTimeZone: DIARY_DISPLAY_TIME_ZONE,
    nowIso: now.toISOString(),
    todayKey,
    selectedDate,
    activeTypes: entryTypes ?? [],
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

    // Per-type counts are honest only when the WHOLE result is loaded and no type
    // filter is narrowing the data — i.e. Day mode, unfiltered, single page. Any
    // other case (paginated, or already type-filtered) would understate, so the
    // filter chips show labels alone.
    const fullyLoaded = page.nextCursor === null;
    const typeCounts =
      mode === "day" && !isFiltered && fullyLoaded
        ? tallyByType(page.items)
        : null;

    return {
      ...base,
      groups: serializeTimelinePage(page.items, DIARY_DISPLAY_TIME_ZONE),
      nextCursor: page.nextCursor,
      typeCounts,
      failed: false,
    };
  } catch {
    // A storage fault OR a malformed/scope-mismatched cursor: degrade to a calm
    // error so the shell stays usable — never a 500.
    return {
      ...base,
      groups: [] as SerializedDayGroup[],
      nextCursor: null as string | null,
      typeCounts: null as Readonly<Record<string, number>> | null,
      failed: true,
    };
  }
}

/** Count loaded entries by their entry type (for the honest filter-chip counts). */
function tallyByType(
  items: readonly { readonly entryType: string }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.entryType] = (counts[item.entryType] ?? 0) + 1;
  }
  return counts;
}

export default function DiaryRoute({ loaderData }: Route.ComponentProps) {
  return <DiaryWorkspaceView {...loaderData} />;
}
