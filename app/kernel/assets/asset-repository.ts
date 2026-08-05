/**
 * ASSET-01 Assets kernel — the authoritative domain repository contract.
 *
 * The storage-independent interface that owns an Asset's structured detail slice,
 * its real-world status, and its archive lifecycle. It speaks only domain terms
 * (camelCase `Asset`s, closed unions, integer minor-unit money, typed errors) and
 * never exposes D1, SQL or Cloudflare types. The D1 adapter
 * (`app/platform/storage/d1`) implements it; the generic Entity repository refuses
 * to CREATE an `asset` (so an Asset can never exist without its detail row), but
 * still owns a rename and soft-delete/restore — mirroring People/Diary's
 * create-only reservation.
 *
 * The repository is WORKSPACE-BOUND (ADR-010): constructed with a single
 * `WorkspaceContext`, every method operates only within that workspace, no method
 * accepts a `workspaceId`, and the trusted Activity actor is bound at
 * construction — module code cannot pass, select or spoof scope or actor.
 *
 * Atomicity (ADR-012): `create` writes the `entities` row, the `asset_details`
 * row and one `asset.created` event as ONE D1 transaction that rolls back entirely
 * on any failure. `update`, `archive`, `restore` and status changes fold their
 * precondition and change-detection into the mutating SQL, atomic with their
 * Activity append; an idempotent no-op changes nothing and appends no Activity.
 * Activity payloads carry ONLY structural metadata (which field NAMES changed,
 * the new status) — NEVER serial/policy numbers, prices or private notes (§17).
 */

import type {
  AssetChangeResult,
  AssetDeleteResult,
  AssetLifecycleResult,
  AssetPage,
  CreateAssetInput,
  GetAssetOptions,
  ListAssetsInput,
  Asset,
  UpdateAssetInput,
} from "./asset";

export interface AssetRepository {
  /** Create an Asset from a title + type plus optional details. Atomically writes
   * the entity, its detail row and `asset.created`. */
  create(input: CreateAssetInput): Promise<Asset>;

  /**
   * Read one Asset by id within the bound workspace. Returns null when there is no
   * matching Asset here — including when it exists in another workspace
   * (indistinguishable from "does not exist"). Soft-deleted Assets are excluded
   * unless `options.includeDeleted`. Archived Assets ARE returned (archive is not
   * deletion).
   */
  get(id: string, options?: GetAssetOptions): Promise<Asset | null>;

  /**
   * List Assets in the bound workspace for a collection view, with structured
   * filters, a text query and a sort, using bounded cursor pagination with a
   * deterministic total order. Filtering and ordering operate over the FULL
   * workspace collection in SQL, never only the loaded page.
   */
  list(input?: ListAssetsInput): Promise<AssetPage>;

  /**
   * Update an Asset's detail slice (never its title or archive lifecycle). Only
   * the fields present in `changes` are touched; an update that changes nothing
   * after normalisation is an idempotent no-op. A change to `status` appends
   * `asset.status_changed` (or `asset.disposed` when the new status is disposed);
   * any other detail change appends `asset.updated`.
   */
  update(id: string, changes: UpdateAssetInput): Promise<AssetChangeResult>;

  /**
   * Archive an Asset: set `archivedAt`, advance the detail `updatedAt` and append
   * `asset.archived`, atomically. Archiving an already-archived Asset is a no-op.
   * A soft-deleted Asset cannot be archived (`AssetNotFoundError`). Archive is
   * independent of the real-world `status`.
   */
  archive(id: string): Promise<AssetLifecycleResult>;

  /**
   * Restore an archived Asset to the active collection: clear `archivedAt`,
   * advance `updatedAt` and append `asset.restored`, atomically. Restoring an
   * already-active Asset is a no-op.
   */
  restore(id: string): Promise<AssetLifecycleResult>;

  /**
   * Permanently (hard) delete an Asset — the guarded destructive path. Refuses
   * (returns `{ deleted: false, blockedReason: "has_links" }`) when the Asset
   * still has active relationships, so linked Notes/Tasks/People are never
   * silently orphaned; the caller unlinks first. Never touches any linked record.
   *
   * On success the Asset's whole footprint — links, subject pointers, ASSET-02
   * history and obligations, the detail row and the entity row — is removed
   * child-first in ONE atomic batch, and exactly one SUBJECT-LESS `asset.deleted`
   * tombstone is appended carrying `{ assetId, title }`. Existing `activities`
   * rows about the Asset are RETAINED (append-only, ADR-012); only their
   * `activity_subjects` pointers to the vanishing entity go.
   *
   * Idempotent and race-safe: an already-gone Asset returns `{ deleted: false }`
   * having written nothing, and a purge that loses a race (or is blocked at
   * commit by a link created after the precheck) removes nothing and appends no
   * tombstone — exactly one tombstone can ever exist per destroyed Asset.
   */
  permanentlyDelete(id: string): Promise<AssetDeleteResult>;
}
