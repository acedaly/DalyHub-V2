/**
 * CAPTURE-01 — what a capture is allowed to say in a log.
 *
 * External capture carries the most private text a person produces: a worry
 * dictated in a car park, a note about a friend, a medical follow-up. None of it
 * belongs in a log line, an analytics event, an error-reporting payload or an AI
 * request (CAPTURE-01 §44). DalyHub's Worker observability is on, so this is not a
 * hypothetical: whatever is passed to `console` is retained somewhere.
 *
 * So logging goes through this ONE function, whose parameter type cannot express
 * the owner's words. There is no `text`, no `title`, no `sourceUrl` and no
 * message field — a caller that wants to log content has to change this file,
 * which is exactly the review moment that should exist.
 *
 * What IS logged is structural and diagnosable: what happened, from which source,
 * to which credential (by ID and safe fingerprint — never the token), and whether
 * it worked. That is enough to answer "is my iPhone Shortcut working?" and
 * nothing more.
 */

import type { CaptureErrorCode, CaptureSource } from "~/kernel/capture";

/** A capture-boundary event, in structural facts only. */
export type CaptureLogEvent = {
  /** What happened. A closed vocabulary, not a free-text message. */
  readonly event:
    | "capture.accepted"
    | "capture.replayed"
    | "capture.rejected"
    | "capture.email_accepted"
    | "capture.email_rejected";
  /** The declared source, when one was validated. */
  readonly source?: CaptureSource;
  /** The credential's stable id. Safe: it is not a credential. */
  readonly captureTokenId?: string | null;
  /** The credential's short digest fingerprint. Safe: not reversible. */
  readonly fingerprint?: string | null;
  /** Which record kind was created. */
  readonly kind?: "task" | "note";
  /** The created record's id — an identifier, not content. */
  readonly recordId?: string;
  /** The structured failure code, for a rejection. */
  readonly code?: CaptureErrorCode | string;
};

/**
 * Emit one capture log line. Deliberately `console.log`/`console.warn` only:
 * Cloudflare Workers observability collects those, and CAPTURE-01 adds no
 * logging platform, no analytics provider and no third-party sink.
 */
export function logCapture(event: CaptureLogEvent): void {
  const line = JSON.stringify(event);
  if (event.event.endsWith("rejected")) {
    console.warn(line);
    return;
  }
  console.log(line);
}
