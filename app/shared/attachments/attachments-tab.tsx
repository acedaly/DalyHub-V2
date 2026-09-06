/**
 * V2.11 FILE-01 — the Evidence TAB, so a consumer adds one line rather than one
 * layout.
 *
 * ```tsx
 * tabs={[…, attachmentsTab({ ownerEntityId: asset.id, attachments, onChanged })]}
 * ```
 *
 * ## Why a tab, and not a section under the Overview
 *
 * Every record in DalyHub uses the same layout — header, feature, tabs — and
 * evidence is the same kind of thing on every one of them: reference material
 * you consult once you are already looking at the record. Putting it in the
 * Overview would push a record's actual content down by a picker and a hint on
 * every page, including the overwhelming majority of records that will never
 * carry a file. A tab costs one word in the strip until it is used, and it is
 * where "Linked" already sits — the other relationship-shaped thing a record
 * has.
 *
 * The count is on the tab, so the owner can see that a record HAS evidence
 * without opening it. It is a badge rather than part of the label, because a
 * label that changes from "Evidence" to "Evidence (3)" changes the accessible
 * name of a control every time a file is added.
 */

import type { SerializedAttachment } from "~/kernel/attachments";
import type { RecordTab } from "~/shared/record-layout";

import { AttachmentsSection } from "./AttachmentsSection";

export interface AttachmentsTabInput {
  readonly ownerEntityId: string;
  readonly attachments: readonly SerializedAttachment[];
  /** Render read-only — an archived record, a completed obligation. */
  readonly readOnly?: boolean;
  /** One sentence saying what belongs here, in this record's own terms. */
  readonly description?: string;
  readonly onChanged?: () => void;
  /** Override only where a record genuinely calls it something else. */
  readonly id?: string;
  readonly label?: string;
}

/** Build the shared Evidence tab for a record. */
export function attachmentsTab(input: AttachmentsTabInput): RecordTab {
  return {
    id: input.id ?? "evidence",
    label: input.label ?? "Evidence",
    badge:
      input.attachments.length > 0
        ? String(input.attachments.length)
        : undefined,
    content: (
      <AttachmentsSection
        ownerEntityId={input.ownerEntityId}
        attachments={input.attachments}
        readOnly={input.readOnly}
        description={input.description}
        onChanged={input.onChanged}
        // The heading is the tab's own label, so the panel does not repeat it.
        heading="Files"
      />
    ),
  };
}
