/**
 * SET-03 Account & security kernel — the security-relevant event vocabulary.
 *
 * A tiny, dependency-free module: the STABLE Activity type identifiers for the
 * things the owner does to their own account and to this device, plus the exact
 * shape of each payload. It is a kernel module rather than a Settings-module one
 * because the shared cross-module activity descriptors read these identifiers,
 * and a shared surface must never import a module (AGENTS.md §9.1).
 *
 * ── What is recorded, and what deliberately is not ───────────────────────────
 *
 * Recorded: the two owner-initiated security actions DalyHub genuinely OBSERVES
 * — signing out through DalyHub's own sign-out, and clearing this device's local
 * DalyHub data. Both are real, both are actions rather than page views, and both
 * are things an owner would want to see a history of on a device they no longer
 * trust.
 *
 * NOT recorded, and each for a reason:
 *   - page views and requests. An audit trail that logs everything says nothing.
 *   - Cloudflare Access events — sign-INS, failed sign-ins, MFA, session
 *     revocation elsewhere. DalyHub never receives them. Manufacturing a
 *     "signed in" row from the fact that a request arrived would be inventing an
 *     observation, and the Account & security surface would then be showing
 *     inferred facts as though they were observed.
 *   - IP addresses, user-agent strings, device names and locations. DalyHub has
 *     no product need for them, and `AGENTS.md` §17 makes the owner's data the
 *     thing being protected rather than a thing to accumulate.
 *   - any token, cookie, claim, subject or secret. Payloads below carry counts
 *     and booleans, and that is the whole vocabulary.
 */

/**
 * The owner signed out through DalyHub's own sign-out surface.
 *
 * NOT "the session ended" — DalyHub cannot observe that. Cloudflare Access can
 * expire a session, and a sign-out performed from Cloudflare's own endpoint
 * directly, from another tab or from another device produces no event here. The
 * type name says what was actually seen: this application's sign-out was used.
 */
export const SECURITY_SIGNED_OUT = "security.signed_out";

/** The owner cleared DalyHub's local data on a device. */
export const SECURITY_LOCAL_DATA_CLEARED = "security.local_data_cleared";

/** Every security-relevant Activity type, for the Account & security read. */
export const SECURITY_ACTIVITY_TYPES = [
  SECURITY_SIGNED_OUT,
  SECURITY_LOCAL_DATA_CLEARED,
] as const;

/** How much local data a clear covered. */
export type LocalDataClearScope =
  /** The read-only snapshot of the owner's records only. */
  | "snapshot"
  /** The snapshot AND DalyHub's cached application files. */
  | "snapshot_and_caches"
  /** Everything, including captures that had never reached DalyHub. */
  | "everything";

/** True for a value that is one of the declared clear scopes. */
export function isLocalDataClearScope(
  value: unknown,
): value is LocalDataClearScope {
  return (
    value === "snapshot" ||
    value === "snapshot_and_caches" ||
    value === "everything"
  );
}

/**
 * The `security.signed_out` payload. Structural facts only: whether the local
 * snapshot was cleared on the way out, and how many offline captures were still
 * queued when it happened. The count matters because an owner reading this later
 * needs to know whether unsynchronised work was left on a device — and it is a
 * COUNT, never the captures themselves.
 */
export type SignedOutPayload = {
  readonly localSnapshotCleared: boolean;
  readonly queuedCapturesKept: number;
};

/** The `security.local_data_cleared` payload. */
export type LocalDataClearedPayload = {
  readonly scope: LocalDataClearScope;
  readonly queuedCapturesDiscarded: number;
};

/** Clamp an untrusted count into a bounded, non-negative integer for a payload. */
export function boundedCount(value: unknown, maximum = 100_000): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(Math.floor(numeric), maximum);
}
