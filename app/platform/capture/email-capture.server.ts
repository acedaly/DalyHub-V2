/**
 * CAPTURE-01 — email capture, as a Cloudflare Email Worker handler.
 *
 * Forwarding an email to DalyHub is the fifth capture surface, and it terminates
 * in the SAME capture application service everything else does: an email becomes
 * a {@link CaptureRequest} and then an ordinary Task or Note (CAPTURE-01 §2). There is no
 * `email_notes` table and no email-specific create path.
 *
 * ── Why an Email Worker fits here ───────────────────────────────────────────
 * DalyHub is already a Cloudflare Worker with a D1 binding. Email Routing
 * delivers an inbound message to the SAME Worker as a second exported handler,
 * with the same bindings and the same code — no new service, no new deployment
 * target, no polling of a mailbox, no third-party inbound-mail provider holding
 * the owner's forwarded email (CAPTURE-01 §25). If Email Routing is not configured, this
 * handler is never invoked and costs nothing.
 *
 * ── The security posture ────────────────────────────────────────────────────
 * Everything in `~/kernel/capture/capture-email.ts` applies BEFORE a byte of the
 * message is read: the envelope recipient must be a configured address, the
 * envelope sender must be on the allowlist, and Cloudflare's own
 * `Authentication-Results` must show SPF, DKIM or DMARC passing. The `From:`
 * header is never an authorisation input. A refused message is rejected at SMTP
 * with a fixed, uninformative reason — a sender learns nothing about the
 * allowlist, and DalyHub never generates a bounce that could be used to reflect
 * mail at a third party.
 *
 * ── Bounds ──────────────────────────────────────────────────────────────────
 * `rawSize` is checked before the stream is read, so an enormous message is
 * refused without being buffered. Attachments are ignored entirely — out of scope
 * for CAPTURE-01, and a decoder that never runs is a decoder that cannot be
 * exploited.
 */

import {
  CaptureError,
  buildEmailCaptureRequest,
  bytesToBinaryString,
  captureEmailIsEnabled,
  evaluateInboundEmail,
  extractEmailContent,
  evaluateCaptureRate,
  hashCaptureToken,
  parseEmailAuthenticationResults,
  resolveCaptureEmailConfig,
  type CaptureEmailConfigEnv,
  type EmailRejectionReason,
} from "~/kernel/capture";
import { createActivityActorContext } from "~/kernel/activity";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import { ownerCalendarIso } from "~/shared/datetime";
import {
  bindWorkspaceRepositories,
  createWorkspaceContextResolver,
  type WorkspaceScopeEnv,
} from "~/platform/workspaces";

import { CAPTURE_ACTOR_TYPE } from "./capture-authentication.server";
import { logCapture } from "./capture-log.server";
import { runCapture } from "./capture-service.server";

/** The environment email capture reads. */
export type EmailCaptureEnv = WorkspaceScopeEnv & CaptureEmailConfigEnv;

/**
 * The largest inbound message accepted, in bytes. Generous enough for a long
 * forwarded thread with quoted history, far too small to be a delivery vector.
 */
export const CAPTURE_EMAIL_MAX_BYTES = 512 * 1024;

/**
 * The rate-limit identity email capture is counted under.
 *
 * A single identity for all inbound mail, distinct from every capture token's, so
 * a flood of forwarded email can exhaust the EMAIL budget and nothing else — the
 * owner's phone keeps capturing (CAPTURE-01 §15).
 */
export const EMAIL_CAPTURE_IDENTITY = "email";

/**
 * The one reason ever returned to a sender. Deliberately uninformative and
 * identical for every refusal, so a prober cannot distinguish "wrong address"
 * from "not on the allowlist" from "failed authentication" (CAPTURE-01 §35).
 */
const REJECTION = "Message rejected.";

/** The minimal slice of the Cloudflare message this handler needs, for testing. */
export type InboundEmail = {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
};

/** Read a bounded number of bytes from the message stream. */
async function readBounded(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > limit) {
        // Stop reading rather than buffering the rest: the message is already
        // over the bound and nothing beyond it will be used.
        return new Uint8Array(0);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * A stable idempotency key for an inbound message.
 *
 * Derived from the `Message-ID`, which is what makes REPEATED DELIVERY safe
 * (CAPTURE-01 §26): mail systems retry, and a retried delivery of the same message must not
 * produce a second Note. Hashed rather than used directly because a `Message-ID`
 * is attacker-influenced text of arbitrary shape, and the receipt key grammar is
 * narrow — a digest is always well-formed. A message with no `Message-ID` gets no
 * key and is simply captured; losing idempotency is better than losing the mail.
 */
export async function emailIdempotencyKey(
  messageId: string | null,
): Promise<string | null> {
  if (messageId === null || messageId.trim().length === 0) return null;
  const digest = await hashCaptureToken(messageId.trim());
  return digest.slice(0, 48);
}

/**
 * Handle one inbound message. Never throws: an Email Worker that throws produces
 * an opaque delivery failure, so every path here ends in either a capture or an
 * explicit, uninformative rejection.
 */
export async function handleCaptureEmail(
  message: InboundEmail,
  env: EmailCaptureEnv,
  now: Date = new Date(),
): Promise<void> {
  const reject = (reason: EmailRejectionReason): void => {
    logCapture({ event: "capture.email_rejected", code: reason });
    message.setReject(REJECTION);
  };

  const config = resolveCaptureEmailConfig(env);
  if (!captureEmailIsEnabled(config)) {
    reject("email_capture_disabled");
    return;
  }

  const decision = evaluateInboundEmail({
    config,
    recipient: message.to,
    // The SMTP ENVELOPE sender, not the `From:` header (CAPTURE-01 §26).
    envelopeFrom: message.from,
    authentication: parseEmailAuthenticationResults(
      message.headers.get("authentication-results"),
    ),
  });
  if (!decision.accepted) {
    reject(decision.reason);
    return;
  }

  if (message.rawSize > CAPTURE_EMAIL_MAX_BYTES) {
    reject("message_too_large");
    return;
  }

  const bytes = await readBounded(message.raw, CAPTURE_EMAIL_MAX_BYTES);
  if (bytes.byteLength === 0) {
    reject("message_too_large");
    return;
  }

  const extracted = extractEmailContent(bytesToBinaryString(bytes));
  if (extracted.subject.length === 0 && extracted.text.length === 0) {
    reject("empty_message");
    return;
  }

  try {
    const context = await createWorkspaceContextResolver(env).resolve();
    const scope = bindWorkspaceRepositories(
      env,
      context,
      createActivityActorContext({
        type: CAPTURE_ACTOR_TYPE,
        id: EMAIL_CAPTURE_IDENTITY,
      }),
    );

    // Email is rate-limited exactly like a capture device, under its own identity.
    const counts = await scope.captureRateLimit.consume(
      EMAIL_CAPTURE_IDENTITY,
      now,
    );
    if (!evaluateCaptureRate(counts, now).allowed) {
      logCapture({
        event: "capture.email_rejected",
        code: "capture_rate_limited",
      });
      message.setReject(REJECTION);
      return;
    }

    const request = buildEmailCaptureRequest({
      subject: extracted.subject,
      body: extracted.text,
      fromHeader: extracted.fromHeader,
      clientCaptureId: await emailIdempotencyKey(extracted.messageId),
      receivedAt: now,
    });

    const outcome = await runCapture(scope, request, {
      credential: {
        identity: EMAIL_CAPTURE_IDENTITY,
        // No credential id: email capture holds no token, and inventing one
        // would put a value in Activity that names nothing real.
        captureTokenId: null,
        deviceName: null,
        // Email may create both, because the subject prefix chooses; the
        // allowlist is what bounds who may ask.
        capabilities: ["task", "note"],
      },
      db: env.DB,
      now,
      // Email capture holds no credential, so there is no owner subject whose
      // timezone preference could be read — the allowlist is an ADDRESS, and
      // preferences are keyed by authenticated subject. The deployment default
      // is used, explicitly rather than through a lookup that would return it
      // anyway, and this limitation is written down in UNIVERSAL_CAPTURE.md
      // rather than left to be discovered by a date landing a day out.
      todayIso: ownerCalendarIso(now, DEFAULT_OWNER_TIME_ZONE),
    });

    logCapture({
      event: "capture.email_accepted",
      source: "email",
      kind: outcome.kind,
      recordId: outcome.id,
    });
  } catch (cause) {
    logCapture({
      event: "capture.email_rejected",
      code: cause instanceof CaptureError ? cause.code : "capture_failed",
    });
    // A DalyHub-side failure is a TEMPORARY refusal from the sender's point of
    // view — rejecting tells the forwarding mail system the message was not
    // accepted, so the owner's own mail client keeps it rather than believing it
    // was filed. A thought is never silently dropped (CAPTURE-01 §30).
    message.setReject(REJECTION);
  }
}
