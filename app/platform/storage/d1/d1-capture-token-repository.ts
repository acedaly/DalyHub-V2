/**
 * CAPTURE-01 — the D1 capture-credential store.
 *
 * Workspace-bound at construction, like every other repository here: every
 * statement below carries `workspace_id = ?`, so the workspace a credential
 * belongs to is decided by the composition boundary and can never be reached
 * from a request (CAPTURE-01 §36, ADR-010). A credential in another workspace is not
 * "forbidden" — it is simply not found, which is the same answer as "no such
 * token" and discloses nothing.
 *
 * The store handles digests and fingerprints only. There is no statement here
 * that could return a token, because no column holds one.
 */

import {
  CaptureTokenStorageError,
  captureTokenFingerprint,
  normaliseCaptureCapabilities,
  type CaptureCapability,
  type CaptureTokenRecord,
  type CaptureTokenRepository,
  type NewCaptureToken,
} from "~/kernel/capture";
import { secureIdGenerator, systemClock } from "~/kernel/entities";
import type { Clock, IdGenerator } from "~/kernel/entities";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";

interface CaptureTokenRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly owner_subject: string;
  readonly name: string;
  readonly fingerprint: string;
  readonly capabilities: string;
  readonly source: string | null;
  readonly created_at: string;
  readonly last_used_at: string | null;
  readonly expires_at: string | null;
  readonly revoked_at: string | null;
}

/** The columns every read selects. `token_hash` is deliberately absent: nothing
 * outside the lookup predicate has any business handling it. */
const COLUMNS =
  "id, workspace_id, owner_subject, name, fingerprint, capabilities, source, created_at, last_used_at, expires_at, revoked_at";

function rowToRecord(row: CaptureTokenRow): CaptureTokenRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerSubject: row.owner_subject,
    name: row.name,
    fingerprint: row.fingerprint,
    // Re-normalised on the way out, so a hand-edited row can never widen a
    // credential into a capability the application does not recognise.
    capabilities: normaliseCaptureCapabilities(row.capabilities.split(",")),
    source: row.source,
    createdAt: fromStorageTimestamp(row.created_at),
    lastUsedAt:
      row.last_used_at === null ? null : fromStorageTimestamp(row.last_used_at),
    expiresAt:
      row.expires_at === null ? null : fromStorageTimestamp(row.expires_at),
    revokedAt:
      row.revoked_at === null ? null : fromStorageTimestamp(row.revoked_at),
  };
}

function serialiseCapabilities(
  capabilities: readonly CaptureCapability[],
): string {
  return normaliseCaptureCapabilities(capabilities).join(",");
}

export type D1CaptureTokenRepositoryOptions = {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
};

export class D1CaptureTokenRepository implements CaptureTokenRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1CaptureTokenRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
  }

  async create(input: NewCaptureToken): Promise<CaptureTokenRecord> {
    const id = this.#newId();
    const createdAt = this.#clock();
    const capabilities = serialiseCapabilities(input.capabilities);
    const fingerprint = captureTokenFingerprint(input.tokenHash);
    try {
      await this.#db
        .prepare(
          `INSERT INTO capture_tokens
             (id, workspace_id, owner_subject, name, token_hash, fingerprint,
              capabilities, source, created_at, last_used_at, expires_at, revoked_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10, NULL)`,
        )
        .bind(
          id,
          this.#workspaceId,
          input.ownerSubject,
          input.name,
          input.tokenHash,
          fingerprint,
          capabilities,
          input.source,
          toStorageTimestamp(createdAt),
          input.expiresAt === null ? null : toStorageTimestamp(input.expiresAt),
        )
        .run();
    } catch (cause) {
      throw new CaptureTokenStorageError("create", { cause });
    }
    return {
      id,
      workspaceId: this.#workspaceId,
      ownerSubject: input.ownerSubject,
      name: input.name,
      fingerprint,
      capabilities: normaliseCaptureCapabilities(input.capabilities),
      source: input.source,
      createdAt,
      lastUsedAt: null,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
  }

  async findByHash(tokenHash: string): Promise<CaptureTokenRecord | null> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT ${COLUMNS} FROM capture_tokens
            WHERE workspace_id = ?1 AND token_hash = ?2`,
        )
        .bind(this.#workspaceId, tokenHash)
        .first<CaptureTokenRow>();
      return row === null ? null : rowToRecord(row);
    } catch (cause) {
      throw new CaptureTokenStorageError("find", { cause });
    }
  }

  async list(): Promise<readonly CaptureTokenRecord[]> {
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${COLUMNS} FROM capture_tokens
            WHERE workspace_id = ?1
            ORDER BY created_at DESC, id DESC`,
        )
        .bind(this.#workspaceId)
        .all<CaptureTokenRow>();
      return (result.results ?? []).map(rowToRecord);
    } catch (cause) {
      throw new CaptureTokenStorageError("list", { cause });
    }
  }

  async markUsed(id: string, at: Date): Promise<void> {
    try {
      await this.#db
        .prepare(
          `UPDATE capture_tokens
              SET last_used_at = ?1
            WHERE workspace_id = ?2 AND id = ?3`,
        )
        .bind(toStorageTimestamp(at), this.#workspaceId, id)
        .run();
    } catch (cause) {
      throw new CaptureTokenStorageError("mark used", { cause });
    }
  }

  async revoke(id: string, at: Date): Promise<boolean> {
    try {
      // `revoked_at IS NULL` makes this a compare-and-swap: a second Revoke tap
      // changes nothing and reports false, rather than rewriting the moment the
      // credential stopped working.
      const result = await this.#db
        .prepare(
          `UPDATE capture_tokens
              SET revoked_at = ?1
            WHERE workspace_id = ?2 AND id = ?3 AND revoked_at IS NULL`,
        )
        .bind(toStorageTimestamp(at), this.#workspaceId, id)
        .run();
      return (result.meta?.changes ?? 0) > 0;
    } catch (cause) {
      throw new CaptureTokenStorageError("revoke", { cause });
    }
  }
}
