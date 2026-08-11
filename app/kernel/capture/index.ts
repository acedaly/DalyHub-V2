/**
 * CAPTURE-01 Capture kernel — public surface.
 *
 * The ONE universal capture contract every surface feeds: the PWA, an Apple
 * Shortcut, Siri, the iOS Share Sheet, email — and, later, a browser extension,
 * a Raycast command, a macOS Shortcut, an Apple Watch or a native iOS client.
 * Adding one of those means writing an authentication adapter and a transport;
 * it does not mean another capture backend, another parser or another table
 * (CAPTURE-01 §46).
 *
 * Everything here is storage-, transport- and framework-independent: no D1, no
 * Cloudflare, no React, no React Router, no `env`. The Worker-side wiring lives
 * in `app/platform/capture`.
 */

export {
  CAPTURE_INTENTS,
  CAPTURE_SOURCES,
  CAPTURE_SOURCE_LABELS,
  CAPTURE_RECEIVED,
  CAPTURE_REQUEST_MAX_BYTES,
  CAPTURE_TEXT_MAX_LENGTH,
  CAPTURE_TITLE_MAX_LENGTH,
  CAPTURE_SOURCE_TITLE_MAX_LENGTH,
  CAPTURE_URL_MAX_LENGTH,
  CAPTURE_DERIVED_TITLE_MAX_LENGTH,
  CAPTURE_URL_SCHEMES,
  DEFAULT_CAPTURE_INTENT,
  DEFAULT_CAPTURE_SOURCE,
  capturePathFor,
  isCaptureIntent,
  isCaptureSource,
  type CaptureDestination,
  type CaptureIntent,
  type CaptureOutcome,
  type CaptureRecordKind,
  type CaptureReceivedPayload,
  type CaptureRequest,
  type CaptureSource,
} from "./capture";

export {
  CAPTURE_ERROR_CODES,
  CAPTURE_ERROR_STATUS,
  CaptureError,
  CaptureCredentialError,
  CaptureFailedError,
  CapturePermissionError,
  CaptureRateLimitedError,
  CaptureReplayConflictError,
  CaptureTooLargeError,
  CaptureValidationError,
  toCaptureErrorBody,
  type CaptureErrorBody,
  type CaptureErrorCode,
  type CaptureField,
} from "./capture-errors";

export {
  CAPTURE_CLIENT_ID_MAX_LENGTH,
  CAPTURE_CLIENT_ID_MIN_LENGTH,
  codePointLength,
  isCaptureClientId,
  normaliseCaptureLine,
  normaliseCaptureText,
  parseCaptureRequest,
  parseCaptureUrl,
} from "./capture-validation";

export {
  CAPTURE_ACTION_PHRASES,
  CAPTURE_ACTION_VERBS,
  CAPTURE_AUTO_NOTE_LENGTH,
  classifyCapture,
  hasNoteMarker,
  opensWithAction,
  type CaptureClassification,
  type CaptureClassificationReason,
  type CapturePlanningProbe,
} from "./capture-classification";

export {
  CAPTURE_UNTITLED,
  composeCaptureNoteBody,
  composeCaptureTaskDescription,
  deriveCaptureTitle,
  escapeMarkdownLinkText,
  encodeMarkdownLinkDestination,
  truncateCaptureTitle,
} from "./capture-title";

export {
  CAPTURE_CAPABILITIES,
  CAPTURE_CAPABILITY_LABELS,
  CAPTURE_FINGERPRINT_LENGTH,
  CAPTURE_SECRET_BYTES,
  CAPTURE_TOKEN_MAX_LENGTH,
  CAPTURE_TOKEN_NAME_MAX_LENGTH,
  CAPTURE_TOKEN_PREFIX,
  CaptureTokenValidationError,
  captureTokenAllows,
  captureTokenFingerprint,
  captureTokenIsUsable,
  captureTokenStatus,
  constantTimeEquals,
  generateCaptureToken,
  hashCaptureToken,
  isCaptureCapability,
  isCaptureTokenShape,
  normaliseCaptureCapabilities,
  parseCaptureTokenCapabilities,
  parseCaptureTokenName,
  readBearerCaptureToken,
  type CaptureCapability,
  type CaptureTokenRecord,
  type CaptureTokenStatus,
} from "./capture-tokens";

export {
  CaptureTokenStorageError,
  type CaptureTokenRepository,
  type NewCaptureToken,
} from "./capture-token-repository";

export {
  CAPTURE_RATE_WINDOWS,
  captureWindowResetIn,
  captureWindowStart,
  evaluateCaptureRate,
  type CaptureRateDecision,
  type CaptureRateLimiter,
  type CaptureRateWindow,
} from "./capture-rate-limit";

export {
  CAPTURE_EMAIL_PREFIXES,
  EMAIL_DEFAULT_INTENT,
  buildEmailCaptureRequest,
  captureEmailIsEnabled,
  emailIsAuthenticated,
  evaluateInboundEmail,
  extractEmailAddress,
  normaliseEmailAddress,
  parseEmailAddressList,
  parseEmailAuthenticationResults,
  parseEmailSubject,
  resolveCaptureEmailConfig,
  type CaptureEmailConfig,
  type CaptureEmailConfigEnv,
  type EmailAuthenticationResults,
  type EmailCaptureDecision,
  type EmailRejectionReason,
  type EmailSubjectIntent,
} from "./capture-email";

export {
  MIME_MAX_DEPTH,
  MIME_MAX_PARTS,
  binaryStringToBytes,
  bytesToBinaryString,
  decodeBase64,
  decodeCharset,
  decodeEncodedWords,
  decodeQuotedPrintable,
  decodeTransferEncoding,
  extractEmailContent,
  headerValue,
  htmlToPlainText,
  parseContentType,
  splitMimePart,
  type ContentType,
  type ExtractedEmail,
  type MimeHeaders,
  type MimePart,
} from "./capture-email-message";
