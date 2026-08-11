/**
 * CAPTURE-01 Capture kernel — the typed error model.
 *
 * The capture endpoint is the one DalyHub surface a stranger can reach, so its
 * failures are a security surface in their own right. Every failure here is a
 * CLOSED set of codes with owner-readable messages written in advance (CAPTURE-01 §17):
 *
 *   - no SQL, no D1 error, no stack trace, no Cloudflare detail and no token
 *     representation can ever reach a response, because a response is built from
 *     this vocabulary rather than from a caught exception;
 *   - the messages never distinguish "no such token" from "revoked token" from
 *     "expired token" from "token for another workspace". All four are
 *     `invalid_capture_token`, because telling a probe WHICH it was is telling it
 *     something about a credential it does not hold (CAPTURE-01 §35).
 *
 * `capture_not_permitted` is deliberately separate and IS distinguishable: it can
 * only be reached by a caller holding a valid credential, so it discloses nothing
 * a legitimate owner does not already know, and an honest "this device is not
 * allowed to create Notes" is what makes the permission model usable.
 */

/** Every failure the capture boundary can report. */
export const CAPTURE_ERROR_CODES = [
  "invalid_capture",
  "invalid_capture_token",
  "capture_not_permitted",
  "duplicate_capture",
  "capture_too_large",
  "capture_rate_limited",
  "capture_failed",
] as const;

export type CaptureErrorCode = (typeof CAPTURE_ERROR_CODES)[number];

/** The HTTP status each code answers with. */
export const CAPTURE_ERROR_STATUS: Readonly<Record<CaptureErrorCode, number>> =
  {
    invalid_capture: 400,
    invalid_capture_token: 401,
    capture_not_permitted: 403,
    duplicate_capture: 409,
    capture_too_large: 413,
    capture_rate_limited: 429,
    capture_failed: 500,
  };

/** The base of every capture failure. Carries a code and a safe message. */
export class CaptureError extends Error {
  readonly code: CaptureErrorCode;

  constructor(code: CaptureErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "CaptureError";
  }

  /** The HTTP status this failure answers with. */
  get status(): number {
    return CAPTURE_ERROR_STATUS[this.code];
  }
}

/** The field of the submitted capture that was wrong, when one can be named. */
export type CaptureField =
  | "kind"
  | "text"
  | "title"
  | "source"
  | "sourceUrl"
  | "sourceTitle"
  | "clientCaptureId"
  | "capturedAt"
  | "body";

/** The payload was malformed, out of range, or named something unknown. */
export class CaptureValidationError extends CaptureError {
  readonly field: CaptureField;

  constructor(field: CaptureField, message: string) {
    super("invalid_capture", message);
    this.field = field;
    this.name = "CaptureValidationError";
  }
}

/** The payload exceeded a hard size bound. Separate from validation so the
 * boundary can answer `413` without reading the body into the domain (CAPTURE-01 §16). */
export class CaptureTooLargeError extends CaptureError {
  readonly field: CaptureField;

  constructor(field: CaptureField, message: string) {
    super("capture_too_large", message);
    this.field = field;
    this.name = "CaptureTooLargeError";
  }
}

/**
 * The credential is absent, malformed, unknown, revoked, expired, or belongs to
 * another workspace. All of those produce this ONE error with this ONE message.
 */
export class CaptureCredentialError extends CaptureError {
  constructor() {
    super(
      "invalid_capture_token",
      "That capture token is not valid. Check the token in Settings → Capture, or create a new one.",
    );
    this.name = "CaptureCredentialError";
  }
}

/** A valid credential that is not allowed to create this kind of record. */
export class CapturePermissionError extends CaptureError {
  constructor(message: string) {
    super("capture_not_permitted", message);
    this.name = "CapturePermissionError";
  }
}

/**
 * The idempotency key is spoken for by an attempt whose outcome is not (yet)
 * knowable — a concurrent retry, or a claim whose request never returned. The
 * reason comes from the existing PWA-05 receipt vocabulary, which is already
 * written for an owner rather than a developer.
 */
export class CaptureReplayConflictError extends CaptureError {
  constructor(reason: string) {
    super("duplicate_capture", reason);
    this.name = "CaptureReplayConflictError";
  }
}

/** The credential exceeded its bounded capture rate. */
export class CaptureRateLimitedError extends CaptureError {
  /** Seconds until the window resets, for the `Retry-After` header. */
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      "capture_rate_limited",
      "Too many captures from this device just now. Try again shortly — nothing was lost.",
    );
    this.retryAfterSeconds = retryAfterSeconds;
    this.name = "CaptureRateLimitedError";
  }
}

/**
 * Something below the boundary failed. The `cause` is kept for the Worker's own
 * observability and is NEVER serialised — the owner-facing message is fixed.
 */
export class CaptureFailedError extends CaptureError {
  constructor(options?: ErrorOptions) {
    super(
      "capture_failed",
      "DalyHub couldn’t save that capture. Your text is safe — try again.",
      options,
    );
    this.name = "CaptureFailedError";
  }
}

/**
 * The wire shape of a failure. Small, stable and free of internal detail — this
 * is the whole of what a failing capture ever reveals.
 */
export type CaptureErrorBody = {
  readonly ok: false;
  readonly error: {
    readonly code: CaptureErrorCode;
    readonly message: string;
    /** Present only for a field-attributable validation/size failure. */
    readonly field?: CaptureField;
  };
};

/**
 * Turn any thrown value into a safe response body. An unrecognised error becomes
 * a generic `capture_failed` — the default is to disclose nothing, so a new throw
 * site cannot accidentally start leaking (fail closed, AGENTS.md CAPTURE-01 §17).
 */
export function toCaptureErrorBody(cause: unknown): CaptureErrorBody {
  const error =
    cause instanceof CaptureError ? cause : new CaptureFailedError({ cause });
  const field =
    error instanceof CaptureValidationError ||
    error instanceof CaptureTooLargeError
      ? error.field
      : undefined;
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(field === undefined ? {} : { field }),
    },
  };
}
