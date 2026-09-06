/**
 * V2.11 FILE-00 — the attachment domain's stable machine identifiers, and the
 * one rule about what an event may say.
 *
 * Two Activity types, and **neither payload carries the filename.**
 *
 * That is a deliberate privacy decision, not an oversight (ADR-119 decision 9).
 * The Assets and Obligations search providers have refused to print an amount in
 * a result list since ASSET-03, on the grounds that a list is the surface most
 * likely to be read over someone's shoulder. A filename is at least as
 * revealing — `MRI results.pdf`, `Divorce settlement.pdf`, `Termination
 * letter.pdf` — and an Activity feed is read in exactly the same circumstances,
 * on Today, on a record, and in the workspace-wide feed.
 *
 * So the feed says *"Added a file"* and *"Removed a file"*. The owner sees the
 * name on the record, where they went to look for it. The payload carries the
 * MEDIA CLASS only ("PDF", "Image"), because that is a shape rather than a
 * subject and it makes the line read as something rather than as nothing.
 *
 * Nothing else is an event. Opening or downloading a file is READING, and
 * DalyHub does not log the owner reading their own records.
 */

/** Appended when a file is attached to a record. Payload: `{ kind }`. */
export const ATTACHMENT_ADDED = "attachment.added";

/** Appended when a file is removed from a record. Payload: `{ kind }`. */
export const ATTACHMENT_REMOVED = "attachment.removed";

/** Every Activity type this domain appends. */
export const ATTACHMENT_ACTIVITY_TYPES: readonly string[] = [
  ATTACHMENT_ADDED,
  ATTACHMENT_REMOVED,
];

/**
 * The payload an attachment event carries, in full.
 *
 * One field. It is a TYPE LABEL from the closed media-type list ("PDF",
 * "Image", "Document", "Spreadsheet", "Presentation", "Text") — never a
 * filename, never a byte count that could identify a specific document, never a
 * checksum and never a storage key.
 */
export interface AttachmentActivityPayload {
  readonly kind: string;
}
