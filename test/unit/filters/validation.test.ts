/**
 * DS-07 — type-aware clause validation.
 *
 * Proves validation enforces the FIELD's declared value type (not just operator
 * arity): it rejects inappropriate scalar values (boolean-for-text,
 * "banana"-for-number, number-for-enum, bad dates, non-finite numbers, invalid
 * ranges) and rejects operator overrides that widen a field beyond its type, while
 * accepting a valid example for every supported type. Also proves the URL decoder
 * drops such malformed clauses defensively.
 */

import { describe, expect, it } from "vitest";

import {
  isStrictCalendarDate,
  operatorsForField,
  readFilterExpression,
  sanitiseExpression,
  validateClause,
  valueMatchesFieldType,
} from "~/shared/filters";
import type { FilterFieldRegistry } from "~/shared/filters";

const FIELDS: FilterFieldRegistry = [
  { id: "title", label: "Title", type: "text" },
  { id: "age", label: "Age", type: "number" },
  { id: "due", label: "Due", type: "date" },
  {
    id: "status",
    label: "Status",
    type: "enum",
    options: [
      { value: "open", label: "Open" },
      { value: "done", label: "Done" },
    ],
  },
  {
    id: "owner",
    label: "Owner",
    type: "reference",
    options: [{ value: "u1", label: "Aidan" }],
  },
  {
    id: "tags",
    label: "Tags",
    type: "multi-enum",
    options: [{ value: "a", label: "A" }],
  },
  { id: "starred", label: "Starred", type: "boolean" },
];

function valid(field: string, operator: string, value?: unknown): boolean {
  return validateClause(FIELDS, {
    field,
    operator: operator as never,
    value: value as never,
  }).valid;
}

describe("isStrictCalendarDate", () => {
  it("accepts real YYYY-MM-DD dates and rejects everything else", () => {
    expect(isStrictCalendarDate("2026-07-18")).toBe(true);
    expect(isStrictCalendarDate("2026-02-31")).toBe(false); // impossible day
    expect(isStrictCalendarDate("2026-13-01")).toBe(false); // impossible month
    expect(isStrictCalendarDate("2026-7-8")).toBe(false); // not zero-padded
    expect(isStrictCalendarDate("2026-07-18T00:00:00Z")).toBe(false); // timestamp
    expect(isStrictCalendarDate("banana")).toBe(false);
    expect(isStrictCalendarDate(20260718)).toBe(false);
    expect(isStrictCalendarDate(true)).toBe(false);
  });
});

describe("text", () => {
  it("accepts a non-empty string; rejects boolean/number/empty", () => {
    expect(valid("title", "contains", "hi")).toBe(true);
    expect(valid("title", "contains", true)).toBe(false);
    expect(valid("title", "contains", 5)).toBe(false);
    expect(valid("title", "contains", "")).toBe(false);
  });
});

describe("number", () => {
  it("accepts finite numbers; rejects text, NaN and Infinity", () => {
    expect(valid("age", "gt", 5)).toBe(true);
    expect(valid("age", "lt", 0)).toBe(true);
    expect(valid("age", "equals", 42)).toBe(true);
    expect(valid("age", "gt", "banana")).toBe(false);
    expect(valid("age", "gt", Number.NaN)).toBe(false);
    expect(valid("age", "gt", Number.POSITIVE_INFINITY)).toBe(false);
    expect(valid("age", "gt", Number.NEGATIVE_INFINITY)).toBe(false);
    expect(valid("age", "gt", true)).toBe(false);
  });

  it("validates numeric ranges as finite", () => {
    expect(valid("age", "between", { from: "1", to: "9" })).toBe(true);
    expect(valid("age", "between", { from: "banana", to: "9" })).toBe(false);
    expect(valid("age", "between", { from: "1", to: "" })).toBe(false);
  });
});

describe("date", () => {
  it("requires valid calendar dates for scalar and range operators", () => {
    expect(valid("due", "on", "2026-07-18")).toBe(true);
    expect(valid("due", "before", "2026-01-01")).toBe(true);
    expect(valid("due", "on", "banana")).toBe(false);
    expect(valid("due", "on", true)).toBe(false);
    expect(valid("due", "on", 20260718)).toBe(false);
    expect(valid("due", "on", "2026-02-31")).toBe(false);
    expect(
      valid("due", "between", { from: "2026-01-01", to: "2026-12-31" }),
    ).toBe(true);
    expect(valid("due", "between", { from: "2026-01-01", to: "nope" })).toBe(
      false,
    );
  });
});

describe("enum / reference", () => {
  it("requires string scalars and non-empty string lists", () => {
    expect(valid("status", "is", "open")).toBe(true);
    expect(valid("status", "is", 5)).toBe(false);
    expect(valid("status", "is", true)).toBe(false);
    expect(valid("status", "is_any_of", ["open", "done"])).toBe(true);
    expect(valid("status", "is_any_of", [])).toBe(false);
    expect(valid("owner", "is", "u1")).toBe(true);
  });

  it("retains unknown option values for forward compatibility (type still enforced)", () => {
    // Documented policy: an unknown string option value is kept (options may be
    // partial/lazy); only the value TYPE is enforced.
    expect(valid("status", "is", "archived-later")).toBe(true);
  });
});

describe("multi-enum", () => {
  it("requires non-empty string arrays for membership operators", () => {
    expect(valid("tags", "is_any_of", ["a"])).toBe(true);
    expect(valid("tags", "is_any_of", [])).toBe(false);
    expect(valid("tags", "is_empty")).toBe(true);
  });
});

describe("boolean", () => {
  it("uses no-value operators only", () => {
    expect(valid("starred", "is_true")).toBe(true);
    expect(valid("starred", "is_false")).toBe(true);
    // A value on a no-value operator is invalid.
    expect(valid("starred", "is_true", true)).toBe(false);
  });
});

describe("operator overrides", () => {
  it("allows narrowing to a subset of the type’s operators", () => {
    expect(
      operatorsForField({
        id: "t",
        label: "T",
        type: "text",
        operators: ["contains"],
      }),
    ).toEqual(["contains"]);
  });

  it("throws in development when an override widens beyond the field type", () => {
    expect(() =>
      operatorsForField({
        id: "t",
        label: "T",
        type: "text",
        operators: ["between"],
      }),
    ).toThrow(/narrow/i);
  });
});

describe("valueMatchesFieldType is exported for query-layer reuse", () => {
  it("gates values by field type", () => {
    const number = FIELDS[1];
    expect(valueMatchesFieldType(number, "gt", 5)).toBe(true);
    expect(valueMatchesFieldType(number, "gt", "banana")).toBe(false);
  });
});

describe("defensive URL decode", () => {
  it("drops a malformed number clause restored from the URL", () => {
    const params = new URLSearchParams();
    params.set("fv", "1");
    params.append("f", "age:gt:" + JSON.stringify("banana"));
    params.append("f", "age:gt:" + JSON.stringify(7));
    const restored = readFilterExpression(params, FIELDS);
    expect(restored.clauses).toHaveLength(1);
    expect(restored.clauses[0].value).toBe(7);
  });

  it("sanitiseExpression removes type-invalid clauses", () => {
    const result = sanitiseExpression(FIELDS, {
      mode: "and",
      clauses: [
        { id: "0", field: "age", operator: "gt", value: "banana" as never },
        { id: "1", field: "title", operator: "contains", value: "ok" },
      ],
    });
    expect(result.clauses).toHaveLength(1);
    expect(result.clauses[0].field).toBe("title");
  });
});
