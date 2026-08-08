/**
 * SET-03 — the authenticated Account & security endpoints
 * (`POST /settings/account-security/:action`, where `action` is `sign-out` or
 * `local-data-cleared`).
 *
 * A resource route: it renders no UI. It exists because two of the surface's
 * actions produce a durable, security-relevant HISTORY entry, and history is a
 * server fact — a client cannot be trusted to write one, and a client-side action
 * that leaves no trace is exactly what a security page should not offer.
 *
 * ── What each action actually does ───────────────────────────────────────────
 *
 * `sign-out` records that the owner used DalyHub's own sign-out, with two
 * structural facts: whether this device's local snapshot was cleared on the way
 * out, and how many offline captures were still queued. It does NOT end the
 * session. DalyHub holds no session of its own to end — authentication is the
 * Cloudflare Access cookie (ADR-016 §5.1) — so the browser is sent to Access's
 * logout endpoint afterwards by the caller. This endpoint therefore never claims
 * to have signed anyone out; it records that the owner asked to be.
 *
 * `local-data-cleared` records that the owner cleared DalyHub's data on a device
 * — the scope, and how many unsynchronised captures the clear destroyed. The
 * clearing itself happens in the browser (IndexedDB and Cache Storage are the
 * device's, not the server's), so this is the server LEARNING what the device
 * did, which is why the request carries the outcome rather than a command.
 *
 * ── Why nothing here is a security decision the client makes ─────────────────
 * Everything the client sends is a bounded number or an enumerated literal, and
 * both go through the kernel's own parsers before reaching a payload. The actor,
 * the workspace, the timestamp and the event id all come from the trusted
 * composition. A crafted POST can therefore make the history slightly wrong about
 * a count it was going to have to take the device's word for anyway — and can do
 * nothing else at all: it cannot name another workspace, forge an actor, choose a
 * timestamp, write an arbitrary event type, or reach any other row.
 *
 * The unsafe method also means the Worker boundary has already required a valid
 * Access session AND same-origin provenance (AUDIT-FIX-04) before this action
 * runs. There is no route-specific CSRF token here because there does not need to
 * be one: the canonical boundary covers every mutation, and adding a second
 * mechanism beside it would be two things to keep right instead of one.
 */

import { env } from "cloudflare:workers";

import {
  SECURITY_LOCAL_DATA_CLEARED,
  SECURITY_SIGNED_OUT,
  boundedCount,
  isLocalDataClearScope,
  type LocalDataClearedPayload,
  type SignedOutPayload,
} from "~/kernel/account-security";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/account-security";

/** The bounded set of actions this route accepts. */
const ACTIONS = new Set(["sign-out", "local-data-cleared"]);

type ActionResult =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

function json(data: ActionResult, status = 200): Response {
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

  try {
    if (step === "sign-out") {
      const payload: SignedOutPayload = {
        localSnapshotCleared: String(form.get("localSnapshotCleared")) === "1",
        queuedCapturesKept: boundedCount(form.get("queuedCapturesKept")),
      };
      await scope.workspaceEvents.record({
        type: SECURITY_SIGNED_OUT,
        payload,
      });
      return json({ ok: true });
    }

    const rawScope = String(form.get("scope") ?? "");
    if (!isLocalDataClearScope(rawScope)) {
      return json({ ok: false, message: "Unknown clear scope." }, 400);
    }
    const payload: LocalDataClearedPayload = {
      scope: rawScope,
      queuedCapturesDiscarded: boundedCount(
        form.get("queuedCapturesDiscarded"),
      ),
    };
    await scope.workspaceEvents.record({
      type: SECURITY_LOCAL_DATA_CLEARED,
      payload,
    });
    return json({ ok: true });
  } catch {
    /*
     * Restrained on purpose (§23 of the SET-03 brief). The owner gets one
     * sentence and no internals: no D1 error, no SQL, no stack, no header and no
     * claim. There is nothing actionable in the detail for them, and plenty in it
     * for anyone else.
     *
     * The status matters more than the message here: the CALLERS treat recording
     * as best-effort, because failing to write a history row must never be able
     * to stop the owner signing out or clearing a device.
     */
    return json(
      {
        ok: false,
        message: "That could not be recorded. Nothing else changed.",
      },
      500,
    );
  }
}
