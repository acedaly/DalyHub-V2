/**
 * DIARY-01B — the Diary workspace view (presentation, no server imports).
 *
 * A timeline-first workspace: a coherent toolbar (Day/Timeline mode, a Day-mode date
 * navigator, a compact type filter, and one restrained "New entry" action) above a
 * real visual timeline. Opening an entry preserves the timeline beside it through the
 * shared DS-10 Inspector — docked on desktop, a modal sheet on mobile — and quick
 * capture is launched on demand (button, `c` shortcut, mobile floating action) rather
 * than occupying a permanent panel.
 *
 * State lives in the URL: `mode`, `date` (Day mode), `type`, `cursor` (pagination)
 * and `inspector` (the open entry / capture). Load-more accumulates keyset pages
 * behind the shared control; loading, empty, filtered-empty and error states are all
 * handled. Capture and the timeline stay reachable in every state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useFetcher,
  useNavigate,
  useNavigation,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { CollectionLayout } from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import { PlusIcon } from "~/shared/icons";
import {
  InspectorProvider,
  useInspector,
  type InspectorEntry,
  type InspectorRenderResult,
} from "~/shared/inspector";
import { LoadMore } from "~/shared/load-more";

import { DiaryCapture } from "./DiaryCapture";
import { DiaryDayNavigator } from "./DiaryDayNavigator";
import { DiaryDetailsHost, type DetailsPanelMode } from "./DiaryDetailsPanel";
import { DiaryModeTabs } from "./DiaryModeTabs";
import { DiaryTimelineBody } from "./DiaryTimelineBody";
import { DiaryTypeFilter } from "./DiaryTypeFilter";
import type { SerializedDayGroup } from "./diary-view";
import { formatDayKeyLong } from "./occurred-time";
import type { DiaryMode } from "./routes/index";

/** The workspace loader payload (both success and calm-failure shapes). */
export interface DiaryWorkspaceViewProps {
  readonly mode: DiaryMode;
  readonly groups: readonly SerializedDayGroup[];
  readonly nextCursor: string | null;
  readonly typeCounts: Readonly<Record<string, number>> | null;
  readonly failed: boolean;
  readonly displayTimeZone: string;
  readonly nowIso: string;
  readonly todayKey: string;
  readonly selectedDate: string;
  readonly activeTypes: readonly string[];
  readonly isFiltered: boolean;
}

const VIEW_PREFIX = "view:";
const EDIT_PREFIX = "edit:";
const CAPTURE_KEY = "new";

type TimelinePageData = {
  readonly groups: readonly SerializedDayGroup[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
};

export function DiaryWorkspaceView(props: DiaryWorkspaceViewProps) {
  return (
    <InspectorProvider renderInspector={makeRenderInspector(props.todayKey)}>
      <DiaryWorkspaceInner {...props} />
    </InspectorProvider>
  );
}

/**
 * The Inspector render map. The key alone drives it (so a deep link resolves): the
 * capture flow (`new`), the read/edit details (`view:<id>` / `edit:<id>`). The host
 * components pull revalidate/close/navigate from hooks, so this stays a pure key map.
 */
function makeRenderInspector(todayKey: string) {
  return function renderInspector(
    entry: InspectorEntry,
  ): InspectorRenderResult | null {
    if (entry.key === CAPTURE_KEY) {
      return {
        title: "New entry",
        description: "Capture a moment — a meeting, a decision, an idea.",
        children: <CaptureHost todayKey={todayKey} />,
      };
    }
    if (
      entry.key.startsWith(VIEW_PREFIX) ||
      entry.key.startsWith(EDIT_PREFIX)
    ) {
      const isEdit = entry.key.startsWith(EDIT_PREFIX);
      const entryId = entry.key.slice(
        (isEdit ? EDIT_PREFIX : VIEW_PREFIX).length,
      );
      return {
        title: isEdit ? "Edit entry" : "Entry details",
        children: (
          <DetailsHost entryId={entryId} mode={isEdit ? "edit" : "read"} />
        ),
      };
    }
    return null;
  };
}

/** Capture host — wires the compact capture form to revalidate/close/cross-day. */
function CaptureHost({ todayKey }: { readonly todayKey: string }) {
  const { closeInspector } = useInspector();
  const revalidator = useRevalidator();
  const feedback = useFeedback();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const onCaptured = useCallback(
    (_entryId: string, capturedDayKey: string) => {
      revalidator.revalidate();
      closeInspector();
      feedback.notifySuccess("Entry captured");

      // Honest cross-day handling: a backdated entry that belongs to another day
      // (Day mode) is not silently made to appear under the wrong date — offer to
      // view the day it actually landed on.
      const mode = searchParams.get("mode") === "timeline" ? "timeline" : "day";
      const selectedDate =
        searchParams.get("date") || (mode === "day" ? todayKey : "");
      if (mode === "day" && capturedDayKey !== selectedDate) {
        feedback.notifyInfo(`Saved to ${formatDayKeyLong(capturedDayKey)}`, {
          message: "That day isn’t the one you’re viewing.",
          action: {
            label: "View that day",
            onSelect: () => {
              const next = new URLSearchParams(searchParams);
              next.delete("cursor");
              // These params were captured while the capture panel was open, so
              // they still name it — drop `inspector` so viewing the day doesn't
              // immediately reopen capture (and inert the timeline on mobile).
              next.delete("inspector");
              if (capturedDayKey === todayKey) next.delete("date");
              else next.set("date", capturedDayKey);
              const query = next.toString();
              navigate(query ? `?${query}` : "?", { preventScrollReset: true });
            },
          },
        });
      }
    },
    [revalidator, closeInspector, feedback, navigate, searchParams, todayKey],
  );

  return <DiaryCapture todayKey={todayKey} onCaptured={onCaptured} />;
}

/** Details host — wires read/edit to the Inspector URL key + revalidate/close. */
function DetailsHost({
  entryId,
  mode,
}: {
  readonly entryId: string;
  readonly mode: DetailsPanelMode;
}) {
  const { closeInspector, replaceInspector } = useInspector();
  const revalidator = useRevalidator();
  return (
    <DiaryDetailsHost
      entryId={entryId}
      mode={mode}
      onRequestEdit={() => replaceInspector(`${EDIT_PREFIX}${entryId}`)}
      onRequestRead={() => replaceInspector(`${VIEW_PREFIX}${entryId}`)}
      onChanged={() => revalidator.revalidate()}
      onClose={closeInspector}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                 */
/* -------------------------------------------------------------------------- */

function mergeGroups(
  accumulated: readonly SerializedDayGroup[],
  next: readonly SerializedDayGroup[],
): SerializedDayGroup[] {
  if (next.length === 0) return [...accumulated];
  if (accumulated.length === 0) return [...next];
  const merged = [...accumulated];
  const last = merged[merged.length - 1];
  const [firstNext, ...restNext] = next;
  if (last.day === firstNext.day) {
    const seen = new Set(last.entries.map((e) => e.id));
    merged[merged.length - 1] = {
      day: last.day,
      entries: [
        ...last.entries,
        ...firstNext.entries.filter((e) => !seen.has(e.id)),
      ],
    };
    merged.push(...restNext);
  } else {
    merged.push(...next);
  }
  return merged;
}

function useDiaryTimeline(
  firstGroups: readonly SerializedDayGroup[],
  initialCursor: string | null,
  searchParams: URLSearchParams,
) {
  const fetcher = useFetcher<TimelinePageData>();
  const [pages, setPages] = useState<SerializedDayGroup[][]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadFailed, setLoadFailed] = useState(false);
  const processed = useRef<TimelinePageData | null>(null);

  useEffect(() => {
    setPages([]);
    setCursor(initialCursor);
    setLoadFailed(false);
    processed.current = null;
  }, [firstGroups, initialCursor]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const data = fetcher.data;
    if (processed.current === data) return;
    processed.current = data;
    if (data.failed) {
      setLoadFailed(true);
      return;
    }
    setPages((prev) => [...prev, [...data.groups]]);
    setCursor(data.nextCursor);
    setLoadFailed(false);
  }, [fetcher.state, fetcher.data]);

  const loadMore = useCallback(() => {
    if (cursor === null) return;
    setLoadFailed(false);
    const params = new URLSearchParams(searchParams);
    params.set("cursor", cursor);
    // The pagination fetch is a data load, never a panel navigation.
    params.delete("inspector");
    fetcher.load(`/diary?${params.toString()}`);
  }, [cursor, fetcher, searchParams]);

  const groups = useMemo(
    () =>
      [firstGroups, ...pages].reduce(mergeGroups, [] as SerializedDayGroup[]),
    [firstGroups, pages],
  );

  return {
    groups,
    hasMore: cursor !== null,
    loading: fetcher.state !== "idle",
    loadFailed,
    loadMore,
  };
}

/** True only while a SCOPE change (mode/date/type) is loading — not a panel open. */
function useScopeLoading(
  mode: DiaryMode,
  selectedDate: string,
  activeTypes: readonly string[],
): boolean {
  const navigation = useNavigation();
  if (
    navigation.state !== "loading" ||
    !navigation.location ||
    navigation.location.pathname !== "/diary"
  ) {
    return false;
  }
  const next = new URLSearchParams(navigation.location.search);
  const nextMode = next.get("mode") === "timeline" ? "timeline" : "day";
  const nextTypes = next.getAll("type").sort().join(",");
  const currentTypes = [...activeTypes].sort().join(",");
  const nextDate = next.get("date") || "";
  const currentDate = mode === "day" ? selectedDate : "";
  return (
    nextMode !== mode ||
    nextTypes !== currentTypes ||
    (nextMode === "day" && nextDate !== "" && nextDate !== currentDate)
  );
}

/* -------------------------------------------------------------------------- */
/* Workspace                                                                  */
/* -------------------------------------------------------------------------- */

function selectedIdFrom(openKey: string | null): string | null {
  if (openKey === null) return null;
  if (openKey.startsWith(VIEW_PREFIX)) return openKey.slice(VIEW_PREFIX.length);
  if (openKey.startsWith(EDIT_PREFIX)) return openKey.slice(EDIT_PREFIX.length);
  return null;
}

function DiaryWorkspaceInner(props: DiaryWorkspaceViewProps) {
  const {
    mode,
    groups: firstGroups,
    nextCursor,
    typeCounts,
    failed,
    todayKey,
    selectedDate,
    activeTypes,
    isFiltered,
  } = props;
  const [searchParams] = useSearchParams();
  const inspector = useInspector();

  const { groups, hasMore, loading, loadFailed, loadMore } = useDiaryTimeline(
    firstGroups,
    nextCursor,
    searchParams,
  );
  const isScopeLoading = useScopeLoading(mode, selectedDate, activeTypes);

  const activeType = activeTypes.length === 1 ? activeTypes[0] : null;
  const entryCount = groups.reduce((sum, g) => sum + g.entries.length, 0);
  const selectedId = selectedIdFrom(inspector.openKey);

  const isEmptyResult = !failed && !isScopeLoading && entryCount === 0;
  const isFilteredEmpty = isEmptyResult && isFiltered;
  const isEmpty = isEmptyResult && !isFiltered;

  const openCapture = useCallback(
    () => inspector.openInspector(CAPTURE_KEY),
    [inspector],
  );
  const onSelect = useCallback(
    (id: string) => inspector.openInspector(`${VIEW_PREFIX}${id}`),
    [inspector],
  );
  const onEdit = useCallback(
    (id: string) => inspector.openInspector(`${EDIT_PREFIX}${id}`),
    [inspector],
  );

  // The `c` keyboard shortcut opens capture when the user isn't typing and no
  // surface is already open.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "c" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isEditableTarget(event.target) || inspector.isOpen) return;
      event.preventDefault();
      openCapture();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [inspector.isOpen, openCapture]);

  const subtitle = failed
    ? "We couldn’t load your diary."
    : mode === "day"
      ? formatDayKeyLong(selectedDate)
      : hasMore
        ? `${entryCount} shown`
        : entryCount === 1
          ? "1 entry"
          : `${entryCount} entries`;

  return (
    <>
      <CollectionLayout
        className="dh-diary-collection"
        title="Diary"
        subtitle={subtitle}
        entityType="diary"
        viewSwitcher={<DiaryModeTabs mode={mode} />}
        primaryAction={
          <button
            type="button"
            className="dh-btn dh-btn--primary"
            onClick={openCapture}
          >
            <PlusIcon aria-hidden="true" />
            New entry
          </button>
        }
        filterBar={
          <div className="dh-diary-toolbar">
            {mode === "day" ? (
              <DiaryDayNavigator
                selectedDate={selectedDate}
                todayKey={todayKey}
              />
            ) : null}
            <DiaryTypeFilter activeType={activeType} typeCounts={typeCounts} />
          </div>
        }
        isLoading={isScopeLoading}
        error={
          failed ? (
            <EmptyState
              icon={<EntityIcon type="diary" />}
              title="We couldn’t load your diary"
              description="Something went wrong. Please try again."
            />
          ) : undefined
        }
        isEmpty={isEmpty}
        emptySlot={
          <EmptyState
            icon={<EntityIcon type="diary" />}
            title={
              mode === "day"
                ? "Nothing recorded on this day"
                : "Your diary is empty"
            }
            description={
              mode === "day"
                ? "Capture a moment for this day — a meeting, a decision, an idea. Just a type and a title."
                : "Capture your first moment — a meeting, a decision, an idea. Just a type and a title."
            }
            primaryAction={
              <button
                type="button"
                className="dh-btn dh-btn--primary"
                onClick={openCapture}
              >
                New entry
              </button>
            }
          />
        }
        isFilteredEmpty={isFilteredEmpty}
        filteredEmptySlot={
          <EmptyState
            icon={<EntityIcon type="diary" />}
            title="No entries match this filter"
            description="No diary entries match the current type. Clear the filter to see more."
            primaryAction={
              <a
                className="dh-btn dh-btn--secondary"
                href={clearTypeHref(searchParams)}
              >
                Clear filter
              </a>
            }
          />
        }
      >
        <DiaryTimelineBody
          groups={groups}
          mode={mode}
          todayKey={todayKey}
          selectedId={selectedId}
          onSelect={onSelect}
          onEdit={onEdit}
        />
        {!failed && hasMore ? (
          <LoadMore
            loading={loading}
            loadFailed={loadFailed}
            onLoadMore={loadMore}
            label="Load more entries"
          />
        ) : null}
      </CollectionLayout>

      <button
        type="button"
        className="dh-diary-fab"
        aria-label="New entry"
        onClick={openCapture}
      >
        <PlusIcon aria-hidden="true" />
      </button>
    </>
  );
}

/** A `?` href that clears the type filter (and its stale cursor), keeping mode/date. */
function clearTypeHref(searchParams: URLSearchParams): string {
  const next = new URLSearchParams(searchParams);
  next.delete("type");
  next.delete("cursor");
  const query = next.toString();
  return query.length > 0 ? `?${query}` : "?";
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}
