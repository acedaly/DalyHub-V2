/**
 * NOTES-01B/01C/02/03/06 — the canonical Note record, composed through the
 * shared DS-02 Record Layout.
 *
 * Presentation only: the header (generic entity identity — title, Rename, and
 * the ONE shared DS-12 overflow holding Tags, Export, Archive and Delete), the
 * "Note" tab (the writing editor), "Backlinks", "Links" and "Activity". Data
 * loading and mutations live in the route; this component only renders them.
 *
 * The knowledge completion added three things here and nothing else:
 *   - two relationship tabs, because "who points at this" and "what does this
 *     point at" are different questions (§4) — they are NOT merged into one
 *     ambiguous list, and neither replaces the shared REL-01 Linked Items
 *     surface, which stays the place relationships are *edited*;
 *   - tags and archive state in the shared Summary (in WORDS, never colour or a
 *     glyph alone), with their actions in the shared overflow;
 *   - Export in that same overflow — one lifecycle/overflow vocabulary, no
 *     Notes-only action bar (DS-12/PX-04).
 */

import { useRef, type ReactNode } from "react";

import type { SanitizedMarkdownHtml } from "~/kernel/markdown";
import { EntityIcon } from "~/shared/entity";
import { CopyIcon, DownloadIcon, PrinterIcon, TagIcon } from "~/shared/icons";
import { MarkdownContent } from "~/shared/markdown";
import type { OverflowMenuItem } from "~/shared/overflow-menu";
import {
  RecordLayout,
  type RecordAction,
  type RecordMetaItem,
} from "~/shared/record-layout";
import { useRecordLifecycle } from "~/shared/record-lifecycle";
import { formatCalendarDate } from "~/shared/task-record/task-view";

import { NoteContentForm } from "./NoteContentForm";
import { useArchiveNote } from "./use-archive-note";
import { useDeleteNote } from "./use-delete-note";
import { useNoteExport } from "./use-note-export";
import {
  effectiveNoteUpdatedAt,
  type SerializedNoteDetails,
  type SerializedNoteOverview,
} from "./note-view";

interface NoteOverviewProps {
  readonly overview: SerializedNoteOverview;
  readonly details: SerializedNoteDetails;
  readonly onRename: () => void;
  readonly onEditTags: () => void;
  readonly onSaved: () => void;
  readonly backlinksTab: ReactNode;
  readonly linksTab: ReactNode;
  readonly activityTab: ReactNode;
  readonly activeTabId?: string;
  readonly onTabChange?: (tabId: string) => void;
  /**
   * NOTES-05 §21 — the note rendered by the server through the ONE FND-08
   * pipeline, for the print-only view. `null` when the note is empty or could
   * not be rendered, in which case printing simply omits the body rather than
   * printing an error.
   */
  readonly printHtml?: SanitizedMarkdownHtml | null;
}

function dateLabel(iso: string): string | null {
  return formatCalendarDate(iso.slice(0, 10));
}

export function NoteOverview({
  overview,
  details,
  onRename,
  onEditTags,
  onSaved,
  backlinksTab,
  linksTab,
  activityTab,
  activeTabId,
  onTabChange,
  printHtml = null,
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
  const archived = details.archivedAt !== null;

  const summaryMetadata: RecordMetaItem[] = [];
  if (created) {
    summaryMetadata.push({ id: "created", label: "Created", value: created });
  }
  if (updated) {
    summaryMetadata.push({ id: "updated", label: "Updated", value: updated });
  }
  summaryMetadata.push({
    id: "tags",
    label: "Tags",
    value: details.tags.length > 0 ? details.tags.join(", ") : "None",
  });
  if (archived) {
    // State in words — never a colour-only or icon-only signal (AGENTS.md §15).
    summaryMetadata.push({ id: "state", label: "State", value: "Archived" });
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
  const {
    archiveNote,
    unarchiveNote,
    pending: archivePending,
  } = useArchiveNote(overview.id);
  const {
    exportNote,
    copyNote,
    pending: exportPending,
  } = useNoteExport(overview.id, overview.title);

  const renameAction: RecordAction = {
    id: "rename",
    label: "Rename",
    variant: "secondary",
    onSelect: onRename,
  };

  // The module's own items sit ABOVE the shared lifecycle group in the ONE
  // overflow, exactly as `useRecordLifecycle` documents — so "where do I find
  // the other things I can do to this record?" has the same answer everywhere.
  const leadingItems: readonly OverflowMenuItem[] = [
    {
      id: "note-tags",
      label: "Edit tags",
      icon: <TagIcon />,
      onSelect: onEditTags,
    },
    {
      id: "note-export-md",
      label: "Export as Markdown (.md)",
      icon: <DownloadIcon />,
      disabled: exportPending,
      onSelect: () => void exportNote("md"),
    },
    {
      id: "note-export-txt",
      label: "Export as plain text (.txt)",
      icon: <DownloadIcon />,
      disabled: exportPending,
      onSelect: () => void exportNote("txt"),
    },
    // NOTES-05 §21 — copy and print. They join the SAME overflow rather than
    // adding a Notes-only action bar (DS-12), and copy serves the identical
    // bytes the matching export writes, so "copy" and "export" can never
    // disagree about what the note is.
    {
      id: "note-copy-md",
      label: "Copy Markdown",
      icon: <CopyIcon />,
      disabled: exportPending,
      onSelect: () => void copyNote("md"),
    },
    {
      id: "note-copy-txt",
      label: "Copy plain text",
      icon: <CopyIcon />,
      disabled: exportPending,
      onSelect: () => void copyNote("txt"),
    },
    {
      id: "note-print",
      label: "Print",
      icon: <PrinterIcon />,
      // `window.print()` is synchronous and always available; the print-only
      // view is already in the DOM, so nothing needs loading first.
      onSelect: () => window.print(),
    },
  ];

  // PX-04: Notes were the reference lifecycle (header button + Undo toast), but
  // the button lived beside Rename while every other module's removal was
  // somewhere else. The behaviour is unchanged — a single click, optimistic, with
  // a DS-10 Undo toast — it has simply moved into the ONE shared overflow slot so
  // the mental model transfers (ADR-042 + PX-04). NOTES-03 adds Archive/Restore
  // to the same group, using the SAME shared vocabulary as Projects and Areas.
  const lifecycle = useRecordLifecycle({
    entityType: "note",
    title: overview.title,
    archived,
    deleteMode: "reversible",
    pending: deletePending || archivePending,
    leadingItems,
    onArchive: archiveNote,
    onRestore: archived ? unarchiveNote : undefined,
    onDelete: async () => {
      deleteNote();
    },
  });

  return (
    <>
      <RecordLayout
        title={overview.title}
        typeLabel="Note"
        icon={<EntityIcon type="note" />}
        breadcrumb={[{ id: "notes", label: "Notes", href: "/notes" }]}
        secondaryActions={[renameAction]}
        overflowActions={lifecycle.overflowActions}
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
          { id: "backlinks", label: "Backlinks", content: backlinksTab },
          { id: "linked", label: "Links", content: linksTab },
          { id: "activity", label: "Activity", content: activityTab },
        ]}
      />
      {lifecycle.dialogs}

      {/*
        NOTES-05 §21 — the print-friendly view.

        Hidden on screen and revealed only by `@media print`, so ⌘P works from
        ANY tab and in either editor mode. This matters: the writing surface is
        CodeMirror, and printing a live editor prints its scroller, its
        decorations and its concealed markers rather than the note.

        It is rendered SERVER-side through the one FND-08 pipeline into the one
        sanctioned `MarkdownContent` sink — no second renderer, no second sink,
        and nothing here can print content the reader was not authorised to see.
        Because it is real DOM rather than a screenshot of the editor, it also
        carries no hidden UI text: only the title, the dates and the note.
      */}
      <div className="dh-note-print" aria-hidden="true">
        <h1 className="dh-note-print__title">{overview.title}</h1>
        <p className="dh-note-print__meta">
          {created ? `Created ${created}` : null}
          {created && updated ? " · " : null}
          {updated ? `Updated ${updated}` : null}
          {details.tags.length > 0 ? ` · ${details.tags.join(", ")}` : null}
        </p>
        {printHtml ? <MarkdownContent html={printHtml} /> : null}
      </div>
    </>
  );
}
