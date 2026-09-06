/**
 * V2.12 FIN-00 — the transaction, and the sign convention everything obeys.
 *
 * A transaction is a LIGHT ENTITY (ADR-120 decision 2): an ordinary `entities`
 * row whose title is the display payee, plus a `finance_transaction_details`
 * slice. It is an entity ONLY because three mechanisms need a stable entity
 * identity and all three already exist — an attachment's owner is an `entities`
 * row, an obligation's settlement projection is an EntityLink between two of
 * them, and a Search result needs an entity id.
 *
 * "Light" is enforced elsewhere and stated here: no Activity per transaction, no
 * record route, no record chrome. It opens in the shared Drawer.
 *
 * ## THE SIGN CONVENTION
 *
 *     POSITIVE is money IN. NEGATIVE is money OUT.
 *
 * One sentence, everywhere: the CSV mapping's output, `amount_minor`, the
 * balance sum, every category total, the budget comparison, net worth and the
 * UI's own arithmetic. A bank adapter's job is to translate INTO it; a
 * `debit`/`credit` pair becomes one signed amount at the mapping boundary and
 * nothing downstream knows the file had two columns.
 *
 * ## Spend, income and refunds
 *
 * The totals are computed by the category's KIND, not by the sign:
 *
 *     money out = -Σ amount over non-transfer rows in SPENDING categories
 *     money in  = +Σ amount over non-transfer rows in INCOME categories
 *
 * so a +$50 refund categorised as Groceries REDUCES Groceries spend and never
 * appears as income. That is the whole refund model, it costs nothing, and it is
 * the simplified rule this release commits to. Uncategorised rows are reported
 * separately and folded into neither, because a month with forty uncategorised
 * transactions must say so rather than quietly understate spend.
 *
 * Pure: no storage, no clock, no JSX.
 */

/** One transaction. */
export interface FinanceTransaction {
  readonly id: string;
  readonly workspaceId: string;
  readonly accountId: string;
  /** The date the owner thinks in, and the date the month is cut by. */
  readonly occurredOn: string;
  /** SIGNED minor units. Positive in, negative out. Zero is legitimate. */
  readonly amountMinor: number;
  /** Always the account's own currency. Never converted. */
  readonly currencyCode: string;
  /** The bank's raw string, never destroyed and never overwritten. */
  readonly sourceDescription: string;
  /**
   * What the owner sees. Editable, including on an imported row.
   *
   * It is stored as the `entities` row's TITLE rather than in the detail slice —
   * one title, one place, the rule `obligation_details` set — and is projected
   * here so a surface reads one shape.
   */
  readonly payeeDisplay: string;
  /** The bounded normalisation. Fingerprinting and suggestion only. */
  readonly payeeKey: string;
  readonly memo: string | null;
  /** `null` IS uncategorised. */
  readonly categoryId: string | null;
  /** Set when the OWNER chose the category by hand. */
  readonly categoryConfirmedAt: Date | null;
  /** `null` means entered by hand. */
  readonly importId: string | null;
  readonly sourceTransactionId: string | null;
  /** The row's identity within its account. */
  readonly fingerprint: string;
  /** Both legs of one transfer share it. */
  readonly transferGroupId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

/**
 * A transaction with the context a row or a drawer renders, resolved in the
 * SAME statement.
 *
 * There is no per-row category read, no per-row account read and no per-row
 * attachment read: the category and the account arrive through `LEFT JOIN`s, and
 * attachment presence is not shown on a row at all.
 */
export interface FinanceTransactionView {
  readonly transaction: FinanceTransaction;
  readonly accountTitle: string;
  readonly categoryName: string | null;
  readonly categoryKind: string | null;
  readonly categoryArchived: boolean;
  /** The other leg's id, when this transaction is half of a transfer. */
  readonly transferPartnerId: string | null;
  readonly transferPartnerAccountTitle: string | null;
  /** The obligation this transaction settled, when it settled one. */
  readonly settlesObligationId: string | null;
  readonly settlesObligationTitle: string | null;
}

/** Whether a transaction is money in, money out, or neither. */
export type FinanceDirection = "in" | "out" | "zero";

/** The direction of one amount, under the one sign convention. */
export function financeDirection(amountMinor: number): FinanceDirection {
  if (amountMinor > 0) return "in";
  if (amountMinor < 0) return "out";
  return "zero";
}

/**
 * The fields an owner may correct on an IMPORTED transaction.
 *
 * Everything else — the date, the amount, the account, the source description,
 * the bank's id and the fingerprint — IS the import's identity. Letting any of
 * them move would make an applied import unreproducible and could silently break
 * deduplication, so the repository refuses the edit by name rather than
 * accepting it and hoping.
 *
 * A MANUAL transaction (no `importId`) has no such restriction: its fingerprint
 * is `man:<entityId>`, unique by construction and content-independent.
 */
export const IMPORTED_TRANSACTION_EDITABLE_FIELDS = [
  "payeeDisplay",
  "memo",
  "categoryId",
] as const;

/** The editable transaction fields. `undefined` unchanged; `null` clears. */
export interface UpdateFinanceTransactionInput {
  readonly payeeDisplay?: string;
  readonly memo?: string | null;
  /** `null` clears the category, returning the row to the queue. */
  readonly categoryId?: string | null;
  /** Manual rows only. Refused on an imported row. */
  readonly occurredOn?: string;
  /** Manual rows only. Refused on an imported row. */
  readonly amount?: string | number;
}

/** Input to enter a transaction by hand — cash, a correction, a small account. */
export interface CreateFinanceTransactionInput {
  readonly accountId: string;
  readonly occurredOn: string;
  /**
   * The amount as the owner typed it, parsed by the money kernel. SIGNED: a
   * leading minus means money out. The form supplies the sign from an explicit
   * in/out control rather than asking the owner to type one.
   */
  readonly amount: string | number;
  readonly payeeDisplay: string;
  readonly memo?: string | null;
  readonly categoryId?: string | null;
}

/** Which transactions to read. Every field narrows; none widens. */
export interface FinanceTransactionFilters {
  readonly accountId?: string;
  /** `null` reads ONLY uncategorised rows — the phone queue. */
  readonly categoryId?: string | null;
  /** Inclusive owner-calendar day bounds. */
  readonly fromDate?: string;
  readonly toDate?: string;
  /** Free text the owner typed. Matches the DISPLAY payee and nothing else. */
  readonly query?: string;
  /** When true, only rows that are half of a transfer. */
  readonly transfersOnly?: boolean;
}

export const DEFAULT_TRANSACTIONS_PAGE_SIZE = 50;
export const MAX_TRANSACTIONS_PAGE_SIZE = 200;

/** A bounded page of transactions plus the next-page cursor. */
export interface FinanceTransactionPage {
  readonly items: readonly FinanceTransactionView[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  /**
   * How many rows match the filters IN TOTAL, counted in the same statement as
   * the page rather than derived from `items.length` — the defect DEBT-232
   * records, where a bounded page was counted and printed as the total.
   */
  readonly total: number;
}
