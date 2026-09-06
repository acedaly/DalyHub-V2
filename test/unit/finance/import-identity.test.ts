import { describe, expect, it } from "vitest";

import {
  assignFingerprints,
  looksLikeDuplicate,
  mapCsvRows,
  normalisePayee,
  parseCsv,
  parseCsvDate,
  proposeDisplayPayee,
  serialiseCsvMapping,
  validateCsvMapping,
  type CsvMapping,
} from "~/kernel/finance";
import { FinanceValidationError } from "~/kernel/finance";

/**
 * V2.12 FIN-01 — the pure half of "importing a statement twice does not
 * duplicate my money".
 *
 * Three modules, one question each:
 *
 *   - `normalisePayee` — do two spellings of one merchant agree, WITHOUT
 *     inventing merchant intelligence?
 *   - `assignFingerprints` — does the occurrence index count from zero within
 *     the FILE, which is the decision the whole release rests on?
 *   - `mapCsvRows` — does the sign convention get applied at the boundary and
 *     nowhere else, and is every failure NAMED rather than thrown?
 *
 * Everything here is pure, so every bank's odd shape is pinned with no database,
 * no clock and no browser.
 */

const AUD = "AUD";

describe("payee normalisation is conservative on purpose", () => {
  it("makes two spellings of one merchant agree on the merchant", () => {
    // The exact case the roadmap names: a card fragment and a suburb.
    expect(normalisePayee("WOOLWORTHS 1234 DUBBO")).toBe("WOOLWORTHS DUBBO");
    expect(normalisePayee("WOOLWORTHS DUBBO NSW")).toBe("WOOLWORTHS DUBBO NSW");
    // They agree on the merchant and the suburb, which is what the suggestion
    // and the fingerprint need. They are not made IDENTICAL, and that is the
    // boundary: this is a bounded normalisation, not merchant intelligence.
    expect(
      normalisePayee("WOOLWORTHS 1234 DUBBO").startsWith("WOOLWORTHS"),
    ).toBe(true);
  });

  it("strips ONE leading method prefix from the closed list", () => {
    expect(normalisePayee("EFTPOS NORTHWIND GROCERS")).toBe(
      "NORTHWIND GROCERS",
    );
    expect(normalisePayee("VISA PURCHASE SYNTH CAFE")).toBe("SYNTH CAFE");
    expect(normalisePayee("DIRECT DEBIT SYNTHETIC INSURANCE")).toBe(
      "SYNTHETIC INSURANCE",
    );
  });

  it("strips a prefix only at a WORD boundary, never mid-word", () => {
    /*
     * A REGRESSION test: a bare `startsWith` turned `PAYMENTS PLUS PTY LTD`
     * into `S PLUS PTY LTD`, because `PAYMENT` is on the prefix list. A merchant
     * whose name begins with a method word is a merchant, and eating the front
     * of its name would silently make it a different payee — a different
     * fingerprint group, and a category suggestion that never fires.
     */
    expect(normalisePayee("PAYMENTS PLUS PTY LTD")).toBe(
      "PAYMENTS PLUS PTY LTD",
    );
    expect(normalisePayee("TRANSFERWISE LTD")).toBe("TRANSFERWISE LTD");
    expect(normalisePayee("DEPOSITARY SERVICES")).toBe("DEPOSITARY SERVICES");
    // The prefix itself, at a real boundary, still goes.
    expect(normalisePayee("PAYMENT SYNTHETIC INSURANCE")).toBe(
      "SYNTHETIC INSURANCE",
    );
  });

  it("drops card and terminal fragments but keeps real short words", () => {
    expect(normalisePayee("SHOP X4821 NSW")).toBe("SHOP NSW");
    expect(normalisePayee("BP 2093 DUBBO")).toBe("BP DUBBO");
  });

  it("never returns an empty key, even for a description of only digits", () => {
    // An empty key would make every such row ONE payee, which would collapse
    // unrelated transactions into one fingerprint group.
    expect(normalisePayee("1234 5678")).not.toBe("");
    expect(normalisePayee("- . -")).not.toBe("");
  });

  it("caps the key, so a pathological description cannot grow an index entry", () => {
    expect(normalisePayee("ALPHA ".repeat(40)).length).toBeLessThanOrEqual(64);
  });

  it("proposes a DISPLAY payee that keeps the merchant's own words", () => {
    // Gentler than the key: this is what the owner reads, and a key is not a
    // name. The owner may rename it, and no import ever overwrites that.
    expect(proposeDisplayPayee("  EFTPOS   NORTHWIND  GROCERS 4821 ")).toBe(
      "EFTPOS NORTHWIND GROCERS 4821",
    );
    expect(proposeDisplayPayee("   ")).toBe("Unknown payee");
  });
});

describe("the occurrence index counts from zero WITHIN THE FILE", () => {
  const cafe = {
    occurredOn: "2026-09-04",
    amountMinor: -1250,
    payeeKey: "SYNTH CAFE",
    sourceTransactionId: null,
  };

  it("gives two identical rows in one file DIFFERENT fingerprints", () => {
    expect(assignFingerprints([cafe, cafe])).toEqual([
      "occ:2026-09-04:-1250:SYNTH CAFE:0",
      "occ:2026-09-04:-1250:SYNTH CAFE:1",
    ]);
  });

  it("gives the SAME file the SAME fingerprints every time", () => {
    /*
     * This is the whole of "importing it twice does not duplicate anything" on
     * the pure side. The rejected alternative — existing count plus position —
     * would produce 0,1 on the first pass and 2,3 on the second, and both would
     * be new. It passes the test above and fails this one.
     */
    expect(assignFingerprints([cafe, cafe])).toEqual(
      assignFingerprints([cafe, cafe]),
    );
  });

  it("counts each (date, amount, payee) group separately", () => {
    const other = { ...cafe, amountMinor: -1300 };
    const nextDay = { ...cafe, occurredOn: "2026-09-05" };
    expect(assignFingerprints([cafe, other, cafe, nextDay, other])).toEqual([
      "occ:2026-09-04:-1250:SYNTH CAFE:0",
      "occ:2026-09-04:-1300:SYNTH CAFE:0",
      "occ:2026-09-04:-1250:SYNTH CAFE:1",
      "occ:2026-09-05:-1250:SYNTH CAFE:0",
      "occ:2026-09-04:-1300:SYNTH CAFE:1",
    ]);
  });

  it("uses the bank's stable id where the file carries one, and ignores occurrence entirely", () => {
    const withId = { ...cafe, sourceTransactionId: "SYN-0001" };
    const alsoWithId = { ...cafe, sourceTransactionId: "SYN-0002" };
    expect(assignFingerprints([withId, alsoWithId])).toEqual([
      "id:SYN-0001",
      "id:SYN-0002",
    ]);
  });

  it("keeps id-bearing rows out of the occurrence counting", () => {
    const withId = { ...cafe, sourceTransactionId: "SYN-0001" };
    expect(assignFingerprints([withId, cafe, cafe])).toEqual([
      "id:SYN-0001",
      "occ:2026-09-04:-1250:SYNTH CAFE:0",
      "occ:2026-09-04:-1250:SYNTH CAFE:1",
    ]);
  });
});

describe("the mapping is a closed shape, and nothing in it is guessed", () => {
  const base = {
    v: 1,
    headerRows: 1,
    date: 0,
    dateFormat: "dmy",
    description: 1,
    amount: { kind: "single", column: 2, invert: false },
    sourceId: null,
    balance: null,
  };

  it("accepts a well-formed mapping and drops unknown keys", () => {
    const mapping = validateCsvMapping({
      ...base,
      // A key that accumulated in a stored blob. A closed shape drops it rather
      // than carrying it, because a config that accumulates keys becomes a
      // surface.
      formula: "=A1*2",
      script: "alert(1)",
    });
    expect(Object.keys(mapping).sort()).toEqual([
      "amount",
      "balance",
      "date",
      "dateFormat",
      "description",
      "headerRows",
      "sourceId",
      "v",
    ]);
    const serialised = serialiseCsvMapping(mapping);
    expect(serialised).not.toContain("=A1*2");
    expect(serialised).not.toContain("alert(1)");
    expect(serialised).not.toContain("formula");
  });

  it("refuses a column index outside the parser's own ceiling", () => {
    expect(() => validateCsvMapping({ ...base, date: -1 })).toThrow(
      FinanceValidationError,
    );
    expect(() => validateCsvMapping({ ...base, date: 999 })).toThrow(
      FinanceValidationError,
    );
  });

  it("refuses two roles pointing at ONE column", () => {
    // Two roles on one column is always a mistake, and it produces an import
    // where the date and the description are the same string.
    expect(() => validateCsvMapping({ ...base, description: 0 })).toThrow(
      /already used/,
    );
  });

  it("refuses a debit and a credit column that are the same", () => {
    expect(() =>
      validateCsvMapping({
        ...base,
        amount: { kind: "debit_credit", debitColumn: 2, creditColumn: 2 },
      }),
    ).toThrow(FinanceValidationError);
  });

  it("refuses an unknown date format rather than falling back to one", () => {
    expect(() =>
      validateCsvMapping({ ...base, dateFormat: "clever_guess" }),
    ).toThrow(FinanceValidationError);
  });

  it("serialises deterministically, so two saves of one mapping are identical", () => {
    const a = validateCsvMapping(base);
    const b = validateCsvMapping({ ...base, balance: null, sourceId: null });
    expect(serialiseCsvMapping(a)).toBe(serialiseCsvMapping(b));
  });
});

describe("a date is parsed under the format the owner NAMED, never guessed", () => {
  it("reads 03/04/2026 as 3 April under dmy and 4 March under mdy", () => {
    /*
     * The whole reason the format is a control rather than a heuristic. Nothing
     * in this repository could legitimately settle which one a file means, and
     * inventing an authority to avoid asking is how a year of dates goes quietly
     * wrong.
     */
    expect(parseCsvDate("03/04/2026", "dmy")).toBe("2026-04-03");
    expect(parseCsvDate("03/04/2026", "mdy")).toBe("2026-03-04");
  });

  it("reads each named format, and only that format", () => {
    expect(parseCsvDate("2026-09-03", "iso")).toBe("2026-09-03");
    expect(parseCsvDate("03.09.2026", "dmy_dot")).toBe("2026-09-03");
    expect(parseCsvDate("03/09/26", "dmy_short")).toBe("2026-09-03");
    expect(parseCsvDate("3 Sep 2026", "d_mon_y")).toBe("2026-09-03");
    expect(parseCsvDate("3-Sep-26", "d_mon_y")).toBe("2026-09-03");
    // Named `iso`, given `dmy`: null, never a silent second attempt.
    expect(parseCsvDate("03/09/2026", "iso")).toBeNull();
  });

  it("refuses a date that does not exist", () => {
    expect(parseCsvDate("30/02/2026", "dmy")).toBeNull();
    expect(parseCsvDate("2026-13-01", "iso")).toBeNull();
    expect(parseCsvDate("2027-02-29", "iso")).toBeNull();
  });

  it("accepts a real leap day", () => {
    expect(parseCsvDate("29/02/2028", "dmy")).toBe("2028-02-29");
  });
});

describe("the sign convention is applied at the mapping boundary, and nowhere else", () => {
  function map(csv: string, mapping: Partial<CsvMapping> = {}) {
    const full = validateCsvMapping({
      v: 1,
      headerRows: 1,
      date: 0,
      dateFormat: "dmy",
      description: 1,
      amount: { kind: "single", column: 2, invert: false },
      sourceId: null,
      balance: null,
      ...mapping,
    });
    return mapCsvRows(parseCsv(csv), full, AUD);
  }

  it("keeps a signed column's sign", () => {
    const rows = map("D,X,A\n03/09/2026,SHOP,-12.50\n04/09/2026,PAY,2500.00\n");
    expect(rows.map((row) => row.amountMinor)).toEqual([-1250, 250_000]);
  });

  it("inverts when the owner says the file writes spend positive", () => {
    const rows = map("D,X,A\n03/09/2026,SHOP,12.50\n", {
      amount: { kind: "single", column: 2, invert: true },
    });
    expect(rows[0]!.amountMinor).toBe(-1250);
  });

  it("collapses a debit/credit pair to ONE signed amount", () => {
    const rows = map(
      "D,X,DR,CR\n03/09/2026,SHOP,12.50,\n04/09/2026,PAY,,2500.00\n",
      {
        amount: {
          kind: "debit_credit",
          debitColumn: 2,
          creditColumn: 3,
          debitPositive: true,
        },
      },
    );
    // A debit is money OUT and money out is negative. Nothing downstream ever
    // learns that the file had two columns.
    expect(rows.map((row) => row.amountMinor)).toEqual([-1250, 250_000]);
  });

  it("treats a written 0.00 beside a real figure as an empty column, not a conflict", () => {
    const rows = map("D,X,DR,CR\n03/09/2026,SHOP,12.50,0.00\n", {
      amount: {
        kind: "debit_credit",
        debitColumn: 2,
        creditColumn: 3,
        debitPositive: true,
      },
    });
    expect(rows[0]!.problem).toBeNull();
    expect(rows[0]!.amountMinor).toBe(-1250);
  });

  it("refuses a row with a REAL figure in both columns rather than guessing", () => {
    const rows = map("D,X,DR,CR\n03/09/2026,SHOP,12.50,4.00\n", {
      amount: {
        kind: "debit_credit",
        debitColumn: 2,
        creditColumn: 3,
        debitPositive: true,
      },
    });
    expect(rows[0]!.problem).toBe("both_debit_and_credit");
  });

  it("reads a bracketed negative, which some exports use", () => {
    const rows = map("D,X,A\n03/09/2026,SHOP,(12.50)\n");
    expect(rows[0]!.amountMinor).toBe(-1250);
  });
});

describe("every mapping failure is NAMED, and costs only its own row", () => {
  function map(csv: string) {
    const mapping = validateCsvMapping({
      v: 1,
      headerRows: 1,
      date: 0,
      dateFormat: "dmy",
      description: 1,
      amount: { kind: "single", column: 2, invert: false },
      sourceId: null,
      balance: null,
    });
    return mapCsvRows(parseCsv(csv), mapping, AUD);
  }

  it("names each problem and keeps the good rows", () => {
    const rows = map(
      [
        "D,X,A",
        "03/09/2026,GOOD,-12.50",
        ",MISSING DATE,-1.00",
        "99/99/2026,BAD DATE,-1.00",
        "04/09/2026,NO AMOUNT,",
        "05/09/2026,NOT A NUMBER,twelve",
        "06/09/2026,,-1.00",
        "07/09/2026,SHORT",
        "08/09/2026,ALSO GOOD,-3.00",
        "",
      ].join("\n"),
    );
    expect(rows.map((row) => row.problem)).toEqual([
      null,
      "no_date",
      "bad_date",
      "no_amount",
      "bad_amount",
      "no_description",
      "short_row",
      null,
    ]);
    // One bad row must never cost the owner the other 1,999.
    expect(rows.filter((row) => row.problem === null)).toHaveLength(2);
  });

  it("numbers the DATA rows from zero and reports the SOURCE line", () => {
    const rows = map("D,X,A\n03/09/2026,ONE,-1.00\n04/09/2026,TWO,-2.00\n");
    expect(rows.map((row) => row.index)).toEqual([0, 1]);
    expect(rows.map((row) => row.line)).toEqual([2, 3]);
  });

  it("keeps the bank's verbatim description beside the normalised key", () => {
    const rows = map("D,X,A\n03/09/2026,EFTPOS NORTHWIND GROCERS 4821,-1.00\n");
    expect(rows[0]!.sourceDescription).toBe("EFTPOS NORTHWIND GROCERS 4821");
    expect(rows[0]!.payeeKey).toBe("NORTHWIND GROCERS");
    expect(rows[0]!.payeeDisplay).toBe("EFTPOS NORTHWIND GROCERS 4821");
  });

  it("does not let an INVALID row shift a later row's occurrence index", () => {
    /*
     * Fingerprints are assigned over the VALID rows only. If an invalid row
     * consumed an occurrence index, fixing that row in the bank's next export
     * would renumber every later row in its group — and every one of them would
     * import again as new.
     */
    const rows = map(
      [
        "D,X,A",
        "04/09/2026,SYNTH CAFE 001,-12.50",
        "99/99/2026,BROKEN,-12.50",
        "04/09/2026,SYNTH CAFE 001,-12.50",
        "",
      ].join("\n"),
    );
    const valid = rows.filter((row) => row.problem === null);
    expect(
      assignFingerprints(
        valid.map((row) => ({
          occurredOn: row.occurredOn!,
          amountMinor: row.amountMinor!,
          payeeKey: row.payeeKey!,
          sourceTransactionId: row.sourceTransactionId,
        })),
      ),
    ).toEqual([
      "occ:2026-09-04:-1250:SYNTH CAFE:0",
      "occ:2026-09-04:-1250:SYNTH CAFE:1",
    ]);
  });
});

describe("the suspicion rule tells a repeat purchase from a repeated ROW", () => {
  const existing = {
    occurredOn: "2026-09-04",
    amountMinor: -1250,
    payeeKey: "SYNTH CAFE",
  };

  it("does not suspect a different amount, or one outside the window", () => {
    expect(
      looksLikeDuplicate({ ...existing, amountMinor: -1300 }, existing),
    ).toBe(false);
    expect(
      looksLikeDuplicate({ ...existing, occurredOn: "2026-09-20" }, existing),
    ).toBe(false);
  });

  it("does not suspect the SAME day and the SAME payee, which the occurrence index owns", () => {
    // A third coffee is a third coffee. `occ:...:2` is correct and certain, and
    // asking the owner to confirm it every week would be friction with no value.
    expect(looksLikeDuplicate(existing, existing)).toBe(false);
  });

  it("suspects the same amount on a NEARBY day — one transaction, two routes", () => {
    expect(
      looksLikeDuplicate({ ...existing, occurredOn: "2026-09-06" }, existing),
    ).toBe(true);
  });

  it("suspects the same amount and day with a DIFFERENT payee — the description changed", () => {
    // The one case the fingerprint cannot see, because a changed description is
    // a changed key is a changed identity.
    expect(
      looksLikeDuplicate(
        { ...existing, payeeKey: "SYNTH CAFE DUBBO" },
        existing,
      ),
    ).toBe(true);
  });
});
