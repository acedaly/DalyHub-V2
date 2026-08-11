/**
 * CAPTURE-01 Capture kernel — the capture-credential storage contract.
 *
 * Storage-independent and WORKSPACE-BOUND at construction, exactly like every
 * other repository in the kernel. That binding is the whole of CAPTURE-01 §36: the workspace
 * is decided when the repository is built, from trusted server configuration, so
 * there is no method here that takes a workspace and therefore no way for a
 * request to name one. A credential minted in one workspace is invisible to a
 * repository bound to another — a lookup simply does not find it, which is the
 * same answer as "no such token" and discloses nothing.
 *
 * Note what is NOT here: no method returns a token, and no method accepts one.
 * The repository deals exclusively in digests and fingerprints, so a token cannot
 * be read back out of storage even by code that wants to.
 */

import type { CaptureCapability, CaptureTokenRecord } from "./capture-tokens";

/** What creating a credential needs. The id and timestamps are the store's. */
export type NewCaptureToken = {
  /**
   * The authenticated subject minting this credential. Never a request value —
   * the Settings endpoint takes it from the boundary-validated session.
   */
  readonly ownerSubject: string;
  readonly name: string;
  readonly capabilities: readonly CaptureCapability[];
  /** The expected capture source for this device, or null. Presentation only. */
  readonly source: string | null;
  /** The SHA-256 digest of the minted token. Never the token. */
  readonly tokenHash: string;
  /** An optional expiry. Null means "until revoked". */
  readonly expiresAt: Date | null;
};

export interface CaptureTokenRepository {
  /**
   * Store a new credential and return it. Throws `CaptureTokenStorageError` on a
   * storage failure — a credential that could not be stored must never be
   * reported as created, because the owner would then hold a token that can
   * never work and no way to tell.
   */
  create(input: NewCaptureToken): Promise<CaptureTokenRecord>;

  /**
   * Find the credential whose stored digest equals `tokenHash`, within the bound
   * workspace. Returns the record whatever its state — revoked and expired
   * credentials are RETURNED, not filtered, so the caller evaluates status
   * against one clock and the authentication path has exactly one shape.
   * Returns null when there is no such digest here.
   */
  findByHash(tokenHash: string): Promise<CaptureTokenRecord | null>;

  /**
   * Every credential in the workspace, newest first, including revoked ones — the
   * Settings list shows history, and a revoked device disappearing without trace
   * is how an owner loses the ability to answer "did I revoke that?".
   */
  list(): Promise<readonly CaptureTokenRecord[]>;

  /**
   * Record that a credential was used. Best-effort by contract at the CALL SITE:
   * a failure to update "last used" must never fail a capture, because the
   * capture is the thing the owner cares about.
   */
  markUsed(id: string, at: Date): Promise<void>;

  /**
   * Revoke a credential, permanently and immediately. Returns true when this call
   * performed the revocation, false when it was already revoked (idempotent — a
   * double-tap on Revoke is not an error).
   */
  revoke(id: string, at: Date): Promise<boolean>;
}

/** A capture-credential storage failure. Never carries the underlying detail out. */
export class CaptureTokenStorageError extends Error {
  constructor(operation: string, options?: ErrorOptions) {
    super(
      `A capture credential storage error occurred (${operation}).`,
      options,
    );
    this.name = "CaptureTokenStorageError";
  }
}
