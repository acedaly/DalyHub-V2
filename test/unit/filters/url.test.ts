/**
 * DS-07 — the Filter URL contract.
 *
 * Proves encode/decode round-trips (including punctuation, spaces, Unicode and
 * URL-reserved characters), that unrelated params — including repeated `drawer`
 * params from DS-03 — are preserved, that malformed/unknown/oversized/excess input
 * fails safely, that empty state removes URL residue, and that equivalent states
 * produce deterministic URLs.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_CLAUSES,
  MAX_ENCODED_CLAUSE_LENGTH,
  decodeClause,
  encodeClause,
  expressionsEqual,
  readFilterExpression,
  writeFilterExpression,
} from "~/shared/filters";
import type { FilterExpression, FilterFieldRegistry } from "~/shared/filters";

const FIELDS: FilterFieldRegistry = [
  { id: "title", label: "Title", type: "text" },
  { id: "type", label: "Type", type: "enum", options: [] },
  { id: "tags", label: "Tags", type: "multi-enum", options: [] },
  { id: "progress", label: "Progress", type: "number" },
  { id: "due", label: "Due", type: "date" },
];

function roundTrip(expression: FilterExpression): FilterExpression {
  const written = writeFilterExpression(new URLSearchParams(), expression);
  // Serialise to a string and back, exactly as a browser/router would.
  const reparsed = new URLSearchParams(written.toString());
  return readFilterExpression(reparsed, FIELDS);
}

describe("clause encode/decode", () => {
  it("encodes no-value operators without a value segment", () => {
    expect(encodeClause({ id: "1", field: "due", operator: "is_empty" })).toBe(
      "due:is_empty",
    );
    expect(decodeClause("due:is_empty")).toEqual({
      field: "due",
      operator: "is_empty",
    });
  });

  it("round-trips scalar, list and range values", () => {
    expect(
      decodeClause(
        encodeClause({
          id: "1",
          field: "title",
          operator: "contains",
          value: "hi there",
        }),
      ),
    ).toMatchObject({ value: "hi there" });
    expect(
      decodeClause(
        encodeClause({
          id: "1",
          field: "tags",
          operator: "is_any_of",
          value: ["a", "b"],
        }),
      ),
    ).toMatchObject({ value: ["a", "b"] });
    expect(
      decodeClause(
        encodeClause({
          id: "1",
          field: "progress",
          operator: "between",
          value: { from: "1", to: "9" },
        }),
      ),
    ).toMatchObject({ value: { from: "1", to: "9" } });
  });
});

describe("full URL round-trip", () => {
  it("restores an AND expression", () => {
    const expr: FilterExpression = {
      mode: "and",
      clauses: [
        { id: "0", field: "type", operator: "is", value: "task" },
        { id: "1", field: "title", operator: "contains", value: "run" },
      ],
    };
    expect(expressionsEqual(roundTrip(expr), expr)).toBe(true);
  });

  it("restores an OR expression and its mode", () => {
    const expr: FilterExpression = {
      mode: "or",
      clauses: [
        { id: "0", field: "title", operator: "contains", value: "a" },
        { id: "1", field: "title", operator: "contains", value: "b" },
      ],
    };
    const back = roundTrip(expr);
    expect(back.mode).toBe("or");
    expect(expressionsEqual(back, expr)).toBe(true);
  });

  it("round-trips punctuation, spaces, Unicode and reserved characters", () => {
    const value = "a & b, c=d? é 🚀 / #x %20";
    const expr: FilterExpression = {
      mode: "and",
      clauses: [{ id: "0", field: "title", operator: "contains", value }],
    };
    const back = roundTrip(expr);
    expect(back.clauses[0].value).toBe(value);
  });
});

describe("parameter preservation & determinism", () => {
  it("preserves unrelated params and repeated drawer params", () => {
    const params = new URLSearchParams(
      "status=active&drawer=project%3Aa&drawer=goal%3Ab",
    );
    const next = writeFilterExpression(params, {
      mode: "and",
      clauses: [{ id: "0", field: "type", operator: "is", value: "task" }],
    });
    expect(next.get("status")).toBe("active");
    expect(next.getAll("drawer")).toEqual(["project:a", "goal:b"]);
    expect(next.getAll("f")).toHaveLength(1);
  });

  it("produces a deterministic URL for equivalent states", () => {
    const expr: FilterExpression = {
      mode: "and",
      clauses: [{ id: "x", field: "type", operator: "is", value: "task" }],
    };
    const a = writeFilterExpression(
      new URLSearchParams("q=1"),
      expr,
    ).toString();
    const b = writeFilterExpression(new URLSearchParams("q=1"), {
      ...expr,
      clauses: [{ ...expr.clauses[0], id: "different" }],
    }).toString();
    expect(a).toBe(b);
  });

  it("empty expression removes all filter residue but keeps other params", () => {
    const params = new URLSearchParams(
      "fv=1&f=type%3Ais%3A%22task%22&fmode=or&keep=yes",
    );
    const next = writeFilterExpression(params, { mode: "and", clauses: [] });
    expect(next.get("keep")).toBe("yes");
    expect(next.getAll("f")).toHaveLength(0);
    expect(next.get("fv")).toBeNull();
    expect(next.get("fmode")).toBeNull();
  });
});

describe("safety & bounds", () => {
  it("ignores an unknown version wholesale", () => {
    const params = new URLSearchParams('fv=9&f=type:is:"task"');
    expect(readFilterExpression(params, FIELDS).clauses).toHaveLength(0);
  });

  it("drops malformed, unknown-field and unknown-operator clauses", () => {
    const params = new URLSearchParams();
    params.set("fv", "1");
    params.append("f", "title:contains:not json[[");
    params.append("f", "ghost:is:" + JSON.stringify("x"));
    params.append("f", "title:bogusop:" + JSON.stringify("x"));
    params.append("f", "type:is:" + JSON.stringify("task"));
    expect(readFilterExpression(params, FIELDS).clauses).toHaveLength(1);
  });

  it("rejects an oversized encoded clause", () => {
    expect(
      decodeClause(
        "title:contains:" +
          JSON.stringify("x".repeat(MAX_ENCODED_CLAUSE_LENGTH)),
      ),
    ).toBeNull();
  });

  it("caps the number of clauses read from the URL", () => {
    const params = new URLSearchParams();
    params.set("fv", "1");
    for (let i = 0; i < MAX_CLAUSES + 10; i += 1) {
      params.append("f", "title:contains:" + JSON.stringify(`v${i}`));
    }
    expect(
      readFilterExpression(params, FIELDS).clauses.length,
    ).toBeLessThanOrEqual(MAX_CLAUSES);
  });

  it("does not deserialise objects into anything but plain value shapes", () => {
    // A JSON object that isn't a {from,to} range still decodes as an object, but
    // validation rejects it for the operator, so it is dropped on read.
    const params = new URLSearchParams();
    params.set("fv", "1");
    params.append("f", "title:contains:" + JSON.stringify({ evil: true }));
    expect(readFilterExpression(params, FIELDS).clauses).toHaveLength(0);
  });
});
