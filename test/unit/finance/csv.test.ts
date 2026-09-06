import { describe, expect, it } from "vitest";

import {
  CSV_MAX_COLUMNS,
  CSV_MAX_FIELD_LENGTH,
  CSV_MAX_ROWS,
  CsvParseError,
  decodeCsvBytes,
  parseCsv,
  readCsv,
} from "~/kernel/finance";

/**
 * V2.12 FIN-01 — the bounded CSV reader, against every shape a real bank export
 * and a hostile file actually take.
 *
 * DalyHub writes this parser rather than adding a dependency, and the ONLY thing
 * that justifies that is this file: the format is small, the bounds are the
 * point, and the adversarial cases are pinned rather than hoped for.
 */

const encoder = new TextEncoder();

function bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

describe("the shapes a real bank export takes", () => {
  it("reads a plain file", () => {
    const table = parseCsv("Date,Description,Amount\n03/09/2026,SHOP,-12.50\n");
    expect(table.rows).toEqual([
      ["Date", "Description", "Amount"],
      ["03/09/2026", "SHOP", "-12.50"],
    ]);
    expect(table.columnCount).toBe(3);
  });

  it("reads CRLF line endings, which most Windows exports use", () => {
    const table = parseCsv("a,b\r\n1,2\r\n");
    expect(table.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("reads a lone CR, which a very old export produces", () => {
    expect(parseCsv("a,b\r1,2").rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a UTF-8 BOM rather than putting it in the first field", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes("a,b\n1,2\n")]);
    expect(readCsv(withBom).rows[0]).toEqual(["a", "b"]);
  });

  it("keeps a quoted field's commas", () => {
    expect(parseCsv('a,"one, two",c\n').rows[0]).toEqual([
      "a",
      "one, two",
      "c",
    ]);
  });

  it("reads a doubled quote as one literal quote", () => {
    expect(parseCsv('a,"she said ""hi""",c\n').rows[0]).toEqual([
      "a",
      'she said "hi"',
      "c",
    ]);
  });

  it("keeps a newline INSIDE a quoted field", () => {
    const table = parseCsv('a,"line one\nline two",c\n');
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]![1]).toBe("line one\nline two");
  });

  it("keeps empty fields, including a trailing one", () => {
    expect(parseCsv("a,,c,\n").rows[0]).toEqual(["a", "", "c", ""]);
  });

  it("reads a final row with no trailing newline", () => {
    expect(parseCsv("a,b\n1,2").rows).toHaveLength(2);
  });

  it("drops the trailing blank line every bank export ends with", () => {
    expect(parseCsv("a,b\n1,2\n\n").rows).toHaveLength(2);
  });

  it("keeps a RAGGED row rather than padding it, so the mapping can refuse it", () => {
    /*
     * A short row is usually the wrong file, and the mapping pass reports it as
     * `short_row` with its line number. Padding it here would turn a wrong file
     * into a silently wrong import.
     */
    const table = parseCsv("a,b,c\n1,2\n");
    expect(table.rows[1]).toEqual(["1", "2"]);
    expect(table.columnCount).toBe(3);
  });

  it("reports the SOURCE line of each row, so an error can be found in the file", () => {
    const table = parseCsv('h\n"a\nb"\nc\n');
    expect(table.lines).toEqual([1, 2, 4]);
  });
});

describe("the bounds, which are why this parser exists", () => {
  it("refuses an empty file", () => {
    expect(() => readCsv(new Uint8Array())).toThrow(CsvParseError);
    expect(() => parseCsv("")).toThrow(/no rows/);
  });

  it("refuses a file above the byte ceiling BEFORE decoding it", () => {
    const huge = new Uint8Array(3 * 1024 * 1024).fill(0x61);
    const error = (() => {
      try {
        decodeCsvBytes(huge);
        return null;
      } catch (cause) {
        return cause as CsvParseError;
      }
    })();
    expect(error?.reason).toBe("too_many_bytes");
  });

  it("refuses invalid UTF-8 rather than producing replacement characters", () => {
    // A lone continuation byte: not valid UTF-8 in any position.
    const error = (() => {
      try {
        decodeCsvBytes(new Uint8Array([0x61, 0x2c, 0xff, 0x0a]));
        return null;
      } catch (cause) {
        return cause as CsvParseError;
      }
    })();
    expect(error?.reason).toBe("not_utf8");
    expect(error?.message).toMatch(/UTF-8/);
  });

  it("refuses more rows than the ceiling", () => {
    const text = `h\n${"1\n".repeat(CSV_MAX_ROWS + 1)}`;
    const error = (() => {
      try {
        parseCsv(text);
        return null;
      } catch (cause) {
        return cause as CsvParseError;
      }
    })();
    expect(error?.reason).toBe("too_many_rows");
  });

  it("refuses more columns than the ceiling", () => {
    const error = (() => {
      try {
        parseCsv(`${"a,".repeat(CSV_MAX_COLUMNS + 2)}\n`);
        return null;
      } catch (cause) {
        return cause as CsvParseError;
      }
    })();
    expect(error?.reason).toBe("too_many_columns");
  });

  it("refuses a field longer than the ceiling, DURING the scan", () => {
    /*
     * During, not after: a single 50 MB field must be refused as it is read
     * rather than assembled first and measured second.
     */
    const error = (() => {
      try {
        parseCsv(`a,${"x".repeat(CSV_MAX_FIELD_LENGTH + 1)}\n`);
        return null;
      } catch (cause) {
        return cause as CsvParseError;
      }
    })();
    expect(error?.reason).toBe("field_too_long");
  });

  it("refuses a file that ends inside a quoted value", () => {
    const error = (() => {
      try {
        parseCsv('a,"never closed\n');
        return null;
      } catch (cause) {
        return cause as CsvParseError;
      }
    })();
    expect(error?.reason).toBe("unterminated_quote");
  });

  it("accepts a field EXACTLY at the ceiling", () => {
    // The bound is a refusal, not an off-by-one that costs a legitimate row.
    const table = parseCsv(`a,${"x".repeat(CSV_MAX_FIELD_LENGTH)}\n`);
    expect(table.rows[0]![1]).toHaveLength(CSV_MAX_FIELD_LENGTH);
  });

  it("accepts exactly the maximum number of rows", () => {
    const table = parseCsv(`h\n${"1\n".repeat(CSV_MAX_ROWS - 1)}`);
    expect(table.rows).toHaveLength(CSV_MAX_ROWS);
  });
});

describe("a formula-looking cell is TEXT, and is not mangled", () => {
  it("keeps a leading =, + and @ exactly as the bank wrote them", () => {
    /*
     * DalyHub never writes a CSV, so there is no sink for a formula to reach.
     * Mangling the owner's data to defend a hazard that does not exist would
     * corrupt a legitimate description — and `=BAKERY` is a legitimate
     * description. `finance-boundaries.test.ts` asserts the absent sink.
     */
    const table = parseCsv("a,=SUM(A1)\nb,+61 400 000 000\nc,@HOME\n");
    expect(table.rows.map((row) => row[1])).toEqual([
      "=SUM(A1)",
      "+61 400 000 000",
      "@HOME",
    ]);
  });
});
