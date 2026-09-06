/**
 * V2.11 FILE-01 — the ONE attachment row.
 *
 * Drawn identically wherever a record carries evidence: an Obligation, an Asset,
 * a Meeting, a Note, a Project, a Task, a Goal, a Person. There is no
 * `AssetAttachmentRow`, no `MeetingDocumentRow` and no Finance receipt row, and
 * `attachment-consumers.test.tsx` fails if one appears.
 *
 * ## Long filenames
 *
 * A document name is often long and its EXTENSION is the part that says what it
 * is, so the name wraps rather than truncating with an ellipsis that would eat
 * `.pdf`. `overflow-wrap: anywhere` breaks inside a word if it has to — a 90
 * character name at 320px has nowhere else to go — and the row never widens the
 * page.
 *
 * ## Accessible names carry the filename
 *
 * Every action reads `Download <filename>`, `Open <filename>`, `Remove
 * <filename>`. A list of ten files where every button is announced as "Download"
 * is a list a screen-reader user cannot act on. The visible label stays short;
 * the filename is in a visually-hidden span, which is the pattern the shared
 * obligation row already uses.
 *
 * ## The image thumbnail
 *
 * Only where `previewHref` is non-null, which the server decides — raster images
 * and nothing else, because DalyHub's CSP means nothing else can be displayed
 * inside a page. It is decoration on a row that already works without it, so it
 * is `alt=""` and `aria-hidden`: the filename beside it is the content.
 */

import type { SerializedAttachment } from "~/kernel/attachments";

export interface AttachmentRowProps {
  readonly attachment: SerializedAttachment;
  /** Omit to render the row read-only (an archived record, a print view). */
  readonly onRemove?: (attachment: SerializedAttachment) => void;
  /** True while THIS attachment is being removed. */
  readonly busy?: boolean;
  readonly "data-testid"?: string;
}

export function AttachmentRow({
  attachment,
  onRemove,
  busy = false,
  "data-testid": testId = "attachment-row",
}: AttachmentRowProps) {
  return (
    <li className="dh-attachment-row" data-testid={testId}>
      <span className="dh-attachment-row__lead" aria-hidden="true">
        {attachment.previewHref ? (
          <img
            className="dh-attachment-row__thumb"
            src={attachment.previewHref}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="dh-attachment-row__kind">
            {attachment.kindLabel}
          </span>
        )}
      </span>

      <span className="dh-attachment-row__main">
        <a
          className="dh-attachment-row__name"
          href={attachment.downloadHref}
          data-testid={`${testId}-open`}
        >
          {attachment.filename}
        </a>
        <span className="dh-attachment-row__meta">
          {attachment.kindLabel} · {attachment.sizeLabel} ·{" "}
          {attachment.createdLabel}
        </span>
      </span>

      <span className="dh-attachment-row__actions">
        <a
          className="dh-btn dh-btn--ghost dh-btn--sm"
          href={attachment.downloadHref}
          // A same-origin authenticated route; the response carries
          // `Content-Disposition: attachment`, so this saves rather than
          // navigating away from the record.
          download={attachment.filename}
          data-testid={`${testId}-download`}
        >
          Download
          <span className="dh-visually-hidden"> {attachment.filename}</span>
        </a>
        {onRemove ? (
          <button
            type="button"
            className="dh-btn dh-btn--ghost dh-btn--sm"
            disabled={busy}
            onClick={() => onRemove(attachment)}
            data-testid={`${testId}-remove`}
          >
            Remove
            <span className="dh-visually-hidden"> {attachment.filename}</span>
          </button>
        ) : null}
      </span>
    </li>
  );
}
