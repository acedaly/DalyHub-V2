/**
 * DIARY-01 — the Diary Timeline view (presentation, no server imports).
 *
 * Timeline-FIRST, not a collection of equal-sized cards: a compact quick-capture
 * surface and a restrained type filter sit above a chronological history grouped
 * under local-day headings, with a strong visual break between days. Each entry
 * shows its type, local time and title immediately; an optional Markdown body is
 * readable through a restrained collapsed/expanded disclosure (rendered only
 * through the one FND-08 sink). Editing opens the route-backed Drawer without
 * leaving the Timeline. Bounded "Load more" pagination accumulates keyset pages
 * behind the shared control; loading, empty, filtered-empty and error states are
 * all handled (a surface that can render blank is incomplete).
 *
 * The capture surface and filter live in the layout's always-visible controls
 * region (not the state-swapped content) so capture stays reachable even when the
 * Timeline is empty, filtered-empty or errored.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useFetcher,
  useNavigation,
  useRevalidator,
  useSearchParams,
} from "react-router";

import type { SanitizedMarkdownHtml } from "~/kernel/markdown";
import { CollectionLayout } from "~/shared/collection-layout";
import {
  DrawerProvider,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { LoadMore } from "~/shared/load-more";
import { MarkdownContent } from "~/shared/markdown";

import { DiaryEntryEditor } from "./DiaryEntryEditor";
import { DiaryTypeFilter } from "./DiaryTypeFilter";
import { QuickCapture } from "./QuickCapture";
import type { SerializedDayGroup, SerializedDiaryEntry } from "./diary-view";
import { diaryDayHeading } from "./occurred-time";

/** The Timeline route's loader payload (both success and calm-failure shapes). */
export interface DiaryTimelineViewProps {
  readonly groups: readonly SerializedDayGroup[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
  readonly displayTimeZone: string;
  readonly nowIso: string;
  readonly todayKey: string;
  readonly activeTypes: readonly string[];
  readonly from: string;
  readonly to: string;
  readonly isFiltered: boolean;
}

/** The prefix identifying the entry-edit Drawer key (`edit:<entryId>`). */
const EDIT_KEY_PREFIX = "edit:";

/** How many characters of a long body to preview while collapsed. */
const COLLAPSED_EXCERPT_CHARS = 160;

type TimelinePageData = {
  readonly groups: readonly SerializedDayGroup[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
};

export function DiaryTimelineView(props: DiaryTimelineViewProps) {
  return (
    <DrawerProvider renderDrawer={renderDiaryDrawer}>
      <DiaryTimelineInner {...props} />
    </DrawerProvider>
  );
}

/** Drawer renderer: the `edit:<id>` key hosts the route-backed entry editor. */
function renderDiaryDrawer(entry: DrawerEntry): DrawerRenderResult | null {
  if (entry.key.startsWith(EDIT_KEY_PREFIX)) {
    const entryId = entry.key.slice(EDIT_KEY_PREFIX.length);
    return {
      title: "Edit entry",
      description:
        "Change this moment's title, type, details or when it happened.",
      size: "wide",
      children: <EditEntryHost entryId={entryId} />,
    };
  }
  return null;
}

function EditEntryHost({ entryId }: { readonly entryId: string }) {
  const { closeDrawer } = useDrawer();
  const revalidator = useRevalidator();
  return (
    <DiaryEntryEditor
      entryId={entryId}
      onSaved={() => {
        revalidator.revalidate();
        closeDrawer();
      }}
      onCancel={closeDrawer}
    />
  );
}

/** Merge an appended page's day groups onto the accumulated list, coalescing the
 * boundary day (the same local day split across a page boundary) — grouping
 * itself stays the kernel's; this is only a day-KEY join. */
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
    const seen = new Set(last.entries.map((entry) => entry.id));
    merged[merged.length - 1] = {
      day: last.day,
      entries: [
        ...last.entries,
        ...firstNext.entries.filter((entry) => !seen.has(entry.id)),
      ],
    };
    merged.push(...restNext);
  } else {
    merged.push(...next);
  }
  return merged;
}

/**
 * Accumulate keyset pages behind "Load more" without navigating, merging day
 * groups across page boundaries. Resets whenever the first page changes (a
 * filter navigation or a post-capture/save revalidation re-runs the loader).
 */
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
    params.delete("drawer");
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

/** True only while a Timeline SCOPE change (type/date filter) is loading — not a
 * drawer-open or load-more, so opening the editor never blanks the Timeline. */
function useFilterLoading(
  activeTypes: readonly string[],
  from: string,
  to: string,
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
  const nextTypes = next.getAll("type").sort().join(",");
  const currentTypes = [...activeTypes].sort().join(",");
  return (
    nextTypes !== currentTypes ||
    (next.get("from") ?? "") !== from ||
    (next.get("to") ?? "") !== to
  );
}

function DiaryTimelineInner(props: DiaryTimelineViewProps) {
  const {
    groups: firstGroups,
    nextCursor,
    failed,
    todayKey,
    activeTypes,
    from,
    to,
    isFiltered,
  } = props;
  const [searchParams] = useSearchParams();
  const { openDrawer } = useDrawer();
  const revalidator = useRevalidator();

  const { groups, hasMore, loading, loadFailed, loadMore } = useDiaryTimeline(
    firstGroups,
    nextCursor,
    searchParams,
  );
  const isFilterLoading = useFilterLoading(activeTypes, from, to);

  const activeType = activeTypes.length === 1 ? activeTypes[0] : null;
  const entryCount = groups.reduce(
    (sum, group) => sum + group.entries.length,
    0,
  );

  const isEmpty =
    !failed && !isFilterLoading && entryCount === 0 && !isFiltered;
  const isFilteredEmpty =
    !failed && !isFilterLoading && entryCount === 0 && isFiltered;

  const onEdit = useCallback(
    (entryId: string) => openDrawer(`${EDIT_KEY_PREFIX}${entryId}`),
    [openDrawer],
  );

  const subtitle = failed
    ? "We couldn't load your diary."
    : hasMore
      ? `${entryCount} shown`
      : entryCount === 1
        ? "1 entry"
        : `${entryCount} entries`;

  return (
    <CollectionLayout
      className="dh-diary-collection"
      title="Diary"
      subtitle={subtitle}
      entityType="diary"
      filterBar={
        <div className="dh-diary-controls">
          <QuickCapture onCaptured={() => revalidator.revalidate()} />
          <DiaryTypeFilter activeType={activeType} />
        </div>
      }
      isLoading={isFilterLoading}
      error={
        failed ? (
          <EmptyState
            icon={<EntityIcon type="diary" />}
            title="We couldn't load your diary"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={isEmpty}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="diary" />}
          title="Your diary is empty"
          description="Capture your first moment above — a meeting, a decision, an idea. Just a type and a title."
        />
      }
      isFilteredEmpty={isFilteredEmpty}
      filteredEmptySlot={
        <EmptyState
          icon={<EntityIcon type="diary" />}
          title="No entries match this filter"
          description="No diary entries match the current type. Clear the filter to see your whole Timeline."
          primaryAction={
            <a className="dh-btn dh-btn--secondary" href="/diary">
              Clear filter
            </a>
          }
        />
      }
    >
      <TimelineBody groups={groups} todayKey={todayKey} onEdit={onEdit} />
      {!failed && hasMore ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={loadMore}
          label="Load more entries"
        />
      ) : null}
    </CollectionLayout>
  );
}

function TimelineBody({
  groups,
  todayKey,
  onEdit,
}: {
  readonly groups: readonly SerializedDayGroup[];
  readonly todayKey: string;
  readonly onEdit: (entryId: string) => void;
}) {
  return (
    <ol className="dh-diary-timeline" aria-label="Diary timeline">
      {groups.map((group) => (
        <li key={group.day} className="dh-diary-day">
          <h2 className="dh-diary-day__heading">
            {diaryDayHeading(group.day, todayKey)}
          </h2>
          <ol className="dh-diary-day__entries">
            {group.entries.map((entry) => (
              <DiaryEntryRow key={entry.id} entry={entry} onEdit={onEdit} />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

function DiaryEntryRow({
  entry,
  onEdit,
}: {
  readonly entry: SerializedDiaryEntry;
  readonly onEdit: (entryId: string) => void;
}) {
  return (
    <li className="dh-diary-entry">
      <div className="dh-diary-entry__meta">
        <time className="dh-diary-entry__time" dateTime={entry.occurredAtIso}>
          {entry.occurredTimeLabel}
        </time>
        <span className="dh-diary-entry__type">{entry.entryTypeLabel}</span>
        {entry.backdated ? (
          <span className="dh-diary-entry__backdated">Backdated</span>
        ) : null}
      </div>
      <div className="dh-diary-entry__body">
        <h3 className="dh-diary-entry__title">{entry.title}</h3>
        {entry.bodySource !== null ? (
          <DiaryEntryBody source={entry.bodySource} isLong={entry.bodyIsLong} />
        ) : null}
      </div>
      <div className="dh-diary-entry__actions">
        <button
          type="button"
          className="dh-btn dh-btn--ghost dh-diary-entry__edit"
          onClick={() => onEdit(entry.id)}
        >
          Edit
          <span className="dh-visually-hidden"> {entry.title}</span>
        </button>
      </div>
    </li>
  );
}

/** A single, plain-text-collapsed / Markdown-expanded body. The heavy renderer is
 * lazy-loaded only when the body is expanded, so the Timeline route never pulls
 * the parser bundle for collapsed entries. */
function DiaryEntryBody({
  source,
  isLong,
}: {
  readonly source: string;
  readonly isLong: boolean;
}) {
  const [expanded, setExpanded] = useState(!isLong);
  const [html, setHtml] = useState<SanitizedMarkdownHtml | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    if (!expanded || html !== null) return;
    let active = true;
    import("~/platform/markdown")
      .then(({ renderMarkdownSource }) => {
        if (!active) return;
        try {
          setHtml(renderMarkdownSource(source).html);
        } catch {
          setRenderFailed(true);
        }
      })
      .catch(() => {
        if (active) setRenderFailed(true);
      });
    return () => {
      active = false;
    };
  }, [expanded, html, source]);

  const excerpt = useMemo(() => {
    const collapsed = source.replace(/\s+/g, " ").trim();
    return collapsed.length > COLLAPSED_EXCERPT_CHARS
      ? `${collapsed.slice(0, COLLAPSED_EXCERPT_CHARS)}…`
      : collapsed;
  }, [source]);

  if (!expanded) {
    return (
      <div className="dh-diary-entry__preview">
        <p className="dh-diary-entry__excerpt">{excerpt}</p>
        <button
          type="button"
          className="dh-btn dh-btn--ghost dh-diary-entry__toggle"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
        >
          Show more
        </button>
      </div>
    );
  }

  return (
    <div className="dh-diary-entry__content">
      {renderFailed ? (
        <p className="dh-diary-entry__render-error">
          This content can’t be shown right now.
        </p>
      ) : html !== null ? (
        <MarkdownContent html={html} />
      ) : (
        <p className="dh-diary-entry__excerpt" aria-hidden="true">
          {excerpt}
        </p>
      )}
      {isLong ? (
        <button
          type="button"
          className="dh-btn dh-btn--ghost dh-diary-entry__toggle"
          aria-expanded={true}
          onClick={() => setExpanded(false)}
        >
          Show less
        </button>
      ) : null}
    </div>
  );
}
