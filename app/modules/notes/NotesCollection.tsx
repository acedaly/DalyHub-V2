/**
 * NOTES-01B/NOTES-01C — the Notes collection view (presentation, no server
 * imports).
 *
 * Replaces the PX-03 "Coming Soon" placeholder with the shared PX-02
 * Collection Layout and DS-04 Card. Composed ENTIRELY from the shared frame —
 * the DS-03 Drawer (hosting the DS-06 "New note" form), the shared
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";

import {
  Card,
  CardCollection,
  type CardAction,
  type CardMetaItem,
  type CardProps,
} from "~/shared/card";
import { CollectionLayout } from "~/shared/collection-layout";
import {
  DrawerProvider,
  DrawerTrigger,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import { LoadMore } from "~/shared/load-more";
import {
  SegmentedFilter,
  type SegmentedFilterOption,
} from "~/shared/segmented-filter";
import { formatCalendarDate } from "~/shared/task-record/task-view";

import { NewNoteForm } from "./NewNoteForm";
import type { SerializedNoteListItem } from "./note-view";
import type { NoteMutationResult } from "./routes/mutate";

/** The drawer key hosting the create form. */
const NEW_NOTE_KEY = "new-note";

/** NOTES-01C lifecycle filter states — mirrors Projects' `ProjectState`. */
export type NoteCollectionState = "active" | "deleted";

const STATE_OPTIONS: readonly SegmentedFilterOption[] = [
  { value: "active", label: "Active" },
  { value: "deleted", label: "Deleted" },
];

export interface NotesCollectionViewProps {
  readonly notes: readonly SerializedNoteListItem[];
  /** Opaque cursor for the next page from the loader, or null when exhausted. */
  readonly nextCursor: string | null;
  readonly state: NoteCollectionState;
  readonly failed: boolean;
}

/**
 * The subset of the collection loader's payload a "Load more" fetch reads
 * back: the next page of Notes and the following cursor (plus the calm
 * failure flag).
 */
type NotesPageData = {
  readonly notes: readonly SerializedNoteListItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
};

export function NotesCollectionView({
  notes,
  nextCursor,
  state,
  failed,
}: NotesCollectionViewProps) {
  const navigate = useNavigate();

  const renderDrawer = useMemo(() => {
    return function render(entry: DrawerEntry): DrawerRenderResult | null {
      if (entry.key !== NEW_NOTE_KEY) {
        return null;
      }
      return {
        title: "New note",
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
  const updated = formatCalendarDate(note.updatedAt.slice(0, 10));
  if (updated) {
    metadata.push({ id: "updated", label: "Updated", value: updated });
  }

  return {
    id: note.id,
    title: note.title,
    typeLabel: "Note",
    icon: <EntityIcon type="note" />,
    headingLevel: 2,
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
function useNotePagination(
  firstPage: readonly SerializedNoteListItem[],
  initialCursor: string | null,
  state: NoteCollectionState,
) {
  const fetcher = useFetcher<NotesPageData>();
  const [appended, setAppended] = useState<SerializedNoteListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadFailed, setLoadFailed] = useState(false);
  const processed = useRef<NotesPageData | null>(null);

  useEffect(() => {
    setAppended([]);
    setCursor(initialCursor);
    setLoadFailed(false);
    processed.current = null;
  }, [initialCursor, state]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return;
    }
    const data = fetcher.data;
    if (processed.current === data) {
      return;
    }
    processed.current = data;
    if (data.failed) {
      setLoadFailed(true);
      return;
    }
    setAppended((prev) => [...prev, ...data.notes]);
    setCursor(data.nextCursor);
    setLoadFailed(false);
  }, [fetcher.state, fetcher.data]);

  const loadMore = useCallback(() => {
    if (cursor === null) {
      return;
    }
    setLoadFailed(false);
    fetcher.load(`/notes?cursor=${encodeURIComponent(cursor)}&state=${state}`);
  }, [cursor, fetcher, state]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: SerializedNoteListItem[] = [];
    for (const note of [...firstPage, ...appended]) {
      if (seen.has(note.id)) {
        continue;
      }
      seen.add(note.id);
      out.push(note);
    }
    return out;
  }, [firstPage, appended]);

  return {
    items,
    hasMore: cursor !== null,
    loading: fetcher.state !== "idle",
    loadFailed,
    loadMore,
  };
}

/** Restore a Note from the Deleted view. Not a Drawer/confirmation flow — the
 * Deleted collection IS the deliberate, explicit restore surface (spec §C);
 * one click, an honest success toast, no second confirmation step for an
 * action the user came here specifically to take. */
function useRestoreNote() {
  const feedback = useFeedback();
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [restoredIds, setRestoredIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const restore = useCallback(
    (noteId: string, title: string) => {
      setPendingIds((prev) => new Set(prev).add(noteId));
      const body = new FormData();
      body.set("intent", "restore");
      void fetch(`/notes/${encodeURIComponent(noteId)}/mutate`, {
        method: "POST",
        body,
      })
        .then((response) => response.json() as Promise<NoteMutationResult>)
        .then((result) => {
          setPendingIds((prev) => {
            const next = new Set(prev);
            next.delete(noteId);
            return next;
          });
          if (result.kind === "restore" && result.ok) {
            setRestoredIds((prev) => new Set(prev).add(noteId));
            feedback.notifySuccess(`"${title}" restored`);
          } else {
            feedback.notifyError(`Couldn't restore "${title}". Try again.`);
          }
        })
        .catch(() => {
          setPendingIds((prev) => {
            const next = new Set(prev);
            next.delete(noteId);
            return next;
          });
          feedback.notifyError(`Couldn't restore "${title}". Try again.`);
        });
    },
    [feedback],
  );

  return { restore, pendingIds, restoredIds };
}

function NotesCollection({
  notes,
  nextCursor,
  state,
  failed,
  onOpenNote,
}: {
  readonly notes: readonly SerializedNoteListItem[];
  readonly nextCursor: string | null;
  readonly state: NoteCollectionState;
  readonly failed: boolean;
  readonly onOpenNote: (id: string) => void;
}) {
  const { items, hasMore, loading, loadFailed, loadMore } = useNotePagination(
    notes,
    nextCursor,
    state,
  );
  const { restore, pendingIds, restoredIds } = useRestoreNote();

  const visibleItems =
    state === "deleted"
      ? items.filter((note) => !restoredIds.has(note.id))
      : items;

  const count = visibleItems.length;
  // Never present the loaded-row count as the TOTAL while more pages remain —
  // say how many are "loaded" so far, not how many exist.
  const noun = state === "deleted" ? "deleted notes" : "notes";
  const subtitle = failed
    ? `We couldn't load your ${state === "deleted" ? "deleted notes" : "notes"}.`
    : hasMore
      ? `${count} ${noun} loaded`
      : count === 1
        ? state === "deleted"
          ? "1 deleted note"
          : "1 note"
        : `${count} ${noun}`;

  return (
    <CollectionLayout
      title="Notes"
      subtitle={subtitle}
      entityType="note"
      filterBar={
        <SegmentedFilter
          param="state"
          options={STATE_OPTIONS}
          value={state}
          label="Filter notes by state"
        />
      }
      primaryAction={
        state === "active" ? (
          <DrawerTrigger
            drawerKey={NEW_NOTE_KEY}
            className="dh-btn dh-btn--primary"
          >
            New note
          </DrawerTrigger>
        ) : undefined
      }
      error={
        failed ? (
          <EmptyState
            title={`We couldn't load your ${state === "deleted" ? "deleted notes" : "notes"}`}
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={!failed && count === 0 && state === "active"}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="note" />}
          title="No notes yet"
          description="Notes hold what you know and think — references, drafts, research, ideas. Create your first one to get started."
          primaryAction={
            <DrawerTrigger
              drawerKey={NEW_NOTE_KEY}
              className="dh-btn dh-btn--primary"
            >
              New note
            </DrawerTrigger>
          }
        />
      }
      isFilteredEmpty={!failed && count === 0 && state === "deleted"}
      filteredEmptySlot={
        <EmptyState
          icon={<EntityIcon type="note" />}
          title="No deleted notes"
          description="Notes you delete appear here, and can be restored at any time."
        />
      }
    >
      <CardCollection
        items={visibleItems}
        getItemId={(note) => note.id}
        ariaLabel={state === "deleted" ? "Deleted notes" : "Notes"}
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
          label={
            state === "deleted" ? "Load more deleted notes" : "Load more notes"
          }
        />
      ) : null}
    </CollectionLayout>
  );
}
