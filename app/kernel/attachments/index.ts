/**
 * V2.11 FILE-00 Attachments kernel — public surface.
 *
 * The ONE attachment domain: what a file is, what may be stored, what a surface
 * receives, where the bytes go, and the bounds on all of it. It is pure — no D1,
 * no R2, no JSX, no Cloudflare type, no clock — so the rules can be exercised
 * deterministically and the two adapters (`app/platform/storage/d1` for the
 * metadata, `app/platform/attachments` for the bytes) are the only places a
 * vendor's shapes exist.
 *
 * There is deliberately no attachment ENTITY here, and no EntityLink. An
 * attachment is a child record with one required owner, for the reason ADR-119
 * decision 1 records: a link cannot express a requirement, and "an attachment
 * must have an owner" is the property this release is built on.
 */

export {
  AttachmentValidationError,
  AttachmentStorageError,
  type AttachmentValidationField,
  type AttachmentStorageFailure,
} from "./attachment-errors";

export {
  ATTACHMENT_ADDED,
  ATTACHMENT_REMOVED,
  ATTACHMENT_ACTIVITY_TYPES,
  type AttachmentActivityPayload,
} from "./attachment-identifiers";

export {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_REQUEST_BYTES,
  MAX_ATTACHMENT_REQUEST_OVERHEAD_BYTES,
  MIN_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_FILENAME_LENGTH,
  MAX_ATTACHMENTS_PER_RECORD,
  MAX_ATTACHMENTS_PER_ARCHIVE,
  DEFAULT_ATTACHMENTS_PER_OWNER,
  DEFAULT_ATTACHMENTS_PER_OWNER_IN_LIST,
  ATTACHMENT_PURGE_SWEEP_LIMIT,
  formatAttachmentSize,
} from "./attachment-limits";

export {
  ATTACHMENT_ACCEPT_ATTRIBUTE,
  ATTACHMENT_MEDIA_TYPES,
  ATTACHMENT_REFUSED_MEDIA_TYPES,
  attachmentMediaType,
  filenameExtension,
  matchesSignature,
  mediaTypesForExtension,
  normaliseMediaType,
  type AttachmentDisposition,
  type AttachmentMediaType,
} from "./attachment-media-types";

export {
  asciiFilenameFallback,
  contentDispositionHeader,
  rfc5987Encode,
  validateAttachmentFilename,
} from "./attachment-filename";

export {
  ATTACHMENT_KEY_KIND,
  ATTACHMENT_KEY_ROOT,
  attachmentStorageKey,
  attachmentWorkspacePrefix,
  isSafeKeySegment,
  keyBelongsToWorkspace,
} from "./attachment-storage-key";

export {
  createInMemoryObjectStore,
  hexDigest,
  type AttachmentObjectStore,
  type PutObjectOptions,
  type StoredObject,
  type StoredObjectInfo,
  type StoredObjectStream,
} from "./attachment-object-store";

export {
  assertDeclaredSizeWithinBound,
  assertRecordHasRoom,
  tooLargeMessage,
  unsupportedTypeMessage,
  validateAttachmentUpload,
  validateUploadOperationId,
  type AttachmentUploadCandidate,
  type ValidatedAttachmentUpload,
} from "./attachment-validation";

export {
  attachmentDownloadHref,
  attachmentPreviewHref,
  attachmentView,
  attachmentViews,
} from "./attachment-view";

export type {
  AttachmentObjectPurge,
  AttachmentPurgeReason,
  AttachmentRecord,
  AttachmentRepository,
  CreateAttachmentInput,
  CreateAttachmentOutcome,
  CreateAttachmentResult,
  SerializedAttachment,
} from "./attachment";
