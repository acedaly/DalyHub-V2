/**
 * ASSET-01 Assets — D1 implementation of the authoritative, workspace-bound
 * `AssetRepository`.
 *
 * Implements the storage-independent Assets contract over Cloudflare D1 (SQLite)
 * using prepared, parameterised statements only. Constructed with a single
 * `WorkspaceContext`; every statement constrains `workspace_id = ?` and no method
 * accepts a `workspaceId` (ADR-010). No caller value is ever interpolated into SQL
 * (AGENTS.md §17) — the only inlined literal is the trusted kernel constant
 * `'asset'` and the trusted column-name constants used to build partial-update
 * statements (every VALUE stays bound).
 *
 * Atomicity (ADR-012): `create` writes the `entities` row, the `asset_details`
 * row and one `asset.created` event in ONE `D1Database.batch()`. `update`,
 * `archive`, `restore` fold their precondition and change-detection into the
 * mutating SQL, atomic with their Activity append via `recordAtomicMutation`.
 * `permanentlyDelete` purges the Asset's whole footprint child-first in one
 * guarded batch and appends exactly one subject-less `asset.deleted` tombstone
 * immediately after the `entities` DELETE, guarded on that DELETE's `changes()`
 * (AUDIT-03 / DEBT-79) — the same shape as the Area purge precedent.
 *
 * Activity payloads carry ONLY structural metadata — which field NAMES changed and
 * the new status vocabulary term — NEVER an Asset's serial/policy numbers, prices
 * or private notes (AGENTS.md §5, §17).
 */

import {
  ActivityError,
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator as activitySecureIdGenerator,
  serializeActivityPayload,
  type ActivityActorContext,
  type NewActivityEvent,
} from "~/kernel/activity";
import {
  ASSET_ARCHIVED,
  ASSET_CREATED,
  ASSET_DELETED,
  ASSET_DISPOSED,
  ASSET_ENTITY_TYPE,
  ASSET_RESTORED,
  ASSET_SCALAR_FIELDS,
  ASSET_STATUS_CHANGED,
  ASSET_UPDATED,
  AssetConflictError,
  AssetError,
  AssetNotFoundError,
  AssetStorageError,
  decodeAssetCursorForScope,
  encodeAssetCursor,
  normaliseQuery,
  validateAssetDetails,
  validateAssetFilters,
  validateAssetId,
  validateAssetsLimit,
  validateAssetSort,
  validateAssetTitle,
  validateAssetView,
  validateToday,
  type Asset,
  type AssetChangeResult,
  type AssetCursorScope,
  type AssetDeleteResult,
  type AssetLifecycleResult,
  type AssetPage,
  type AssetRepository,
  type AssetScalarField,
  type AssetMeterUnit,
  type AssetStatus,
  type AssetType,
  type CreateAssetInput,
  type ListAssetsInput,
  type UpdateAssetInput,
} from "~/kernel/assets";
import {
  systemClock,
  secureIdGenerator,
  type Clock,
  type IdGenerator,
} from "~/kernel/entities";
import { canonicalTagKey, type WorkspaceTag } from "~/kernel/tags";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import { ownerCalendarIso } from "~/shared/datetime";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";
import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  recordAtomicMutation,
  type AtomicMutationFault,
} from "./d1-atomic-mutation";
import {
  buildEntityTagStatements,
  entityTagsProjection,
  parseTagProjection,
  tagFilterPredicate,
  tagSearchPredicate,
} from "./d1-entity-tags";
import { likeContains } from "./like-pattern";

/** TEST-ONLY deterministic create-batch failure injection. Never set in production. */
export type D1AssetCreateFault = "after-entity" | "after-details";

/**
 * TEST-ONLY deterministic purge-batch failure injection. Never set in production.
 *
 * `after-entity` fails BETWEEN the `entities` DELETE and the tombstone insert;
 * `after-tombstone` fails AFTER both. Either proves the destruction and its audit
 * event are one indivisible unit — no purged Asset without a tombstone, and no
 * tombstone for an Asset that still exists.
 */
export type D1AssetDeleteFault = "after-entity" | "after-tombstone";

export interface D1AssetRepositoryOptions {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly actorContext?: ActivityActorContext;
  readonly activityIdGenerator?: IdGenerator;
  /** TEST-ONLY create-batch fault (proves the whole create rolls back). */
  readonly createFault?: D1AssetCreateFault;
  /** TEST-ONLY mutation-batch fault (proves the detail write + event roll back). */
  readonly mutationFault?: AtomicMutationFault;
  /** TEST-ONLY purge-batch fault (proves the purge + tombstone roll back). */
  readonly deleteFault?: D1AssetDeleteFault;
  /**
   * AUDIT-14 — resolve the OWNER's timezone, so this repository's idea of
   * "today" is the same one every other module uses. It used to be a hard-coded
   * `Australia/Sydney`, which day-shifted obligation due state and the dates
   * written onto generated work for any owner living elsewhere. Omitted, it
   * falls back to `DEFAULT_OWNER_TIME_ZONE` — the no-preference case only.
   */
  readonly ownerTimeZone?: () => Promise<string>;
}

const SUBJECT_ROLE = "subject";

/** How far out the date-driven collection views look (owner-calendar days). */
const EXPIRING_HORIZON_DAYS = 60;
const SERVICE_HORIZON_DAYS = 60;

/** A far-future sentinel so NULL dates sort LAST under ascending date order. */
const DATE_SENTINEL = "9999-12-31";

/** The DB column for each scalar detail field. Trusted identifiers, never caller
 * data, so they may be interpolated into a dynamic partial-update statement while
 * every VALUE stays bound. */
const SCALAR_COLUMN: Record<AssetScalarField, string> = {
  description: "description",
  manufacturer: "manufacturer",
  model: "model",
  serialNumber: "serial_number",
  referenceCode: "reference_code",
  ownerPersonId: "owner_person_id",
  responsiblePersonId: "responsible_person_id",
  location: "location",
  areaId: "area_id",
  acquisitionDate: "acquisition_date",
  currencyCode: "currency_code",
  supplier: "supplier",
  disposalDate: "disposal_date",
  disposalNotes: "disposal_notes",
  warrantyExpiry: "warranty_expiry",
  serviceInterval: "service_interval",
  lastServiceDate: "last_service_date",
  nextServiceDate: "next_service_date",
  serviceProvider: "service_provider",
  maintenanceNotes: "maintenance_notes",
  issuer: "issuer",
  referenceNumber: "reference_number",
  issueDate: "issue_date",
  renewalDate: "renewal_date",
  url: "url",
  documentNotes: "document_notes",
};

/** Column → domain field, for building the (name-only) Activity payload and
 * reading current values during change detection. */
const COLUMN_FIELD: ReadonlyMap<string, string> = new Map([
  ...ASSET_SCALAR_FIELDS.map((f) => [SCALAR_COLUMN[f], f] as const),
  ["asset_type", "assetType"] as const,
  ["status", "status"] as const,
  ["purchase_price_minor", "purchasePriceMinor"] as const,
  ["replacement_value_minor", "replacementValueMinor"] as const,
]);

/** Every editable detail column a create INSERT writes, in a stable order. */
const DETAIL_COLUMNS: readonly string[] = [
  "asset_type",
  "status",
  ...ASSET_SCALAR_FIELDS.map((f) => SCALAR_COLUMN[f]),
  "purchase_price_minor",
  "replacement_value_minor",
];

/** The full ordered detail-column list the create INSERT writes. */
const CREATE_COLUMNS: readonly string[] = [
  ...DETAIL_COLUMNS,
  "archived_at",
  "updated_at",
];

const ENTITY_RETURNING =
  "id, workspace_id, type, title, created_at, updated_at, deleted_at";

/** The joined columns every read selects. */
const READ_COLUMNS = `
  e.id AS id,
  e.workspace_id AS workspace_id,
  e.title AS title,
  e.created_at AS created_at,
  e.deleted_at AS deleted_at,
  d.asset_type AS asset_type,
  d.status AS status,
  d.description AS description,
  d.manufacturer AS manufacturer,
  d.model AS model,
  d.serial_number AS serial_number,
  d.reference_code AS reference_code,
  ${entityTagsProjection("d")} AS tags,
  d.owner_person_id AS owner_person_id,
  d.responsible_person_id AS responsible_person_id,
  d.location AS location,
  d.area_id AS area_id,
  d.acquisition_date AS acquisition_date,
  d.purchase_price_minor AS purchase_price_minor,
  d.currency_code AS currency_code,
  d.supplier AS supplier,
  d.replacement_value_minor AS replacement_value_minor,
  d.disposal_date AS disposal_date,
  d.disposal_notes AS disposal_notes,
  d.warranty_expiry AS warranty_expiry,
  d.service_interval AS service_interval,
  d.last_service_date AS last_service_date,
  d.next_service_date AS next_service_date,
  d.service_provider AS service_provider,
  d.maintenance_notes AS maintenance_notes,
  d.issuer AS issuer,
  d.reference_number AS reference_number,
  d.issue_date AS issue_date,
  d.renewal_date AS renewal_date,
  d.url AS url,
  d.document_notes AS document_notes,
  d.current_meter_value AS current_meter_value,
  d.current_meter_unit AS current_meter_unit,
  d.current_meter_date AS current_meter_date,
  d.archived_at AS archived_at,
  CASE WHEN e.updated_at >= d.updated_at THEN e.updated_at ELSE d.updated_at END
    AS effective_updated_at`;

interface AssetJoinedRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly deleted_at: string | null;
  readonly asset_type: string;
  readonly status: string;
  readonly description: string | null;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly serial_number: string | null;
  readonly reference_code: string | null;
  readonly tags: string | null;
  readonly owner_person_id: string | null;
  readonly responsible_person_id: string | null;
  readonly location: string | null;
  readonly area_id: string | null;
  readonly acquisition_date: string | null;
  readonly purchase_price_minor: number | null;
  readonly currency_code: string | null;
  readonly supplier: string | null;
  readonly replacement_value_minor: number | null;
  readonly disposal_date: string | null;
  readonly disposal_notes: string | null;
  readonly warranty_expiry: string | null;
  readonly service_interval: string | null;
  readonly last_service_date: string | null;
  readonly next_service_date: string | null;
  readonly service_provider: string | null;
  readonly maintenance_notes: string | null;
  readonly issuer: string | null;
  readonly reference_number: string | null;
  readonly issue_date: string | null;
  readonly renewal_date: string | null;
  readonly url: string | null;
  readonly document_notes: string | null;
  readonly current_meter_value: number | null;
  readonly current_meter_unit: string | null;
  readonly current_meter_date: string | null;
  readonly archived_at: string | null;
  readonly effective_updated_at: string;
  /** The view/sort's primary ordering value, projected for the cursor. */
  readonly sort_primary?: string;
}

interface CreatedEntityRow {
  readonly id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * True when a record already carries exactly this set of tags.
 *
 * Compared by canonical KEY, never by label, and the distinction is load-bearing:
 * a record carries tag IDENTITIES, and the label it displays belongs to the
 * workspace vocabulary. Re-submitting `READING` for a record already tagged
 * `Reading` therefore changes nothing -- same tag, and the vocabulary keeps the
 * first spelling -- so it must not record a change the owner did not make.
 */
function sameTagSet(
  desired: readonly WorkspaceTag[],
  current: readonly string[],
): boolean {
  if (desired.length !== current.length) return false;
  const carried = new Set(current.map((label) => canonicalTagKey(label)));
  return desired.every((tag) => carried.has(tag.key));
}

/** Add `days` to a wall-calendar `YYYY-MM-DD` string (UTC math, zone-free). */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const yy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** The primary ordering SQL expression for a view/sort, projected as `sort_primary`. */
function primaryExpr(view: string, sort: string): string {
  if (view === "expiring") {
    return `min(coalesce(d.warranty_expiry,'${DATE_SENTINEL}'), coalesce(d.renewal_date,'${DATE_SENTINEL}'))`;
  }
  if (view === "service_due") {
    return "d.next_service_date";
  }
  switch (sort) {
    case "title":
      return "lower(e.title)";
    case "type":
      return "d.asset_type";
    case "next_date":
      return `min(coalesce(d.warranty_expiry,'${DATE_SENTINEL}'), coalesce(d.renewal_date,'${DATE_SENTINEL}'), coalesce(d.next_service_date,'${DATE_SENTINEL}'))`;
    case "recent":
    default:
      return "e.updated_at";
  }
}

/** Whether the view/sort orders ascending (else descending). */
function isAscending(view: string, sort: string): boolean {
  if (view === "expiring" || view === "service_due") return true;
  return sort !== "recent";
}

export class D1AssetRepository implements AssetRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;
  readonly #actor: ActivityActorContext;
  readonly #newActivityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  readonly #createFault?: D1AssetCreateFault;
  readonly #mutationFault?: AtomicMutationFault;
  readonly #deleteFault?: D1AssetDeleteFault;
  readonly #ownerTimeZone: () => Promise<string>;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1AssetRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
    this.#actor = options.actorContext ?? createSystemActorContext();
    this.#newActivityId =
      options.activityIdGenerator ?? activitySecureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#createFault = options.createFault;
    this.#mutationFault = options.mutationFault;
    this.#deleteFault = options.deleteFault;
    this.#ownerTimeZone =
      options.ownerTimeZone ?? (() => Promise.resolve(DEFAULT_OWNER_TIME_ZONE));
  }

  /** A statement guaranteed to fail at execution, aborting/rolling back the batch. */
  #forcedFailure(): D1PreparedStatement {
    return this.#db.prepare("SELECT 1 FROM __dalyhub_asset_forced_fault__");
  }

  /* ---------------------------------------------------------------------- */
  /* Create                                                                 */
  /* ---------------------------------------------------------------------- */

  async create(input: CreateAssetInput): Promise<Asset> {
    const title = validateAssetTitle(input.title);
    const v = validateAssetDetails(input, "create");
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const id = this.#newId();

    const entityStmt = this.#db
      .prepare(
        `INSERT INTO entities
           (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (?, ?, '${ASSET_ENTITY_TYPE}', ?, ?, ?, NULL)
         RETURNING ${ENTITY_RETURNING}`,
      )
      .bind(id, this.#workspaceId, title, nowTs, nowTs);

    const detailValues: (string | number | null)[] = [
      v.assetType ?? "other",
      v.status ?? "active",
      ...ASSET_SCALAR_FIELDS.map((f) => v.scalars.get(f) ?? null),
      v.money.get("purchasePriceMinor") ?? null,
      v.money.get("replacementValueMinor") ?? null,
      null, // archived_at
      nowTs, // updated_at
    ];
    const detailsStmt = this.#db
      .prepare(
        `INSERT INTO asset_details
           (workspace_id, entity_id, ${CREATE_COLUMNS.join(", ")})
         VALUES (?, ?, ${CREATE_COLUMNS.map(() => "?").join(", ")})`,
      )
      .bind(this.#workspaceId, id, ...detailValues);

    const event: NewActivityEvent = {
      type: ASSET_CREATED,
      subjects: [{ entityId: id, role: SUBJECT_ROLE }],
      payload: {},
    };

    let model;
    try {
      model = buildActivityWriteModel(
        event,
        this.#actor.actor,
        this.#newActivityId(),
        now,
      );
    } catch (cause) {
      if (cause instanceof AssetError || cause instanceof ActivityError)
        throw cause;
      throw new AssetStorageError({ cause });
    }
    const append = this.#recorder.buildAppendStatements(
      this.#workspaceId,
      model,
    );

    const batch: D1PreparedStatement[] = [entityStmt];
    if (this.#createFault === "after-entity") batch.push(this.#forcedFailure());
    batch.push(detailsStmt);
    if (this.#createFault === "after-details")
      batch.push(this.#forcedFailure());
    batch.push(...append);
    // FIND-02 — the tags land in the SAME transaction, guarded on the Activity
    // event this batch appends.
    batch.push(
      ...buildEntityTagStatements({
        db: this.#db,
        workspaceId: this.#workspaceId,
        entityId: id,
        tags: v.tags,
        now: nowTs,
        activityId: model.id,
      }),
    );

    try {
      await this.#db.batch<CreatedEntityRow>(batch);
    } catch (cause) {
      throw new AssetStorageError({ cause });
    }

    const created = await this.get(id);
    if (!created) throw new AssetStorageError();
    return created;
  }

  /* ---------------------------------------------------------------------- */
  /* Read                                                                   */
  /* ---------------------------------------------------------------------- */

  async get(
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<Asset | null> {
    const assetId = validateAssetId(id);
    const deletedClause = options.includeDeleted
      ? ""
      : " AND e.deleted_at IS NULL";
    let row: AssetJoinedRow | null;
    try {
      row = await this.#db
        .prepare(
          `SELECT ${READ_COLUMNS}
           FROM entities e
           JOIN asset_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE e.workspace_id = ? AND e.id = ? AND e.type = '${ASSET_ENTITY_TYPE}'${deletedClause}
           LIMIT 1`,
        )
        .bind(this.#workspaceId, assetId)
        .first<AssetJoinedRow>();
    } catch (cause) {
      throw new AssetStorageError({ cause });
    }
    return row ? this.#rowToAsset(row) : null;
  }

  /* ---------------------------------------------------------------------- */
  /* List                                                                   */
  /* ---------------------------------------------------------------------- */

  async list(input: ListAssetsInput = {}): Promise<AssetPage> {
    const view = validateAssetView(input.view);
    const sort = validateAssetSort(input.sort);
    const limit = validateAssetsLimit(input.limit);
    const query = normaliseQuery(input.query);
    const filters = validateAssetFilters(input.filters);
    // AUDIT-14 — the caller's own owner-day wins (loaders resolve it once per
    // request); otherwise resolve the OWNER's timezone rather than assuming one.
    const today =
      validateToday(input.today) ??
      ownerCalendarIso(this.#clock(), await this.#ownerTimeZone());

    const scope: AssetCursorScope = {
      workspaceId: this.#workspaceId,
      view,
      sort,
      query,
      filters,
    };

    const conditions: string[] = [
      "e.workspace_id = ?",
      `e.type = '${ASSET_ENTITY_TYPE}'`,
      "e.deleted_at IS NULL",
    ];
    const params: unknown[] = [this.#workspaceId];

    // Archived partition.
    if (view === "archived") {
      conditions.push("d.archived_at IS NOT NULL");
    } else {
      conditions.push("d.archived_at IS NULL");
    }

    // Date-driven views: bound by the owner-calendar horizon.
    if (view === "expiring") {
      const horizon = addDays(today, EXPIRING_HORIZON_DAYS);
      conditions.push(
        `min(coalesce(d.warranty_expiry,'${DATE_SENTINEL}'), coalesce(d.renewal_date,'${DATE_SENTINEL}')) <= ?`,
      );
      params.push(horizon);
    } else if (view === "service_due") {
      const horizon = addDays(today, SERVICE_HORIZON_DAYS);
      conditions.push("d.next_service_date IS NOT NULL");
      conditions.push("d.next_service_date <= ?");
      params.push(horizon);
    }

    // Structured filters (full-collection, in SQL).
    if (filters.type) {
      conditions.push("d.asset_type = ?");
      params.push(filters.type);
    }
    if (filters.status) {
      conditions.push("d.status = ?");
      params.push(filters.status);
    }
    if (filters.areaId) {
      conditions.push("d.area_id = ?");
      params.push(filters.areaId);
    }
    if (filters.personId) {
      conditions.push("(d.owner_person_id = ? OR d.responsible_person_id = ?)");
      params.push(filters.personId, filters.personId);
    }
    if (filters.tag) {
      // FIND-02 — an EXACT canonical-key match through the vocabulary, where it
      // used to be a `LIKE` over the JSON text that could match the punctuation
      // between two tags. A semi-join, so an Asset appears once.
      const predicate = tagFilterPredicate("d", [canonicalTagKey(filters.tag)]);
      conditions.push(predicate.sql);
      params.push(...predicate.params);
    }

    // Non-sensitive text query.
    if (query !== null) {
      const like = likeContains(query);
      conditions.push(
        `(lower(e.title) LIKE ? ESCAPE '\\'
          OR lower(coalesce(d.manufacturer,'')) LIKE ? ESCAPE '\\'
          OR lower(coalesce(d.model,'')) LIKE ? ESCAPE '\\'
          OR lower(coalesce(d.location,'')) LIKE ? ESCAPE '\\'
          OR lower(coalesce(d.supplier,'')) LIKE ? ESCAPE '\\'
          OR lower(coalesce(d.issuer,'')) LIKE ? ESCAPE '\\'
          OR lower(coalesce(d.service_provider,'')) LIKE ? ESCAPE '\\'
          OR ${tagSearchPredicate("d")})`,
      );
      params.push(like, like, like, like, like, like, like, like);
    }

    const expr = primaryExpr(view, sort);
    const asc = isAscending(view, sort);
    const dir = asc ? "ASC" : "DESC";
    const cmp = asc ? ">" : "<";

    if (input.cursor !== undefined) {
      const position = decodeAssetCursorForScope(input.cursor, scope);
      conditions.push(`(${expr} ${cmp} ? OR (${expr} = ? AND e.id ${cmp} ?))`);
      params.push(position.primary, position.primary, position.id);
    }

    const fetchLimit = limit + 1;
    params.push(fetchLimit);

    let rows: AssetJoinedRow[];
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${READ_COLUMNS}, ${expr} AS sort_primary
           FROM entities e
           JOIN asset_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE ${conditions.join(" AND ")}
           ORDER BY ${expr} ${dir}, e.id ${dir}
           LIMIT ?`,
        )
        .bind(...params)
        .all<AssetJoinedRow>();
      rows = result.results;
    } catch (cause) {
      if (cause instanceof AssetError) throw cause;
      throw new AssetStorageError({ cause });
    }

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map((row) => this.#rowToAsset(row));
    const last = pageRows.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeAssetCursor(scope, {
            primary: last.sort_primary ?? "",
            id: last.id,
          })
        : null;

    return { items, nextCursor, hasMore };
  }

  /* ---------------------------------------------------------------------- */
  /* Update                                                                 */
  /* ---------------------------------------------------------------------- */

  async update(
    id: string,
    changes: UpdateAssetInput,
  ): Promise<AssetChangeResult> {
    const assetId = validateAssetId(id);
    const v = validateAssetDetails(changes, "update");

    const current = await this.get(assetId);
    if (!current) throw new AssetNotFoundError();

    const desired = new Map<string, string | number | null>();
    for (const field of ASSET_SCALAR_FIELDS) {
      if (v.scalars.has(field)) {
        desired.set(SCALAR_COLUMN[field], v.scalars.get(field) ?? null);
      }
    }
    if (v.assetType !== undefined) desired.set("asset_type", v.assetType);
    if (v.status !== undefined) desired.set("status", v.status);
    if (v.money.has("purchasePriceMinor")) {
      desired.set(
        "purchase_price_minor",
        v.money.get("purchasePriceMinor") ?? null,
      );
    }
    if (v.money.has("replacementValueMinor")) {
      desired.set(
        "replacement_value_minor",
        v.money.get("replacementValueMinor") ?? null,
      );
    }
    const changed = [...desired.keys()].filter(
      (column) => desired.get(column) !== currentColumnValue(current, column),
    );
    // FIND-02 — tags are compared as a canonical LIST, not as a column.
    const tagsChanged = v.tagsProvided && !sameTagSet(v.tags, current.tags);
    if (changed.length === 0 && !tagsChanged) {
      return { asset: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const setSql = changed.map((column) => `${column} = ?`).join(", ");
    // A TAGS-ONLY edit changes no column and so has no column guard to offer;
    // the guard reduces to "the Asset is still here". See the Person repository,
    // where the same case is documented at length.
    const guardSql =
      changed.length > 0
        ? changed.map((column) => `${column} IS NOT ?`).join(" OR ")
        : "1 = 1";
    const domainStatement = this.#db
      .prepare(
        `UPDATE asset_details
            SET ${changed.length > 0 ? `${setSql}, ` : ""}updated_at = ?
          WHERE workspace_id = ? AND entity_id = ?
            AND EXISTS (
                  SELECT 1 FROM entities
                  WHERE workspace_id = ? AND id = ? AND type = '${ASSET_ENTITY_TYPE}'
                        AND deleted_at IS NULL
                )
            AND (${guardSql})
          RETURNING entity_id`,
      )
      .bind(
        ...changed.map((column) => desired.get(column) ?? null),
        nowTs,
        this.#workspaceId,
        assetId,
        this.#workspaceId,
        assetId,
        ...changed.map((column) => desired.get(column) ?? null),
      );

    // Payload: field NAMES only (never values), plus the new status vocabulary
    // term when the status changed (a term, not a private value) — §17.
    const changedFields = changed
      .map((column) => COLUMN_FIELD.get(column))
      .filter((f): f is string => f !== undefined);
    if (tagsChanged) changedFields.push("tags");
    const statusChanged = changed.includes("status");
    const newStatus = v.status;
    const payload: { fields: string[]; status?: string } = {
      fields: changedFields,
    };
    let eventType = ASSET_UPDATED;
    if (statusChanged && newStatus) {
      payload.status = newStatus;
      eventType =
        newStatus === "disposed" ? ASSET_DISPOSED : ASSET_STATUS_CHANGED;
    }

    const event: NewActivityEvent = {
      type: eventType,
      subjects: [{ entityId: assetId, role: SUBJECT_ROLE }],
      payload,
    };

    let result;
    try {
      const model = buildActivityWriteModel(
        event,
        this.#actor.actor,
        this.#newActivityId(),
        now,
      );
      result = await recordAtomicMutation<{ entity_id: string }>({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model,
        trailingStatements: tagsChanged
          ? buildEntityTagStatements({
              db: this.#db,
              workspaceId: this.#workspaceId,
              entityId: assetId,
              tags: v.tags,
              now: nowTs,
              activityId: model.id,
            })
          : undefined,
        fault: this.#mutationFault,
      });
    } catch (cause) {
      if (cause instanceof AssetError || cause instanceof ActivityError)
        throw cause;
      throw new AssetStorageError({ cause });
    }

    if (result.changed) {
      const refreshed = await this.get(assetId);
      if (!refreshed) throw new AssetStorageError();
      return { asset: refreshed, changed: true };
    }

    // The gate matched nothing: reconcile honestly (mirrors People/Note).
    const refreshed = await this.get(assetId);
    if (!refreshed) throw new AssetNotFoundError();
    if (
      changed.every(
        (column) =>
          currentColumnValue(refreshed, column) === desired.get(column),
      )
    ) {
      return { asset: refreshed, changed: false };
    }
    throw new AssetConflictError();
  }

  /* ---------------------------------------------------------------------- */
  /* Archive lifecycle                                                      */
  /* ---------------------------------------------------------------------- */

  async archive(id: string): Promise<AssetLifecycleResult> {
    return this.#setArchived(id, true);
  }

  async restore(id: string): Promise<AssetLifecycleResult> {
    return this.#setArchived(id, false);
  }

  async #setArchived(
    id: string,
    archived: boolean,
  ): Promise<AssetLifecycleResult> {
    const assetId = validateAssetId(id);
    const current = await this.get(assetId);
    if (!current) throw new AssetNotFoundError();

    const isArchived = current.archivedAt !== null;
    if (isArchived === archived) {
      return {
        asset: current,
        outcome: archived ? "already_archived" : "already_active",
        changed: false,
      };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const archivedValue = archived ? nowTs : null;
    const guard = archived ? "archived_at IS NULL" : "archived_at IS NOT NULL";

    const domainStatement = this.#db
      .prepare(
        `UPDATE asset_details
            SET archived_at = ?, updated_at = ?
          WHERE workspace_id = ? AND entity_id = ?
            AND EXISTS (
                  SELECT 1 FROM entities
                  WHERE workspace_id = ? AND id = ? AND type = '${ASSET_ENTITY_TYPE}'
                        AND deleted_at IS NULL
                )
            AND ${guard}
          RETURNING entity_id`,
      )
      .bind(
        archivedValue,
        nowTs,
        this.#workspaceId,
        assetId,
        this.#workspaceId,
        assetId,
      );

    const event: NewActivityEvent = {
      type: archived ? ASSET_ARCHIVED : ASSET_RESTORED,
      subjects: [{ entityId: assetId, role: SUBJECT_ROLE }],
      payload: {},
    };

    let result;
    try {
      const model = buildActivityWriteModel(
        event,
        this.#actor.actor,
        this.#newActivityId(),
        now,
      );
      result = await recordAtomicMutation<{ entity_id: string }>({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model,
        fault: this.#mutationFault,
      });
    } catch (cause) {
      if (cause instanceof AssetError || cause instanceof ActivityError)
        throw cause;
      throw new AssetStorageError({ cause });
    }

    if (result.changed) {
      const refreshed = await this.get(assetId);
      if (!refreshed) throw new AssetStorageError();
      return {
        asset: refreshed,
        outcome: archived ? "archived" : "restored",
        changed: true,
      };
    }

    const refreshed = await this.get(assetId);
    if (!refreshed) throw new AssetNotFoundError();
    const nowArchived = refreshed.archivedAt !== null;
    if (nowArchived === archived) {
      return {
        asset: refreshed,
        outcome: archived ? "already_archived" : "already_active",
        changed: false,
      };
    }
    throw new AssetConflictError();
  }

  /* ---------------------------------------------------------------------- */
  /* Permanent (hard) deletion — guarded                                    */
  /* ---------------------------------------------------------------------- */

  async permanentlyDelete(id: string): Promise<AssetDeleteResult> {
    const assetId = validateAssetId(id);
    const existing = await this.get(assetId, { includeDeleted: true });
    if (!existing) {
      // Already gone: idempotent no-op. NOTHING is written — in particular no
      // second tombstone, so a repeated purge can never inflate the audit trail.
      return { deleted: false, blockedReason: undefined, linkCount: 0 };
    }
    // Captured BEFORE the purge: after the batch commits, the only surviving
    // record of which Asset was destroyed is the tombstone payload built here.
    const title = existing.title;

    // Guard: refuse while any ACTIVE relationship references the Asset, so linked
    // Notes/Tasks/People are never silently orphaned (the caller unlinks first).
    let linkCount: number;
    try {
      const row = await this.#db
        .prepare(
          `SELECT COUNT(*) AS n FROM entity_links
           WHERE workspace_id = ? AND deleted_at IS NULL
             AND (source_entity_id = ? OR target_entity_id = ?)`,
        )
        .bind(this.#workspaceId, assetId, assetId)
        .first<{ n: number }>();
      linkCount = row?.n ?? 0;
    } catch (cause) {
      throw new AssetStorageError({ cause });
    }
    if (linkCount > 0) {
      return { deleted: false, blockedReason: "has_links", linkCount };
    }

    // Purge the Asset's footprint child-first in ONE atomic, FK-safe batch, each
    // DELETE carrying the SAME "no active link" guard so the batch is strictly
    // all-or-nothing at commit (closes the read→submit race). Retained: the
    // `activities` rows themselves (append-only, ADR-012) — only their subject
    // pointers to the vanishing entity are removed.
    //
    // The deliberate statement order, child-first so no `ON DELETE RESTRICT`
    // foreign key is ever violated (migration 0025):
    //
    //   1. `entity_links`      — the Asset's remaining soft-deleted/historical
    //      link rows; an ACTIVE one cannot be here, or the guard blocked already.
    //   2. `activity_subjects` — the Asset's subject pointers. The `activities`
    //      rows themselves are RETAINED (append-only, ADR-012); removing a
    //      pointer never removes the event it points at.
    //   3. `asset_events`      — ASSET-02 history (RESTRICT FK to `entities`).
    //   4. `asset_obligations` — ASSET-02 obligations (RESTRICT FK to `entities`).
    //   5. `asset_details`     — the module-owned detail row.
    //   6. `entities`          — the entity row itself, with `RETURNING`; this is
    //      the AUTHORITATIVE statement whose `changes()` drives the tombstone.
    //   7. one subject-less `asset.deleted` tombstone, `WHERE changes() > 0`.
    //
    // Step 7 must follow step 6 IMMEDIATELY: the recorder's contract is that the
    // event insert reads the `changes()` of the statement directly before it. A
    // guard on any earlier child DELETE would be a lie — those match zero rows for
    // an Asset with no history, yet the Asset itself was still destroyed.
    const emptyGuard = `NOT EXISTS (
        SELECT 1 FROM entity_links gl
        WHERE gl.workspace_id = ? AND gl.deleted_at IS NULL
          AND (gl.source_entity_id = ? OR gl.target_entity_id = ?)
      )`;
    const g = [this.#workspaceId, assetId, assetId];

    const deleteLinks = this.#db
      .prepare(
        `DELETE FROM entity_links
         WHERE workspace_id = ? AND (source_entity_id = ? OR target_entity_id = ?)
           AND ${emptyGuard}`,
      )
      .bind(this.#workspaceId, assetId, assetId, ...g);
    // ASSET-02's history and obligations reference the Asset's entity row with
    // ON DELETE RESTRICT (migration 0025) — they are the Asset's OWN dependent
    // records, so an authorised purge removes them (including soft-deleted rows,
    // which still hold the FK) in the same batch. Without these two statements
    // the entity DELETE below violates the constraint and the whole purge fails.
    const deleteEvents = this.#db
      .prepare(
        `DELETE FROM asset_events
         WHERE workspace_id = ? AND asset_id = ? AND ${emptyGuard}`,
      )
      .bind(this.#workspaceId, assetId, ...g);
    const deleteObligations = this.#db
      .prepare(
        `DELETE FROM asset_obligations
         WHERE workspace_id = ? AND asset_id = ? AND ${emptyGuard}`,
      )
      .bind(this.#workspaceId, assetId, ...g);
    const deleteSubjects = this.#db
      .prepare(
        `DELETE FROM activity_subjects
         WHERE workspace_id = ? AND entity_id = ? AND ${emptyGuard}`,
      )
      .bind(this.#workspaceId, assetId, ...g);
    const deleteDetails = this.#db
      .prepare(
        `DELETE FROM asset_details
         WHERE workspace_id = ? AND entity_id = ? AND ${emptyGuard}`,
      )
      .bind(this.#workspaceId, assetId, ...g);
    const deleteEntity = this.#db
      .prepare(
        `DELETE FROM entities
         WHERE workspace_id = ? AND id = ? AND type = '${ASSET_ENTITY_TYPE}'
           AND ${emptyGuard}
         RETURNING id, title`,
      )
      .bind(this.#workspaceId, assetId, ...g);

    // The retained audit tombstone (AUDIT-03 / DEBT-79). Written DIRECTLY after
    // the `entities` DELETE and guarded on its `changes()`, so it exists iff this
    // call is the one that actually destroyed the Asset: a blocked purge, an
    // already-gone purge and a raced loser all leave `changes()` at 0 and append
    // nothing. Subject-less by construction — an `activity_subjects` row would
    // point at the `entities` row this very batch removed.
    const nowTs = toStorageTimestamp(this.#clock());
    let payloadJson: string;
    try {
      payloadJson = serializeActivityPayload({ assetId, title });
    } catch (cause) {
      if (cause instanceof ActivityError) throw cause;
      throw new AssetStorageError({ cause });
    }
    const tombstone = this.#db
      .prepare(
        `INSERT INTO activities
           (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE changes() > 0`,
      )
      .bind(
        this.#newActivityId(),
        this.#workspaceId,
        ASSET_DELETED,
        this.#actor.actor.type,
        this.#actor.actor.id,
        nowTs,
        payloadJson,
      );

    const batch: D1PreparedStatement[] = [
      deleteLinks,
      deleteSubjects,
      deleteEvents,
      deleteObligations,
      deleteDetails,
      deleteEntity,
    ];
    if (this.#deleteFault === "after-entity") batch.push(this.#forcedFailure());
    batch.push(tombstone);
    if (this.#deleteFault === "after-tombstone")
      batch.push(this.#forcedFailure());

    try {
      const results = await this.#db.batch(batch);
      // The `entities` DELETE is index 5 (the sixth statement).
      const entityResult = results[5];
      const removed = (entityResult?.meta?.changes ?? 0) > 0;
      if (removed) return { deleted: true };
      // The guard blocked at commit (a concurrent link appeared): report it.
      return { deleted: false, blockedReason: "has_links", linkCount: 1 };
    } catch (cause) {
      if (cause instanceof AssetError || cause instanceof ActivityError)
        throw cause;
      throw new AssetStorageError({ cause });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  #rowToAsset(row: AssetJoinedRow): Asset {
    try {
      return {
        id: row.id,
        workspaceId: parseWorkspaceId(row.workspace_id),
        title: row.title,
        assetType: row.asset_type as AssetType,
        status: row.status as AssetStatus,
        description: row.description,
        manufacturer: row.manufacturer,
        model: row.model,
        serialNumber: row.serial_number,
        referenceCode: row.reference_code,
        tags: parseTagProjection(row.tags),
        ownerPersonId: row.owner_person_id,
        responsiblePersonId: row.responsible_person_id,
        location: row.location,
        areaId: row.area_id,
        acquisitionDate: row.acquisition_date,
        purchasePriceMinor: row.purchase_price_minor,
        currencyCode: row.currency_code,
        supplier: row.supplier,
        replacementValueMinor: row.replacement_value_minor,
        disposalDate: row.disposal_date,
        disposalNotes: row.disposal_notes,
        warrantyExpiry: row.warranty_expiry,
        serviceInterval: row.service_interval,
        lastServiceDate: row.last_service_date,
        nextServiceDate: row.next_service_date,
        serviceProvider: row.service_provider,
        maintenanceNotes: row.maintenance_notes,
        issuer: row.issuer,
        referenceNumber: row.reference_number,
        issueDate: row.issue_date,
        renewalDate: row.renewal_date,
        url: row.url,
        documentNotes: row.document_notes,
        currentMeterValue: row.current_meter_value,
        currentMeterUnit: row.current_meter_unit as AssetMeterUnit | null,
        currentMeterDate: row.current_meter_date,
        createdAt: fromStorageTimestamp(row.created_at),
        updatedAt: fromStorageTimestamp(row.effective_updated_at),
        deletedAt:
          row.deleted_at === null ? null : fromStorageTimestamp(row.deleted_at),
        archivedAt:
          row.archived_at === null
            ? null
            : fromStorageTimestamp(row.archived_at),
      };
    } catch (cause) {
      if (cause instanceof AssetError) throw cause;
      throw new AssetStorageError({ cause });
    }
  }
}

/** Read a column's current value from an Asset record, for update reconciliation. */
function currentColumnValue(
  asset: Asset,
  column: string,
): string | number | null {
  const field = COLUMN_FIELD.get(column);
  if (field === undefined) return null;
  const value = (asset as unknown as Record<string, unknown>)[field];
  if (value === undefined || value === null) return null;
  return value as string | number;
}
