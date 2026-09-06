/**
 * V2.12 FIN-01 — the PURE pass: a parsed CSV plus a mapping become candidate
 * rows, with the sign convention applied and every failure named.
 *
 * This is the whole translation from "what the bank wrote" to "what DalyHub
 * stores", and it is a pure function so that every bank's odd shape can be
 * pinned by a test with no database, no clock and no browser.
 *
 * **The sign convention is applied HERE and nowhere else.** A `debit`/`credit`
 * pair becomes one signed amount at this boundary, and nothing downstream knows
 * the file had two columns. An adapter never invents its own semantics; it
 * translates INTO the one convention (ADR-120 decision 1).
 */

import {
  MAX_MONEY_MINOR_UNITS,
  MoneyValidationError,
  parseMoneyToMinorUnits,
} from "~/kernel/money";

import type { CsvTable } from "./finance-csv";
import { parseCsvDate, type CsvMapping } from "./finance-csv-mapping";
import { normalisePayee, proposeDisplayPayee } from "./finance-fingerprint";
import type { ImportRowProblem } from "./finance-import";

/** One candidate row, or the reason it is not one. */
export interface MappedRow {
  /** 0-based index among the file's DATA rows. */
  readonly index: number;
  /** 1-based source line. */
  readonly line: number;
  readonly sourceDescription: string;
  /** Null when the row is invalid. */
  readonly occurredOn: string | null;
  readonly amountMinor: number | null;
  readonly payeeDisplay: string | null;
  readonly payeeKey: string | null;
  readonly sourceTransactionId: string | null;
  /** The row's balance cell, where the mapping named one and it parsed. */
  readonly balanceMinor: number | null;
  readonly problem: ImportRowProblem | null;
}

function cell(row: readonly string[], index: number): string {
  return (row[index] ?? "").trim();
}

/**
 * Parse an amount cell in a currency, returning `undefined` for a blank cell and
 * throwing nothing — a malformed amount is a NAMED problem on the row, not an
 * exception that takes the whole file down. One bad row must not cost the owner
 * the other 1,999.
 */
function amountCell(
  value: string,
  currencyCode: string,
): number | null | "invalid" | "too_large" {
  const cleaned = value.replace(/[()]/g, (match) => (match === "(" ? "-" : ""));
  if (cleaned.trim() === "") return null;
  try {
    const minor = parseMoneyToMinorUnits(cleaned, currencyCode, "amount");
    if (minor === null) return null;
    if (Math.abs(minor) > MAX_MONEY_MINOR_UNITS) return "too_large";
    return minor;
  } catch (cause) {
    if (cause instanceof MoneyValidationError) {
      return cause.message.includes("too large") ? "too_large" : "invalid";
    }
    return "invalid";
  }
}

/**
 * Map every data row of a parsed file through a mapping.
 *
 * `headerRows` leading rows are skipped. A row with fewer columns than the
 * mapping needs is `short_row` rather than a silent empty value, because a
 * ragged file usually means the wrong file.
 */
export function mapCsvRows(
  table: CsvTable,
  mapping: CsvMapping,
  currencyCode: string,
): readonly MappedRow[] {
  const needed = Math.max(
    mapping.date,
    mapping.description,
    mapping.amount.kind === "single"
      ? mapping.amount.column
      : Math.max(mapping.amount.debitColumn, mapping.amount.creditColumn),
    mapping.sourceId ?? 0,
    mapping.balance ?? 0,
  );

  const out: MappedRow[] = [];
  for (let i = mapping.headerRows; i < table.rows.length; i += 1) {
    const row = table.rows[i]!;
    const line = table.lines[i]!;
    const index = i - mapping.headerRows;
    const sourceDescription = cell(row, mapping.description);

    const base = {
      index,
      line,
      sourceDescription,
      occurredOn: null,
      amountMinor: null,
      payeeDisplay: null,
      payeeKey: null,
      sourceTransactionId: null,
      balanceMinor: null,
    } as const;

    if (row.length <= needed) {
      out.push({ ...base, problem: "short_row" });
      continue;
    }

    const dateCell = cell(row, mapping.date);
    if (dateCell === "") {
      out.push({ ...base, problem: "no_date" });
      continue;
    }
    const occurredOn = parseCsvDate(dateCell, mapping.dateFormat);
    if (occurredOn === null) {
      out.push({ ...base, problem: "bad_date" });
      continue;
    }

    let amountMinor: number;
    if (mapping.amount.kind === "single") {
      const parsed = amountCell(cell(row, mapping.amount.column), currencyCode);
      if (parsed === null) {
        out.push({ ...base, occurredOn, problem: "no_amount" });
        continue;
      }
      if (parsed === "invalid") {
        out.push({ ...base, occurredOn, problem: "bad_amount" });
        continue;
      }
      if (parsed === "too_large") {
        out.push({ ...base, occurredOn, problem: "amount_too_large" });
        continue;
      }
      amountMinor = mapping.amount.invert ? -parsed : parsed;
    } else {
      const debit = amountCell(
        cell(row, mapping.amount.debitColumn),
        currencyCode,
      );
      const credit = amountCell(
        cell(row, mapping.amount.creditColumn),
        currencyCode,
      );
      if (debit === "invalid" || credit === "invalid") {
        out.push({ ...base, occurredOn, problem: "bad_amount" });
        continue;
      }
      if (debit === "too_large" || credit === "too_large") {
        out.push({ ...base, occurredOn, problem: "amount_too_large" });
        continue;
      }
      // A row with a figure in BOTH columns is ambiguous, and guessing which one
      // the bank meant is exactly the invention this boundary refuses. Zero in
      // one column beside a real figure in the other is not ambiguous, though —
      // some exports write 0.00 rather than blank.
      const debitReal = debit !== null && debit !== 0;
      const creditReal = credit !== null && credit !== 0;
      if (debitReal && creditReal) {
        out.push({ ...base, occurredOn, problem: "both_debit_and_credit" });
        continue;
      }
      if (!debitReal && !creditReal) {
        out.push({ ...base, occurredOn, problem: "no_amount" });
        continue;
      }
      if (debitReal) {
        // A debit is money OUT, and money out is negative. When the file writes
        // debits positive (which most do), DalyHub negates.
        const magnitude = debit as number;
        amountMinor = mapping.amount.debitPositive ? -magnitude : magnitude;
      } else {
        const magnitude = credit as number;
        amountMinor = Math.abs(magnitude);
      }
    }

    if (sourceDescription === "") {
      out.push({ ...base, occurredOn, amountMinor, problem: "no_description" });
      continue;
    }

    const sourceIdCell =
      mapping.sourceId === null ? "" : cell(row, mapping.sourceId);
    const balanceParsed =
      mapping.balance === null
        ? null
        : amountCell(cell(row, mapping.balance), currencyCode);

    out.push({
      index,
      line,
      sourceDescription: sourceDescription.slice(0, 512),
      occurredOn,
      amountMinor,
      payeeDisplay: proposeDisplayPayee(sourceDescription),
      payeeKey: normalisePayee(sourceDescription),
      sourceTransactionId:
        sourceIdCell === "" ? null : sourceIdCell.slice(0, 128),
      balanceMinor: typeof balanceParsed === "number" ? balanceParsed : null,
      problem: null,
    });
  }
  return out;
}

/** The rows that parsed cleanly, in file order. */
export function validRows(rows: readonly MappedRow[]): readonly MappedRow[] {
  return rows.filter((row) => row.problem === null);
}
