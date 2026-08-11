/**
 * CAPTURE-01 — `POST /api/capture`, the one external capture endpoint.
 *
 * A resource route (no component): a Shortcut posting JSON gets JSON back, never
 * a rendered document. It is the ONLY DalyHub path reachable without a Cloudflare
 * Access session, and the Worker request boundary knows it by exact match
 * (`app/platform/request/request-boundary.ts`) — the bypass covers this one path
 * and only for `POST`.
 *
 * ── Deliberately write-narrow ───────────────────────────────────────────────
 * There is no `GET /api/tasks`, no `GET /api/notes`, no `PATCH`, no `DELETE`
 * (CAPTURE-01 §37, §38). A capture credential cannot enumerate anything, because there is
 * nothing to enumerate: this endpoint is the entire external API surface. That is
 * what makes a leaked capture token a small problem rather than a catastrophic
 * one — it can add a Task to an Inbox, and that is all it can ever do.
 *
 * ── CSRF ────────────────────────────────────────────────────────────────────
 * The endpoint takes no cookie and no session. Authorisation is a bearer token a
 * browser cannot attach cross-origin without a preflight, and the endpoint
 * requires `application/json`, which forces one. So the AUDIT-FIX-04 mutation
 * provenance check is not skipped here so much as inapplicable: there is no
 * ambient credential for a cross-site request to ride.
 *
 * ── The order ───────────────────────────────────────────────────────────────
 *   method → content type → credential → rate limit → size → parse → capture.
 *
 * The method and the content type are cheap header checks and go first. The
 * credential is verified BEFORE the body is read at all, so an anonymous caller
 * can neither make DalyHub buffer a payload nor use the validator as an oracle.
 * The rate limit is charged BEFORE parsing, so a flood of malformed bodies still
 * costs budget rather than being free. Only then is the body read, under a hard
 * byte ceiling, and only then parsed.
 */

import { env } from "cloudflare:workers";

import {
  CAPTURE_REQUEST_MAX_BYTES,
  CaptureError,
  CaptureRateLimitedError,
  CaptureTooLargeError,
  CaptureValidationError,
  evaluateCaptureRate,
  parseCaptureRequest,
  toCaptureErrorBody,
  type CaptureOutcome,
} from "~/kernel/capture";
import {
  authenticateCaptureRequest,
  touchCaptureCredential,
} from "~/platform/capture/capture-authentication.server";
import { logCapture } from "~/platform/capture/capture-log.server";
import { runCapture } from "~/platform/capture/capture-service.server";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import { ownerCalendarIso } from "~/shared/datetime";

import type { Route } from "./+types/api-capture";

/** The success body. Small on purpose (CAPTURE-01 §9) — no internal storage detail. */
export type CaptureResponseBody = {
  readonly ok: true;
  readonly capture: {
    readonly id: string;
    readonly kind: "task" | "note";
    readonly title: string;
    readonly destination: string;
    /** The canonical in-app path, for an "Open in DalyHub" action. */
    readonly path: string;
    /** True when this answer replayed an earlier identical capture. */
    readonly replayed: boolean;
  };
};

function json(
  body: unknown,
  status: number,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function failure(cause: unknown): Response {
  const body = toCaptureErrorBody(cause);
  const status =
    cause instanceof CaptureError
      ? cause.status
      : /* an unrecognised throw is a 500 by the same mapping */ 500;
  const headers: Record<string, string> =
    cause instanceof CaptureRateLimitedError
      ? { "retry-after": String(cause.retryAfterSeconds) }
      : {};
  return json(body, status, headers);
}

/**
 * Read the body with a hard byte ceiling.
 *
 * `Content-Length` is checked first because it lets an oversized request be
 * refused without reading a byte — but it is a claim, not a fact, so the decoded
 * text is measured too. Both are needed: the header can lie, and a streamed body
 * can arrive with no header at all.
 */
async function readBoundedBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > CAPTURE_REQUEST_MAX_BYTES) {
    throw new CaptureTooLargeError("body", "That capture is too large.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > CAPTURE_REQUEST_MAX_BYTES) {
    throw new CaptureTooLargeError("body", "That capture is too large.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CaptureValidationError("body", "That capture is not valid JSON.");
  }
}

/**
 * The owner's calendar day, for the deterministic date grammar.
 *
 * Resolved from the preferences of the subject that MINTED the credential — not
 * from `scope.ownerTodayIso`, which keys preferences on the bound Activity actor
 * and would therefore look up the capture device's own id, find no row, and
 * silently fall back to the deployment default. A capture that says "tomorrow"
 * has to mean the owner's tomorrow, and on a travelling phone that is not the
 * same as the device's. A missing preferences row still degrades to the default:
 * a capture must never fail for want of a timezone.
 */
async function captureOwnerDay(
  scope: Awaited<ReturnType<typeof authenticateCaptureRequest>>["scope"],
  ownerSubject: string,
  now: Date,
): Promise<string> {
  try {
    const preferences = await scope.appPreferences.get(ownerSubject);
    return ownerCalendarIso(now, preferences.timezone);
  } catch {
    return ownerCalendarIso(now, DEFAULT_OWNER_TIME_ZONE);
  }
}

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  if (request.method !== "POST") {
    return json(
      {
        ok: false,
        error: {
          code: "invalid_capture",
          message: "Capture accepts POST only.",
        },
      },
      405,
      { allow: "POST" },
    );
  }

  const now = new Date();

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new CaptureValidationError(
        "body",
        "Send the capture as application/json.",
      );
    }

    const { scope, credential } = await authenticateCaptureRequest(
      env,
      request,
      now,
    );

    const counts = await scope.captureRateLimit.consume(credential.id, now);
    const rate = evaluateCaptureRate(counts, now);
    if (!rate.allowed) {
      logCapture({
        event: "capture.rejected",
        captureTokenId: credential.id,
        fingerprint: credential.fingerprint,
        code: "capture_rate_limited",
      });
      throw new CaptureRateLimitedError(rate.retryAfterSeconds);
    }

    const captureRequest = parseCaptureRequest(await readBoundedBody(request));

    const outcome: CaptureOutcome = await runCapture(scope, captureRequest, {
      credential: {
        identity: credential.id,
        captureTokenId: credential.id,
        deviceName: credential.name,
        capabilities: credential.capabilities,
      },
      db: env.DB,
      now,
      todayIso: await captureOwnerDay(scope, credential.ownerSubject, now),
    });

    await touchCaptureCredential(scope, credential.id, now);

    logCapture({
      event: outcome.replayed ? "capture.replayed" : "capture.accepted",
      source: captureRequest.source,
      captureTokenId: credential.id,
      fingerprint: credential.fingerprint,
      kind: outcome.kind,
      recordId: outcome.id,
    });

    const body: CaptureResponseBody = {
      ok: true,
      capture: {
        id: outcome.id,
        kind: outcome.kind,
        title: outcome.title,
        destination: outcome.destination,
        path: outcome.path,
        replayed: outcome.replayed,
      },
    };
    return json(body, 201);
  } catch (cause) {
    if (!(cause instanceof CaptureRateLimitedError)) {
      logCapture({
        event: "capture.rejected",
        code: cause instanceof CaptureError ? cause.code : "capture_failed",
      });
    }
    return failure(cause);
  }
}
