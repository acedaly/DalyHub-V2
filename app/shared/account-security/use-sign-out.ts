/**
 * SET-03 — the ONE sign-out path DalyHub owns end to end (closing DEBT-68).
 *
 * ── What sign-out is, and is not ─────────────────────────────────────────────
 * DalyHub holds no session of its own. Authentication is the Cloudflare Access
 * cookie (ADR-016 §5.1), so ending a session means visiting Access's own logout
 * endpoint — that is the supported mechanism, and this hook does not try to
 * replace, reimplement or second-guess it. It does not delete a cookie by hand;
 * a hand-deleted cookie would leave the owner looking signed out while the edge
 * still considers them signed in, which is worse than not trying.
 *
 * What DalyHub CAN own is everything that happens on the device before the
 * browser leaves, and that is what this hook adds. In order:
 *
 *   1. clear the personal data on this device — the offline snapshot, recent
 *      searches, the diagnostics ring — and DalyHub's cached application files;
 *   2. PRESERVE any offline capture that has never reached the server, because
 *      it exists nowhere else (see `./local-data` for the full classification);
 *   3. tell the server what happened, so the owner has a history entry;
 *   4. navigate to the Access logout endpoint.
 *
 * ── Why this order, and why step 3 cannot block ──────────────────────────────
 * Clearing runs FIRST because after step 4 this page is gone and no cleanup can
 * run — the "clear on the way out" hook DEBT-68 describes has to be on the way
 * out, not after it. Step 3 is deliberately best-effort and its failure is
 * swallowed: a security control that can be prevented from signing you out by an
 * unrelated write failing is not a security control. The history entry is
 * valuable; being able to leave is more valuable.
 *
 * Step 1 is also best-effort, and for the same reason. If IndexedDB is
 * unavailable there is nothing readable to clear, and refusing to sign out over
 * it would strand the owner on a device they were trying to walk away from. The
 * recorded event carries whether the clear SUCCEEDED, so the history never
 * claims a clear that did not happen.
 */

import { useCallback, useState } from "react";

import { ACCESS_LOGOUT_PATH } from "~/shared/shell/access-logout";
import { clearServiceWorkerCaches, useOffline } from "~/shared/offline";

import { clearPersonalWebStorage } from "./local-data";

/** The endpoint that records the sign-out in the owner's own history. */
export const SIGN_OUT_RECORD_PATH = "/settings/account-security/sign-out";

/** Where the hook has got to. `leaving` means the navigation has been asked for. */
export type SignOutState = "idle" | "clearing" | "leaving";

export type UseSignOutResult = {
  readonly state: SignOutState;
  /** Captures on this device that have never reached DalyHub. */
  readonly queuedCaptures: number;
  /** Run the full sign-out. Safe to call twice; the second call is ignored. */
  readonly signOut: () => Promise<void>;
};

/**
 * Drive a complete sign-out.
 *
 * `navigate` is injectable so a component test can prove the ORDER — that the
 * device was cleared and the event recorded before the browser was sent away —
 * without a real navigation. Production callers pass nothing.
 */
export function useSignOut(options?: {
  readonly navigate?: (url: string) => void;
}): UseSignOutResult {
  const offline = useOffline();
  const [state, setState] = useState<SignOutState>("idle");
  const navigate = options?.navigate;

  const queuedCaptures = offline
    ? offline.status.pendingCaptures + offline.status.failedCaptures
    : 0;

  const signOut = useCallback(async () => {
    if (state !== "idle") return;
    setState("clearing");

    let localSnapshotCleared = false;
    try {
      if (offline) {
        if (queuedCaptures === 0) {
          // Nothing on this device exists only here, so everything DalyHub put
          // here can go — the offline database included. A device with nothing
          // pending is left with nothing at all.
          await offline.resetDevice();
        } else {
          // Unsynchronised work is present. Clear the reproducible personal
          // snapshot and the cached application files; keep the queue.
          await offline.clearCachedData();
          await clearServiceWorkerCaches();
        }
        localSnapshotCleared = true;
      }
      clearPersonalWebStorage();
    } catch {
      // Storage that cannot be cleared is storage that could not be read
      // either. Recorded honestly below as `localSnapshotCleared: false`.
      localSnapshotCleared = false;
    }

    // Best-effort history. A failure here changes nothing the owner can act on,
    // and must never keep them signed in.
    try {
      const body = new FormData();
      body.set("localSnapshotCleared", localSnapshotCleared ? "1" : "0");
      body.set("queuedCapturesKept", String(queuedCaptures));
      await fetch(SIGN_OUT_RECORD_PATH, {
        method: "POST",
        body,
        credentials: "same-origin",
      });
    } catch {
      /* See the header: recording must not be able to block leaving. */
    }

    setState("leaving");
    if (navigate) {
      navigate(ACCESS_LOGOUT_PATH);
    } else {
      window.location.assign(ACCESS_LOGOUT_PATH);
    }
  }, [navigate, offline, queuedCaptures, state]);

  return { state, queuedCaptures, signOut };
}
