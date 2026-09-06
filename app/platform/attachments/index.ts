/**
 * V2.11 FILE-00 Attachments platform — public surface.
 *
 * The two halves the kernel deliberately does not have: the Cloudflare R2
 * adapter, and the compensated write that ties the object store to the metadata
 * repository. Everything above this speaks the kernel's contracts.
 */

export {
  createR2ObjectStore,
  resolveAttachmentObjectStore,
} from "./r2-object-store";

export {
  deleteAttachment,
  drainPurge,
  isAttachmentValidationError,
  listMissingObjects,
  listOrphanedObjects,
  readAttachmentBytes,
  sweepAttachmentPurges,
  uploadAttachment,
  type AttachmentServiceDependencies,
  type UploadAttachmentInput,
  type UploadAttachmentResult,
} from "./attachment-service";

export {
  runScheduledAttachmentPurge,
  type AttachmentPurgeSweepSummary,
  type ScheduledAttachmentPurgeEnv,
} from "./scheduled-purge.server";

export {
  loadRecordAttachments,
  loadRecordAttachmentsFor,
  type RecordAttachmentScope,
} from "./record-attachments.server";
