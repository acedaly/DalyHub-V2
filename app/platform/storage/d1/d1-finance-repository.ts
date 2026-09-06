/**
 * V2.12 FIN-00/01/02 — the D1 adapter for the Finance store.
 *
 * Read the kernel contract (`~/kernel/finance/finance-repository.ts`) first; it
 * states the three properties this file has to make true. They are worth
 * restating where the SQL lives, because this is where they can be broken:
 *
 *   1. **No balance is stored.** There is no `balance` column and no statement
 *      here writes one. Every balance is derived in ONE grouped statement.
 *   2. **Every read is bounded and grouped.** No statement here runs per row.
 *      The account, the category, the transfer partner and the settled
 *      obligation arrive with a page through `LEFT JOIN`s.
 *   3. **An applied import is ONE atomic batch whose statement count does not
 *      grow with the row count.** The rows travel as one bound JSON parameter
 *      expanded with `json_each` — the technique `history-window-read.ts` uses,
 *      for the same reason: D1 refuses a statement with more than 100 bound
 *      variables, so a per-row or per-column binding would cap an import at a
 *      handful of rows.
 *
 * ## Two representations of a payee, in one batch
 *
 * A transaction's DISPLAY payee is the `entities` row's title — one title, one
 * place, the rule `obligation_details` set. The detail slice carries the
 * `payee_key` (the bounded normalisation) and the `source_description` (the
 * bank's verbatim string), which are different facts and are never confused with
 * it. A rename writes the entity title and the slice's `updated_at` together.
 *
 * ## Idempotency is TWO constraints, and neither is a check-then-insert
 *
 * `finance_imports UNIQUE (workspace_id, account_id, file_sha256)` refuses the
 * same bytes twice, and `finance_transaction_details UNIQUE (workspace_id,
 * account_id, fingerprint)` refuses the same row twice. The preview READS both
 * to tell the owner what will happen; the apply relies on the INDEXES, so two
 * concurrent applies of one file cannot both win.
 */

import {
  ActivityError,
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator as activitySecureIdGenerator,
  type ActivityActorContext,
  type ActivityPayload,
  type NewActivityEvent,
} from "~/kernel/activity";
import {
  secureIdGenerator,
  systemClock,
  type Clock,
  type IdGenerator,
} from "~/kernel/entities";
import {
  FINANCE_ACCOUNT_CLOSED,
  FINANCE_ACCOUNT_CREATED,
  FINANCE_ACCOUNT_ENTITY_TYPE,
  FINANCE_ACCOUNT_UPDATED,
  FINANCE_IMPORT_APPLIED,
  FINANCE_STARTER_CATEGORIES,
  FINANCE_TRANSACTION_ENTITY_TYPE,
  FinanceNotFoundError,
  FinanceRefusedError,
  FinanceStorageError,
  FinanceValidationError,
  SUSPECTED_DUPLICATE_WINDOW_DAYS,
  assignFingerprints,
  looksLikeDuplicate,
  decodeFinanceCursorForScope,
  encodeFinanceCursor,
  financeCategoryKey,
  financeCursorScope,
  manualFingerprint,
  mapCsvRows,
  monthEnd,
  monthStart,
  normalisePayee,
  readCsv,
  serialiseCsvMapping,
  validateAccountStatus,
  validateAccountType,
  validateCategoryKind,
  validateCategoryName,
  validateFinanceCurrency,
  validateFinanceId,
  validateFinanceMonth,
  validateIsoDate,
  validateNonNegativeAmount,
  validateOpeningBalance,
  validateOptionalFinanceId,
  validateOptionalText,
  validateSignedAmount,
  validateText,
  validateTransactionsLimit,
  type ApplyImportInput,
  type CategorySuggestion,
  type CreateFinanceAccountInput,
  type CreateFinanceCategoryInput,
  type CreateFinanceTransactionInput,
  type CsvMapping,
  type ExpectedCommitment,
  type FinanceAccount,
  type FinanceAccountWithBalance,
  type FinanceBudget,
  type FinanceCategory,
  type FinanceImport,
  type FinanceMonth,
  type FinanceMonthSummary,
  type FinanceRepository,
  type FinanceTransaction,
  type FinanceTransactionPage,
  type FinanceTransactionView,
  type ImportBalanceCheck,
  type ImportPreview,
  type ImportPreviewRow,
  type ImportResult,
  type ListTransactionsInput,
  type MappedRow,
  type NetWorthAsset,
  type SetFinanceBudgetInput,
  type TransferCandidate,
  type UpdateFinanceAccountInput,
  type UpdateFinanceCategoryInput,
  type UpdateFinanceTransactionInput,
} from "~/kernel/finance";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";
import { D1ActivityRecorder } from "./d1-activity-recorder";
import type { AtomicMutationFault } from "./d1-atomic-mutation";
import { likeContains } from "./like-pattern";

/** The role a mutation writes its own entity under. */
const SUBJECT_ROLE = "subject";

/** How many imports a bounded listing returns by default. */
const DEFAULT_IMPORTS_LIMIT = 20;
const MAX_IMPORTS_LIMIT = 100;

/** How many transfer candidates the deterministic suggestion offers. */
const MAX_TRANSFER_CANDIDATES = 5;

/** How many payee keys one suggestion read accepts — one page's worth. */
const MAX_SUGGESTION_KEYS = 200;

export interface D1FinanceRepositoryOptions {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly actorContext?: ActivityActorContext;
  readonly activityIdGenerator?: IdGenerator;
  /** Test seam: splice a statement that fails into every mutation batch. */
  readonly mutationFault?: AtomicMutationFault;
}

type AccountRow = {
  entity_id: string;
  title: string;
  account_type: string;
  currency_code: string;
  opening_balance_minor: number;
  opening_date: string;
  institution: string | null;
  status: string;
  import_mapping_json: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
};

type TransactionRow = {
  entity_id: string;
  account_id: string;
  occurred_on: string;
  amount_minor: number;
  currency_code: string;
  source_description: string;
  payee_display: string;
  payee_key: string;
  memo: string | null;
  category_id: string | null;
  category_confirmed_at: string | null;
  import_id: string | null;
  source_transaction_id: string | null;
  fingerprint: string;
  transfer_group_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  account_title: string;
  category_name: string | null;
  category_kind: string | null;
  category_archived_at: string | null;
  partner_id: string | null;
  partner_account_title: string | null;
  settles_obligation_id: string | null;
  settles_obligation_title: string | null;
};

/**
 * The transaction columns every read selects, with the display payee coming from
 * the `entities` row rather than the slice.
 */
const TRANSACTION_COLUMNS = `t.entity_id, t.account_id, t.occurred_on,
  t.amount_minor, t.currency_code, t.source_description, e.title AS payee_display,
  t.payee_key, t.memo, t.category_id, t.category_confirmed_at, t.import_id,
  t.source_transaction_id, t.fingerprint, t.transfer_group_id, t.created_at,
  t.updated_at, t.deleted_at, ae.title AS account_title,
  c.name AS category_name, c.kind AS category_kind,
  c.archived_at AS category_archived_at,
  p.entity_id AS partner_id, pae.title AS partner_account_title,
  ob.entity_id AS settles_obligation_id, obe.title AS settles_obligation_title`;

/**
 * The joins that make a transaction page ONE statement.
 *
 * Eight joins on a fifty-row page is one round trip. Eight reads per row would
 * be four hundred, which is the N+1 every collection in this product is written
 * to avoid.
 */
const TRANSACTION_JOINS = `
  JOIN entities e ON e.workspace_id = t.workspace_id AND e.id = t.entity_id
  JOIN finance_account_details a
    ON a.workspace_id = t.workspace_id AND a.entity_id = t.account_id
  JOIN entities ae ON ae.workspace_id = a.workspace_id AND ae.id = a.entity_id
  LEFT JOIN finance_categories c
    ON c.workspace_id = t.workspace_id AND c.id = t.category_id
  LEFT JOIN finance_transaction_details p
    ON t.transfer_group_id IS NOT NULL
   AND p.workspace_id = t.workspace_id
   AND p.transfer_group_id = t.transfer_group_id
   AND p.entity_id <> t.entity_id
  LEFT JOIN finance_account_details pa
    ON pa.workspace_id = p.workspace_id AND pa.entity_id = p.account_id
  LEFT JOIN entities pae ON pae.workspace_id = pa.workspace_id AND pae.id = pa.entity_id
  LEFT JOIN obligation_details ob
    ON ob.workspace_id = t.workspace_id AND ob.settled_by_transaction_id = t.entity_id
  LEFT JOIN entities obe ON obe.workspace_id = ob.workspace_id AND obe.id = ob.entity_id`;

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function instant(value: unknown): Date | null {
  const raw = text(value);
  return raw === null ? null : fromStorageTimestamp(raw);
}

/** Add days to an owner-calendar ISO date, with no timezone involved. */
function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** The D1 adapter for the Finance store. */
export class D1FinanceRepository implements FinanceRepository {
  readonly context: WorkspaceContext;

  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;
  readonly #actor: ActivityActorContext;
  readonly #newActivityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  readonly #mutationFault?: AtomicMutationFault;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1FinanceRepositoryOptions = {},
  ) {
    this.#db = db;
    this.context = context;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
    this.#actor = options.actorContext ?? createSystemActorContext();
    this.#newActivityId =
      options.activityIdGenerator ?? activitySecureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#mutationFault = options.mutationFault;
  }

  /* ------------------------------------------------------------ internals */

  #forcedFailure(): D1PreparedStatement {
    return this.#db.prepare("SELECT 1 FROM __dalyhub_finance_fault__");
  }

  #withFault(batch: D1PreparedStatement[]): D1PreparedStatement[] {
    if (this.#mutationFault === undefined) return batch;
    const spliced = [...batch];
    spliced.splice(1, 0, this.#forcedFailure());
    return spliced;
  }

  #fail(cause: unknown): never {
    if (
      cause instanceof FinanceValidationError ||
      cause instanceof FinanceNotFoundError ||
      cause instanceof FinanceRefusedError ||
      cause instanceof ActivityError
    ) {
      throw cause;
    }
    throw new FinanceStorageError();
  }

  /**
   * The Activity statements for one Finance event.
   *
   * NOTHING here may carry a monetary value, a payee, a memo or a CSV row: an
   * Activity payload reaches the feed, the digest and the export, and an amount
   * in any of those is exactly the leak ADR-049 decision 5 forbids. Callers pass
   * structure — a type, a currency code, a count — and never a figure.
   */
  #appendStatements(
    type: string,
    subjects: readonly (string | null)[],
    payload: ActivityPayload,
    now: Date,
  ): D1PreparedStatement[] {
    const anchors = [...new Set(subjects.filter((id): id is string => !!id))];
    const event: NewActivityEvent = {
      type,
      subjects: anchors.map((entityId) => ({ entityId, role: SUBJECT_ROLE })),
      payload,
    };
    const model = buildActivityWriteModel(
      event,
      this.#actor.actor,
      this.#newActivityId(),
      now,
    );
    return this.#recorder.buildAppendStatements(this.#workspaceId, model);
  }

  /* ------------------------------------------------------------- accounts */

  async createAccount(
    input: CreateFinanceAccountInput,
  ): Promise<FinanceAccount> {
    const title = validateText(input.title, "title", 200);
    const accountType = validateAccountType(input.accountType);
    const currencyCode = validateFinanceCurrency(input.currencyCode);
    const openingDate = validateIsoDate(input.openingDate, "openingDate");
    const openingBalanceMinor = validateOpeningBalance(
      input.openingBalance,
      currencyCode,
    );
    const institution = validateOptionalText(
      input.institution,
      "institution",
      120,
    );

    const accountId = this.#newId();
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    // Is this the workspace's FIRST account? The starter categories are seeded
    // in the SAME batch as it, once, and never again.
    const existing = await this.#db
      .prepare(
        `SELECT 1 AS present FROM finance_account_details
          WHERE workspace_id = ? LIMIT 1`,
      )
      .bind(this.#workspaceId)
      .first<{ present: number }>();
    const seedCategories = existing === null;

    const batch: D1PreparedStatement[] = [
      this.#db
        .prepare(
          `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          accountId,
          this.#workspaceId,
          FINANCE_ACCOUNT_ENTITY_TYPE,
          title,
          nowTs,
          nowTs,
        ),
      this.#db
        .prepare(
          `INSERT INTO finance_account_details
             (workspace_id, entity_id, account_type, currency_code,
              opening_balance_minor, opening_date, institution, status,
              import_mapping_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'open', NULL, ?, ?)`,
        )
        .bind(
          this.#workspaceId,
          accountId,
          accountType,
          currencyCode,
          openingBalanceMinor,
          openingDate,
          institution,
          nowTs,
          nowTs,
        ),
    ];

    if (seedCategories) {
      for (const [index, category] of FINANCE_STARTER_CATEGORIES.entries()) {
        batch.push(
          this.#db
            .prepare(
              `INSERT INTO finance_categories
                 (workspace_id, id, name, name_key, kind, is_builtin,
                  sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
            )
            .bind(
              this.#workspaceId,
              this.#newId(),
              category.name,
              financeCategoryKey(category.name),
              category.kind,
              index,
              nowTs,
              nowTs,
            ),
        );
      }
    }

    batch.push(
      ...this.#appendStatements(
        FINANCE_ACCOUNT_CREATED,
        [accountId],
        // Structure, never a value: the KIND of account and the currency it is
        // denominated in, never the opening balance (ADR-049 decision 5).
        {
          accountType,
          currencyCode,
          hasOpeningBalance: openingBalanceMinor !== 0,
          seededCategories: seedCategories,
        },
        now,
      ),
    );

    try {
      await this.#db.batch(this.#withFault(batch));
    } catch (cause) {
      this.#fail(cause);
    }

    const created = await this.getAccount(accountId);
    if (created === null) throw new FinanceStorageError();
    return created;
  }

  async getAccount(accountId: string): Promise<FinanceAccount | null> {
    const id = validateFinanceId(accountId, "accountId");
    const row = await this.#db
      .prepare(
        `SELECT a.entity_id, e.title, a.account_type, a.currency_code,
                a.opening_balance_minor, a.opening_date, a.institution,
                a.status, a.import_mapping_json, a.created_at, a.updated_at,
                a.archived_at, a.deleted_at
           FROM finance_account_details a
           JOIN entities e
             ON e.workspace_id = a.workspace_id AND e.id = a.entity_id
          WHERE a.workspace_id = ? AND a.entity_id = ? AND a.deleted_at IS NULL`,
      )
      .bind(this.#workspaceId, id)
      .first<AccountRow>();
    return row === null ? null : this.#toAccount(row);
  }

  #toAccount(row: AccountRow): FinanceAccount {
    return {
      id: row.entity_id,
      workspaceId: this.#workspaceId,
      title: row.title,
      accountType: row.account_type as FinanceAccount["accountType"],
      currencyCode: row.currency_code,
      openingBalanceMinor: row.opening_balance_minor,
      openingDate: row.opening_date,
      institution: text(row.institution),
      status: row.status as FinanceAccount["status"],
      importMappingJson: text(row.import_mapping_json),
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
      archivedAt: instant(row.archived_at),
      deletedAt: instant(row.deleted_at),
    };
  }

  async updateAccount(
    accountId: string,
    input: UpdateFinanceAccountInput,
  ): Promise<FinanceAccount> {
    const current = await this.getAccount(accountId);
    if (current === null) throw new FinanceNotFoundError("account");

    const title =
      input.title === undefined
        ? current.title
        : validateText(input.title, "title", 200);
    const accountType =
      input.accountType === undefined
        ? current.accountType
        : validateAccountType(input.accountType);
    const openingDate =
      input.openingDate === undefined
        ? current.openingDate
        : validateIsoDate(input.openingDate, "openingDate");
    const openingBalanceMinor =
      input.openingBalance === undefined
        ? current.openingBalanceMinor
        : validateOpeningBalance(input.openingBalance, current.currencyCode);
    const institution =
      input.institution === undefined
        ? current.institution
        : validateOptionalText(input.institution, "institution", 120);
    const status =
      input.status === undefined
        ? current.status
        : validateAccountStatus(input.status);

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const closing = status === "closed" && current.status !== "closed";

    const batch: D1PreparedStatement[] = [
      this.#db
        .prepare(
          `UPDATE entities SET title = ?, updated_at = ?
            WHERE workspace_id = ? AND id = ? AND type = ?`,
        )
        .bind(
          title,
          nowTs,
          this.#workspaceId,
          current.id,
          FINANCE_ACCOUNT_ENTITY_TYPE,
        ),
      this.#db
        .prepare(
          `UPDATE finance_account_details
              SET account_type = ?, opening_balance_minor = ?, opening_date = ?,
                  institution = ?, status = ?, updated_at = ?
            WHERE workspace_id = ? AND entity_id = ? AND deleted_at IS NULL`,
        )
        .bind(
          accountType,
          openingBalanceMinor,
          openingDate,
          institution,
          status,
          nowTs,
          this.#workspaceId,
          current.id,
        ),
      ...this.#appendStatements(
        closing ? FINANCE_ACCOUNT_CLOSED : FINANCE_ACCOUNT_UPDATED,
        [current.id],
        { accountType, currencyCode: current.currencyCode, status },
        now,
      ),
    ];

    try {
      await this.#db.batch(this.#withFault(batch));
    } catch (cause) {
      this.#fail(cause);
    }
    const updated = await this.getAccount(current.id);
    if (updated === null) throw new FinanceStorageError();
    return updated;
  }

  /**
   * Every account with its DERIVED balance, in one statement.
   *
   * The sum is a grouped sub-select over `finance_transaction_details`, so an
   * account with 10,000 transactions costs the same round trip as one with 10.
   * There is nothing stored to read instead, which is the point.
   */
  async listAccountsWithBalances(options?: {
    readonly includeClosed?: boolean;
  }): Promise<readonly FinanceAccountWithBalance[]> {
    const includeClosed = options?.includeClosed ?? true;
    const result = await this.#db
      .prepare(
        `SELECT a.entity_id, e.title, a.account_type, a.currency_code,
                a.opening_balance_minor, a.opening_date, a.institution,
                a.status, a.import_mapping_json, a.created_at, a.updated_at,
                a.archived_at, a.deleted_at,
                COALESCE(s.sum_minor, 0) AS sum_minor,
                COALESCE(s.n, 0) AS n
           FROM finance_account_details a
           JOIN entities e
             ON e.workspace_id = a.workspace_id AND e.id = a.entity_id
           LEFT JOIN (
             SELECT account_id,
                    SUM(amount_minor) AS sum_minor,
                    COUNT(*) AS n
               FROM finance_transaction_details
              WHERE workspace_id = ? AND deleted_at IS NULL
              GROUP BY account_id
           ) s ON s.account_id = a.entity_id
          WHERE a.workspace_id = ? AND a.deleted_at IS NULL
            AND (? = 1 OR a.status = 'open')
          ORDER BY a.created_at, a.entity_id`,
      )
      .bind(this.#workspaceId, this.#workspaceId, includeClosed ? 1 : 0)
      .all<AccountRow & { sum_minor: number; n: number }>();

    return result.results.map((row) => ({
      account: this.#toAccount(row),
      // The one derivation, in the one place. `deriveBalanceMinor` states the
      // same rule for the restore rehearsal and for every parity test, so there
      // is no chance of two answers.
      balanceMinor: row.opening_balance_minor + Number(row.sum_minor),
      transactionCount: Number(row.n),
    }));
  }

  async deleteAccount(accountId: string): Promise<void> {
    const current = await this.getAccount(accountId);
    if (current === null) throw new FinanceNotFoundError("account");

    // Deleted transactions count too: a soft-deleted row still names this
    // account, and a transaction whose account has gone is a row nothing can
    // explain.
    const used = await this.#db
      .prepare(
        `SELECT COUNT(*) AS n FROM finance_transaction_details
          WHERE workspace_id = ? AND account_id = ?`,
      )
      .bind(this.#workspaceId, current.id)
      .first<{ n: number }>();
    if (used !== null && Number(used.n) > 0) {
      throw new FinanceRefusedError(
        "account_in_use",
        `That account holds ${used.n} ${Number(used.n) === 1 ? "transaction" : "transactions"}. Close it instead — closing keeps its history and stops new transactions.`,
      );
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    try {
      await this.#db.batch(
        this.#withFault([
          this.#db
            .prepare(
              `UPDATE finance_account_details SET deleted_at = ?, updated_at = ?
                WHERE workspace_id = ? AND entity_id = ? AND deleted_at IS NULL`,
            )
            .bind(nowTs, nowTs, this.#workspaceId, current.id),
          this.#db
            .prepare(
              `UPDATE entities SET deleted_at = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ? AND type = ?`,
            )
            .bind(
              nowTs,
              nowTs,
              this.#workspaceId,
              current.id,
              FINANCE_ACCOUNT_ENTITY_TYPE,
            ),
          ...this.#appendStatements(
            FINANCE_ACCOUNT_UPDATED,
            [current.id],
            { accountType: current.accountType, lifecycle: "deleted" },
            now,
          ),
        ]),
      );
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async saveAccountMapping(
    accountId: string,
    mapping: CsvMapping,
  ): Promise<void> {
    const id = validateFinanceId(accountId, "accountId");
    const now = toStorageTimestamp(this.#clock());
    await this.#db
      .prepare(
        `UPDATE finance_account_details
            SET import_mapping_json = ?, updated_at = ?
          WHERE workspace_id = ? AND entity_id = ? AND deleted_at IS NULL`,
      )
      .bind(serialiseCsvMapping(mapping), now, this.#workspaceId, id)
      .run();
  }

  /* ----------------------------------------------------------- categories */

  async listCategories(options?: {
    readonly includeArchived?: boolean;
  }): Promise<readonly FinanceCategory[]> {
    const includeArchived = options?.includeArchived ?? false;
    const result = await this.#db
      .prepare(
        `SELECT id, name, name_key, kind, is_builtin, sort_order, archived_at,
                created_at, updated_at
           FROM finance_categories
          WHERE workspace_id = ? AND (? = 1 OR archived_at IS NULL)
          ORDER BY sort_order, name, id`,
      )
      .bind(this.#workspaceId, includeArchived ? 1 : 0)
      .all<{
        id: string;
        name: string;
        name_key: string;
        kind: string;
        is_builtin: number;
        sort_order: number;
        archived_at: string | null;
        created_at: string;
        updated_at: string;
      }>();
    return result.results.map((row) => ({
      id: row.id,
      workspaceId: this.#workspaceId,
      name: row.name,
      nameKey: row.name_key,
      kind: row.kind as FinanceCategory["kind"],
      isBuiltin: row.is_builtin === 1,
      sortOrder: Number(row.sort_order),
      archivedAt: instant(row.archived_at),
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
    }));
  }

  async createCategory(
    input: CreateFinanceCategoryInput,
  ): Promise<FinanceCategory> {
    const { name, nameKey } = validateCategoryName(input.name);
    const kind = validateCategoryKind(input.kind);
    const id = this.#newId();
    const nowTs = toStorageTimestamp(this.#clock());

    const highest = await this.#db
      .prepare(
        `SELECT COALESCE(MAX(sort_order), -1) AS top FROM finance_categories
          WHERE workspace_id = ?`,
      )
      .bind(this.#workspaceId)
      .first<{ top: number }>();

    try {
      await this.#db
        .prepare(
          `INSERT INTO finance_categories
             (workspace_id, id, name, name_key, kind, is_builtin, sort_order,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        )
        .bind(
          this.#workspaceId,
          id,
          name,
          nameKey,
          kind,
          Number(highest?.top ?? -1) + 1,
          nowTs,
          nowTs,
        )
        .run();
    } catch (cause) {
      // The unique index on `(workspace_id, name_key)` is the authority; this
      // turns its refusal into the sentence the owner reads.
      if (String(cause).includes("UNIQUE")) {
        throw new FinanceValidationError(
          "name",
          "is already one of your categories",
        );
      }
      this.#fail(cause);
    }
    const created = (await this.listCategories({ includeArchived: true })).find(
      (category) => category.id === id,
    );
    if (created === undefined) throw new FinanceStorageError();
    return created;
  }

  async updateCategory(
    categoryId: string,
    input: UpdateFinanceCategoryInput,
  ): Promise<FinanceCategory> {
    const id = validateFinanceId(categoryId, "categoryId");
    const all = await this.listCategories({ includeArchived: true });
    const current = all.find((category) => category.id === id);
    if (current === undefined) throw new FinanceNotFoundError("category");

    const named =
      input.name === undefined
        ? { name: current.name, nameKey: current.nameKey }
        : validateCategoryName(input.name);
    const sortOrder =
      input.sortOrder === undefined ? current.sortOrder : input.sortOrder;
    const nowTs = toStorageTimestamp(this.#clock());

    try {
      await this.#db
        .prepare(
          `UPDATE finance_categories
              SET name = ?, name_key = ?, sort_order = ?, updated_at = ?
            WHERE workspace_id = ? AND id = ?`,
        )
        .bind(
          named.name,
          named.nameKey,
          sortOrder,
          nowTs,
          this.#workspaceId,
          id,
        )
        .run();
    } catch (cause) {
      if (String(cause).includes("UNIQUE")) {
        throw new FinanceValidationError(
          "name",
          "is already one of your categories",
        );
      }
      this.#fail(cause);
    }
    // Renaming a category rewrites NO transaction history: a transaction stores
    // the category's IDENTITY, never its text.
    const after = (await this.listCategories({ includeArchived: true })).find(
      (category) => category.id === id,
    );
    if (after === undefined) throw new FinanceStorageError();
    return after;
  }

  async setCategoryArchived(
    categoryId: string,
    archived: boolean,
  ): Promise<FinanceCategory> {
    const id = validateFinanceId(categoryId, "categoryId");
    const nowTs = toStorageTimestamp(this.#clock());
    const result = await this.#db
      .prepare(
        `UPDATE finance_categories SET archived_at = ?, updated_at = ?
          WHERE workspace_id = ? AND id = ?`,
      )
      .bind(archived ? nowTs : null, nowTs, this.#workspaceId, id)
      .run();
    if (!result.success || (result.meta?.changes ?? 0) === 0) {
      throw new FinanceNotFoundError("category");
    }
    const after = (await this.listCategories({ includeArchived: true })).find(
      (category) => category.id === id,
    );
    if (after === undefined) throw new FinanceNotFoundError("category");
    return after;
  }

  async countTransactionsByCategory(): Promise<ReadonlyMap<string, number>> {
    const result = await this.#db
      .prepare(
        `SELECT category_id, COUNT(*) AS n
           FROM finance_transaction_details
          WHERE workspace_id = ? AND deleted_at IS NULL
            AND category_id IS NOT NULL
          GROUP BY category_id`,
      )
      .bind(this.#workspaceId)
      .all<{ category_id: string; n: number }>();
    return new Map(
      result.results.map((row) => [row.category_id, Number(row.n)]),
    );
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const id = validateFinanceId(categoryId, "categoryId");
    const used = await this.#db
      .prepare(
        `SELECT COUNT(*) AS n FROM finance_transaction_details
          WHERE workspace_id = ? AND category_id = ?`,
      )
      .bind(this.#workspaceId, id)
      .first<{ n: number }>();
    const count = Number(used?.n ?? 0);
    if (count > 0) {
      // Refused, never cascaded and never nulled: silently un-categorising 432
      // transactions to honour one delete is a change the owner did not ask for
      // and could not see.
      throw new FinanceRefusedError(
        "category_in_use",
        `${count} ${count === 1 ? "transaction uses" : "transactions use"} that category. Archive it instead — an archived category keeps its history and stops being offered.`,
      );
    }
    const budgets = await this.#db
      .prepare(
        `SELECT COUNT(*) AS n FROM finance_budgets
          WHERE workspace_id = ? AND category_id = ?`,
      )
      .bind(this.#workspaceId, id)
      .first<{ n: number }>();
    const nowTs = toStorageTimestamp(this.#clock());
    const batch: D1PreparedStatement[] = [];
    if (Number(budgets?.n ?? 0) > 0) {
      // A budget for a category with no transactions is configuration, not
      // history, so it goes with it rather than blocking the delete.
      batch.push(
        this.#db
          .prepare(
            `DELETE FROM finance_budgets WHERE workspace_id = ? AND category_id = ?`,
          )
          .bind(this.#workspaceId, id),
      );
    }
    batch.push(
      this.#db
        .prepare(
          `DELETE FROM finance_categories WHERE workspace_id = ? AND id = ?`,
        )
        .bind(this.#workspaceId, id),
    );
    void nowTs;
    try {
      await this.#db.batch(this.#withFault(batch));
    } catch (cause) {
      this.#fail(cause);
    }
  }

  /* --------------------------------------------------------- transactions */

  #toTransactionView(row: TransactionRow): FinanceTransactionView {
    const transaction: FinanceTransaction = {
      id: row.entity_id,
      workspaceId: this.#workspaceId,
      accountId: row.account_id,
      occurredOn: row.occurred_on,
      amountMinor: Number(row.amount_minor),
      currencyCode: row.currency_code,
      sourceDescription: row.source_description,
      payeeDisplay: row.payee_display,
      payeeKey: row.payee_key,
      memo: text(row.memo),
      categoryId: text(row.category_id),
      categoryConfirmedAt: instant(row.category_confirmed_at),
      importId: text(row.import_id),
      sourceTransactionId: text(row.source_transaction_id),
      fingerprint: row.fingerprint,
      transferGroupId: text(row.transfer_group_id),
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
      deletedAt: instant(row.deleted_at),
    };
    return {
      transaction,
      accountTitle: row.account_title,
      categoryName: text(row.category_name),
      categoryKind: text(row.category_kind),
      categoryArchived: text(row.category_archived_at) !== null,
      transferPartnerId: text(row.partner_id),
      transferPartnerAccountTitle: text(row.partner_account_title),
      settlesObligationId: text(row.settles_obligation_id),
      settlesObligationTitle: text(row.settles_obligation_title),
    };
  }

  /** The WHERE fragment and its bindings for a filtered transactions read. */
  #transactionPredicate(filters: ListTransactionsInput["filters"]): {
    readonly sql: string;
    readonly binds: unknown[];
  } {
    const clauses = ["t.workspace_id = ?", "t.deleted_at IS NULL"];
    const binds: unknown[] = [this.#workspaceId];
    const f = filters ?? {};
    if (f.accountId !== undefined) {
      clauses.push("t.account_id = ?");
      binds.push(validateFinanceId(f.accountId, "accountId"));
    }
    if (f.categoryId === null) {
      clauses.push("t.category_id IS NULL");
    } else if (f.categoryId !== undefined) {
      clauses.push("t.category_id = ?");
      binds.push(validateFinanceId(f.categoryId, "categoryId"));
    }
    if (f.fromDate !== undefined) {
      clauses.push("t.occurred_on >= ?");
      binds.push(validateIsoDate(f.fromDate, "fromDate"));
    }
    if (f.toDate !== undefined) {
      clauses.push("t.occurred_on <= ?");
      binds.push(validateIsoDate(f.toDate, "toDate"));
    }
    if (f.transfersOnly === true) {
      clauses.push("t.transfer_group_id IS NOT NULL");
    }
    const query = (f.query ?? "").trim();
    if (query.length > 0) {
      // The DISPLAY payee only. Never `source_description` (raw bank text an
      // owner never chose), never a memo (body content the explicit-query
      // boundary governs, ADR-114 decision 2) and never an amount.
      clauses.push("e.title LIKE ? ESCAPE '\\'");
      binds.push(likeContains(query));
    }
    return { sql: clauses.join(" AND "), binds };
  }

  async listTransactions(
    input: ListTransactionsInput = {},
  ): Promise<FinanceTransactionPage> {
    const limit = validateTransactionsLimit(input.limit);
    const scope = financeCursorScope(input.filters);
    const cursor = decodeFinanceCursorForScope(input.cursor, scope);
    const { sql, binds } = this.#transactionPredicate(input.filters);

    const keyset =
      cursor === null
        ? ""
        : " AND (t.occurred_on < ? OR (t.occurred_on = ? AND t.entity_id > ?))";
    const keysetBinds =
      cursor === null
        ? []
        : [cursor.occurredOn, cursor.occurredOn, cursor.entityId];

    const page = await this.#db
      .prepare(
        `SELECT ${TRANSACTION_COLUMNS}
           FROM finance_transaction_details t
           ${TRANSACTION_JOINS}
          WHERE ${sql}${keyset}
          ORDER BY t.occurred_on DESC, t.entity_id ASC
          LIMIT ?`,
      )
      .bind(...binds, ...keysetBinds, limit + 1)
      .all<TransactionRow>();

    const rows = page.results;
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((row) =>
      this.#toTransactionView(row),
    );

    // The total is counted over the WHOLE filtered set in its own statement,
    // never derived from `items.length` — the defect DEBT-232 records, where a
    // bounded page was counted and printed as the total. It is read only on the
    // first page, because a total does not change as the owner pages.
    let total = items.length;
    if (cursor === null) {
      const counted = await this.#db
        .prepare(
          `SELECT COUNT(*) AS n
             FROM finance_transaction_details t
             JOIN entities e
               ON e.workspace_id = t.workspace_id AND e.id = t.entity_id
            WHERE ${sql}`,
        )
        .bind(...binds)
        .first<{ n: number }>();
      total = Number(counted?.n ?? items.length);
    }

    const tail = items[items.length - 1];
    return {
      items,
      nextCursor:
        hasMore && tail !== undefined
          ? encodeFinanceCursor(
              {
                occurredOn: tail.transaction.occurredOn,
                entityId: tail.transaction.id,
              },
              scope,
            )
          : null,
      hasMore,
      total,
    };
  }

  async getTransaction(
    transactionId: string,
  ): Promise<FinanceTransactionView | null> {
    const id = validateFinanceId(transactionId, "transactionId");
    const row = await this.#db
      .prepare(
        `SELECT ${TRANSACTION_COLUMNS}
           FROM finance_transaction_details t
           ${TRANSACTION_JOINS}
          WHERE t.workspace_id = ? AND t.entity_id = ?`,
      )
      .bind(this.#workspaceId, id)
      .first<TransactionRow>();
    return row === null ? null : this.#toTransactionView(row);
  }

  async createTransaction(
    input: CreateFinanceTransactionInput,
  ): Promise<FinanceTransaction> {
    const account = await this.getAccount(
      validateFinanceId(input.accountId, "accountId"),
    );
    if (account === null) throw new FinanceNotFoundError("account");
    const occurredOn = validateIsoDate(input.occurredOn, "occurredOn");
    const amountMinor = validateSignedAmount(
      input.amount,
      account.currencyCode,
      "amount",
    );
    const payeeDisplay = validateText(input.payeeDisplay, "payeeDisplay", 200);
    const memo = validateOptionalText(input.memo, "memo", 500);
    const categoryId = validateOptionalFinanceId(
      input.categoryId,
      "categoryId",
    );
    if (categoryId !== null) await this.#assertCategoryExists(categoryId);

    const id = this.#newId();
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    try {
      await this.#db.batch(
        this.#withFault([
          this.#db
            .prepare(
              `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              id,
              this.#workspaceId,
              FINANCE_TRANSACTION_ENTITY_TYPE,
              payeeDisplay,
              nowTs,
              nowTs,
            ),
          this.#db
            .prepare(
              `INSERT INTO finance_transaction_details
                 (workspace_id, entity_id, account_id, occurred_on, amount_minor,
                  currency_code, source_description, payee_key, memo, category_id,
                  category_confirmed_at, import_id, source_transaction_id,
                  fingerprint, transfer_group_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?)`,
            )
            .bind(
              this.#workspaceId,
              id,
              account.id,
              occurredOn,
              amountMinor,
              account.currencyCode,
              payeeDisplay,
              normalisePayee(payeeDisplay),
              memo,
              categoryId,
              // A category the owner typed IS a confirmation, and it is what the
              // suggestion engine learns from.
              categoryId === null ? null : nowTs,
              // `man:` — unique by construction, content-independent, and never
              // matched by an import, because a row you typed and a row the bank
              // sent are different facts with different provenance.
              manualFingerprint(id),
              nowTs,
              nowTs,
            ),
        ]),
      );
    } catch (cause) {
      this.#fail(cause);
    }
    const created = await this.getTransaction(id);
    if (created === null) throw new FinanceStorageError();
    return created.transaction;
  }

  async #assertCategoryExists(categoryId: string): Promise<void> {
    const row = await this.#db
      .prepare(
        `SELECT 1 AS present FROM finance_categories
          WHERE workspace_id = ? AND id = ?`,
      )
      .bind(this.#workspaceId, categoryId)
      .first<{ present: number }>();
    if (row === null) throw new FinanceNotFoundError("category");
  }

  async updateTransaction(
    transactionId: string,
    input: UpdateFinanceTransactionInput,
  ): Promise<FinanceTransaction> {
    const view = await this.getTransaction(transactionId);
    if (view === null || view.transaction.deletedAt !== null) {
      throw new FinanceNotFoundError("transaction");
    }
    const current = view.transaction;
    const imported = current.importId !== null;

    // The date, the amount, the account, the source description, the bank's id
    // and the fingerprint ARE the import's identity. Letting one move would make
    // an applied import unreproducible and could silently break deduplication,
    // so the refusal is by name.
    if (
      imported &&
      (input.occurredOn !== undefined || input.amount !== undefined)
    ) {
      throw new FinanceRefusedError(
        "import_provenance",
        "The date and amount of an imported transaction come from your bank and cannot be edited. Delete it and add a correction by hand if it is wrong.",
      );
    }

    const payeeDisplay =
      input.payeeDisplay === undefined
        ? current.payeeDisplay
        : validateText(input.payeeDisplay, "payeeDisplay", 200);
    const memo =
      input.memo === undefined
        ? current.memo
        : validateOptionalText(input.memo, "memo", 500);
    const categoryId =
      input.categoryId === undefined
        ? current.categoryId
        : validateOptionalFinanceId(input.categoryId, "categoryId");
    if (categoryId !== null && categoryId !== current.categoryId) {
      await this.#assertCategoryExists(categoryId);
    }
    const occurredOn =
      input.occurredOn === undefined
        ? current.occurredOn
        : validateIsoDate(input.occurredOn, "occurredOn");
    const amountMinor =
      input.amount === undefined
        ? current.amountMinor
        : validateSignedAmount(input.amount, current.currencyCode, "amount");

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    // Setting a category through the product IS the owner confirming it, and
    // that stamp is the only thing the suggestion engine learns from — so it
    // never learns from its own guesses. Clearing a category clears the stamp.
    const confirmedAt =
      categoryId === null
        ? null
        : categoryId === current.categoryId
          ? current.categoryConfirmedAt === null
            ? nowTs
            : toStorageTimestamp(current.categoryConfirmedAt)
          : nowTs;

    // A manual transaction's fingerprint is content-independent, so an amount or
    // date correction does not move it. An imported one cannot reach here.
    try {
      await this.#db.batch(
        this.#withFault([
          this.#db
            .prepare(
              `UPDATE entities SET title = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ? AND type = ?`,
            )
            .bind(
              payeeDisplay,
              nowTs,
              this.#workspaceId,
              current.id,
              FINANCE_TRANSACTION_ENTITY_TYPE,
            ),
          this.#db
            .prepare(
              `UPDATE finance_transaction_details
                  SET occurred_on = ?, amount_minor = ?, memo = ?,
                      category_id = ?, category_confirmed_at = ?, updated_at = ?
                WHERE workspace_id = ? AND entity_id = ? AND deleted_at IS NULL`,
            )
            .bind(
              occurredOn,
              amountMinor,
              memo,
              categoryId,
              confirmedAt,
              nowTs,
              this.#workspaceId,
              current.id,
            ),
        ]),
      );
    } catch (cause) {
      this.#fail(cause);
    }
    const after = await this.getTransaction(current.id);
    if (after === null) throw new FinanceStorageError();
    return after.transaction;
  }

  async deleteTransaction(transactionId: string): Promise<void> {
    const view = await this.getTransaction(transactionId);
    if (view === null) throw new FinanceNotFoundError("transaction");
    const nowTs = toStorageTimestamp(this.#clock());
    try {
      await this.#db.batch(
        this.#withFault([
          // The fingerprint and every scrap of provenance STAY on the deleted
          // row, so a later overlapping import reports it as already imported
          // rather than resurrecting it. Deleting was a decision.
          this.#db
            .prepare(
              `UPDATE finance_transaction_details SET deleted_at = ?, updated_at = ?
                WHERE workspace_id = ? AND entity_id = ? AND deleted_at IS NULL`,
            )
            .bind(nowTs, nowTs, this.#workspaceId, view.transaction.id),
          this.#db
            .prepare(
              `UPDATE entities SET deleted_at = ?, updated_at = ?
                WHERE workspace_id = ? AND id = ? AND type = ?`,
            )
            .bind(
              nowTs,
              nowTs,
              this.#workspaceId,
              view.transaction.id,
              FINANCE_TRANSACTION_ENTITY_TYPE,
            ),
        ]),
      );
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async restoreTransaction(transactionId: string): Promise<FinanceTransaction> {
    const id = validateFinanceId(transactionId, "transactionId");
    const nowTs = toStorageTimestamp(this.#clock());
    try {
      await this.#db.batch(
        this.#withFault([
          this.#db
            .prepare(
              `UPDATE finance_transaction_details SET deleted_at = NULL, updated_at = ?
                WHERE workspace_id = ? AND entity_id = ?`,
            )
            .bind(nowTs, this.#workspaceId, id),
          this.#db
            .prepare(
              `UPDATE entities SET deleted_at = NULL, updated_at = ?
                WHERE workspace_id = ? AND id = ? AND type = ?`,
            )
            .bind(
              nowTs,
              this.#workspaceId,
              id,
              FINANCE_TRANSACTION_ENTITY_TYPE,
            ),
        ]),
      );
    } catch (cause) {
      this.#fail(cause);
    }
    const after = await this.getTransaction(id);
    if (after === null) throw new FinanceNotFoundError("transaction");
    return after.transaction;
  }

  /**
   * The deterministic suggestion, for a whole page in ONE statement.
   *
   * The rule: the most recent MANUALLY CONFIRMED category for the same payee
   * key. `json_each` expands the page's keys as one bound parameter, so a page of
   * fifty costs the same statement as a page of one — and D1's hundred-variable
   * ceiling is never approached.
   */
  async suggestCategories(
    payeeKeys: readonly string[],
  ): Promise<readonly CategorySuggestion[]> {
    const keys = [...new Set(payeeKeys.filter((key) => key.length > 0))].slice(
      0,
      MAX_SUGGESTION_KEYS,
    );
    if (keys.length === 0) return [];
    const result = await this.#db
      .prepare(
        `SELECT t.payee_key, t.category_id, c.name AS category_name,
                MAX(t.category_confirmed_at) AS confirmed_at
           FROM finance_transaction_details t
           JOIN finance_categories c
             ON c.workspace_id = t.workspace_id AND c.id = t.category_id
          WHERE t.workspace_id = ?
            AND t.deleted_at IS NULL
            AND t.category_confirmed_at IS NOT NULL
            AND c.archived_at IS NULL
            AND t.payee_key IN (SELECT value FROM json_each(?))
          GROUP BY t.payee_key
          ORDER BY t.payee_key`,
      )
      .bind(this.#workspaceId, JSON.stringify(keys))
      .all<{
        payee_key: string;
        category_id: string;
        category_name: string;
        confirmed_at: string;
      }>();
    return result.results.map((row) => ({
      payeeKey: row.payee_key,
      categoryId: row.category_id,
      categoryName: row.category_name,
      confirmedOn: row.confirmed_at.slice(0, 10),
    }));
  }

  /* -------------------------------------------------------------- transfers */

  async linkTransfer(outflowId: string, inflowId: string): Promise<void> {
    const first = await this.getTransaction(outflowId);
    const second = await this.getTransaction(inflowId);
    if (first === null || second === null) {
      throw new FinanceNotFoundError("transaction");
    }
    const a = first.transaction;
    const b = second.transaction;
    const refuse = (message: string): never => {
      throw new FinanceRefusedError("transfer_invalid", message);
    };
    if (a.id === b.id) refuse("A transfer needs two different transactions.");
    if (a.deletedAt !== null || b.deletedAt !== null) {
      refuse("A deleted transaction cannot be part of a transfer.");
    }
    if (a.accountId === b.accountId) {
      refuse(
        "Both sides of a transfer are in the same account, so this is not a transfer.",
      );
    }
    if (a.transferGroupId !== null || b.transferGroupId !== null) {
      refuse(
        "One of those transactions is already part of a transfer. Unlink it first.",
      );
    }
    if (a.amountMinor === 0 || b.amountMinor === 0) {
      refuse("A transfer needs money to move on both sides.");
    }
    if (a.amountMinor > 0 === b.amountMinor > 0) {
      refuse(
        "A transfer is money out of one account and into another, so the two sides must have opposite signs.",
      );
    }

    const groupId = this.#newId();
    const nowTs = toStorageTimestamp(this.#clock());
    try {
      // BOTH legs in ONE statement, so a transfer can never be half-applied —
      // which is exactly how a "transfer category" inflates spend by one leg.
      await this.#db
        .prepare(
          `UPDATE finance_transaction_details
              SET transfer_group_id = ?, updated_at = ?
            WHERE workspace_id = ? AND entity_id IN (?, ?)`,
        )
        .bind(groupId, nowTs, this.#workspaceId, a.id, b.id)
        .run();
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async unlinkTransfer(transactionId: string): Promise<void> {
    const view = await this.getTransaction(transactionId);
    if (view === null) throw new FinanceNotFoundError("transaction");
    const groupId = view.transaction.transferGroupId;
    if (groupId === null) return;
    const nowTs = toStorageTimestamp(this.#clock());
    await this.#db
      .prepare(
        `UPDATE finance_transaction_details
            SET transfer_group_id = NULL, updated_at = ?
          WHERE workspace_id = ? AND transfer_group_id = ?`,
      )
      .bind(nowTs, this.#workspaceId, groupId)
      .run();
  }

  async suggestTransferPartners(
    transactionId: string,
  ): Promise<readonly TransferCandidate[]> {
    const view = await this.getTransaction(transactionId);
    if (view === null) throw new FinanceNotFoundError("transaction");
    const t = view.transaction;
    if (t.transferGroupId !== null || t.amountMinor === 0) return [];

    // Deterministic: the EXACTLY opposite amount, the same currency, a different
    // account, unpaired, within three days, nearest date first. Nothing fuzzy,
    // nothing learned, and nothing applied automatically.
    const result = await this.#db
      .prepare(
        `SELECT t.entity_id, t.account_id, ae.title AS account_title,
                t.occurred_on, t.amount_minor, t.currency_code,
                e.title AS payee_display
           FROM finance_transaction_details t
           JOIN entities e ON e.workspace_id = t.workspace_id AND e.id = t.entity_id
           JOIN finance_account_details a
             ON a.workspace_id = t.workspace_id AND a.entity_id = t.account_id
           JOIN entities ae ON ae.workspace_id = a.workspace_id AND ae.id = a.entity_id
          WHERE t.workspace_id = ?
            AND t.deleted_at IS NULL
            AND t.transfer_group_id IS NULL
            AND t.account_id <> ?
            AND t.amount_minor = ?
            AND t.currency_code = ?
            AND t.occurred_on >= ? AND t.occurred_on <= ?
          ORDER BY ABS(julianday(t.occurred_on) - julianday(?)), t.entity_id
          LIMIT ?`,
      )
      .bind(
        this.#workspaceId,
        t.accountId,
        -t.amountMinor,
        t.currencyCode,
        shiftIsoDate(t.occurredOn, -SUSPECTED_DUPLICATE_WINDOW_DAYS),
        shiftIsoDate(t.occurredOn, SUSPECTED_DUPLICATE_WINDOW_DAYS),
        t.occurredOn,
        MAX_TRANSFER_CANDIDATES,
      )
      .all<{
        entity_id: string;
        account_id: string;
        account_title: string;
        occurred_on: string;
        amount_minor: number;
        currency_code: string;
        payee_display: string;
      }>();

    return result.results.map((row) => ({
      transactionId: row.entity_id,
      accountId: row.account_id,
      accountTitle: row.account_title,
      occurredOn: row.occurred_on,
      amountMinor: Number(row.amount_minor),
      currencyCode: row.currency_code,
      payeeDisplay: row.payee_display,
    }));
  }

  /* --------------------------------------------------------------- budgets */

  async listBudgets(month: FinanceMonth): Promise<readonly FinanceBudget[]> {
    const period = validateFinanceMonth(month);
    const result = await this.#db
      .prepare(
        `SELECT id, category_id, period_month, amount_minor, currency_code,
                created_at, updated_at
           FROM finance_budgets
          WHERE workspace_id = ? AND period_month = ?
          ORDER BY category_id`,
      )
      .bind(this.#workspaceId, period)
      .all<{
        id: string;
        category_id: string;
        period_month: string;
        amount_minor: number;
        currency_code: string;
        created_at: string;
        updated_at: string;
      }>();
    return result.results.map((row) => ({
      id: row.id,
      workspaceId: this.#workspaceId,
      categoryId: row.category_id,
      periodMonth: row.period_month,
      amountMinor: Number(row.amount_minor),
      currencyCode: row.currency_code,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
    }));
  }

  async setBudget(input: SetFinanceBudgetInput): Promise<FinanceBudget> {
    const categoryId = validateFinanceId(input.categoryId, "categoryId");
    const period = validateFinanceMonth(input.periodMonth, "periodMonth");
    const currencyCode = validateFinanceCurrency(input.currencyCode);
    const amountMinor = validateNonNegativeAmount(
      input.amount,
      currencyCode,
      "amount",
    );

    const categories = await this.listCategories({ includeArchived: true });
    const category = categories.find((entry) => entry.id === categoryId);
    if (category === undefined) throw new FinanceNotFoundError("category");
    if (category.kind !== "spending") {
      // "I budget to earn $6,000" is a Goal, and DalyHub already has Goals.
      throw new FinanceValidationError(
        "categoryId",
        "must be a money-out category — money-in categories do not carry a budget",
      );
    }

    const nowTs = toStorageTimestamp(this.#clock());
    const id = this.#newId();
    try {
      await this.#db
        .prepare(
          `INSERT INTO finance_budgets
             (workspace_id, id, category_id, period_month, amount_minor,
              currency_code, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (workspace_id, category_id, period_month)
           DO UPDATE SET amount_minor = excluded.amount_minor,
                         currency_code = excluded.currency_code,
                         updated_at = excluded.updated_at`,
        )
        .bind(
          this.#workspaceId,
          id,
          categoryId,
          period,
          amountMinor,
          currencyCode,
          nowTs,
          nowTs,
        )
        .run();
    } catch (cause) {
      this.#fail(cause);
    }
    const budgets = await this.listBudgets(period);
    const saved = budgets.find((budget) => budget.categoryId === categoryId);
    if (saved === undefined) throw new FinanceStorageError();
    return saved;
  }

  async deleteBudget(budgetId: string): Promise<void> {
    const id = validateFinanceId(budgetId, "budgetId");
    const result = await this.#db
      .prepare(`DELETE FROM finance_budgets WHERE workspace_id = ? AND id = ?`)
      .bind(this.#workspaceId, id)
      .run();
    if ((result.meta?.changes ?? 0) === 0) {
      throw new FinanceNotFoundError("budget");
    }
  }

  async copyBudgets(from: FinanceMonth, to: FinanceMonth): Promise<number> {
    const source = validateFinanceMonth(from, "from");
    const target = validateFinanceMonth(to, "to");
    const nowTs = toStorageTimestamp(this.#clock());
    // One statement, and it SKIPS a category the target month already has, so
    // copying twice cannot overwrite a budget the owner has since edited.
    const result = await this.#db
      .prepare(
        `INSERT INTO finance_budgets
           (workspace_id, id, category_id, period_month, amount_minor,
            currency_code, created_at, updated_at)
         SELECT b.workspace_id,
                lower(hex(randomblob(16))),
                b.category_id, ?, b.amount_minor, b.currency_code, ?, ?
           FROM finance_budgets b
          WHERE b.workspace_id = ? AND b.period_month = ?
            AND NOT EXISTS (
              SELECT 1 FROM finance_budgets x
               WHERE x.workspace_id = b.workspace_id
                 AND x.category_id = b.category_id
                 AND x.period_month = ?
            )`,
      )
      .bind(target, nowTs, nowTs, this.#workspaceId, source, target)
      .run();
    return result.meta?.changes ?? 0;
  }

  /* ------------------------------------------------------------- the month */

  /**
   * A month's category totals, in ONE grouped statement.
   *
   * The Finance home and the budget screen both call this, which is what makes
   * "they agree" a property of the code. Transfer legs are excluded HERE, in the
   * query, so no consumer can forget.
   */
  async monthSummary(month: FinanceMonth): Promise<FinanceMonthSummary> {
    const period = validateFinanceMonth(month);
    const from = monthStart(period);
    const to = monthEnd(period);

    const grouped = await this.#db
      .prepare(
        `SELECT t.category_id, c.name AS category_name, c.kind AS category_kind,
                t.currency_code, SUM(t.amount_minor) AS net_minor,
                COUNT(*) AS n
           FROM finance_transaction_details t
           LEFT JOIN finance_categories c
             ON c.workspace_id = t.workspace_id AND c.id = t.category_id
          WHERE t.workspace_id = ? AND t.deleted_at IS NULL
            AND t.transfer_group_id IS NULL
            AND t.occurred_on >= ? AND t.occurred_on <= ?
          GROUP BY t.category_id, t.currency_code
          ORDER BY c.sort_order, c.name, t.category_id, t.currency_code`,
      )
      .bind(this.#workspaceId, from, to)
      .all<{
        category_id: string | null;
        category_name: string | null;
        category_kind: string | null;
        currency_code: string;
        net_minor: number;
        n: number;
      }>();

    const transfers = await this.#db
      .prepare(
        `SELECT COUNT(*) AS n FROM finance_transaction_details
          WHERE workspace_id = ? AND deleted_at IS NULL
            AND transfer_group_id IS NOT NULL
            AND occurred_on >= ? AND occurred_on <= ?`,
      )
      .bind(this.#workspaceId, from, to)
      .first<{ n: number }>();

    const categories = grouped.results.map((row) => ({
      categoryId: text(row.category_id),
      categoryName: text(row.category_name),
      categoryKind: (text(row.category_kind) ?? null) as
        "spending" | "income" | null,
      currencyCode: row.currency_code,
      netMinor: Number(row.net_minor),
      transactionCount: Number(row.n),
    }));

    return {
      month: period,
      categories,
      uncategorisedCount: categories
        .filter((entry) => entry.categoryId === null)
        .reduce((sum, entry) => sum + entry.transactionCount, 0),
      transferCount: Number(transfers?.n ?? 0),
    };
  }

  async countUncategorised(): Promise<number> {
    const row = await this.#db
      .prepare(
        `SELECT COUNT(*) AS n FROM finance_transaction_details
          WHERE workspace_id = ? AND deleted_at IS NULL AND category_id IS NULL`,
      )
      .bind(this.#workspaceId)
      .first<{ n: number }>();
    return Number(row?.n ?? 0);
  }

  /* ------------------------------------------- net worth, and commitments */

  /**
   * Every live Asset's LATEST recorded valuation, in ONE statement.
   *
   * An Asset with no valuation comes back with `valueMinor: null` — excluded and
   * COUNTED by the net-worth arithmetic, never valued at zero. A house DalyHub
   * has never been told the value of is not worth nothing.
   */
  async listLatestAssetValuations(): Promise<readonly NetWorthAsset[]> {
    const result = await this.#db
      .prepare(
        `SELECT e.id AS asset_id, e.title,
                v.value_minor, v.currency_code, v.event_date
           FROM entities e
           JOIN asset_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           LEFT JOIN (
             SELECT ev.asset_id,
                    ev.value_minor, ev.currency_code, ev.event_date,
                    ROW_NUMBER() OVER (
                      PARTITION BY ev.asset_id
                      ORDER BY ev.event_date DESC, ev.id DESC
                    ) AS rank_in_asset
               FROM asset_events ev
              WHERE ev.workspace_id = ?
                AND ev.category = 'valuation'
                AND ev.value_minor IS NOT NULL
                AND ev.deleted_at IS NULL AND ev.archived_at IS NULL
           ) v ON v.asset_id = e.id AND v.rank_in_asset = 1
          WHERE e.workspace_id = ? AND e.type = 'asset' AND e.deleted_at IS NULL
            AND d.deleted_at IS NULL
          ORDER BY e.title, e.id`,
      )
      .bind(this.#workspaceId, this.#workspaceId)
      .all<{
        asset_id: string;
        title: string;
        value_minor: number | null;
        currency_code: string | null;
        event_date: string | null;
      }>();
    return result.results.map((row) => ({
      assetId: row.asset_id,
      title: row.title,
      valueMinor: row.value_minor === null ? null : Number(row.value_minor),
      currencyCode: text(row.currency_code),
      valuedOn: text(row.event_date),
    }));
  }

  /**
   * Money-bearing obligations due in a month.
   *
   * A deterministic list of RECORDED amounts, not a forecast. An obligation due
   * this month with no recorded amount is listed with `expectedAmountMinor:
   * null` and counted as such by the surface — never inferred, never estimated,
   * never zero.
   */
  async listExpectedCommitments(
    month: FinanceMonth,
  ): Promise<readonly ExpectedCommitment[]> {
    const period = validateFinanceMonth(month);
    const result = await this.#db
      .prepare(
        /*
         * OPEN and COMPLETED, and the caller decides what each is for.
         *
         * `open` is what "due this month" sums — the roadmap's definition, a
         * deterministic total of recorded amounts still to pay. `completed` is
         * carried so the month can SHOW what was settled: a commitment that
         * vanished the instant it was paid would make the settle action look
         * like it had failed, and would give the owner nowhere to check that
         * the payment it recorded was the right one.
         *
         * Dismissed and on-hold obligations are neither, and are absent.
         */
        `SELECT o.entity_id, e.title, o.due_date, o.expected_amount_minor,
                o.currency_code, o.settled_by_transaction_id, o.status
           FROM obligation_details o
           JOIN entities e
             ON e.workspace_id = o.workspace_id AND e.id = o.entity_id
          WHERE o.workspace_id = ? AND o.deleted_at IS NULL
            AND o.status IN ('open', 'completed')
            AND o.due_date >= ? AND o.due_date <= ?
          ORDER BY o.due_date, o.entity_id`,
      )
      .bind(this.#workspaceId, monthStart(period), monthEnd(period))
      .all<{
        entity_id: string;
        title: string;
        due_date: string;
        expected_amount_minor: number | null;
        currency_code: string | null;
        settled_by_transaction_id: string | null;
        status: string;
      }>();
    return result.results.map((row) => ({
      obligationId: row.entity_id,
      title: row.title,
      dueDate: row.due_date,
      expectedAmountMinor:
        row.expected_amount_minor === null
          ? null
          : Number(row.expected_amount_minor),
      currencyCode: text(row.currency_code),
      settledByTransactionId: text(row.settled_by_transaction_id),
      completed: row.status === "completed",
    }));
  }

  /**
   * V2.12 FIN-04 — what a transaction says, for the obligation that wants to
   * name it as its settlement.
   *
   * Read-only, and deliberately narrow: an amount as a POSITIVE magnitude, a
   * currency, a day, a direction and whether it is already spoken for. It
   * returns `null` for a transaction that is not in this workspace, which is the
   * same answer as "there is no such transaction" — so a hostile workspace
   * cannot learn that one exists by the shape of the refusal.
   *
   * A deleted transaction is `null` too: deleting it was a decision, and a
   * deleted row is not evidence that a bill was paid.
   */
  async resolveSettlement(transactionId: string): Promise<{
    readonly amountMinor: number;
    readonly currencyCode: string;
    readonly occurredOn: string;
    readonly inflow: boolean;
    readonly settlesObligationId: string | null;
  } | null> {
    const id = validateFinanceId(transactionId, "transactionId");
    const row = await this.#db
      .prepare(
        `SELECT t.amount_minor, t.currency_code, t.occurred_on,
                ob.entity_id AS settles_obligation_id
           FROM finance_transaction_details t
           LEFT JOIN obligation_details ob
             ON ob.workspace_id = t.workspace_id
            AND ob.settled_by_transaction_id = t.entity_id
            AND ob.deleted_at IS NULL
          WHERE t.workspace_id = ? AND t.entity_id = ? AND t.deleted_at IS NULL`,
      )
      .bind(this.#workspaceId, id)
      .first<{
        amount_minor: number;
        currency_code: string;
        occurred_on: string;
        settles_obligation_id: string | null;
      }>();
    if (row === null) return null;
    const amount = Number(row.amount_minor);
    return {
      // A POSITIVE magnitude: `obligation_details` CHECKs that a completed
      // amount is non-negative, and "what it cost" is not a signed quantity.
      amountMinor: Math.abs(amount),
      currencyCode: row.currency_code,
      occurredOn: row.occurred_on,
      inflow: amount > 0,
      settlesObligationId: text(row.settles_obligation_id),
    };
  }

  /* --------------------------------------------------------------- imports */

  async listImports(options?: {
    readonly accountId?: string;
    readonly limit?: number;
  }): Promise<readonly FinanceImport[]> {
    const accountId =
      options?.accountId === undefined
        ? null
        : validateFinanceId(options.accountId, "accountId");
    const limit = Math.min(
      Math.max(1, options?.limit ?? DEFAULT_IMPORTS_LIMIT),
      MAX_IMPORTS_LIMIT,
    );
    const result = await this.#db
      .prepare(
        `SELECT id, account_id, file_name, file_sha256, file_bytes, row_count,
                added_count, skipped_existing_count, suspected_count,
                invalid_count, mapping_json, imported_at, created_at
           FROM finance_imports
          WHERE workspace_id = ? AND (? IS NULL OR account_id = ?)
          ORDER BY imported_at DESC, id
          LIMIT ?`,
      )
      .bind(this.#workspaceId, accountId, accountId, limit)
      .all<{
        id: string;
        account_id: string;
        file_name: string;
        file_sha256: string;
        file_bytes: number;
        row_count: number;
        added_count: number;
        skipped_existing_count: number;
        suspected_count: number;
        invalid_count: number;
        mapping_json: string;
        imported_at: string;
        created_at: string;
      }>();
    return result.results.map((row) => ({
      id: row.id,
      workspaceId: this.#workspaceId,
      accountId: row.account_id,
      fileName: row.file_name,
      fileSha256: row.file_sha256,
      fileBytes: Number(row.file_bytes),
      rowCount: Number(row.row_count),
      addedCount: Number(row.added_count),
      skippedExistingCount: Number(row.skipped_existing_count),
      suspectedCount: Number(row.suspected_count),
      invalidCount: Number(row.invalid_count),
      mappingJson: row.mapping_json,
      importedAt: fromStorageTimestamp(row.imported_at),
      createdAt: fromStorageTimestamp(row.created_at),
    }));
  }

  /**
   * Everything the preview and the apply both need, derived once from the same
   * bytes and the same mapping — so an apply cannot decide anything the preview
   * did not show.
   */
  async #deriveImport(
    accountId: string,
    fileName: string,
    bytes: Uint8Array,
    mapping: CsvMapping,
  ): Promise<{
    readonly account: FinanceAccount;
    readonly sha256: string;
    readonly mapped: readonly MappedRow[];
    readonly fingerprints: readonly (string | null)[];
    readonly existing: ReadonlySet<string>;
    readonly suspected: ReadonlySet<number>;
    readonly alreadyAppliedAt: Date | null;
    readonly balanceCheck: ImportBalanceCheck | null;
  }> {
    const account = await this.getAccount(accountId);
    if (account === null) throw new FinanceNotFoundError("account");

    const sha256 = await sha256Hex(bytes);
    const table = readCsv(bytes);
    const mapped = mapCsvRows(table, mapping, account.currencyCode);

    // Fingerprints are assigned over the VALID rows only, in file order, so an
    // invalid row does not consume an occurrence index and shift every later
    // row's identity.
    const valid = mapped.filter((row) => row.problem === null);
    const assigned = assignFingerprints(
      valid.map((row) => ({
        occurredOn: row.occurredOn as string,
        amountMinor: row.amountMinor as number,
        payeeKey: row.payeeKey as string,
        sourceTransactionId: row.sourceTransactionId,
      })),
    );
    const byIndex = new Map<number, string>();
    valid.forEach((row, position) =>
      byIndex.set(row.index, assigned[position]!),
    );
    const fingerprints = mapped.map((row) => byIndex.get(row.index) ?? null);

    // One statement for every candidate, through `json_each`.
    const candidateFingerprints = assigned;
    const existing = new Set<string>();
    if (candidateFingerprints.length > 0) {
      const found = await this.#db
        .prepare(
          `SELECT fingerprint FROM finance_transaction_details
            WHERE workspace_id = ? AND account_id = ?
              AND fingerprint IN (SELECT value FROM json_each(?))`,
        )
        .bind(
          this.#workspaceId,
          account.id,
          JSON.stringify(candidateFingerprints),
        )
        .all<{ fingerprint: string }>();
      for (const row of found.results) existing.add(row.fingerprint);
    }

    // The SUSPECTED window: one bounded read over the account's transactions
    // around the file's own date range, grouped by (date, amount, payee). This
    // is NOT the dedup mechanism — it is the "real people buy the same thing
    // twice" signal, shown to the owner and never applied silently.
    const suspected = new Set<number>();
    const newRows = valid.filter(
      (row, position) => !existing.has(assigned[position]!),
    );
    const newIndexes = new Map<number, number>();
    valid.forEach((row, position) => {
      if (!existing.has(assigned[position]!))
        newIndexes.set(row.index, position);
    });
    if (newRows.length > 0) {
      const dates = newRows.map((row) => row.occurredOn as string).sort();
      const windowFrom = shiftIsoDate(
        dates[0]!,
        -SUSPECTED_DUPLICATE_WINDOW_DAYS,
      );
      const windowTo = shiftIsoDate(
        dates[dates.length - 1]!,
        SUSPECTED_DUPLICATE_WINDOW_DAYS,
      );
      const nearby = await this.#db
        .prepare(
          `SELECT occurred_on, amount_minor, payee_key
             FROM finance_transaction_details
            WHERE workspace_id = ? AND account_id = ? AND deleted_at IS NULL
              AND occurred_on >= ? AND occurred_on <= ?`,
        )
        .bind(this.#workspaceId, account.id, windowFrom, windowTo)
        .all<{
          occurred_on: string;
          amount_minor: number;
          payee_key: string;
        }>();
      for (const row of newRows) {
        // A bank-supplied id makes identity CERTAIN, so it suppresses suspicion.
        if (row.sourceTransactionId !== null) continue;
        const candidate = {
          occurredOn: row.occurredOn as string,
          amountMinor: row.amountMinor as number,
          payeeKey: row.payeeKey as string,
        };
        // The rule itself lives in the kernel, where it is stated and tested;
        // this loop only supplies the rows.
        const hit = nearby.results.some((near) =>
          looksLikeDuplicate(candidate, {
            occurredOn: near.occurred_on,
            amountMinor: Number(near.amount_minor),
            payeeKey: near.payee_key,
          }),
        );
        if (hit) suspected.add(row.index);
      }
    }
    void newIndexes;

    const applied = await this.#db
      .prepare(
        `SELECT imported_at FROM finance_imports
          WHERE workspace_id = ? AND account_id = ? AND file_sha256 = ?`,
      )
      .bind(this.#workspaceId, account.id, sha256)
      .first<{ imported_at: string }>();

    // The balance CHECK: what the file's last balance cell says, against what
    // the rows would produce. It never writes and never becomes an authority.
    let balanceCheck: ImportBalanceCheck | null = null;
    if (mapping.balance !== null) {
      const withBalance = valid.filter((row) => row.balanceMinor !== null);
      const last = withBalance[withBalance.length - 1];
      if (last !== undefined) {
        const accounts = await this.listAccountsWithBalances({
          includeClosed: true,
        });
        const current = accounts.find(
          (entry) => entry.account.id === account.id,
        );
        const currentBalance =
          current?.balanceMinor ?? account.openingBalanceMinor;
        const addition = valid.reduce(
          (sum, row, position) =>
            existing.has(assigned[position]!)
              ? sum
              : sum + (row.amountMinor as number),
          0,
        );
        const derived = currentBalance + addition;
        balanceCheck = {
          statedMinor: last.balanceMinor as number,
          derivedMinor: derived,
          differenceMinor: (last.balanceMinor as number) - derived,
          currencyCode: account.currencyCode,
        };
      }
    }

    return {
      account,
      sha256,
      mapped,
      fingerprints,
      existing,
      suspected,
      alreadyAppliedAt:
        applied === null ? null : fromStorageTimestamp(applied.imported_at),
      balanceCheck,
    };
  }

  async previewImport(input: {
    readonly accountId: string;
    readonly fileName: string;
    readonly bytes: Uint8Array;
    readonly mapping: CsvMapping;
  }): Promise<ImportPreview> {
    const derived = await this.#deriveImport(
      input.accountId,
      input.fileName,
      input.bytes,
      input.mapping,
    );

    const rows: ImportPreviewRow[] = derived.mapped.map((row, position) => {
      const fingerprint = derived.fingerprints[position] ?? null;
      const outcome =
        row.problem !== null
          ? "invalid"
          : fingerprint !== null && derived.existing.has(fingerprint)
            ? "existing"
            : "new";
      return {
        index: row.index,
        line: row.line,
        outcome,
        suspected: outcome === "new" && derived.suspected.has(row.index),
        problem: row.problem,
        occurredOn: row.occurredOn,
        amountMinor: row.amountMinor,
        payeeDisplay: row.payeeDisplay,
        sourceDescription: row.sourceDescription,
        fingerprint,
      };
    });

    // Money in and money out across the rows that WILL be applied by default,
    // so the sign choice in the mapping is visibly right or visibly wrong before
    // anything is written.
    const applying = rows.filter(
      (row) => row.outcome === "new" && !row.suspected,
    );
    return {
      accountId: derived.account.id,
      fileName: validateText(input.fileName, "fileName", 200),
      fileSha256: derived.sha256,
      fileBytes: input.bytes.length,
      mapping: input.mapping,
      rows,
      newCount: rows.filter((row) => row.outcome === "new").length,
      existingCount: rows.filter((row) => row.outcome === "existing").length,
      suspectedCount: rows.filter((row) => row.suspected).length,
      invalidCount: rows.filter((row) => row.outcome === "invalid").length,
      inMinor: applying.reduce(
        (sum, row) => sum + Math.max(0, row.amountMinor ?? 0),
        0,
      ),
      outMinor: applying.reduce(
        (sum, row) => sum - Math.min(0, row.amountMinor ?? 0),
        0,
      ),
      currencyCode: derived.account.currencyCode,
      balanceCheck: derived.balanceCheck,
      alreadyApplied: derived.alreadyAppliedAt !== null,
      alreadyAppliedAt: derived.alreadyAppliedAt,
    };
  }

  /**
   * Apply an import as ONE atomic batch whose statement count does not grow with
   * the row count.
   *
   * The rows travel as one bound JSON parameter expanded with `json_each`, so a
   * 2,000-row import is the same shape as a 1-row import and D1's
   * hundred-variable ceiling is never approached. Invalid rows were separated in
   * the PREVIEW and are not in the batch, so there is no partial import and no
   * "wrote 600 rows and failed at 601".
   */
  async applyImport(input: ApplyImportInput): Promise<ImportResult> {
    const derived = await this.#deriveImport(
      input.accountId,
      input.fileName,
      input.bytes,
      input.mapping,
    );
    if (derived.sha256 !== input.expectedSha256) {
      throw new FinanceValidationError(
        "file",
        "is not the file you previewed. Preview it again before importing.",
      );
    }
    const fileName = validateText(input.fileName, "fileName", 200);

    const includeSuspected = new Set(input.includeSuspected ?? []);
    const valid = derived.mapped.filter((row) => row.problem === null);
    const fingerprintFor = new Map<number, string>();
    derived.mapped.forEach((row, position) => {
      const fingerprint = derived.fingerprints[position];
      if (fingerprint) fingerprintFor.set(row.index, fingerprint);
    });

    const skippedExisting = valid.filter((row) =>
      derived.existing.has(fingerprintFor.get(row.index)!),
    ).length;
    const toInsert = valid.filter((row) => {
      const fingerprint = fingerprintFor.get(row.index)!;
      if (derived.existing.has(fingerprint)) return false;
      // Suspected rows are excluded BY DEFAULT and included only when the owner
      // named them. Nothing is silently merged and nothing is silently dropped.
      if (
        derived.suspected.has(row.index) &&
        !includeSuspected.has(row.index)
      ) {
        return false;
      }
      return true;
    });

    const importId = this.#newId();
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const payload = toInsert.map((row) => ({
      i: this.#newId(),
      d: row.occurredOn as string,
      a: row.amountMinor as number,
      s: row.sourceDescription,
      t: row.payeeDisplay as string,
      k: row.payeeKey as string,
      x: row.sourceTransactionId,
      f: fingerprintFor.get(row.index)!,
    }));
    const payloadJson = JSON.stringify(payload);

    const batch: D1PreparedStatement[] = [
      // FIRST, so the ledger's unique index decides: the same bytes cannot be
      // applied to the same account twice, and two concurrent applies of one
      // file cannot both win. When this INSERT loses, the whole batch fails and
      // nothing at all is written.
      this.#db
        .prepare(
          `INSERT INTO finance_imports
             (workspace_id, id, account_id, file_name, file_sha256, file_bytes,
              row_count, added_count, skipped_existing_count, suspected_count,
              invalid_count, mapping_json, imported_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          this.#workspaceId,
          importId,
          derived.account.id,
          fileName,
          derived.sha256,
          input.bytes.length,
          derived.mapped.length,
          toInsert.length,
          skippedExisting,
          derived.suspected.size,
          derived.mapped.length - valid.length,
          serialiseCsvMapping(input.mapping),
          nowTs,
          nowTs,
        ),
    ];

    if (payload.length > 0) {
      batch.push(
        this.#db
          .prepare(
            `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
             SELECT json_extract(value, '$.i'), ?, ?, json_extract(value, '$.t'), ?, ?
               FROM json_each(?)`,
          )
          .bind(
            this.#workspaceId,
            FINANCE_TRANSACTION_ENTITY_TYPE,
            nowTs,
            nowTs,
            payloadJson,
          ),
        this.#db
          .prepare(
            `INSERT INTO finance_transaction_details
               (workspace_id, entity_id, account_id, occurred_on, amount_minor,
                currency_code, source_description, payee_key, memo, category_id,
                category_confirmed_at, import_id, source_transaction_id,
                fingerprint, transfer_group_id, created_at, updated_at)
             SELECT ?, json_extract(value, '$.i'), ?, json_extract(value, '$.d'),
                    json_extract(value, '$.a'), ?, json_extract(value, '$.s'),
                    json_extract(value, '$.k'), NULL, NULL, NULL, ?,
                    json_extract(value, '$.x'), json_extract(value, '$.f'),
                    NULL, ?, ?
               FROM json_each(?)`,
          )
          .bind(
            this.#workspaceId,
            derived.account.id,
            derived.account.currencyCode,
            importId,
            nowTs,
            nowTs,
            payloadJson,
          ),
      );
    }

    batch.push(
      // ONE Activity event per applied import — counts and the account, never a
      // payee, never an amount, never a row.
      ...this.#appendStatements(
        FINANCE_IMPORT_APPLIED,
        [derived.account.id],
        {
          rowCount: derived.mapped.length,
          addedCount: toInsert.length,
          skippedExistingCount: skippedExisting,
          suspectedCount: derived.suspected.size,
          invalidCount: derived.mapped.length - valid.length,
        },
        now,
      ),
    );

    if (input.saveMapping === true) {
      batch.push(
        this.#db
          .prepare(
            `UPDATE finance_account_details
                SET import_mapping_json = ?, updated_at = ?
              WHERE workspace_id = ? AND entity_id = ?`,
          )
          .bind(
            serialiseCsvMapping(input.mapping),
            nowTs,
            this.#workspaceId,
            derived.account.id,
          ),
      );
    }

    try {
      await this.#db.batch(this.#withFault(batch));
    } catch (cause) {
      // The ledger's unique index is the authority. Losing to it is not an
      // error the owner should see as one: it is the answer, "0 new".
      if (
        String(cause).includes("UNIQUE") &&
        String(cause).includes("finance_imports")
      ) {
        const previous = await this.#db
          .prepare(
            `SELECT id, imported_at FROM finance_imports
              WHERE workspace_id = ? AND account_id = ? AND file_sha256 = ?`,
          )
          .bind(this.#workspaceId, derived.account.id, derived.sha256)
          .first<{ id: string; imported_at: string }>();
        const ledger = (
          await this.listImports({ limit: MAX_IMPORTS_LIMIT })
        ).find((entry) => entry.id === previous?.id);
        if (ledger !== undefined) {
          return {
            import: ledger,
            addedCount: 0,
            skippedExistingCount: valid.length,
            suspectedCount: derived.suspected.size,
            invalidCount: derived.mapped.length - valid.length,
            alreadyApplied: true,
          };
        }
      }
      this.#fail(cause);
    }

    const ledger = (
      await this.listImports({ accountId: derived.account.id })
    ).find((entry) => entry.id === importId);
    if (ledger === undefined) throw new FinanceStorageError();
    return {
      import: ledger,
      addedCount: toInsert.length,
      skippedExistingCount: skippedExisting,
      suspectedCount: derived.suspected.size,
      invalidCount: derived.mapped.length - valid.length,
      alreadyApplied: false,
    };
  }
}

/** Lowercase hex SHA-256, via the platform WebCrypto. */
async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    data as unknown as ArrayBuffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Construct the workspace-bound Finance repository. */
export function createFinanceRepository(
  db: D1Database,
  context: WorkspaceContext,
  options: D1FinanceRepositoryOptions = {},
): FinanceRepository {
  return new D1FinanceRepository(db, context, options);
}
