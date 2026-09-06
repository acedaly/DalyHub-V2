/**
 * V2.12 FIN-01 — a BOUNDED CSV reader for untrusted files.
 *
 * ## Why DalyHub writes this
 *
 * [`OPEN_SOURCE_POLICY.md`] prefers reuse, and this was measured rather than
 * assumed. The property that matters here is not "parses CSV" — it is
 * **bounded**: a hard ceiling on bytes, rows, columns, field length and total
 * cells, applied DURING the scan so a hostile file cannot become large before it
 * is refused. Every general-purpose parser would still need that wrapper,
 * because its own limits are advisory or absent. The format DalyHub must accept
 * is RFC 4180 plus the two variations every real bank export has (CRLF, and a
 * UTF-8 BOM), which is a character scanner rather than a project.
 *
 * There is precedent in this repository for exactly this trade: the export ZIP
 * writer (`~/platform/export/zip.ts`) and the restore ZIP reader
 * (`~/platform/restore/zip-reader.ts`) are both written to the published format
 * under the same reasoning.
 *
 * ## The input is hostile until proven otherwise
 *
 * Every bound below exists because someone will one day upload the wrong file:
 *
 *   - **Bytes** ({@link CSV_MAX_BYTES}) refused before decoding.
 *   - **Encoding** — `TextDecoder` with `fatal: true`, so invalid UTF-8 is a
 *     named refusal rather than mojibake in the owner's ledger.
 *   - **Rows, columns, field length and total cells** checked DURING the scan,
 *     so a 2,000 × 64 file is refused as it is read, not after it is built.
 *   - **Nothing is executed, interpreted or evaluated.** This module returns
 *     strings.
 *
 * ## Formula injection
 *
 * DalyHub **never writes CSV**, so there is no sink: a cell beginning `=`, `+`,
 * `@` or a control character is stored as the text it is and rendered escaped by
 * React. The owner's data is not mangled to defend a hazard that does not exist
 * here, and the absence of the sink is asserted by a test that fails if any
 * Finance route sets a `text/csv` content type.
 *
 * Pure: no storage, no clock, no JSX.
 */

/** The largest CSV DalyHub will read. A twelve-month statement is ~100 KB. */
export const CSV_MAX_BYTES = 2 * 1024 * 1024;

/** The most data rows one file may contribute. */
export const CSV_MAX_ROWS = 2000;

/** The most columns one row may hold. Wider than any statement. */
export const CSV_MAX_COLUMNS = 64;

/** The most characters one field may hold. A bank description is under 100. */
export const CSV_MAX_FIELD_LENGTH = 512;

/** The most cells one file may hold, checked as the scan proceeds. */
export const CSV_MAX_CELLS = CSV_MAX_ROWS * CSV_MAX_COLUMNS;

/** Why a CSV was refused. A closed vocabulary, so the message is a lookup. */
export type CsvRefusalReason =
  | "empty"
  | "too_many_bytes"
  | "not_utf8"
  | "too_many_rows"
  | "too_many_columns"
  | "field_too_long"
  | "too_many_cells"
  | "unterminated_quote";

/** A CSV that could not be read, with the reason and where it happened. */
export class CsvParseError extends Error {
  constructor(
    readonly reason: CsvRefusalReason,
    message: string,
    /** The 1-based line the scan was on, where the reason has a place. */
    readonly line: number | null = null,
  ) {
    super(message);
    this.name = "CsvParseError";
  }
}

/** The owner-facing sentence for each refusal. No jargon, no byte counts. */
export const CSV_REFUSAL_MESSAGES: Readonly<Record<CsvRefusalReason, string>> =
  {
    empty: "That file has no rows in it.",
    too_many_bytes: `That file is larger than ${CSV_MAX_BYTES / (1024 * 1024)} MB. Export a shorter date range from your bank.`,
    not_utf8:
      "DalyHub could not read that file’s characters. Re-export it from your bank as UTF-8 CSV.",
    too_many_rows: `That file has more than ${CSV_MAX_ROWS} rows. Export a shorter date range and import it in parts.`,
    too_many_columns: `That file has more than ${CSV_MAX_COLUMNS} columns, which is more than a bank statement has.`,
    field_too_long: `One of the values in that file is longer than ${CSV_MAX_FIELD_LENGTH} characters, which is more than a bank description holds.`,
    too_many_cells:
      "That file holds more values than DalyHub will read at once.",
    unterminated_quote:
      "That file ends inside a quoted value, so DalyHub cannot tell where the last row finishes.",
  };

/** A parsed CSV: rows of fields, in file order, with the line each came from. */
export interface CsvTable {
  /** Every row, in file order. A row is an array of field strings. */
  readonly rows: readonly (readonly string[])[];
  /** The 1-based source line each row started on, for owner-facing errors. */
  readonly lines: readonly number[];
  /** The widest row's column count. */
  readonly columnCount: number;
}

/**
 * Decode bytes as UTF-8, refusing invalid sequences and stripping a BOM.
 *
 * `fatal: true` is the decision: a statement whose characters DalyHub cannot
 * read is refused with a sentence the owner can act on, rather than imported
 * with replacement characters in the middle of a merchant's name.
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    throw new CsvParseError("empty", CSV_REFUSAL_MESSAGES.empty);
  }
  if (bytes.length > CSV_MAX_BYTES) {
    throw new CsvParseError(
      "too_many_bytes",
      CSV_REFUSAL_MESSAGES.too_many_bytes,
    );
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CsvParseError("not_utf8", CSV_REFUSAL_MESSAGES.not_utf8);
  }
  // A UTF-8 BOM is present in most Windows-exported bank CSVs and is not part of
  // the first field's value.
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Parse decoded CSV text into rows, to RFC 4180 with CRLF and LF line endings.
 *
 * A field may be quoted; inside quotes, `""` is a literal quote and a raw
 * newline is part of the value. A row of one empty unquoted field is a blank
 * line and is dropped — bank exports habitually end with one, and a blank row is
 * not a transaction.
 */
export function parseCsv(text: string): CsvTable {
  const rows: string[][] = [];
  const lines: number[] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  let cells = 0;
  let line = 1;
  let rowStartLine = 1;
  let columnCount = 0;

  const endField = () => {
    if (field.length > CSV_MAX_FIELD_LENGTH) {
      throw new CsvParseError(
        "field_too_long",
        CSV_REFUSAL_MESSAGES.field_too_long,
        rowStartLine,
      );
    }
    row.push(field);
    field = "";
    if (row.length > CSV_MAX_COLUMNS) {
      throw new CsvParseError(
        "too_many_columns",
        CSV_REFUSAL_MESSAGES.too_many_columns,
        rowStartLine,
      );
    }
    cells += 1;
    if (cells > CSV_MAX_CELLS) {
      throw new CsvParseError(
        "too_many_cells",
        CSV_REFUSAL_MESSAGES.too_many_cells,
        rowStartLine,
      );
    }
  };

  const endRow = () => {
    endField();
    // A trailing blank line is not a row.
    const blank = row.length === 1 && row[0] === "";
    if (!blank) {
      rows.push(row);
      lines.push(rowStartLine);
      if (row.length > columnCount) columnCount = row.length;
      if (rows.length > CSV_MAX_ROWS) {
        throw new CsvParseError(
          "too_many_rows",
          CSV_REFUSAL_MESSAGES.too_many_rows,
          rowStartLine,
        );
      }
    }
    row = [];
    rowStartLine = line;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        if (char === "\n") line += 1;
        field += char;
      }
      continue;
    }
    if (char === '"' && field.length === 0) {
      quoted = true;
      continue;
    }
    if (char === ",") {
      endField();
      continue;
    }
    if (char === "\r") {
      // Consume CRLF as one terminator; a lone CR is also a terminator, which is
      // what a very old export produces.
      if (text[i + 1] === "\n") i += 1;
      line += 1;
      endRow();
      continue;
    }
    if (char === "\n") {
      line += 1;
      endRow();
      continue;
    }
    field += char;
    if (field.length > CSV_MAX_FIELD_LENGTH) {
      throw new CsvParseError(
        "field_too_long",
        CSV_REFUSAL_MESSAGES.field_too_long,
        rowStartLine,
      );
    }
  }

  if (quoted) {
    throw new CsvParseError(
      "unterminated_quote",
      CSV_REFUSAL_MESSAGES.unterminated_quote,
      rowStartLine,
    );
  }
  // A file with no trailing newline still ends a row.
  if (field.length > 0 || row.length > 0) endRow();

  if (rows.length === 0) {
    throw new CsvParseError("empty", CSV_REFUSAL_MESSAGES.empty);
  }
  return { rows, lines, columnCount };
}

/** Read bytes straight through to a table. The one entry point callers use. */
export function readCsv(bytes: Uint8Array): CsvTable {
  return parseCsv(decodeCsvBytes(bytes));
}
