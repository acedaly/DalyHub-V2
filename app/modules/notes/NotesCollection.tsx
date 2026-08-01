/**
 * NOTES-01B/NOTES-01C — the Notes collection view (presentation, no server
 * imports).
 *
 * Replaces the PX-03 "Coming Soon" placeholder with the shared PX-02
 * Collection Layout and DS-04 Card. Composed ENTIRELY from the shared frame —
 * the DS-03 Drawer (hosting the DS-06 "New Note" form), the shared
 * `~/shared/segmented-filter` Active/Deleted lifecycle filter (NOTES-01C,
 * mirroring `~/modules/projects/ProjectsCollection.tsx`'s state segment), a
 * restrained state segment, and bounded "Load more" pagination. Each ACTIVE
 * Card opens the canonical Note record through NORMAL client navigation (a
 * real link + SPA open), never an inaccessible clickable container. A DELETED
 * Note's canonical route 404s (soft-deleted entities read as "not found"
 * everywhere else in the kernel), so its Card renders no open target at all —
 * only a "Restore" quick action, mirroring `~/shared/card`'s documented
 * "static title, quick actions only" shape.
 */

import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router";

import {
  Card,
  CardCollection,
  type CardAction,
  type CardMetaItem,
  type CardProps,
} from "~/shared/card";
import {
  CollectionLayout,
  useCollectionLoading,
} from "~/shared/collection-layout";
import {
  DrawerProvider,
  DrawerTrigger,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { useCollectionRestore } from "~/shared/record-lifecycle";
import { formatCalendarDate } from "~/shared/task-record/task-view";

import { NewNoteForm } from "./NewNoteForm";
import { NotesFilterBar, hasActiveFilters } from "./NotesFilterBar";
import type {
  NoteCollectionState,
  NoteFilterOption,
  NoteFilterValues,
  SerializedNoteListItem,
} from "./note-view";
import type { NoteMutationResult } from "./routes/mutate";

/** The drawer key hosting the create form. */
const NEW_NOTE_KEY = "new-note";

export type { NoteCollectionState };

/** The bounded option lists the filter selects offer. */
export interface NoteFilterOptions {
  readonly tags: readonly NoteFilterOption[];
  readonly projects: readonly NoteFilterOption[];
  readonly areas: readonly NoteFilterOption[];
}

export interface NotesCollectionViewProps {
  readonly notes: readonly SerializedNoteListItem[];
  /** Opaque cursor for the next page from the loader, or null when exhausted. */
  readonly nextCursor: string | null;
  readonly state: NoteCollectionState;
  readonly filters: NoteFilterValues;
  readonly options: NoteFilterOptions;
  readonly failed: boolean;
}

/**
 * The subset of the collection loader's payload a "Load more" fetch reads
 * back: the next page of Notes and the following cursor (plus the calm
 * failure flag). `state` is the lifecycle filter the page was FETCHED FOR —
 * carried through so a response that resolves after the user has since
 * switched Active/Deleted can be told apart from one that matches the
 * currently selected view (see `useNotePagination` below).
 */
type NotesPageData = {
  readonly notes: readonly SerializedNoteListItem[];
  readonly nextCursor: string | null;
  readonly state: NoteCollectionState;
  readonly failed: boolean;
};

export function NotesCollectionView({
  notes,
  nextCursor,
  state,
  filters,
  options,
  failed,
}: NotesCollectionViewProps) {
  const navigate = useNavigate();

  const renderDrawer = useMemo(() => {
    return function render(entry: DrawerEntry): DrawerRenderResult | null {
      if (entry.key !== NEW_NOTE_KEY) {
        return null;
      }
      return {
        title: "New Note",
        description: "Give your note a title. You can write its content next.",
        children: (
          <NewNoteFormHost
            onCreated={(id) => navigate(`/notes/${encodeURIComponent(id)}`)}
          />
        ),
      };
    };
  }, [navigate]);

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <NotesCollection
        notes={notes}
        nextCursor={nextCursor}
        state={state}
        filters={filters}
        options={options}
        failed={failed}
        onOpenNote={(id) => navigate(`/notes/${encodeURIComponent(id)}`)}
      />
    </DrawerProvider>
  );
}

/**
 * The create-form host. `onCreated` navigates straight to the new Note's
 * canonical record — that navigation itself replaces the `?drawer=new-note`
 * URL, so no separate `closeDrawer()` call is needed (mirrors
 * `~/modules/projects/ProjectsCollection.tsx`'s `NewProjectFormHost` exactly;
 * calling both would race two navigations against each other).
 */
function NewNoteFormHost({
  onCreated,
}: {
  readonly onCreated: (noteId: string) => void;
}) {
  const { closeDrawer } = useDrawer();
  return <NewNoteForm onCreated={onCreated} onCancel={closeDrawer} />;
}

function toCardProps(
  note: SerializedNoteListItem,
  onOpenNote: (id: string) => void,
): CardProps {
  const metadata: CardMetaItem[] = [];
  const updated = formatCalendarDate(note.effectiveUpdatedAt.slice(0, 10));
  if (updated) {
    metadata.push({ id: "updated", label: "Updated", value: updated });
  }
  if (note.tags.length > 0) {
    metadata.push({
      id: "tags",
      label: "Tags",
      value: note.tags.join(", "),
    });
  }
  metadata.push({
    id: "links",
    label: "Links",
    value: note.linkCount === 0 ? "None" : String(note.linkCount),
  });
  // Archive is state, not decoration — it is stated in WORDS, never by colour
  // or a glyph alone, so it survives forced-colours and a screen reader.
  if (note.archived) {
    metadata.push({ id: "state", label: "State", value: "Archived" });
  }

  return {
    id: note.id,
    title: note.title,
    typeLabel: "Note",
    icon: <EntityIcon type="note" />,
    headingLevel: 2,
    // The excerpt is the shared analyser's syntax-free reading of the body, so a
    // card never shows `##` or half a code fence (§5).
    ...(note.excerpt ? { subtitle: note.excerpt } : {}),
    metadata,
    density: "comfortable",
    presentation: "list",
    href: `/notes/${encodeURIComponent(note.id)}`,
    onOpen: () => onOpenNote(note.id),
    openAriaLabel: `Open ${note.title}`,
  };
}

/**
 * A DELETED Note's Card: no open target (its canonical route 404s — deleted
 * entities read as "not found" everywhere), just identity + a "Restore" quick
 * action. `pending`/`restoredIds` let the collection show one row settling
 * while its POST is in flight and hide a row the moment it is confirmed
 * restored, without waiting for a full page reload.
 */
function toDeletedCardProps(
  note: SerializedNoteListItem,
  onRestore: (id: string, title: string) => void,
  pending: boolean,
): CardProps {
  const metadata: CardMetaItem[] = [];
  const updated = formatCalendarDate(note.updatedAt.slice(0, 10));
  if (updated) {
    metadata.push({ id: "updated", label: "Deleted", value: updated });
  }

  const restoreAction: CardAction = {
    id: "restore",
    label: "Restore",
    pending,
    onSelect: () => onRestore(note.id, note.title),
  };

  return {
    id: note.id,
    title: note.title,
    typeLabel: "Note",
    icon: <EntityIcon type="note" />,
    headingLevel: 2,
    metadata,
    density: "comfortable",
    presentation: "list",
    quickActions: [restoreAction],
  };
}

/**
 * Accumulate keyset pages behind a "Load more" affordance WITHOUT navigating
 * (mirrors `useProjectPagination` in `~/modules/projects/ProjectsCollection.tsx`
 * exactly — see that file for the reasoning behind each reset/merge rule).
 * Resets whenever the loader hands back a fresh first page — either a new
 * `initialCursor` scope OR a lifecycle `state` switch (Active ⇄ Deleted is a
 * DIFFERENT bound cursor scope entirely; stale accumulated rows from the
 * other state must never linger merged into the new one).
 */
/**
 * UX-01 — Notes' private paginator was one of five near-identical copies of the
 * same forty lines (DEBT-45). It is now the ONE shared `useKeysetPagination`.
 *
 * The copy carried an extra guard: it discarded a page whose echoed `state` no
 * longer matched the selected lifecycle view. The shared hook's request-scoped
 * rule subsumes it and is strictly stronger — a scope change clears the pending
 * request, so ANY response issued under a previous scope is discarded, not only
 * one whose state field happens to disagree.
 */
function useNotePagination(
  firstPage: readonly SerializedNoteListItem[],
  initialCursor: string | null,
  state: NoteCollectionState,
  filterKey: string,
) {
  // The next page MUST be requested under the same filter scope the cursor was
  // issued for; `filterKey` is the serialised scope, so this can never ask the
  // server to resume one result set inside another.
  const path = `/notes?${filterKey}${filterKey ? "&" : ""}state=${state}`;
  return useKeysetPagination<SerializedNoteListItem, NotesPageData>({
    firstPage,
    initialCursor,
    path,
    select: selectNotesPage,
    getId: noteId,
  });
}

/** Stable module-level selectors, so the shared hook's memo identity is stable. */
function selectNotesPage(data: NotesPageData) {
  return {
    items: data.notes,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function noteId(note: SerializedNoteListItem): string {
  return note.id;
}

/** Restore a Note from the Deleted view. Not a Drawer/confirmation flow — the
 * Deleted collection IS the deliberate, explicit restore surface (spec §C);
 * one click, an honest success toast, no second confirmation step for an
 * action the user came here specifically to take. PX-04 moved the in-flight
 * bookkeeping into the shared `useCollectionRestore`, so every Deleted view
 * behaves identically; only the endpoint stays here. */
function useRestoreNote() {
  const post = useCallback(async (noteId: string) => {
    const body = new FormData();
    body.set("intent", "restore");
    const response = await fetch(
      `/notes/${encodeURIComponent(noteId)}/mutate`,
      { method: "POST", body },
    );
    const result = (await response.json()) as NoteMutationResult;
    return result.kind === "restore" && result.ok;
  }, []);

  return useCollectionRestore({ post });
}

/** The filter dimensions, serialised as a query string — the cursor's scope. */
function filterQueryKey(filters: NoteFilterValues): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.project) params.set("project", filters.project);
  if (filters.area) params.set("area", filters.area);
  if (filters.links !== "all") params.set("links", filters.links);
  if (filters.sort !== "created") params.set("sort", filters.sort);
  return params.toString();
}

function NotesCollection({
  notes,
  nextCursor,
  state,
  filters,
  options,
  failed,
  onOpenNote,
}: {
  readonly notes: readonly SerializedNoteListItem[];
  readonly nextCursor: string | null;
  readonly state: NoteCollectionState;
  readonly filters: NoteFilterValues;
  readonly options: NoteFilterOptions;
  readonly failed: boolean;
  readonly onOpenNote: (id: string) => void;
}) {
  const filterKey = filterQueryKey(filters);
  const { items, hasMore, loading, loadFailed, loadMore } = useNotePagination(
    notes,
    nextCursor,
    state,
    filterKey,
  );
  const { restore, pendingIds, restoredIds } = useRestoreNote();

  const visibleItems =
    state === "deleted"
      ? items.filter((note) => !restoredIds.has(note.id))
      : items;

  const count = visibleItems.length;
  const filtered = hasActiveFilters(filters);
  // Never present the loaded-row count as the TOTAL while more pages remain —
  // say how many are "loaded" so far, not how many exist.
  const noun =
    state === "deleted"
      ? "deleted notes"
      : state === "archived"
        ? "archived notes"
        : "notes";
  const singular =
    state === "deleted"
      ? "1 deleted note"
      : state === "archived"
        ? "1 archived note"
        : "1 note";
  const subtitle = failed
    ? `We couldn\u2019t load your ${noun}.`
    : hasMore
      ? `${count} ${noun} loaded`
      : count === 1
        ? singular
        : `${count} ${noun}`;

  // PX-06: the ONE shared collection loading signal — a same-route navigation
  // (a filter, a view, a page) shows the shared skeleton instead of leaving the
  // previous list on screen with no feedback.
  const isReloading = useCollectionLoading();
  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Notes"
      subtitle={subtitle}
      entityType="note"
      filterBar={
        <NotesFilterBar
          state={state}
          filters={filters}
          tags={options.tags}
          projects={options.projects}
          areas={options.areas}
        />
      }
      primaryAction={
        state === "active" ? (
          <DrawerTrigger
            drawerKey={NEW_NOTE_KEY}
            className="dh-btn dh-btn--primary"
          >
            New Note
          </DrawerTrigger>
        ) : undefined
      }
      error={
        failed ? (
          <EmptyState
            title={`We couldn\u2019t load your ${noun}`}
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={
        !failed && count === 0 && !hasMore && state === "active" && !filtered
      }
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="note" />}
          title="No Notes yet"
          description="Notes hold what you know and think \u2014 references, drafts, research, ideas. Create your first one to get started."
          primaryAction={
            <DrawerTrigger
              drawerKey={NEW_NOTE_KEY}
              className="dh-btn dh-btn--primary"
            >
              New Note
            </DrawerTrigger>
          }
        />
      }
      isFilteredEmpty={
        !failed && count === 0 && !hasMore && (state !== "active" || filtered)
      }
      filteredEmptySlot={
        <EmptyState
          icon={<EntityIcon type="note" />}
          title={
            state === "deleted"
              ? "No deleted Notes"
              : state === "archived"
                ? "No archived Notes"
                : "No Notes match these filters"
          }
          description={
            state === "deleted"
              ? "Notes you delete appear here, and can be restored at any time."
              : state === "archived"
                ? "Notes you archive appear here. Archiving keeps a note and every link it has \u2014 it just leaves the active list."
                : "Try a different search, tag, project or area \u2014 or clear the filters to see every note."
          }
        />
      }
    >
      <CardCollection
        items={visibleItems}
        getItemId={(note) => note.id}
        ariaLabel={
          state === "deleted"
            ? "Deleted notes"
            : state === "archived"
              ? "Archived notes"
              : "Notes"
        }
        presentation="list"
        density="comfortable"
        renderCard={(note) =>
          state === "deleted" ? (
            <Card
              {...toDeletedCardProps(note, restore, pendingIds.has(note.id))}
            />
          ) : (
            <Card {...toCardProps(note, onOpenNote)} />
          )
        }
      />
      {!failed && hasMore ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={loadMore}
          label={`Load more ${noun}`}
        />
      ) : null}
    </CollectionLayout>
  );
}
