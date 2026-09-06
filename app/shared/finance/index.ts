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

export { TransactionRow, type TransactionRowProps } from "./TransactionRow";
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
  type SerializedCategoryMonthLine,
  type SerializedCommitment,
  type SerializedCurrencyTotal,
  type SerializedFinanceAccount,
  type SerializedFinanceCategory,
  type SerializedFinanceImport,
  type SerializedFinanceTransaction,
  type SerializedImportRow,
} from "./finance-view";
