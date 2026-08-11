/**
 * CAPTURE-01 Capture kernel — boundary validation.
 *
 * The one place an untrusted capture becomes a {@link CaptureRequest}. Pure and
 * storage-independent, so the same rules apply to the HTTP endpoint, to email
 * capture and to anything that feeds the capture service later — there is no
 * second, laxer parser for a second transport (CAPTURE-01 §7, AGENTS.md CAPTURE-01 §9.8).
 *
 * The posture is: bound FIRST, reject EARLY, never coerce silently.
 *
 *   - Every field is length-bounded in CODE POINTS before it can travel further,
 *     so an oversized payload is answered `413` at the boundary rather than
 *     carried into the domain layer (CAPTURE-01 §16).
 *   - Unknown fields are IGNORED rather than rejected. A Shortcut that a later
 *     DalyHub version teaches to send one more field must keep working against an
 *     older deployment; capture must not break on a superset.
 *   - An unknown `kind` or `source` is REJECTED rather than defaulted. Those two
 *     decide what gets created and what the audit trail says; quietly reading
 *     `"Task"` as `task`, or `"my-iphone"` as `api`, would be the server inventing
 *     an intent the caller did not express.
 *   - A URL is parsed and scheme-checked, never string-matched. `javascript:` and
 *     `data:` URLs are refused, so nothing that reaches the Markdown pipeline can
 *     carry an active scheme (CAPTURE-01 §35).
 */

import {
  CAPTURE_SOURCE_TITLE_MAX_LENGTH,
  CAPTURE_TEXT_MAX_LENGTH,
  CAPTURE_TITLE_MAX_LENGTH,
  CAPTURE_URL_MAX_LENGTH,
  CAPTURE_URL_SCHEMES,
  DEFAULT_CAPTURE_INTENT,
  DEFAULT_CAPTURE_SOURCE,
  isCaptureIntent,
  isCaptureSource,
  type CaptureRequest,
} from "./capture";
import { CaptureTooLargeError, CaptureValidationError } from "./capture-errors";

/**
 * The bounds of a caller-generated idempotency key.
 *
 * The maximum is 80 rather than the receipt table's own 128 because the platform
 * NAMESPACES the key by credential before storing it (`cap-<tokenId>-<key>`), and
 * the composed value must still fit. Keeping the arithmetic here means the
 * boundary refuses a key that would later overflow, instead of the database
 * doing it after a claim has been attempted.
 */
export const CAPTURE_CLIENT_ID_MIN_LENGTH = 8;
export const CAPTURE_CLIENT_ID_MAX_LENGTH = 80;

/**
 * The accepted shape: an alphanumeric-led run of alphanumerics and hyphens. A
 * `crypto.randomUUID()` — what every documented Shortcut generates — matches.
 * The character set is deliberately narrow so the composed receipt key stays
 * within the existing PWA-05 key grammar rather than widening it.
 */
const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

/** True for a syntactically acceptable client capture id. */
export function isCaptureClientId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const length = codePointLength(value);
  return (
    length >= CAPTURE_CLIENT_ID_MIN_LENGTH &&
    length <= CAPTURE_CLIENT_ID_MAX_LENGTH &&
    CLIENT_ID_PATTERN.test(value)
  );
}

/** Length in code points, so an emoji costs one character rather than two. */
export function codePointLength(value: string): number {
  let count = 0;
  for (const _ of value) count += 1;
  return count;
}

/**
 * Normalise captured text: strip a UTF-8 BOM, normalise line endings to `\n`,
 * drop control characters that carry no meaning in text, and trim the outside.
 *
 * Interior whitespace and blank lines are PRESERVED — a forwarded email body and
 * a dictated paragraph both depend on their line breaks, and reflowing the
 * owner's words is not the boundary's business (ADR-006/ADR-015: stored Markdown
 * is the exact validated source).
 */
export function normaliseCaptureText(value: string): string {
  return (
    value
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n")
      // Every C0/C1 control except tab and newline; \u007F is DEL. Stripping
      // control characters IS the point here, so the rule that warns about them in
      // a pattern is the one thing this line cannot obey.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "")
      .trim()
  );
}

/** Normalise a single-line field: as above, but newlines collapse to spaces. */
export function normaliseCaptureLine(value: string): string {
  return normaliseCaptureText(value).replace(/\s+/g, " ").trim();
}

/** Read an optional string field, rejecting a present-but-wrong-typed value. */
function optionalString(
  body: Record<string, unknown>,
  key: string,
  field: ConstructorParameters<typeof CaptureValidationError>[0],
): string | null {
  const raw = body[key];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new CaptureValidationError(field, `${key} must be text.`);
  }
  return raw;
}

/**
 * Validate an `http(s)` URL and return its canonical serialisation.
 *
 * Returns null for an empty value. Throws for anything that is not a bounded
 * absolute `http`/`https` URL — including one carrying embedded credentials,
 * which has no honest place in a captured source link.
 */
export function parseCaptureUrl(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  if (codePointLength(value) > CAPTURE_URL_MAX_LENGTH) {
    throw new CaptureTooLargeError(
      "sourceUrl",
      `The source URL is longer than ${CAPTURE_URL_MAX_LENGTH} characters.`,
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CaptureValidationError(
      "sourceUrl",
      "The source URL is not a valid web address.",
    );
  }
  if (!CAPTURE_URL_SCHEMES.has(url.protocol)) {
    throw new CaptureValidationError(
      "sourceUrl",
      "The source URL must be an http or https address.",
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new CaptureValidationError(
      "sourceUrl",
      "The source URL must not contain credentials.",
    );
  }
  return url.toString();
}

/**
 * Parse an untrusted capture body into a validated {@link CaptureRequest}.
 *
 * Accepts the wire field names the documented Shortcut sends (`kind`, `text`,
 * `title`, `source`, `sourceUrl`, `sourceTitle`, `clientCaptureId`,
 * `capturedAt`). Everything else is ignored.
 */
export function parseCaptureRequest(body: unknown): CaptureRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new CaptureValidationError(
      "body",
      "A capture must be a JSON object.",
    );
  }
  const raw = body as Record<string, unknown>;

  /* Intent -------------------------------------------------------------- */
  const rawKind = raw.kind;
  let intent = DEFAULT_CAPTURE_INTENT;
  if (rawKind !== undefined && rawKind !== null && rawKind !== "") {
    if (!isCaptureIntent(rawKind)) {
      throw new CaptureValidationError(
        "kind",
        "kind must be one of: task, note, inbox, auto.",
      );
    }
    intent = rawKind;
  }

  /* Source -------------------------------------------------------------- */
  const rawSource = raw.source;
  let source = DEFAULT_CAPTURE_SOURCE;
  if (rawSource !== undefined && rawSource !== null && rawSource !== "") {
    if (!isCaptureSource(rawSource)) {
      throw new CaptureValidationError(
        "source",
        "source is not a capture source DalyHub recognises.",
      );
    }
    source = rawSource;
  }

  /* Text and title ------------------------------------------------------- */
  const rawText = optionalString(raw, "text", "text") ?? "";
  if (codePointLength(rawText) > CAPTURE_TEXT_MAX_LENGTH) {
    throw new CaptureTooLargeError(
      "text",
      `A capture may hold at most ${CAPTURE_TEXT_MAX_LENGTH} characters of text.`,
    );
  }
  const text = normaliseCaptureText(rawText);

  const rawTitle = optionalString(raw, "title", "title");
  if (
    rawTitle !== null &&
    codePointLength(rawTitle) > CAPTURE_TITLE_MAX_LENGTH
  ) {
    throw new CaptureTooLargeError(
      "title",
      `A capture title may be at most ${CAPTURE_TITLE_MAX_LENGTH} characters.`,
    );
  }
  const title =
    rawTitle === null ? null : normaliseCaptureLine(rawTitle) || null;

  // A capture with neither text nor a title is not a thought — it is an empty
  // request, and saving an empty record would be worse than refusing.
  if (text.length === 0 && title === null) {
    throw new CaptureValidationError(
      "text",
      "There is nothing to capture — send some text or a title.",
    );
  }

  /* Source metadata ------------------------------------------------------ */
  const rawSourceUrl = optionalString(raw, "sourceUrl", "sourceUrl");
  const sourceUrl =
    rawSourceUrl === null ? null : parseCaptureUrl(rawSourceUrl);

  const rawSourceTitle = optionalString(raw, "sourceTitle", "sourceTitle");
  if (
    rawSourceTitle !== null &&
    codePointLength(rawSourceTitle) > CAPTURE_SOURCE_TITLE_MAX_LENGTH
  ) {
    throw new CaptureTooLargeError(
      "sourceTitle",
      `A source title may be at most ${CAPTURE_SOURCE_TITLE_MAX_LENGTH} characters.`,
    );
  }
  const sourceTitle =
    rawSourceTitle === null
      ? null
      : normaliseCaptureLine(rawSourceTitle) || null;

  /* Idempotency ---------------------------------------------------------- */
  const rawClientId = optionalString(raw, "clientCaptureId", "clientCaptureId");
  let clientCaptureId: string | null = null;
  if (rawClientId !== null && rawClientId.trim() !== "") {
    const candidate = rawClientId.trim();
    if (!isCaptureClientId(candidate)) {
      throw new CaptureValidationError(
        "clientCaptureId",
        `clientCaptureId must be ${CAPTURE_CLIENT_ID_MIN_LENGTH}–${CAPTURE_CLIENT_ID_MAX_LENGTH} letters, digits or hyphens.`,
      );
    }
    clientCaptureId = candidate;
  }

  /* Captured-at ---------------------------------------------------------- */
  const rawCapturedAt = optionalString(raw, "capturedAt", "capturedAt");
  let capturedAt: Date | null = null;
  if (rawCapturedAt !== null && rawCapturedAt.trim() !== "") {
    const parsed = new Date(rawCapturedAt.trim());
    if (Number.isNaN(parsed.getTime())) {
      throw new CaptureValidationError(
        "capturedAt",
        "capturedAt must be an ISO-8601 timestamp.",
      );
    }
    capturedAt = parsed;
  }

  return {
    intent,
    text,
    title,
    source,
    sourceUrl,
    sourceTitle,
    clientCaptureId,
    capturedAt,
  };
}
