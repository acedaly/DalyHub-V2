/**
 * PWA-03 — the shared connection- and sync-state model.
 *
 * ONE state vocabulary for the whole product, derived from REAL request outcomes.
 *
 * ── `navigator.onLine` is not the source of truth ────────────────────────────
 * `navigator.onLine` answers "is there a network interface attached?", which is
 * not the question. It reports `true` on a captive-portal wifi that resolves
 * nothing, on a VPN that cannot reach Cloudflare, and while DalyHub's own Worker
 * is returning 503. It reports `false` on some Linux/container setups that are
 * perfectly online. So it is used here for exactly one thing — as a *hint* that
 * it is worth probing again immediately — and never as the answer. The answer
 * always comes from `classifyProbe`, which reads an actual request's outcome.
 *
 * ── Cloudflare Access shapes the states ──────────────────────────────────────
 * DalyHub sits behind Cloudflare Access at the edge, so an expired session does
 * NOT produce a clean 401 from DalyHub's Worker: Access intercepts first and
 * responds with a redirect to the identity provider. From `fetch`'s point of view
 * that is a cross-origin redirect, which surfaces as an opaque redirect (with
 * `redirect: "manual"`) or an outright network error — the same shape as being
 * offline. Telling those two apart is the whole reason `authRequired` is a first
 * class state: showing "you are offline" to someone whose session simply expired
 * would send them to fix the wrong problem.
 */

/** Every connection/sync state the product can be in. */
export const OFFLINE_CONNECTION_STATES = [
  /** The backend answered. Everything works. */
  "online",
  /** A request failed in a way consistent with no usable network. */
  "offline",
  /** A probe is in flight after a failure — we do not yet know. */
  "reconnecting",
  /** The backend is reachable but the Access session is not valid. */
  "authRequired",
  /** Reachable and authenticated, but DalyHub's Worker or D1 is unhealthy. */
  "backendUnavailable",
] as const;

export type OfflineConnectionState = (typeof OFFLINE_CONNECTION_STATES)[number];

/** The synchronisation half of the status, kept separate from reachability. */
export const OFFLINE_SYNC_STATES = [
  /** Nothing queued, snapshot current. */
  "upToDate",
  /** A snapshot refresh or a queue replay is running. */
  "syncing",
  /** Work is queued and waiting for a usable connection. */
  "pending",
  /** The last attempt failed and something needs attention. */
  "failed",
  /** No snapshot has ever been stored on this device. */
  "never",
] as const;

export type OfflineSyncState = (typeof OFFLINE_SYNC_STATES)[number];

/** The raw result of a reachability probe, before classification. */
export type OfflineProbeResult =
  | {
      readonly kind: "response";
      readonly status: number;
      readonly type: string;
      readonly authenticated: boolean;
    }
  | { readonly kind: "networkError" };

/**
 * Classify a probe outcome into a connection state. Pure, total, and the ONLY
 * place this judgement is made.
 *
 * `authenticated` is the probe endpoint's own marker: `/offline/ping` answers
 * with a header only DalyHub's authenticated Worker sets. Its absence on an
 * otherwise-successful response means something else answered — an Access
 * challenge page, a captive portal, a cached intermediary — so the response is
 * NOT treated as proof of a working session.
 */
export function classifyProbe(
  result: OfflineProbeResult,
): OfflineConnectionState {
  if (result.kind === "networkError") return "offline";
  // `redirect: "manual"` turns a cross-origin Access redirect into an opaque
  // redirect; some engines report status 0. Both mean "Access answered".
  if (result.type === "opaqueredirect" || result.status === 0) {
    return "authRequired";
  }
  if (result.status === 401 || result.status === 403) return "authRequired";
  if (result.status >= 300 && result.status < 400) return "authRequired";
  if (result.status >= 500) return "backendUnavailable";
  if (result.status >= 200 && result.status < 300) {
    return result.authenticated ? "online" : "authRequired";
  }
  // 4xx that is not an auth status: the backend answered, so we are reachable.
  return "online";
}

/** True when the backend can be talked to AND the session is usable. */
export function canReachBackend(state: OfflineConnectionState): boolean {
  return state === "online";
}

/**
 * True when a failed request should pause syncing rather than retrying. An
 * expired Access session must NOT be hammered: every retry is a redirect to the
 * identity provider, and a device left in a pocket would generate thousands.
 */
export function shouldPauseSync(state: OfflineConnectionState): boolean {
  return state === "authRequired";
}

/** The complete status the UI renders, assembled from both halves. */
export interface OfflineStatus {
  readonly connection: OfflineConnectionState;
  readonly sync: OfflineSyncState;
  /** The last successful snapshot sync (ISO-8601 UTC), or null if never. */
  readonly lastSyncedAt: string | null;
  /** How many captures are waiting to reach the server. */
  readonly pendingCaptures: number;
  /** How many captures need the owner's attention. */
  readonly failedCaptures: number;
}

/**
 * A short, calm, colour-independent label for a status. Colour is never the only
 * carrier of this information (`AGENTS.md §15`) — this text is.
 */
export function connectionStateLabel(state: OfflineConnectionState): string {
  switch (state) {
    case "online":
      return "Online";
    case "offline":
      return "Offline";
    case "reconnecting":
      return "Reconnecting";
    case "authRequired":
      return "Sign in required";
    case "backendUnavailable":
      return "DalyHub is unavailable";
  }
}

/** One sentence explaining what the state means for the owner right now. */
export function connectionStateDescription(
  state: OfflineConnectionState,
): string {
  switch (state) {
    case "online":
      return "Connected to DalyHub. Everything is available.";
    case "offline":
      return "No connection. You are seeing a stored offline snapshot, and new captures are queued on this device.";
    case "reconnecting":
      return "Checking the connection to DalyHub.";
    case "authRequired":
      return "Your DalyHub sign-in has expired. Anything you captured offline is safe on this device and will sync after you sign in again.";
    case "backendUnavailable":
      return "DalyHub is reachable but not responding. Your queued captures are safe and will be retried.";
  }
}

/** A short, colour-independent label for the sync half of the status. */
export function syncStateLabel(state: OfflineSyncState): string {
  switch (state) {
    case "upToDate":
      return "Up to date";
    case "syncing":
      return "Synchronising";
    case "pending":
      return "Waiting to sync";
    case "failed":
      return "Sync failed";
    case "never":
      return "Not stored offline yet";
  }
}

/** Derive the sync half of the status from the facts. Pure. */
export function deriveSyncState(input: {
  readonly busy: boolean;
  readonly hasSnapshot: boolean;
  readonly pendingCaptures: number;
  readonly failedCaptures: number;
}): OfflineSyncState {
  if (input.busy) return "syncing";
  if (input.failedCaptures > 0) return "failed";
  if (input.pendingCaptures > 0) return "pending";
  if (!input.hasSnapshot) return "never";
  return "upToDate";
}

/**
 * How old a snapshot may be before the offline views call it stale. Two days is
 * chosen against the seven-day window: a snapshot older than this is still shown
 * (it is better than nothing) but is labelled, because within a fifteen-day
 * window a two-day-old copy can already have the wrong idea of "today".
 */
export const OFFLINE_SNAPSHOT_STALE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/** True when a snapshot is old enough to warrant a stale-data warning. */
export function isSnapshotStale(
  lastSyncedAt: string | null,
  now: Date,
  staleAfterMs: number = OFFLINE_SNAPSHOT_STALE_AFTER_MS,
): boolean {
  if (!lastSyncedAt) return false;
  const parsed = Date.parse(lastSyncedAt);
  if (Number.isNaN(parsed)) return true;
  return now.getTime() - parsed >= staleAfterMs;
}
