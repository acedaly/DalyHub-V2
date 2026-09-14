/**
 * V2.12 — public entry for the shared Finance surface.
 *
 * The ONE transaction row, the ONE category picker and the ONE transaction
 * drawer, plus the client-safe shapes and the words a money surface says. Every
 * Finance screen composes these; no module draws its own.
 *
 * There is deliberately no attachment component here. A transaction's receipt is
 * `AttachmentsSection` from `~/shared/attachments`, rendered by the drawer —
 * V2.11's one surface, with nothing Finance-shaped added to it.
 */

/**
 * UNTITLED-16 — `TransactionRow` is gone; the row is a row of the ONE table.
 *
 * It was a hand-written `<li>` with its own flex body, its own hover, its own
 * phone arrangement and an amount column whose digits did not line up. Every
 * surface that drew it now draws `TransactionsTable`, which is the genuine
 * Untitled `application/table`.
 */
export {
  TransactionsTable,
  type TransactionsTableProps,
} from "./TransactionsTable";
export { CategoryPicker, type CategoryPickerProps } from "./CategoryPicker";
export {
  TransactionDrawer,
  type TransactionDrawerProps,
  type TransferCandidateOption,
} from "./TransactionDrawer";

export {
  IMPORT_OUTCOME_LABELS,
  balanceLabel,
  exclusionNote,
  financeAmountLabel,
  financeDate,
  money,
  moneyTick,
  type SerializedCategoryMonthLine,
  type SerializedMonthBudget,
  type SerializedCommitment,
  type SerializedCurrencyTotal,
  type SerializedFinanceAccount,
  type SerializedFinanceCategory,
  type SerializedFinanceImport,
  type SerializedFinanceTransaction,
  type SerializedFlowMonth,
  type SerializedImportRow,
  type SerializedMonthlyFlow,
} from "./finance-view";
