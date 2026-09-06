/**
 * V2.12 FIN-01 — the CSV column mapping: a CLOSED shape, and no guessing.
 *
 * A mapping says which column holds the date, which holds the description, how
 * the amount is expressed, and how the date is written. It is a small record of
 * integer column indexes and enumerated formats.
 *
 * **There is no expression, no formula language, no regex, no template and no
 * SQL fragment in a mapping**, and there never will be — ADR-059/082's
 * persisted-injection rule holds here as it does for Views and Reports. A
 * mapping is data the product interprets, not code it runs.
 *
 * ## Dates are never guessed
 *
 * `03/04/2026` is 3 April under `dmy` and 4 March under `mdy`, and DalyHub does
 * not decide which by locale, by filename, or by scanning the column for a value
 * above twelve. The owner picks; the preview renders the parsed dates in words
 * (`3 April 2026`) so an ambiguous choice is visible in the first row rather
 * than discovered in December. There is no owner-locale authority in this
 * repository that could legitimately settle it, and inventing one to avoid
 * asking is how a year of dates goes quietly wrong.
 *
 * ## Sign is never guessed either
 *
 * `invert` and `debitPositive` are explicit controls, and the preview shows the
 * resulting money-in and money-out totals, so a wrong choice is obvious on the
 * first screen rather than after 300 rows have landed.
 *
 * ## Scope
 *
 * A mapping is saved PER ACCOUNT, on `finance_account_details`. That is how a
 * person actually works — this account, this bank, this format — and it needs no
 * table. **The account is always chosen explicitly and is never inferred from a
 * filename.**
 *
 * Pure: no storage, no clock, no JSX.
 */

import { FinanceValidationError } from "./finance-errors";

/** The date formats a mapping may name. Closed, and each is unambiguous. */
export const CSV_DATE_FORMATS = [
  "iso",
  "dmy",
  "mdy",
  "dmy_dot",
  "dmy_short",
  "d_mon_y",
] as const;

export type CsvDateFormat = (typeof CSV_DATE_FORMATS)[number];

/** What each format looks like, for the picker. The owner reads these. */
export const CSV_DATE_FORMAT_LABELS: Readonly<Record<CsvDateFormat, string>> = {
  iso: "2026-09-03  (year-month-day)",
  dmy: "03/09/2026  (day/month/year)",
  mdy: "09/03/2026  (month/day/year)",
  dmy_dot: "03.09.2026  (day.month.year)",
  dmy_short: "03/09/26  (day/month/two-digit year)",
  d_mon_y: "3 Sep 2026  (day, month name, year)",
};

export function isCsvDateFormat(value: unknown): value is CsvDateFormat {
  return (
    typeof value === "string" &&
    (CSV_DATE_FORMATS as readonly string[]).includes(value)
  );
}

/** How the file expresses an amount. */
export type CsvAmountMapping =
  /** One signed column. `invert` flips it, for a file that writes spend positive. */
  | {
      readonly kind: "single";
      readonly column: number;
      readonly invert: boolean;
    }
  /**
   * Two columns, at most one populated per row. `debitPositive` says whether the
   * debit column's figure is written positive (it usually is), in which case
   * DalyHub negates it — because a debit is money OUT and money out is negative.
   */
  | {
      readonly kind: "debit_credit";
      readonly debitColumn: number;
      readonly creditColumn: number;
      readonly debitPositive: boolean;
    };

/** One saved column mapping. */
export interface CsvMapping {
  readonly v: 1;
  /** How many leading rows are headers. 0 when the file has none. */
  readonly headerRows: number;
  readonly date: number;
  readonly dateFormat: CsvDateFormat;
  readonly description: number;
  readonly amount: CsvAmountMapping;
  /** The bank's stable transaction id, where the file carries one. */
  readonly sourceId: number | null;
  /**
   * The running or closing balance column, where the file carries one.
   *
   * **Validation only.** It is never written and never becomes an authority: the
   * preview compares the file's final balance to the balance the rows would
   * produce and states the difference in words. A balance DalyHub could not
   * reproduce is information; a balance DalyHub silently adopted would hide a
   * missing row.
   */
  readonly balance: number | null;
}

/** The largest column index a mapping may name — the parser's own ceiling. */
export const CSV_MAPPING_MAX_COLUMN = 63;

function column(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new FinanceValidationError(field, "must be a column number");
  }
  if (value < 0 || value > CSV_MAPPING_MAX_COLUMN) {
    throw new FinanceValidationError(field, "is not a column in this file");
  }
  return value;
}

function optionalColumn(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  return column(value, field);
}

function flag(value: unknown, field: string): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "on" || value === "1") return true;
  if (value === "false" || value === "off" || value === "0" || value === "")
    return false;
  throw new FinanceValidationError(field, "must be yes or no");
}

/**
 * Validate an untrusted mapping — from a form, or from an account's stored JSON.
 *
 * Unknown keys are DROPPED rather than carried: a mapping is a closed shape, and
 * a stored blob that accumulated a key nobody reads is how a config becomes a
 * surface.
 */
export function validateCsvMapping(input: unknown): CsvMapping {
  if (typeof input !== "object" || input === null) {
    throw new FinanceValidationError("mapping", "must be a column mapping");
  }
  const raw = input as Record<string, unknown>;

  const headerRowsRaw = raw.headerRows ?? 1;
  const headerRows =
    typeof headerRowsRaw === "string"
      ? Number.parseInt(headerRowsRaw, 10)
      : headerRowsRaw;
  if (
    typeof headerRows !== "number" ||
    !Number.isInteger(headerRows) ||
    headerRows < 0 ||
    headerRows > 5
  ) {
    throw new FinanceValidationError(
      "headerRows",
      "must be between 0 and 5 rows",
    );
  }

  if (!isCsvDateFormat(raw.dateFormat)) {
    throw new FinanceValidationError("dateFormat", "must be a date format");
  }

  const amountRaw = raw.amount;
  if (typeof amountRaw !== "object" || amountRaw === null) {
    throw new FinanceValidationError("amount", "must say where the amount is");
  }
  const amountObj = amountRaw as Record<string, unknown>;
  let amount: CsvAmountMapping;
  if (amountObj.kind === "debit_credit") {
    const debitColumn = column(amountObj.debitColumn, "amount.debitColumn");
    const creditColumn = column(amountObj.creditColumn, "amount.creditColumn");
    if (debitColumn === creditColumn) {
      throw new FinanceValidationError(
        "amount.creditColumn",
        "must be a different column from the debit column",
      );
    }
    amount = {
      kind: "debit_credit",
      debitColumn,
      creditColumn,
      debitPositive: flag(
        amountObj.debitPositive ?? true,
        "amount.debitPositive",
      ),
    };
  } else if (amountObj.kind === "single") {
    amount = {
      kind: "single",
      column: column(amountObj.column, "amount.column"),
      invert: flag(amountObj.invert ?? false, "amount.invert"),
    };
  } else {
    throw new FinanceValidationError("amount", "must say where the amount is");
  }

  const mapping: CsvMapping = {
    v: 1,
    headerRows,
    date: column(raw.date, "date"),
    dateFormat: raw.dateFormat,
    description: column(raw.description, "description"),
    amount,
    sourceId: optionalColumn(raw.sourceId, "sourceId"),
    balance: optionalColumn(raw.balance, "balance"),
  };

  const used = new Set<number>();
  const claim = (index: number, field: string) => {
    if (used.has(index)) {
      throw new FinanceValidationError(
        field,
        "is already used by another column in this mapping",
      );
    }
    used.add(index);
  };
  claim(mapping.date, "date");
  claim(mapping.description, "description");
  if (mapping.amount.kind === "single") {
    claim(mapping.amount.column, "amount.column");
  } else {
    claim(mapping.amount.debitColumn, "amount.debitColumn");
    claim(mapping.amount.creditColumn, "amount.creditColumn");
  }
  if (mapping.sourceId !== null) claim(mapping.sourceId, "sourceId");
  if (mapping.balance !== null) claim(mapping.balance, "balance");

  return mapping;
}

/** Serialise a mapping for storage. Deterministic key order, so two saves of
 * one mapping are byte-identical. */
export function serialiseCsvMapping(mapping: CsvMapping): string {
  return JSON.stringify({
    v: mapping.v,
    headerRows: mapping.headerRows,
    date: mapping.date,
    dateFormat: mapping.dateFormat,
    description: mapping.description,
    amount:
      mapping.amount.kind === "single"
        ? {
            kind: "single",
            column: mapping.amount.column,
            invert: mapping.amount.invert,
          }
        : {
            kind: "debit_credit",
            debitColumn: mapping.amount.debitColumn,
            creditColumn: mapping.amount.creditColumn,
            debitPositive: mapping.amount.debitPositive,
          },
    sourceId: mapping.sourceId,
    balance: mapping.balance,
  });
}

/** Read a stored mapping, returning `null` when it is absent or unreadable —
 * an unreadable saved mapping is a pre-filled form the owner re-does, never an
 * error that stops them importing. */
export function readStoredCsvMapping(json: string | null): CsvMapping | null {
  if (json === null || json.trim() === "") return null;
  try {
    return validateCsvMapping(JSON.parse(json));
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

const MONTH_NAMES: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function iso(year: number, month: number, day: number): string | null {
  if (!isRealDate(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parse one cell under one NAMED format. Returns `null` when the cell does not
 * match — never a guess, and never a fallback to another format.
 *
 * A two-digit year is windowed at 2000–2099. A bank statement is not a
 * historical document, DalyHub was written in 2026, and a `dmy_short` file
 * carrying `95` is a file whose format the owner has mis-named — which the
 * preview shows them.
 */
export function parseCsvDate(
  value: string,
  format: CsvDateFormat,
): string | null {
  const text = value.trim();
  if (text.length === 0) return null;
  switch (format) {
    case "iso": {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
      return m ? iso(+m[1]!, +m[2]!, +m[3]!) : null;
    }
    case "dmy": {
      const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
      return m ? iso(+m[3]!, +m[2]!, +m[1]!) : null;
    }
    case "mdy": {
      const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
      return m ? iso(+m[3]!, +m[1]!, +m[2]!) : null;
    }
    case "dmy_dot": {
      const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
      return m ? iso(+m[3]!, +m[2]!, +m[1]!) : null;
    }
    case "dmy_short": {
      const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/.exec(text);
      return m ? iso(2000 + +m[3]!, +m[2]!, +m[1]!) : null;
    }
    case "d_mon_y": {
      const m = /^(\d{1,2})[\s-]([A-Za-z]{3,4})[\s-](\d{2}|\d{4})$/.exec(text);
      if (!m) return null;
      const month = MONTH_NAMES[m[2]!.toLowerCase()];
      if (month === undefined) return null;
      const yearRaw = +m[3]!;
      return iso(yearRaw < 100 ? 2000 + yearRaw : yearRaw, month, +m[1]!);
    }
  }
}
