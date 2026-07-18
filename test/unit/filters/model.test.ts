/**
 * DS-07 — the pure filter model: operators, validation and evaluation.
 *
 * Proves every supported value type/operator, AND/OR evaluation, null/missing
 * handling, deterministic ordering, non-mutation of source records, and safe
 * handling of invalid clauses — all without React.
 */

import { describe, expect, it } from "vitest";

import {
  EMPTY_EXPRESSION,
  OPERATORS_BY_TYPE,
  expressionsEqual,
  filterRecords,
  isValidValueForOperator,
  matchesExpression,
  operatorsForField,
  sanitiseExpression,
  validateClause,
} from "~/shared/filters";
import type { FilterExpression, FilterFieldRegistry } from "~/shared/filters";

interface Row {
  readonly title: string;
  readonly type: string;
  readonly status: string;
  readonly progress?: number;
  readonly due?: string;
  readonly tags: readonly string[];
  readonly starred: boolean;
}

const FIELDS: FilterFieldRegistry = [
  {
    id: "title",
    label: "Title",
    type: "text",
    accessor: (r) => (r as Row).title,
  },
  {
    id: "type",
    label: "Type",
    type: "enum",
    options: [],
    accessor: (r) => (r as Row).type,
  },
  {
    id: "status",
    label: "Status",
    type: "enum",
    options: [],
    accessor: (r) => (r as Row).status,
  },
  {
    id: "progress",
    label: "Progress",
    type: "number",
    accessor: (r) => (r as Row).progress,
  },
  { id: "due", label: "Due", type: "date", accessor: (r) => (r as Row).due },
  {
    id: "tags",
    label: "Tags",
    type: "multi-enum",
    options: [],
    accessor: (r) => (r as Row).tags,
  },
  {
    id: "starred",
    label: "Starred",
    type: "boolean",
    accessor: (r) => (r as Row).starred,
  },
];

const ROWS: readonly Row[] = [
  {
    title: "Alpha launch",
    type: "project",
    status: "in-progress",
    progress: 40,
    due: "2026-07-18",
    tags: ["launch"],
    starred: true,
  },
  {
    title: "Beta run",
    type: "task",
    status: "todo",
    progress: undefined,
    due: undefined,
    tags: ["health"],
    starred: false,
  },
  {
    title: "Gamma",
    type: "goal",
    status: "done",
    progress: 100,
    due: "2026-12-31",
    tags: ["launch", "focus"],
    starred: false,
  },
];

function clause(field: string, operator: string, value?: unknown) {
  return {
    id: `${field}-${operator}`,
    field,
    operator: operator as never,
    value: value as never,
  };
}

function and(...clauses: ReturnType<typeof clause>[]): FilterExpression {
  return { mode: "and", clauses };
}
function or(...clauses: ReturnType<typeof clause>[]): FilterExpression {
  return { mode: "or", clauses };
}

describe("operator registry", () => {
  it("pairs each value type with only type-appropriate operators", () => {
    expect(OPERATORS_BY_TYPE.boolean).toEqual(["is_true", "is_false"]);
    expect(OPERATORS_BY_TYPE.text).toContain("contains");
    expect(OPERATORS_BY_TYPE.text).not.toContain("between");
    expect(OPERATORS_BY_TYPE.number).toContain("between");
    expect(OPERATORS_BY_TYPE.date).toContain("on");
    expect(OPERATORS_BY_TYPE["multi-enum"]).toContain("is_any_of");
  });

  it("uses a field's operator override when present", () => {
    expect(
      operatorsForField({
        id: "x",
        label: "X",
        type: "text",
        operators: ["equals"],
      }),
    ).toEqual(["equals"]);
  });
});

describe("validation", () => {
  it("rejects unknown field, unknown operator and disallowed operator", () => {
    expect(validateClause(FIELDS, clause("nope", "is", "x")).reason).toBe(
      "unknown-field",
    );
    expect(validateClause(FIELDS, clause("title", "bogus", "x")).reason).toBe(
      "unknown-operator",
    );
    expect(
      validateClause(FIELDS, clause("title", "between", { from: "1", to: "2" }))
        .reason,
    ).toBe("operator-not-allowed");
  });

  it("checks value shape against operator arity", () => {
    expect(isValidValueForOperator("is_empty", undefined)).toBe(true);
    expect(isValidValueForOperator("is_empty", "x")).toBe(false);
    expect(isValidValueForOperator("contains", "")).toBe(false);
    expect(isValidValueForOperator("contains", "hi")).toBe(true);
    expect(isValidValueForOperator("is_any_of", [])).toBe(false);
    expect(isValidValueForOperator("is_any_of", ["a"])).toBe(true);
    expect(isValidValueForOperator("between", { from: "1", to: "" })).toBe(
      false,
    );
    expect(isValidValueForOperator("between", { from: "1", to: "2" })).toBe(
      true,
    );
  });

  it("sanitise drops invalid clauses and caps count", () => {
    const expr = and(
      clause("title", "contains", "a"),
      clause("nope", "is", "x"),
      clause("status", "is", "done"),
    );
    expect(sanitiseExpression(FIELDS, expr).clauses).toHaveLength(2);
  });
});

describe("evaluation — value types & operators", () => {
  it("text contains / equals / empty", () => {
    expect(
      matchesExpression(
        FIELDS,
        and(clause("title", "contains", "run")),
        ROWS[1],
      ),
    ).toBe(true);
    expect(
      matchesExpression(
        FIELDS,
        and(clause("title", "equals", "gamma")),
        ROWS[2],
      ),
    ).toBe(true);
    expect(
      matchesExpression(FIELDS, and(clause("progress", "is_empty")), ROWS[1]),
    ).toBe(true);
    expect(
      matchesExpression(
        FIELDS,
        and(clause("progress", "is_not_empty")),
        ROWS[0],
      ),
    ).toBe(true);
  });

  it("enum is / is_not / any_of / none_of", () => {
    expect(
      matchesExpression(FIELDS, and(clause("type", "is", "task")), ROWS[1]),
    ).toBe(true);
    expect(
      matchesExpression(FIELDS, and(clause("type", "is_not", "task")), ROWS[1]),
    ).toBe(false);
    expect(
      matchesExpression(
        FIELDS,
        and(clause("tags", "is_any_of", ["focus"])),
        ROWS[2],
      ),
    ).toBe(true);
    expect(
      matchesExpression(
        FIELDS,
        and(clause("tags", "is_none_of", ["launch"])),
        ROWS[0],
      ),
    ).toBe(false);
  });

  it("number equals / gt / lt / between", () => {
    expect(
      matchesExpression(FIELDS, and(clause("progress", "gt", 50)), ROWS[2]),
    ).toBe(true);
    expect(
      matchesExpression(FIELDS, and(clause("progress", "lt", 50)), ROWS[0]),
    ).toBe(true);
    expect(
      matchesExpression(
        FIELDS,
        and(clause("progress", "between", { from: "30", to: "50" })),
        ROWS[0],
      ),
    ).toBe(true);
    expect(
      matchesExpression(
        FIELDS,
        and(clause("progress", "equals", 100)),
        ROWS[2],
      ),
    ).toBe(true);
  });

  it("date on / before / after / between around UTC boundaries", () => {
    expect(
      matchesExpression(
        FIELDS,
        and(clause("due", "on", "2026-07-18")),
        ROWS[0],
      ),
    ).toBe(true);
    expect(
      matchesExpression(
        FIELDS,
        and(clause("due", "before", "2026-08-01")),
        ROWS[0],
      ),
    ).toBe(true);
    expect(
      matchesExpression(
        FIELDS,
        and(clause("due", "after", "2026-01-01")),
        ROWS[2],
      ),
    ).toBe(true);
    expect(
      matchesExpression(
        FIELDS,
        and(clause("due", "between", { from: "2026-07-01", to: "2026-07-31" })),
        ROWS[0],
      ),
    ).toBe(true);
    // A missing date never matches a value-bearing date operator.
    expect(
      matchesExpression(
        FIELDS,
        and(clause("due", "on", "2026-07-18")),
        ROWS[1],
      ),
    ).toBe(false);
    expect(
      matchesExpression(FIELDS, and(clause("due", "is_empty")), ROWS[1]),
    ).toBe(true);
  });

  it("boolean is_true / is_false", () => {
    expect(
      matchesExpression(FIELDS, and(clause("starred", "is_true")), ROWS[0]),
    ).toBe(true);
    expect(
      matchesExpression(FIELDS, and(clause("starred", "is_false")), ROWS[1]),
    ).toBe(true);
  });
});

describe("evaluation — composition & safety", () => {
  it("empty expression matches everything", () => {
    expect(matchesExpression(FIELDS, EMPTY_EXPRESSION, ROWS[0])).toBe(true);
  });

  it("AND requires all clauses; OR requires any", () => {
    const both = [
      clause("type", "is", "project"),
      clause("starred", "is_true"),
    ];
    expect(matchesExpression(FIELDS, and(...both), ROWS[0])).toBe(true);
    expect(matchesExpression(FIELDS, and(...both), ROWS[1])).toBe(false);
    expect(matchesExpression(FIELDS, or(...both), ROWS[0])).toBe(true);
    expect(
      matchesExpression(
        FIELDS,
        or(clause("type", "is", "task"), clause("starred", "is_true")),
        ROWS[0],
      ),
    ).toBe(true);
  });

  it("filterRecords preserves order and does not mutate the source", () => {
    const frozen = Object.freeze([...ROWS]);
    const result = filterRecords(
      FIELDS,
      and(clause("progress", "is_not_empty")),
      frozen,
    );
    expect(result.map((r) => r.title)).toEqual(["Alpha launch", "Gamma"]);
    // Original untouched.
    expect(frozen.map((r) => r.title)).toEqual([
      "Alpha launch",
      "Beta run",
      "Gamma",
    ]);
  });

  it("invalid clauses are dropped, not thrown, and do not filter", () => {
    const expr = and(clause("nope", "is", "x"));
    expect(() => matchesExpression(FIELDS, expr, ROWS[0])).not.toThrow();
    expect(matchesExpression(FIELDS, expr, ROWS[0])).toBe(true);
  });
});

describe("expressionsEqual", () => {
  it("ignores clause ids and list order", () => {
    const a: FilterExpression = {
      mode: "and",
      clauses: [
        { id: "1", field: "tags", operator: "is_any_of", value: ["a", "b"] },
      ],
    };
    const b: FilterExpression = {
      mode: "and",
      clauses: [
        { id: "x", field: "tags", operator: "is_any_of", value: ["b", "a"] },
      ],
    };
    expect(expressionsEqual(a, b)).toBe(true);
  });
  it("distinguishes mode and value differences", () => {
    const a: FilterExpression = {
      mode: "and",
      clauses: [{ id: "1", field: "type", operator: "is", value: "task" }],
    };
    const b: FilterExpression = {
      mode: "or",
      clauses: [{ id: "1", field: "type", operator: "is", value: "task" }],
    };
    expect(expressionsEqual(a, b)).toBe(false);
  });
});
