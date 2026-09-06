/**
 * V2.11 FILE-01 — the shared attachment surface: public API.
 *
 * ONE implementation, consumed by every record type that carries evidence. A
 * consumer imports {@link AttachmentsSection} and passes an owner id and what its
 * loader already read; the rest — the picker, the camera control, the states,
 * the announcements, the empty state, the long-filename behaviour — is here.
 *
 * The lower-level pieces are exported because a surface occasionally needs the
 * list without the section (a print view, a drawer with its own heading), NOT so
 * a module can assemble a different attachment experience. The registry contract
 * test asserts that no module defines an attachment row, list or picker of its
 * own.
 */

export { AttachmentsSection } from "./AttachmentsSection";
export { attachmentsTab } from "./attachments-tab";
export type { AttachmentsTabInput } from "./attachments-tab";
export type { AttachmentsSectionProps } from "./AttachmentsSection";

export { AttachmentList } from "./AttachmentList";
export type { AttachmentListProps } from "./AttachmentList";

export { AttachmentRow } from "./AttachmentRow";
export type { AttachmentRowProps } from "./AttachmentRow";

export { AttachmentPicker } from "./AttachmentPicker";
export type { AttachmentPickerProps } from "./AttachmentPicker";

export { useAttachments } from "./use-attachments";
export type {
  AttachmentFeedback,
  AttachmentsController,
  PendingUpload,
  PendingUploadState,
  UseAttachmentsInput,
} from "./use-attachments";

export {
  deleteAttachmentFile,
  listAttachmentsFor,
  newUploadOperationId,
  uploadAttachmentFile,
} from "./attachment-client";
export type {
  AttachmentDeleteResponse,
  AttachmentUploadResponse,
} from "./attachment-client";
