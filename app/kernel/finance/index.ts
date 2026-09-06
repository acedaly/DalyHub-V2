/**
 * V2.12 FIN-00 — the FINANCE kernel: where is my money going?
 *
 * The smallest Finance the owner could genuinely begin using: accounts,
 * imported transactions, one workspace category vocabulary, a monthly budget,
 * derived balances, one net-worth figure, and the link from an obligation to
 * the transaction that paid it.
 *
 * Everything here is PURE — no D1, no JSX, no clock, no timezone database. The
 * READS live on `FinanceRepository`, because a history read is a read of a store
 * and putting it here would give this slice a second identity as a repository
 * (`~/kernel/history`'s own rule, followed rather than restated).
 *
 * Four things to know before changing anything in this directory:
 *
 *   1. **Positive is money in, negative is money out.** Everywhere. Liabilities
 *      subtract because their balances are negative, not because a rule flips
 *      them (ADR-120 decision 1).
 *   2. **A balance is derived and there is nowhere to store one.** No column, no
 *      cache, no setter (ADR-120 decision 5).
 *   3. **Money is `~/kernel/money`** — integer minor units, an explicit
 *      ISO-4217 code, no float and no conversion (ADR-049). Finance adds one
 *      thing that kernel does not have: a total over unlike currencies that
 *      states its exclusions.
 *   4. **Finance has no recurring-commitment model.** A money-bearing recurring
 *      commitment is an Obligation (ADR-116 decision 1).
 */

export {
  FINANCE_ACCOUNT_ENTITY_TYPE,
  FINANCE_TRANSACTION_ENTITY_TYPE,
  RESERVED_FINANCE_ENTITY_TYPES,
  isReservedFinanceEntityType,
  FINANCE_ACCOUNT_CREATED,
  FINANCE_ACCOUNT_UPDATED,
  FINANCE_ACCOUNT_CLOSED,
  FINANCE_IMPORT_APPLIED,
  FINANCE_ACTIVITY_TYPES,
  OBLIGATION_SETTLED_BY_LINK,
  obligationSettlementLinkId,
} from "./finance-identifiers";

export {
  FinanceValidationError,
  FinanceNotFoundError,
  FinanceRefusedError,
  FinanceStorageError,
  type FinanceRefusalReason,
} from "./finance-errors";

export {
  FINANCE_ACCOUNT_TYPES,
  FINANCE_ACCOUNT_TYPE_LABELS,
  FINANCE_ACCOUNT_TYPE_HINTS,
  isFinanceAccountType,
  isLiabilityAccountType,
  deriveBalanceMinor,
  type FinanceAccount,
  type FinanceAccountInput,
  type FinanceAccountStatus,
  type FinanceAccountType,
  type FinanceAccountWithBalance,
  type CreateFinanceAccountInput,
  type UpdateFinanceAccountInput,
} from "./finance-account";

export {
  FINANCE_CATEGORY_KINDS,
  FINANCE_CATEGORY_KIND_LABELS,
  FINANCE_STARTER_CATEGORIES,
  financeCategoryKey,
  isFinanceCategoryKind,
  type CreateFinanceCategoryInput,
  type FinanceCategory,
  type FinanceCategoryKind,
  type UpdateFinanceCategoryInput,
} from "./finance-category";

export {
  DEFAULT_TRANSACTIONS_PAGE_SIZE,
  IMPORTED_TRANSACTION_EDITABLE_FIELDS,
  MAX_TRANSACTIONS_PAGE_SIZE,
  financeDirection,
  type CreateFinanceTransactionInput,
  type FinanceDirection,
  type FinanceTransaction,
  type FinanceTransactionFilters,
  type FinanceTransactionPage,
  type FinanceTransactionView,
  type UpdateFinanceTransactionInput,
} from "./finance-transaction";

export {
  budgetSentence,
  budgetState,
  type BudgetState,
  type BudgetVariance,
  type FinanceBudget,
  type SetFinanceBudgetInput,
} from "./finance-budget";

export {
  EMPTY_MONEY_TOTAL,
  addMoneyTotals,
  excludedFrom,
  exclusionSentence,
  leadingCurrency,
  negateMoneyTotal,
  shareIn,
  totalMoney,
  type CurrencyTotal,
  type MoneyAmount,
  type MoneyTotal,
} from "./finance-money";

export {
  PAYEE_KEY_MAX_LENGTH,
  assignFingerprints,
  manualFingerprint,
  normalisePayee,
  occurrenceFingerprint,
  occurrenceGroupKey,
  proposeDisplayPayee,
  sourceIdFingerprint,
  type FingerprintCandidate,
} from "./finance-fingerprint";

export {
  CSV_MAX_BYTES,
  CSV_MAX_CELLS,
  CSV_MAX_COLUMNS,
  CSV_MAX_FIELD_LENGTH,
  CSV_MAX_ROWS,
  CSV_REFUSAL_MESSAGES,
  CsvParseError,
  decodeCsvBytes,
  parseCsv,
  readCsv,
  type CsvRefusalReason,
  type CsvTable,
} from "./finance-csv";

export {
  CSV_DATE_FORMATS,
  CSV_DATE_FORMAT_LABELS,
  CSV_MAPPING_MAX_COLUMN,
  isCsvDateFormat,
  parseCsvDate,
  readStoredCsvMapping,
  serialiseCsvMapping,
  validateCsvMapping,
  type CsvAmountMapping,
  type CsvDateFormat,
  type CsvMapping,
} from "./finance-csv-mapping";

export {
  IMPORT_ROW_PROBLEM_MESSAGES,
  SUSPECTED_DUPLICATE_WINDOW_DAYS,
  type FinanceImport,
  type ImportBalanceCheck,
  type ImportPreview,
  type ImportPreviewRow,
  type ImportResult,
  type ImportRowOutcome,
  type ImportRowProblem,
} from "./finance-import";

export { mapCsvRows, validRows, type MappedRow } from "./finance-import-rows";

export {
  addMonths,
  isFinanceMonth,
  monthDirectionTotals,
  monthEnd,
  monthLabel,
  monthOf,
  monthStart,
  resolveMonth,
  type CategoryMonthTotal,
  type FinanceMonth,
  type FinanceMonthSummary,
} from "./finance-month";

export {
  computeNetWorth,
  type NetWorth,
  type NetWorthAccount,
  type NetWorthAsset,
} from "./finance-networth";

export {
  decodeFinanceCursorForScope,
  encodeFinanceCursor,
  financeCursorScope,
  type FinanceTransactionCursor,
} from "./finance-cursor";

export {
  FINANCE_ID_MAX_LENGTH,
  isIsoDate,
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
} from "./finance-validation";

export type {
  ApplyImportInput,
  CategorySuggestion,
  ExpectedCommitment,
  FinanceRepository,
  ListTransactionsInput,
  TransferCandidate,
} from "./finance-repository";
