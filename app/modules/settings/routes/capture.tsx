/**
 * CAPTURE-01 — the authenticated capture-credential endpoints
 * (`POST /settings/capture/:action`, where `action` is `create` or `revoke`).
 *
 * A resource route: it renders no UI, and it has no `GET` on purpose. Minting a
 * credential is a mutation with a secret in its response; nothing about it should
 * be reachable by following a link, and nothing about it should be replayable
 * from history.
 *
 * ── Why this is not the capture endpoint ────────────────────────────────────
 * `/api/capture` is authenticated by a capture token and can create Tasks and
 * Notes. THIS route is authenticated by Cloudflare Access — the owner, in a
 * browser, with same-origin provenance already enforced by the request boundary
 * (AUDIT-FIX-04) — and is the only place credentials can be created or revoked.
 * A capture token can never reach here: it has no Access session, and the
 * boundary's capture carve-out is one exact path that is not this one. That
 * separation is what stops a leaked capture token from minting itself a sibling.
 *
 * ── The one moment the secret exists ────────────────────────────────────────
 * `create` returns the complete token exactly once, in this response, and never
 * again from anywhere (CAPTURE-01 §12, §33). Only its SHA-256 digest is stored, so there is
 * no read path that could return it a second time and no support procedure that
 * could recover it. The response is `no-store`.
 */

import { env } from "cloudflare:workers";

import {
  CaptureTokenValidationError,
  captureTokenStatus,
  generateCaptureToken,
  hashCaptureToken,
  normaliseCaptureCapabilities,
  parseCaptureTokenCapabilities,
  parseCaptureTokenName,
  type CaptureTokenRecord,
} from "~/kernel/capture";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/capture";

/*
 * A GET on this mutation endpoint renders DalyHub's error boundary rather
 * than React Router's internal error object and stack trace.
 */
import { actionOnlyLoader } from "~/platform/request";

export const loader = actionOnlyLoader;

/** The bounded set of actions this route accepts. */
const ACTIONS = new Set(["create", "revoke"]);

/** A credential as the Settings surface sees it. No digest, no token. */
export type CaptureDeviceView = {
  readonly id: string;
  readonly name: string;
  readonly fingerprint: string;
  readonly capabilities: readonly string[];
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly status: "active" | "revoked" | "expired";
};

export type CaptureActionResult =
  | {
      readonly ok: true;
      readonly device: CaptureDeviceView;
      /**
       * The complete token. Present ONLY in the response that created it, and
       * never stored anywhere it could be read back.
       */
      readonly token: string;
    }
  | { readonly ok: true; readonly device: CaptureDeviceView }
  | { readonly ok: false; readonly message: string; readonly field?: string };

/** Project a stored credential into the view the Settings surface renders. */
export function toCaptureDeviceView(
  record: CaptureTokenRecord,
  now: Date,
): CaptureDeviceView {
  return {
    id: record.id,
    name: record.name,
    fingerprint: record.fingerprint,
    capabilities: [...record.capabilities],
    createdAt: record.createdAt.toISOString(),
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    status: captureTokenStatus(record, now),
  };
}

function json(data: CaptureActionResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const step = String(params.action ?? "");
  if (!ACTIONS.has(step)) {
    throw new Response("Not Found", { status: 404 });
  }

  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const form = await request.formData();
  const now = new Date();

  try {
    if (step === "create") {
      const name = parseCaptureTokenName(form.get("name"));
      const capabilities = parseCaptureTokenCapabilities(
        form.getAll("capabilities").map((value) => String(value)),
      );
      const token = generateCaptureToken();
      const record = await scope.captureTokens.create({
        // From the boundary-validated session, never the form. It is what lets a
        // capture resolve "tomorrow" in the OWNER's timezone rather than the
        // deployment default.
        ownerSubject: session.user.subject,
        name,
        capabilities,
        source: null,
        tokenHash: await hashCaptureToken(token),
        expiresAt: null,
      });
      return json({
        ok: true,
        device: toCaptureDeviceView(record, now),
        token,
      });
    }

    const id = String(form.get("id") ?? "").trim();
    if (id.length === 0) {
      return json(
        { ok: false, message: "That capture device is unknown." },
        400,
      );
    }
    await scope.captureTokens.revoke(id, now);
    // Re-read so the surface renders the STORED state rather than an optimistic
    // guess. A revoke of an unknown or already-revoked id is not an error: the
    // owner's intent ("this must not work") is satisfied either way.
    const devices = await scope.captureTokens.list();
    const record = devices.find((device) => device.id === id);
    if (record === undefined) {
      return json(
        { ok: false, message: "That capture device is unknown." },
        404,
      );
    }
    return json({ ok: true, device: toCaptureDeviceView(record, now) });
  } catch (cause) {
    if (cause instanceof CaptureTokenValidationError) {
      return json(
        { ok: false, message: cause.message, field: cause.field },
        400,
      );
    }
    // One sentence, no internals — the same restraint the Account & security
    // endpoints exercise. There is nothing actionable in the detail for the
    // owner and plenty in it for anyone else.
    return json(
      {
        ok: false,
        message: "That couldn’t be saved. Please try again.",
      },
      500,
    );
  }
}

/** Re-exported so the Settings loader normalises capabilities identically. */
export { normaliseCaptureCapabilities };
