/**
 * CAPTURE-01 Capture kernel — email capture policy.
 *
 * ── The threat this module exists for ───────────────────────────────────────
 * An email address is a mutation endpoint that anyone on the internet can send
 * to, and `From:` is a header the sender writes themselves. Treating it as
 * identity would mean anyone who learns the capture address can write into the
 * owner's DalyHub (CAPTURE-01 §26). So authorisation here rests on two things a sender
 * cannot simply assert:
 *
 *   1. the SMTP ENVELOPE sender (`MAIL FROM`), which the Cloudflare Email Worker
 *      exposes as `message.from` — not the display header;
 *   2. the `Authentication-Results` Cloudflare stamps on the message, which
 *      carries the SPF / DKIM / DMARC verdicts it computed at the edge.
 *
 * Both must agree before anything is written: the envelope sender must be on a
 * short allowlist, AND the message must have passed at least one of DMARC, DKIM
 * or SPF. A message with no `Authentication-Results` at all is REFUSED — absence
 * of evidence is not a pass (fail closed, AGENTS.md CAPTURE-01 §17).
 *
 * The `From:` header is still extracted, but only to be shown to the owner. It
 * never influences a decision.
 *
 * ── And what it deliberately does not do ────────────────────────────────────
 * There is no command language (CAPTURE-01 §27). Two optional subject prefixes exist and
 * that is the whole grammar; everything else is an Inbox capture. A capture
 * system whose email syntax needs documenting twice has already failed.
 */

import {
  CAPTURE_TEXT_MAX_LENGTH,
  CAPTURE_TITLE_MAX_LENGTH,
  DEFAULT_CAPTURE_INTENT,
  type CaptureIntent,
  type CaptureRequest,
} from "./capture";
import {
  normaliseCaptureLine,
  normaliseCaptureText,
} from "./capture-validation";
import { truncateCaptureTitle } from "./capture-title";

/* -------------------------------------------------------------------------- */
/* Addresses                                                                  */
/* -------------------------------------------------------------------------- */

/** Lowercase and trim an address for comparison. Addresses are compared, never parsed for meaning. */
export function normaliseEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Pull the bare address out of a header value: `Aidan <a@example.com>` becomes
 * `a@example.com`. Returns the trimmed input when there are no angle brackets.
 */
export function extractEmailAddress(value: string): string {
  const angled = /<([^<>]+)>/.exec(value);
  return normaliseEmailAddress(angled?.[1] ?? value);
}

/** Parse a comma/whitespace separated configuration list into normalised addresses. */
export function parseEmailAddressList(
  raw: string | undefined,
): readonly string[] {
  return (raw ?? "")
    .split(/[,\s]+/)
    .map((entry) => normaliseEmailAddress(entry))
    .filter((entry) => entry.includes("@"));
}

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The email-capture configuration, resolved from trusted server configuration —
 * never from the message. The production address is NOT hard-coded anywhere in
 * application logic (CAPTURE-01 §25); it is a deployment value like every other.
 */
export type CaptureEmailConfig = {
  /** The addresses DalyHub accepts capture at. Empty means email capture is OFF. */
  readonly recipients: readonly string[];
  /** The addresses permitted to send. Empty means email capture is OFF. */
  readonly allowedSenders: readonly string[];
};

/** The environment values email capture reads. */
export interface CaptureEmailConfigEnv {
  readonly CAPTURE_EMAIL_RECIPIENTS?: string;
  readonly CAPTURE_EMAIL_ALLOWED_SENDERS?: string;
}

/**
 * Resolve the configuration. Both lists must be non-empty for email capture to be
 * enabled: an unconfigured deployment accepts nothing, which is the correct
 * behaviour for a feature that writes to someone's life when it is on.
 */
export function resolveCaptureEmailConfig(
  env: CaptureEmailConfigEnv,
): CaptureEmailConfig {
  return {
    recipients: parseEmailAddressList(env.CAPTURE_EMAIL_RECIPIENTS),
    allowedSenders: parseEmailAddressList(env.CAPTURE_EMAIL_ALLOWED_SENDERS),
  };
}

/** True when email capture is configured at all. */
export function captureEmailIsEnabled(config: CaptureEmailConfig): boolean {
  return config.recipients.length > 0 && config.allowedSenders.length > 0;
}

/* -------------------------------------------------------------------------- */
/* Sender verification                                                        */
/* -------------------------------------------------------------------------- */

/** The verdicts read out of `Authentication-Results`. */
export type EmailAuthenticationResults = {
  readonly spf: string | null;
  readonly dkim: string | null;
  readonly dmarc: string | null;
};

/**
 * Read the SPF / DKIM / DMARC verdicts out of an `Authentication-Results` header.
 * Unknown or absent methods are null; the header format is read leniently
 * because the point is to find a PASS, and anything that is not clearly a pass is
 * treated as not one.
 */
export function parseEmailAuthenticationResults(
  header: string | null,
): EmailAuthenticationResults {
  const read = (method: string): string | null => {
    if (header === null) return null;
    const match = new RegExp(`\\b${method}\\s*=\\s*([a-z]+)`, "i").exec(header);
    return match?.[1]?.toLowerCase() ?? null;
  };
  return { spf: read("spf"), dkim: read("dkim"), dmarc: read("dmarc") };
}

/** True when at least one authentication method passed. */
export function emailIsAuthenticated(
  results: EmailAuthenticationResults,
): boolean {
  return (
    results.dmarc === "pass" ||
    results.dkim === "pass" ||
    results.spf === "pass"
  );
}

/** Why an inbound message was refused. Internal — never sent back to a sender. */
export type EmailRejectionReason =
  | "email_capture_disabled"
  | "unknown_recipient"
  | "sender_not_allowed"
  | "sender_not_authenticated"
  | "message_too_large"
  | "empty_message";

/** The decision about an inbound message. */
export type EmailCaptureDecision =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: EmailRejectionReason };

/**
 * Decide whether an inbound message may write into DalyHub.
 *
 * Every check is a rejection, and they run in an order that reveals as little as
 * possible to a prober: an unknown recipient is refused before the sender is even
 * considered, so probing the allowlist through a wrong address tells nothing.
 */
export function evaluateInboundEmail(input: {
  readonly config: CaptureEmailConfig;
  /** The SMTP envelope recipient (`RCPT TO`). */
  readonly recipient: string;
  /** The SMTP envelope sender (`MAIL FROM`) — NOT the `From:` header. */
  readonly envelopeFrom: string;
  readonly authentication: EmailAuthenticationResults;
}): EmailCaptureDecision {
  const { config } = input;
  if (!captureEmailIsEnabled(config)) {
    return { accepted: false, reason: "email_capture_disabled" };
  }
  if (!config.recipients.includes(normaliseEmailAddress(input.recipient))) {
    return { accepted: false, reason: "unknown_recipient" };
  }
  if (
    !config.allowedSenders.includes(normaliseEmailAddress(input.envelopeFrom))
  ) {
    return { accepted: false, reason: "sender_not_allowed" };
  }
  if (!emailIsAuthenticated(input.authentication)) {
    return { accepted: false, reason: "sender_not_authenticated" };
  }
  return { accepted: true };
}

/* -------------------------------------------------------------------------- */
/* Subject syntax                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The ENTIRE email capture grammar (CAPTURE-01 §27): an optional `task:` or `note:` prefix.
 * Anything else — including a forwarded message with its `Fwd:` chain — is an
 * Inbox capture, which is what forwarding an email actually means.
 */
export const CAPTURE_EMAIL_PREFIXES: Readonly<Record<string, CaptureIntent>> = {
  task: "task",
  note: "note",
  inbox: "inbox",
};

/** A subject stripped of the forwarding/reply noise mail clients prepend. */
const FORWARD_PREFIX = /^\s*(?:(?:re|fwd?|fw|aw|wg)\s*(?:\[\d+\])?\s*:\s*)+/i;

/** What a subject line said. */
export type EmailSubjectIntent = {
  readonly intent: CaptureIntent;
  /** The subject with the capture prefix and forwarding noise removed. */
  readonly subject: string;
  /** True when the owner named the intent explicitly. */
  readonly explicit: boolean;
};

/**
 * Read the capture intent off a subject line.
 *
 * The prefix is only honoured at the START of the subject, after any `Fwd:`
 * chain, and only when followed by a colon — so an email genuinely ABOUT tasks
 * ("Task list for Friday") is not silently turned into one.
 */
export function parseEmailSubject(rawSubject: string): EmailSubjectIntent {
  const withoutForwarding = normaliseCaptureLine(rawSubject).replace(
    FORWARD_PREFIX,
    "",
  );
  const match = /^([A-Za-z]{3,6})\s*:\s*(.*)$/.exec(withoutForwarding);
  if (match !== null) {
    const keyword = (match[1] ?? "").toLowerCase();
    const intent = CAPTURE_EMAIL_PREFIXES[keyword];
    if (intent !== undefined) {
      return {
        intent,
        subject: (match[2] ?? "").trim(),
        explicit: true,
      };
    }
  }
  return {
    intent: DEFAULT_CAPTURE_INTENT,
    subject: withoutForwarding,
    explicit: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Building the capture                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The default intent for an ordinary forwarded email with no prefix.
 *
 * `inbox`, not `auto` (CAPTURE-01 §29). A forwarded email is reference material the owner
 * has not yet decided about, and running the classifier over somebody else's
 * prose would be exactly the kind of guessing CAPTURE-01 §6 forbids. It lands in the Inbox
 * where the owner can file it with the context they have and the classifier does
 * not.
 */
export const EMAIL_DEFAULT_INTENT: CaptureIntent = "inbox";

/**
 * Turn a verified, extracted message into the SAME {@link CaptureRequest} an
 * iPhone Shortcut produces. This is the whole of what makes email "another
 * transport into the same capture service" rather than a second capture system.
 */
export function buildEmailCaptureRequest(input: {
  readonly subject: string;
  readonly body: string;
  /** The decoded `From:` header, for provenance in the captured text. */
  readonly fromHeader: string;
  readonly clientCaptureId: string | null;
  readonly receivedAt: Date;
}): CaptureRequest {
  const parsed = parseEmailSubject(input.subject);
  const intent = parsed.explicit ? parsed.intent : EMAIL_DEFAULT_INTENT;

  const title =
    parsed.subject.length === 0
      ? null
      : truncateCaptureTitle(parsed.subject, CAPTURE_TITLE_MAX_LENGTH);

  const body = normaliseCaptureText(input.body);
  const sender = normaliseCaptureLine(input.fromHeader);
  const parts: string[] = [];
  if (body.length > 0) parts.push(body);
  // Provenance the owner will want when reading this later, as ordinary text.
  if (sender.length > 0) parts.push(`Forwarded from: ${sender}`);
  const text = parts.join("\n\n").slice(0, CAPTURE_TEXT_MAX_LENGTH);

  return {
    intent,
    // An email with a subject and no body still captures: the subject IS the
    // thought, and losing it because the body was empty would be a lost capture.
    text: text.length > 0 ? text : (title ?? ""),
    title,
    source: "email",
    sourceUrl: null,
    sourceTitle: null,
    clientCaptureId: input.clientCaptureId,
    capturedAt: input.receivedAt,
  };
}
