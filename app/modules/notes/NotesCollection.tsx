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
  CollectionLayout,
  collectionCountLabel,
  CreateActionLabel,
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
import { ViewSwitcher } from "~/shared/view-switcher";
import { EntityIcon } from "~/shared/entity";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { useCollectionRestore } from "~/shared/record-lifecycle";

import { NewNoteForm } from "./NewNoteForm";
import { NotesList } from "./NotesList";
import {
  NOTE_STATE_OPTIONS,
  NotesFilterBar,
  hasActiveFilters,
} from "./NotesFilterBar";
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
}: {
  readonly notes: readonly SerializedNoteListItem[];
  readonly nextCursor: string | null;
  readonly state: NoteCollectionState;
  readonly filters: NoteFilterValues;
  readonly options: NoteFilterOptions;
  readonly failed: boolean;
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
  // The lifecycle state qualifies the noun; it never replaces the count.
  const scope =
    state === "deleted" ? "deleted" : state === "archived" ? "archived" : "";
  /** The same qualified noun, for the error and "Load more" copy. */
  const noun = scope ? `${scope} Notes` : "Notes";
  const subtitle = failed
    ? `We couldn\u2019t load your ${scope ? `${scope} ` : ""}Notes.`
    : collectionCountLabel(count, "Note", "Notes", {
        hasMore,
        ...(scope ? { scope } : {}),
      });

  // PX-06: the ONE shared collection loading signal — a same-route navigation
  // (a filter, a view, a page) shows the shared skeleton instead of leaving the
  // previous list on screen with no feedback.
  const isReloading = useCollectionLoading();
  return (
    <CollectionLayout
      // DS-08 — Notes is a flat LIST of hairline-separated rows, so it takes the
      // white ground D41 gives one. It was drawn on the card grid's grey.
      className="dh-collection--flat"
      isLoading={isReloading}
      title="Notes"
      subtitle={subtitle}
      // UIQ-013 — Active / Archived / Deleted is Notes' principal mode, in the
      // shared header view slot; the search, tag, Project, Area, link-state and
      // ordering controls stay filters, in the band beneath.
      viewSwitcher={
        <ViewSwitcher
          param="state"
          options={NOTE_STATE_OPTIONS}
          value={state}
          label="Note views"
        />
      }
      filterBar={
        <NotesFilterBar
          state={state}
          filters={filters}
          tags={options.tags}
          projects={options.projects}
          areas={options.areas}
        />
      }
      // Shell cleanup: the header's "New Note" button is gone. It opened the
      // generic create drawer with no context the global capture control does not
      // already supply — and the capture panel posts to `POST /notes/new`, the
      // very same NOTES-01B route this drawer posts to, so nothing about how a
      // Note is created has changed. The `?drawer=new-note` URL still resolves
      // (deep links and the empty state below both use it), so this removes an
      // affordance, not a path.
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
              <CreateActionLabel>New note</CreateActionLabel>
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
      <NotesList
        notes={visibleItems}
        ariaLabel={
          state === "deleted"
            ? "Deleted notes"
            : state === "archived"
              ? "Archived notes"
              : "Notes"
        }
        {...(state === "deleted" ? { onRestore: restore, pendingIds } : {})}
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
