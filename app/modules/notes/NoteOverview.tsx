/**
 * NOTES-01B/NOTES-01C — the canonical Note record, composed through the
 * shared DS-02 Record Layout.
 *
 * Presentation only: the header (generic entity identity — title, Rename,
 * Delete — never a bespoke Notes-only header), the "Note" tab (the Markdown
 * source editor/preview, `NoteContentForm`) and the "Activity" tab. Data
 * loading and mutations live in the route; this component only renders them.
 * Deliberately has no third "Settings"/"Links" tab — Delete lives as a Record
 * Header action (via `useDeleteNote`'s Undo-toast flow) rather than a Settings
 * tab, since a deleted Note's canonical route 404s (soft-deleted entities read
 * as "not found" everywhere in the kernel) and there is nothing else on this
 * record that would justify a Settings tab existing just for one action
 * (DESIGN_SYSTEM.md: never an empty tab for a future capability).
 */

import { useRef, type ReactNode } from "react";

import { EntityIcon } from "~/shared/entity";
import {
  RecordLayout,
  type RecordAction,
  type RecordMetaItem,
} from "~/shared/record-layout";
import { formatCalendarDate } from "~/shared/task-record/task-view";

import { NoteContentForm } from "./NoteContentForm";
import { useDeleteNote } from "./use-delete-note";
import {
  effectiveNoteUpdatedAt,
  type SerializedNoteDetails,
  type SerializedNoteOverview,
} from "./note-view";

interface NoteOverviewProps {
  readonly overview: SerializedNoteOverview;
  readonly details: SerializedNoteDetails;
  readonly onRename: () => void;
  readonly onSaved: () => void;
  readonly activityTab: ReactNode;
  readonly activeTabId?: string;
  readonly onTabChange?: (tabId: string) => void;
}

function dateLabel(iso: string): string | null {
  return formatCalendarDate(iso.slice(0, 10));
}

export function NoteOverview({
  overview,
  details,
  onRename,
  onSaved,
  activityTab,
  activeTabId,
  onTabChange,
}: NoteOverviewProps) {
  const created = dateLabel(overview.createdAt);
  // The record's "Updated" value must reflect a content-only save too — the
  // entity's own `updatedAt` only advances on rename, while a Markdown save
  // advances `noteDetails.contentUpdatedAt` instead (NOTES_PERSISTENCE.md's
  // content-timestamp contract). `effectiveNoteUpdatedAt` is the later of the
  // two, matching the Activity tab's reload key.
  const updated = dateLabel(
    effectiveNoteUpdatedAt(overview.updatedAt, details.contentUpdatedAt),
  );

  const summaryMetadata: RecordMetaItem[] = [];
  if (created) {
    summaryMetadata.push({ id: "created", label: "Created", value: created });
  }
  if (updated) {
    summaryMetadata.push({ id: "updated", label: "Updated", value: updated });
  }

  // Handed to `NoteContentForm` (which sets it during render, alongside its
  // own `onSavedRef` pattern) and read by `useDeleteNote` so Delete can flush
  // the latest edit through the SAME field it came from before it unmounts
  // the editor — see both files' doc comments for why this matters.
  const flushContentRef = useRef<(() => Promise<boolean>) | null>(null);

  const {
    deleteNote,
    pending: deletePending,
    deleted,
  } = useDeleteNote(overview.id, overview.title, flushContentRef);

  const renameAction: RecordAction = {
    id: "rename",
    label: "Rename",
    variant: "secondary",
    onSelect: onRename,
  };
  const deleteAction: RecordAction = {
    id: "delete",
    label: "Delete note",
    variant: "secondary",
    disabled: deletePending,
    onSelect: deleteNote,
  };

  return (
    <RecordLayout
      title={overview.title}
      typeLabel="Note"
      icon={<EntityIcon type="note" />}
      breadcrumb={[{ id: "notes", label: "Notes", href: "/notes" }]}
      secondaryActions={[renameAction, deleteAction]}
      summary={
        summaryMetadata.length > 0 ? { metadata: summaryMetadata } : undefined
      }
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      tabs={[
        {
          id: "note",
          label: "Note",
          content: (
            <NoteContentForm
              noteId={overview.id}
              initialContent={details.content}
              onSaved={onSaved}
              suppressGuard={deleted}
              flushRef={flushContentRef}
            />
          ),
        },
        { id: "activity", label: "Activity", content: activityTab },
      ]}
    />
  );
}
