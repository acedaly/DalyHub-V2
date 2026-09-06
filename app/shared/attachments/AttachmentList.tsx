/**
 * V2.11 FILE-01 — the list of a record's evidence, and of what is still on its
 * way there.
 *
 * Two groups in one list, deliberately: an uploading file appears in the same
 * place its finished row will, so nothing jumps when it lands. The pending
 * entries sit AFTER the stored ones because that is where a newly-attached file
 * ends up (attachments are ordered oldest first), so the row does not move at
 * all when the upload completes.
 *
 * A pending entry is never rendered as an attachment. It has no download link,
 * no preview and no size the server has confirmed — it carries the browser's own
 * `File.size`, labelled as what it is. "Uploaded" is a word this component
 * cannot say until the row is a real one.
 */

import { formatAttachmentSize } from "~/kernel/attachments";
import type { SerializedAttachment } from "~/kernel/attachments";

import { AttachmentRow } from "./AttachmentRow";
import type { PendingUpload } from "./use-attachments";

export interface AttachmentListProps {
  readonly attachments: readonly SerializedAttachment[];
  readonly pending?: readonly PendingUpload[];
  readonly onRemove?: (attachment: SerializedAttachment) => void;
  readonly onRetry?: (operationId: string) => void;
  readonly onDismiss?: (operationId: string) => void;
  /** Which stored attachment is being removed. */
  readonly removingId?: string | null;
  readonly "data-testid"?: string;
}

export function AttachmentList({
  attachments,
  pending = [],
  onRemove,
  onRetry,
  onDismiss,
  removingId = null,
  "data-testid": testId = "attachment-list",
}: AttachmentListProps) {
  return (
    <ul className="dh-attachment-list" data-testid={testId}>
      {attachments.map((attachment) => (
        <AttachmentRow
          key={attachment.id}
          attachment={attachment}
          onRemove={onRemove}
          busy={removingId === attachment.id}
        />
      ))}
      {pending.map((entry) => (
        <li
          key={entry.operationId}
          className={`dh-attachment-row dh-attachment-row--${entry.state}`}
          data-testid="attachment-pending"
          data-state={entry.state}
        >
          <span className="dh-attachment-row__lead" aria-hidden="true">
            <span className="dh-attachment-row__kind">
              {entry.state === "failed" ? "Failed" : "…"}
            </span>
          </span>
          <span className="dh-attachment-row__main">
            <span className="dh-attachment-row__name">{entry.filename}</span>
            <span className="dh-attachment-row__meta">
              {entry.state === "failed"
                ? /*
                   * The SERVER's sentence where there is one — "that file is
                   * larger than 10.0 MB", "SVG files aren't accepted because an
                   * SVG can run code" — because those tell the owner what to do.
                   */
                  (entry.error ?? "Couldn’t be attached.")
                : `Uploading · ${formatAttachmentSize(entry.byteSize)}`}
            </span>
          </span>
          <span className="dh-attachment-row__actions">
            {entry.state === "failed" && onRetry ? (
              <button
                type="button"
                className="dh-btn dh-btn--ghost dh-btn--sm"
                onClick={() => onRetry(entry.operationId)}
                data-testid="attachment-retry"
              >
                Try again
                <span className="dh-visually-hidden"> {entry.filename}</span>
              </button>
            ) : null}
            {entry.state === "failed" && onDismiss ? (
              <button
                type="button"
                className="dh-btn dh-btn--ghost dh-btn--sm"
                onClick={() => onDismiss(entry.operationId)}
                data-testid="attachment-dismiss"
              >
                Discard
                <span className="dh-visually-hidden"> {entry.filename}</span>
              </button>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
