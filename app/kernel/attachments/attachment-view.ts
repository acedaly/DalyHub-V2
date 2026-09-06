/**
 * V2.11 FILE-00 — the ONE place an attachment becomes something a surface can
 * render, and the one place it is decided what a surface never receives.
 *
 * The projection is deliberately lossy in a specific direction: the storage key,
 * the checksum, the workspace id and the upload operation id do not appear in
 * {@link SerializedAttachment} at all, so a loader that forgets to strip them
 * fails to compile rather than leaking them. See `attachment.ts` for the pair of
 * types this maps between.
 *
 * Labels are formatted HERE, server-side, so every surface agrees about what
 * `1.2 MB` and `6 September 2026` look like — the rule the obligation view
 * already follows for dates and amounts.
 */

import type { AttachmentRecord, SerializedAttachment } from "./attachment";
import { formatAttachmentSize } from "./attachment-limits";
import { attachmentMediaType } from "./attachment-media-types";

/** The authenticated download route for one attachment. Always `attachment`. */
export function attachmentDownloadHref(attachmentId: string): string {
  return `/attachments/${encodeURIComponent(attachmentId)}`;
}

/** The authenticated inline route. Raster images only — see `attachmentView`. */
export function attachmentPreviewHref(attachmentId: string): string {
  return `/attachments/${encodeURIComponent(attachmentId)}/preview`;
}

/** The one date formatting an attachment uses. */
function formatCreated(instant: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(instant);
}

/**
 * Project one stored attachment into what a surface receives.
 *
 * `previewHref` is non-null only for the media types whose disposition is
 * `image` — the raster formats an `<img>` can show under DalyHub's own CSP. For
 * a PDF it is `null`, because `object-src 'none'` and `frame-src 'none'` mean
 * there is no way to display one inside a DalyHub page, and offering a link that
 * looked like a preview would be a promise the policy breaks.
 */
export function attachmentView(
  attachment: AttachmentRecord,
): SerializedAttachment {
  const media = attachmentMediaType(attachment.mediaType);
  return {
    id: attachment.id,
    filename: attachment.filename,
    mediaType: attachment.mediaType,
    kindLabel: media?.label ?? "File",
    byteSize: attachment.byteSize,
    sizeLabel: formatAttachmentSize(attachment.byteSize),
    createdAt: attachment.createdAt.toISOString(),
    createdLabel: formatCreated(attachment.createdAt),
    downloadHref: attachmentDownloadHref(attachment.id),
    previewHref:
      media?.disposition === "image"
        ? attachmentPreviewHref(attachment.id)
        : null,
  };
}

/** Project a list, preserving order. */
export function attachmentViews(
  attachments: readonly AttachmentRecord[],
): readonly SerializedAttachment[] {
  return attachments.map(attachmentView);
}
