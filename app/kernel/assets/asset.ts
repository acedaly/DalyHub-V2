/**
 * ASSET-01 Assets kernel — the storage-independent Asset contract.
 *
 * Defines the application-facing shape of an Asset: the shared entity header (id,
 * workspaceId, title, timestamps, deletedAt) plus the structured detail slice
 * owned by `asset_details`, and the closed vocabularies (asset type, status). It
 * speaks only domain terms — camelCase, `Date`s, closed string unions, integer
 * minor-unit money — and imports no D1, Cloudflare, SQL or storage-row types. The
 * D1 adapter (`app/platform/storage/d1`) is the only place snake_case rows exist.
 *
 * The Asset's DISPLAY TITLE is the shared `entities.title` (so an Asset renders
 * with the same Record Header identity as every other entity). Everything else —
 * type, status, manufacturer, dates, money, warranty/service, document fields — is
 * the additive detail slice this contract describes. `archivedAt` is a reversible
 * put-away state distinct from `deletedAt` soft-deletion.
 *
 * TWO independent lifecycles, documented deliberately (AGENTS.md, ADR-049):
 *   - `status` describes the REAL-WORLD Asset (Active / Stored / Loaned / Under
 *     repair / Retired / Disposed).
 *   - `archivedAt` controls whether the DalyHub RECORD stays in the active
 *     collection. Archive is not a status; a disposed Asset can still be an active
 *     (un-archived) record, and an archived Asset can still be "Active" status.
 *
 * Every detail field is optional except identity/lifecycle, `assetType` and
 * `status` — an Asset can be captured from a title and a type and enriched over
 * time (care, not data-entry).
 */

import type { WorkspaceId } from "~/kernel/workspaces";

import type { AssetMeterUnit } from "./asset-meter";

/* -------------------------------------------------------------------------- */
/* Closed vocabularies                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The controlled-but-extensible Asset type vocabulary. Stable stored keys with
 * user-friendly labels; a closed union in TypeScript (so rendering is exhaustive)
 * while the stored column stays an ordinary validated string, so a future type is
 * added with no schema migration.
 */
export type AssetType =
  | "vehicle"
  | "trailer"
  | "equipment"
  | "appliance"
  | "electronics"
  | "tool"
  | "property_item"
  | "document"
  | "licence"
  | "insurance"
  | "subscription"
  | "software"
  | "other";

/** Every Asset type, in display order, with a human label. */
export const ASSET_TYPES: readonly {
  readonly value: AssetType;
  readonly label: string;
}[] = [
  { value: "vehicle", label: "Vehicle" },
  { value: "trailer", label: "Trailer or camper" },
  { value: "equipment", label: "Equipment" },
  { value: "appliance", label: "Appliance" },
  { value: "electronics", label: "Electronics" },
  { value: "tool", label: "Tool" },
  { value: "property_item", label: "Property item" },
  { value: "document", label: "Document" },
  { value: "licence", label: "Licence" },
  { value: "insurance", label: "Insurance" },
  { value: "subscription", label: "Subscription" },
  { value: "software", label: "Software" },
  { value: "other", label: "Other" },
];

/**
 * The small, stable real-world lifecycle/status vocabulary. Describes the Asset
 * itself, NOT the DalyHub record's archive state (see the module docs).
 */
export type AssetStatus =
  "active" | "stored" | "loaned" | "under_repair" | "retired" | "disposed";

/** Every Asset status, in display order, with a human label. */
export const ASSET_STATUSES: readonly {
  readonly value: AssetStatus;
  readonly label: string;
}[] = [
  { value: "active", label: "Active" },
  { value: "stored", label: "Stored" },
  { value: "loaned", label: "Loaned" },
  { value: "under_repair", label: "Under repair" },
  { value: "retired", label: "Retired" },
  { value: "disposed", label: "Disposed" },
];

/** The default status a freshly-created Asset carries. */
export const DEFAULT_ASSET_STATUS: AssetStatus = "active";

/* -------------------------------------------------------------------------- */
/* The Asset record                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The structured detail slice an Asset carries beyond the shared entity header.
 * `assetType` and `status` are required; every other field is optional. `tags` is
 * always an array (possibly empty). Date-like fields are stored as calendar
 * `YYYY-MM-DD` strings — dates on a wall calendar, not instants, so they never
 * carry a timezone (ADR-022 §22.7). Money is integer minor units + a currency
 * code (ADR-049); the kernel never converts between currencies.
 *
 * PRIVATE fields (serial/reference numbers, prices, private notes) are marked in
 * `ASSET_PRIVATE_FIELDS`; they are read normally on the record but are NEVER
 * placed in collection cards, search snippets or Activity payloads (§17).
 */
export type AssetDetails = {
  /* Identity */
  readonly assetType: AssetType;
  readonly status: AssetStatus;
  readonly description: string | null;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly serialNumber: string | null;
  readonly referenceCode: string | null;
  readonly tags: readonly string[];
  /* Ownership & location (canonical ids, never duplicated records) */
  readonly ownerPersonId: string | null;
  readonly responsiblePersonId: string | null;
  readonly location: string | null;
  readonly areaId: string | null;
  /* Acquisition & value */
  readonly acquisitionDate: string | null;
  readonly purchasePriceMinor: number | null;
  readonly currencyCode: string | null;
  readonly supplier: string | null;
  readonly replacementValueMinor: number | null;
  readonly disposalDate: string | null;
  readonly disposalNotes: string | null;
  /* Warranty & service */
  readonly warrantyExpiry: string | null;
  readonly serviceInterval: string | null;
  readonly lastServiceDate: string | null;
  readonly nextServiceDate: string | null;
  readonly serviceProvider: string | null;
  readonly maintenanceNotes: string | null;
  /* Document / policy / licence / subscription */
  readonly issuer: string | null;
  readonly referenceNumber: string | null;
  readonly issueDate: string | null;
  readonly renewalDate: string | null;
  readonly url: string | null;
  readonly documentNotes: string | null;
  /* Meter (ASSET-02) — the CURRENT reading, a canonical fact.
   *
   * Advanced forward-only by a meter-bearing Asset Event whose event date is not
   * older than `currentMeterDate`, so back-filling last year's service can never
   * rewind an odometer. All three are null together when no reading exists — and
   * "no reading" is a first-class, honest state, not a zero: a meter obligation
   * with no reading reads as "Current meter reading needed", never as overdue.
   */
  readonly currentMeterValue: number | null;
  readonly currentMeterUnit: AssetMeterUnit | null;
  readonly currentMeterDate: string | null;
};

/**
 * The detail fields that carry sensitive values. They are read on the record but
 * MUST NOT appear in collection cards, search snippets, Activity payloads or
 * telemetry (AGENTS.md §5, §17). The Activity `fields` payload lists which of
 * these changed by NAME only, never the value.
 */
export const ASSET_PRIVATE_FIELDS: ReadonlySet<string> = new Set([
  "serialNumber",
  "referenceCode",
  "referenceNumber",
  "purchasePriceMinor",
  "replacementValueMinor",
  "disposalNotes",
  "maintenanceNotes",
  "documentNotes",
  "description",
]);

/**
 * An Asset: the shared entity header plus the structured detail slice and the
 * archive/soft-delete lifecycle state.
 *
 * Invariants (validation + the D1 adapter + the schema together):
 *   - the underlying `entities.type` is always `asset`.
 *   - `title` is the display title — required, trimmed, shared header rules.
 *   - `archivedAt` (reversible put-away) is independent of `deletedAt`
 *     (soft-deletion) AND of `status` (real-world state).
 *   - a soft-deleted Asset reads as "not found" through normal reads.
 *
 * Every field is `readonly`: a stored record is an immutable snapshot. Mutations
 * go through the `AssetRepository` and return a fresh record.
 */
export type Asset = AssetDetails & {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
  readonly archivedAt: Date | null;
};

/* -------------------------------------------------------------------------- */
/* Creation & update inputs                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The editable detail fields, all optional. `undefined` means "leave unchanged"
 * on update (and "unset" on create); an explicit `null` clears a field; `tags`
 * replaces the whole set. Money amounts are supplied as plain decimal STRINGS
 * ("1234.56") which the boundary parses to integer minor units against
 * `currencyCode`; the two `*Minor` fields never appear here. There is
 * deliberately NO `workspaceId` — scope comes from the repository's bound
 * `WorkspaceContext` (ADR-010).
 */
export type AssetDetailsInput = {
  readonly assetType?: string;
  readonly status?: string;
  readonly description?: string | null;
  readonly manufacturer?: string | null;
  readonly model?: string | null;
  readonly serialNumber?: string | null;
  readonly referenceCode?: string | null;
  readonly tags?: readonly string[];
  readonly ownerPersonId?: string | null;
  readonly responsiblePersonId?: string | null;
  readonly location?: string | null;
  readonly areaId?: string | null;
  readonly acquisitionDate?: string | null;
  readonly purchasePrice?: string | null;
  readonly currencyCode?: string | null;
  readonly supplier?: string | null;
  readonly replacementValue?: string | null;
  readonly disposalDate?: string | null;
  readonly disposalNotes?: string | null;
  readonly warrantyExpiry?: string | null;
  readonly serviceInterval?: string | null;
  readonly lastServiceDate?: string | null;
  readonly nextServiceDate?: string | null;
  readonly serviceProvider?: string | null;
  readonly maintenanceNotes?: string | null;
  readonly issuer?: string | null;
  readonly referenceNumber?: string | null;
  readonly issueDate?: string | null;
  readonly renewalDate?: string | null;
  readonly url?: string | null;
  readonly documentNotes?: string | null;
};

/** Input to create an Asset: a required title and asset type plus optional detail. */
export type CreateAssetInput = AssetDetailsInput & {
  readonly title: string;
  readonly assetType: string;
};

/** Input to update an Asset's detail slice (never its title or archive lifecycle). */
export type UpdateAssetInput = AssetDetailsInput;

/** Result of a detail update: the fresh Asset and whether anything changed. */
export type AssetChangeResult = {
  readonly asset: Asset;
  readonly changed: boolean;
};

/* -------------------------------------------------------------------------- */
/* Lifecycle (archive / restore)                                              */
/* -------------------------------------------------------------------------- */

/** What an archive / restore call actually did. */
export type AssetLifecycleOutcome =
  "archived" | "already_archived" | "restored" | "already_active";

/** Result of an archive or restore. `changed` distinguishes a real transition
 * from an idempotent no-op. */
export type AssetLifecycleResult = {
  readonly asset: Asset;
  readonly outcome: AssetLifecycleOutcome;
  readonly changed: boolean;
};

/** Result of a permanent (hard) delete attempt. */
export type AssetDeleteResult = {
  readonly deleted: boolean;
  /** When `deleted` is false, the reason the delete was refused. */
  readonly blockedReason?: "has_links";
  /** How many active relationships block a guarded delete. */
  readonly linkCount?: number;
};

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** Options for reading a single Asset. */
export type GetAssetOptions = {
  /** When true, a soft-deleted Asset is returned too. Defaults to false. */
  readonly includeDeleted?: boolean;
};

/**
 * Which collection view a list query returns. Views are the segmented tabs of the
 * `/assets` collection; every one is bounded, workspace-scoped and cursor-paged.
 *   - `all`         — active (un-archived) records, any status.
 *   - `recent`      — active records, most-recently-updated first.
 *   - `expiring`    — active records with a warranty/renewal date due within the
 *                     horizon (or already overdue), soonest first.
 *   - `service_due` — active records with a next-service date due within the
 *                     horizon (or overdue), soonest first.
 *   - `archived`    — archived records.
 */
export type AssetView =
  "all" | "recent" | "expiring" | "service_due" | "archived";

/** The sort orders offered for the `all`/`recent`/`archived` views. */
export type AssetSort = "recent" | "title" | "type" | "next_date";

/**
 * Structured, workspace-wide filters applied in SQL (never only over the loaded
 * page). Every value is optional and validated; an omitted filter is inactive.
 */
export type AssetFilters = {
  readonly type?: string;
  readonly status?: string;
  readonly areaId?: string;
  /** Matches when the Asset's owner OR responsible Person is this id. */
  readonly personId?: string;
  readonly tag?: string;
};

/**
 * Input to list Assets within the bound workspace, using bounded cursor
 * pagination with a deterministic total order. Scope comes from the bound
 * `WorkspaceContext`, never a `workspaceId` parameter.
 */
export type ListAssetsInput = {
  /** Collection view to return. Defaults to `all`. */
  readonly view?: AssetView;
  /** Sort order (ignored for the date-driven `expiring`/`service_due` views). */
  readonly sort?: AssetSort;
  /** Structured workspace-wide filters. */
  readonly filters?: AssetFilters;
  /** Optional case-insensitive text filter over non-sensitive fields. */
  readonly query?: string;
  /** Maximum records to return. Clamped to `[1, MAX_ASSETS_PAGE_SIZE]`. */
  readonly limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`. Scope-bound. */
  readonly cursor?: string;
  /**
   * TEST/loader-supplied "today" (owner-calendar `YYYY-MM-DD`) for the date-driven
   * views, so due-date windows resolve in the owner's timezone deterministically.
   * Defaults to the repository clock's owner-calendar day.
   */
  readonly today?: string;
};

/** A bounded page of Assets plus the next-page cursor. */
export type AssetPage = {
  readonly items: readonly Asset[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};
