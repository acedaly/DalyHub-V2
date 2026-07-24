/**
 * NOTES-01B — the canonical Note record, composed through the shared DS-02
 * Record Layout.
 *
 * Presentation only: the header (generic entity identity — title, Rename —
 * never a bespoke Notes-only header), the "Note" tab (the Markdown source
 * editor/preview, `NoteContentForm`) and the "Activity" tab. Data loading and
 * mutations live in the route; this component only renders them. Deliberately
 * has no third "Settings"/"Links" tab — NOTES-01B ships no capability that
 * would need one (DESIGN_SYSTEM.md: never an empty tab for a future
 * capability).
 */

import type { ReactNode } from "react";

import { EntityIcon } from "~/shared/entity";
import {
  RecordLayout,
  type RecordAction,
  type RecordMetaItem,
} from "~/shared/record-layout";
import { formatCalendarDate } from "~/shared/task-record/task-view";

import { NoteContentForm } from "./NoteContentForm";
import type {
  SerializedNoteDetails,
  SerializedNoteOverview,
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
  const updated = dateLabel(overview.updatedAt);

  const summaryMetadata: RecordMetaItem[] = [];
  if (created) {
    summaryMetadata.push({ id: "created", label: "Created", value: created });
  }
  if (updated) {
    summaryMetadata.push({ id: "updated", label: "Updated", value: updated });
  }

  const renameAction: RecordAction = {
    id: "rename",
    label: "Rename",
    variant: "secondary",
    onSelect: onRename,
  };

  return (
    <RecordLayout
      title={overview.title}
      typeLabel="Note"
      icon={<EntityIcon type="note" />}
      breadcrumb={[{ id: "notes", label: "Notes", href: "/notes" }]}
      secondaryActions={[renameAction]}
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
            />
          ),
        },
        { id: "activity", label: "Activity", content: activityTab },
      ]}
    />
  );
}
