/**
 * NOTES-01B — the Notes collection view (presentation, no server imports).
 *
 * Replaces the PX-03 "Coming Soon" placeholder with the shared PX-02
 * Collection Layout and DS-04 Card. Composed ENTIRELY from the shared frame —
 * the DS-03 Drawer (hosting the DS-06 "New note" form), a restrained state
 * segment, and bounded "Load more" pagination — mirroring
 * `~/modules/projects/ProjectsCollection.tsx`, minus the parent picker and
 * state filter Notes don't have (no fake boards/folders/tags — just a plain,
 * deterministically-ordered list). Each Card opens the canonical Note record
 * through NORMAL client navigation (a real link + SPA open), never an
 * inaccessible clickable container.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";

import {
  Card,
  CardCollection,
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
import { LoadMore } from "~/shared/load-more";
import { formatCalendarDate } from "~/shared/task-record/task-view";

import { NewNoteForm } from "./NewNoteForm";
import type { SerializedNoteListItem } from "./note-view";

/** The drawer key hosting the create form. */
const NEW_NOTE_KEY = "new-note";

export interface NotesCollectionViewProps {
  readonly notes: readonly SerializedNoteListItem[];
  /** Opaque cursor for the next page from the loader, or null when exhausted. */
  readonly nextCursor: string | null;
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
 * Accumulate keyset pages behind a "Load more" affordance WITHOUT navigating
 * (mirrors `useProjectPagination` in `~/modules/projects/ProjectsCollection.tsx`
 * exactly — see that file for the reasoning behind each reset/merge rule).
 */
function useNotePagination(
  firstPage: readonly SerializedNoteListItem[],
  initialCursor: string | null,
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
  }, [initialCursor]);

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
    fetcher.load(`/notes?cursor=${encodeURIComponent(cursor)}`);
  }, [cursor, fetcher]);

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

function NotesCollection({
  notes,
  nextCursor,
  failed,
  onOpenNote,
}: {
  readonly notes: readonly SerializedNoteListItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
  readonly onOpenNote: (id: string) => void;
}) {
  const { items, hasMore, loading, loadFailed, loadMore } = useNotePagination(
    notes,
    nextCursor,
  );

  const count = items.length;
  // Never present the loaded-row count as the TOTAL while more pages remain —
  // say how many are "loaded" so far, not how many exist.
  const subtitle = failed
    ? "We couldn't load your notes."
    : hasMore
      ? `${count} notes loaded`
      : count === 1
        ? "1 note"
        : `${count} notes`;

  return (
    <CollectionLayout
      title="Notes"
      subtitle={subtitle}
      entityType="note"
      primaryAction={
        <DrawerTrigger
          drawerKey={NEW_NOTE_KEY}
          className="dh-btn dh-btn--primary"
        >
          New note
        </DrawerTrigger>
      }
      error={
        failed ? (
          <EmptyState
            title="We couldn't load your notes"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={!failed && count === 0}
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
    >
      <CardCollection
        items={items}
        getItemId={(note) => note.id}
        ariaLabel="Notes"
        presentation="list"
        density="comfortable"
        renderCard={(note) => <Card {...toCardProps(note, onOpenNote)} />}
      />
      {!failed && hasMore ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={loadMore}
          label="Load more notes"
        />
      ) : null}
    </CollectionLayout>
  );
}
