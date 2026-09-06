/**
 * V2.11 FILE-01 — the Evidence section, and the ONE thing a record drops in.
 *
 * A consumer writes:
 *
 * ```tsx
 * <AttachmentsSection ownerEntityId={asset.id} attachments={asset.attachments} />
 * ```
 *
 * and gets the picker, the list, the states, the announcements and the empty
 * state. It configures CAPABILITY — can this record be added to, can its files
 * be removed — never anatomy. A consumer that wanted a different row would be
 * asking for a second attachment system, which is what
 * `attachment-consumers.test.tsx` refuses.
 *
 * ## Where it goes on a record
 *
 * In the record's own content, under its own heading, as reference material —
 * beside Linked items rather than in the feature slot. Evidence is what you
 * consult when you are already looking at the record; it is never what the
 * record is FOR, and it is never on a collection row or on Today. The paper
 * lives with the thing, and the thing is the record.
 *
 * ## Announcements
 *
 * One polite live region, carrying one sentence at a time: "Uploading
 * receipt.pdf", "receipt.pdf attached", "receipt.pdf could not be removed". It
 * is `aria-live="polite"` rather than `assertive` because an upload is not an
 * interruption, and it holds one sentence rather than appending, so a burst of
 * five files announces five transitions rather than a growing paragraph.
 */

import { useState } from "react";

import { useFeedback } from "~/shared/feedback";
import { ConfirmationDialog } from "~/shared/settings";
import type { SerializedAttachment } from "~/kernel/attachments";

import { AttachmentList } from "./AttachmentList";
import { AttachmentPicker } from "./AttachmentPicker";
import { useAttachments } from "./use-attachments";

export interface AttachmentsSectionProps {
  /** The record this evidence belongs to. */
  readonly ownerEntityId: string;
  /** What the record's own loader already read. No second fetch on mount. */
  readonly attachments: readonly SerializedAttachment[];
  /**
   * Render read-only: no picker, no Remove.
   *
   * The capability, not the anatomy. An archived Asset and a completed
   * Obligation both pass `readOnly`, and both draw exactly the same rows the
   * editable ones do — which is what makes "one attachment surface" true rather
   * than aspirational.
   */
  readonly readOnly?: boolean;
  /** The heading. Defaults to the product's word for this. */
  readonly heading?: string;
  /** One sentence under the heading, where a record wants to say what belongs here. */
  readonly description?: string;
  /** Called after any change, so a record can revalidate its loader. */
  readonly onChanged?: () => void;
  readonly "data-testid"?: string;
}

export function AttachmentsSection({
  ownerEntityId,
  attachments,
  readOnly = false,
  heading = "Evidence",
  description,
  onChanged,
  "data-testid": testId = "attachments-section",
}: AttachmentsSectionProps) {
  const feedback = useFeedback();
  const controller = useAttachments({
    ownerEntityId,
    initial: attachments,
    feedback,
    onChanged,
  });

  /*
   * Removal is CONFIRMED, and it is the one place this surface departs from
   * `AGENTS.md §2`'s "prefer undo over confirmation dialogs".
   *
   * Undo is not available to prefer. Removing a file hard-deletes the row and
   * owes the bytes to the purge sweep, deliberately: a soft-deleted attachment
   * whose bytes are still in the bucket tells the owner their document is gone
   * when it is not (ADR-119 decision 7). A client-held undo window was the other
   * candidate and is worse for exactly the same reason — close the tab inside
   * the window and the file the owner watched disappear is still there.
   *
   * So the fallback the rule leaves open applies: a deliberate confirmation, in
   * the shared dialog, saying plainly that this cannot be undone. The same
   * shape, for the same reason, as discarding an offline capture.
   */
  const [pendingRemoval, setPendingRemoval] =
    useState<SerializedAttachment | null>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);

  const empty =
    controller.attachments.length === 0 && controller.pending.length === 0;

  return (
    <section className="dh-attachments" data-testid={testId}>
      <div className="dh-attachments__header">
        <h2 className="dh-attachments__heading">{heading}</h2>
        {description ? (
          <p className="dh-attachments__description">{description}</p>
        ) : null}
      </div>

      {empty ? (
        <p className="dh-attachments__empty" data-testid={`${testId}-empty`}>
          {readOnly
            ? "No files are attached to this record."
            : "No files yet. Attach the policy, the receipt or the photo that proves this."}
        </p>
      ) : (
        <AttachmentList
          attachments={controller.attachments}
          pending={controller.pending}
          onRemove={
            readOnly
              ? undefined
              : (attachment, trigger) => {
                  setOpener(trigger);
                  setPendingRemoval(attachment);
                }
          }
          onRetry={readOnly ? undefined : controller.retry}
          onDismiss={readOnly ? undefined : controller.dismiss}
          removingId={controller.removingId}
        />
      )}

      {readOnly ? null : (
        <AttachmentPicker
          onSelect={controller.add}
          data-testid={`${testId}-picker`}
        />
      )}

      {/*
       * One sentence at a time, politely. Rendered unconditionally so the region
       * exists before it has anything to say — a live region created at the
       * moment of its first message is a live region assistive technology has
       * not been watching.
       */}
      <p
        className="dh-visually-hidden"
        role="status"
        aria-live="polite"
        data-testid={`${testId}-status`}
      >
        {controller.status}
      </p>

      <ConfirmationDialog
        open={pendingRemoval !== null}
        title="Remove this file?"
        confirmLabel="Remove file"
        cancelLabel="Keep it"
        busyLabel="Removing…"
        tone="danger"
        opener={opener}
        onClose={() => setPendingRemoval(null)}
        onConfirm={async () => {
          if (pendingRemoval) await controller.remove(pendingRemoval);
        }}
      >
        <p>
          “{pendingRemoval?.filename}” will be deleted from DalyHub permanently.
          It cannot be undone, and it will not be in any backup taken after
          this.
        </p>
      </ConfirmationDialog>
    </section>
  );
}
