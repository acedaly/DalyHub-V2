/**
 * V2.12 — the Finance client-safe shapes and the words a money surface says.
 *
 * A `.server` module may not be imported by a component, so everything a Finance
 * screen renders is declared here: the serialised rows a loader returns, and the
 * small amount of formatting that must be identical on every surface.
 *
 * ## Money is spoken, never coloured
 *
 * A negative balance on a credit card is `$1,240.00 owing`, not a red figure and
 * not a minus sign an owner has to notice. Money out is `−$120.50` *and* the
 * words "out"; the budget says `$75 over` rather than turning a bar red. That is
 * AGENTS.md §15 ("don't rely on colour alone") applied to the one domain where
 * red and green already mean something, and it is why `financeAmountLabel` and
 * `balanceLabel` exist rather than each screen deciding.
 *
 * Pure: no storage, no clock, no JSX.
 */

import { formatMinorUnits } from "~/kernel/money";
import type {
  BudgetState,
  FinanceAccountType,
  FinanceCategoryKind,
  ImportRowOutcome,
  ImportRowProblem,
} from "~/kernel/finance";

/* -------------------------------------------------------------------------- */
/* Serialised shapes                                                          */
/* -------------------------------------------------------------------------- */

/** One account, with its derived balance, as a loader hands it over. */
export interface SerializedFinanceAccount {
  readonly id: string;
  readonly title: string;
  readonly accountType: FinanceAccountType;
  readonly currencyCode: string;
  readonly openingBalanceMinor: number;
  readonly openingDate: string;
  readonly institution: string | null;
  readonly status: "open" | "closed";
  readonly balanceMinor: number;
  readonly transactionCount: number;
  readonly hasSavedMapping: boolean;
}

/** One transaction row, with everything a row or a drawer draws. */
export interface SerializedFinanceTransaction {
  readonly id: string;
  readonly accountId: string;
  readonly accountTitle: string;
  readonly occurredOn: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly payeeDisplay: string;
  /** The bank's verbatim string. Shown in the DRAWER only, never on a row. */
  readonly sourceDescription: string;
  readonly payeeKey: string;
  readonly memo: string | null;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly categoryKind: FinanceCategoryKind | null;
  readonly categoryArchived: boolean;
  readonly imported: boolean;
  readonly transferPartnerId: string | null;
  readonly transferPartnerAccountTitle: string | null;
  readonly settlesObligationId: string | null;
  readonly settlesObligationTitle: string | null;
  /** The deterministic suggestion for this row's payee, when there is one. */
  readonly suggestedCategoryId: string | null;
  readonly suggestedCategoryName: string | null;
}

/** One category, as the picker and the vocabulary screen read it. */
export interface SerializedFinanceCategory {
  readonly id: string;
  readonly name: string;
  readonly kind: FinanceCategoryKind;
  readonly isBuiltin: boolean;
  readonly archived: boolean;
  /** How many live transactions carry it — the count a delete refusal names. */
  readonly transactionCount: number;
}

/** One currency's share of a total, plus how many amounts produced it. */
export interface SerializedCurrencyTotal {
  readonly currencyCode: string;
  readonly minorUnits: number;
  readonly count: number;
}

/** One category's line in the month. */
/**
 * One saved budget for a month, independent of whether anything was spent.
 *
 * A budget exists whether or not the owner has spent against it, so it can
 * never be read off a spend line — see `readMonthLines` for the defect that
 * came of trying.
 */
export interface SerializedMonthBudget {
  readonly categoryId: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
}

export interface SerializedCategoryMonthLine {
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly kind: FinanceCategoryKind | null;
  readonly currencyCode: string;
  /** A POSITIVE magnitude. The `kind` says which direction it is. */
  readonly magnitudeMinor: number;
  readonly transactionCount: number;
  /** The budget for this category and month, when one is set. */
  readonly budgetedMinor: number | null;
  readonly budgetState: BudgetState | null;
  readonly budgetSentence: string | null;
}

/** One money-bearing obligation due this month. */
export interface SerializedCommitment {
  readonly obligationId: string;
  readonly title: string;
  readonly dueDate: string;
  readonly expectedAmountMinor: number | null;
  readonly currencyCode: string | null;
  /** The obligation is complete, however it was completed. */
  readonly settled: boolean;
  /** It was completed by naming a TRANSACTION, rather than by hand. */
  readonly settledByTransaction: boolean;
}

/** One applied import, as the Finance home and the account record list it. */
export interface SerializedFinanceImport {
  readonly id: string;
  readonly accountId: string;
  readonly accountTitle: string;
  readonly fileName: string;
  readonly importedAt: string;
  readonly rowCount: number;
  readonly addedCount: number;
  readonly skippedExistingCount: number;
  readonly suspectedCount: number;
  readonly invalidCount: number;
}

/** One previewed import row, as the desktop import screen renders it. */
export interface SerializedImportRow {
  readonly index: number;
  readonly line: number;
  readonly outcome: ImportRowOutcome;
  readonly suspected: boolean;
  readonly problem: ImportRowProblem | null;
  readonly occurredOn: string | null;
  readonly amountMinor: number | null;
  readonly payeeDisplay: string | null;
  readonly sourceDescription: string;
}

/* -------------------------------------------------------------------------- */
/* The words                                                                  */
/* -------------------------------------------------------------------------- */

/** Format an amount for display. Never a bare number, always a currency. */
export function money(minorUnits: number, currencyCode: string): string {
  return formatMinorUnits(minorUnits, currencyCode);
}

/**
 * A signed transaction amount, with its direction in WORDS as well as its sign.
 *
 * `-$120.50 out` and `$2,500.00 in`. The word is what a screen reader says and
 * what a person reads when a minus sign is one pixel wide, and it is why no
 * Finance surface conveys direction with colour alone.
 */
export function financeAmountLabel(
  minorUnits: number,
  currencyCode: string,
): { readonly figure: string; readonly direction: string } {
  return {
    figure: money(minorUnits, currencyCode),
    direction: minorUnits > 0 ? "in" : minorUnits < 0 ? "out" : "",
  };
}

/**
 * A balance, spoken.
 *
 * A liability's negative balance is money the owner OWES, and saying so is
 * clearer than a minus sign and honest in a way a red figure is not: red means
 * "something is wrong", and owing $1,240 on a card you deliberately use is not
 * wrong. A positive balance on a liability (an overpaid card) says "in credit",
 * which is the truth and is worth noticing.
 */
export function balanceLabel(
  balanceMinor: number,
  currencyCode: string,
  accountType: FinanceAccountType,
): { readonly figure: string; readonly qualifier: string | null } {
  const liability = accountType === "credit_card" || accountType === "loan";
  if (liability && balanceMinor < 0) {
    return { figure: money(-balanceMinor, currencyCode), qualifier: "owing" };
  }
  if (liability && balanceMinor > 0) {
    return {
      figure: money(balanceMinor, currencyCode),
      qualifier: "in credit",
    };
  }
  if (!liability && balanceMinor < 0) {
    return {
      figure: money(balanceMinor, currencyCode),
      qualifier: "overdrawn",
    };
  }
  return { figure: money(balanceMinor, currencyCode), qualifier: null };
}

/** A calendar date, spoken the calm way ("3 September"). */
export function financeDate(iso: string, locale = "en-AU"): string {
  const [year, month, day] = iso.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * The sentence a total prints when other currencies were left out of it.
 *
 * Never `null` silently: a surface that has excluded money either prints this or
 * prints every currency, and there is no third option in which the exclusion
 * goes unsaid.
 */
export function exclusionNote(
  excluded: readonly SerializedCurrencyTotal[],
): string | null {
  if (excluded.length === 0) return null;
  const parts = excluded.map(
    (entry) =>
      `${money(entry.minorUnits, entry.currencyCode)} in ${entry.count} ` +
      `${entry.count === 1 ? "transaction" : "transactions"}`,
  );
  const list =
    parts.length === 1
      ? parts[0]!
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${list}, shown separately because DalyHub never converts between currencies.`;
}

/** What an import preview row means, in one phrase. */
export const IMPORT_OUTCOME_LABELS: Readonly<Record<ImportRowOutcome, string>> =
  {
    new: "Will be added",
    existing: "Already imported",
    invalid: "Cannot be read",
  };
