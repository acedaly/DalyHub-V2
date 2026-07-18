/**
 * DS-07 — the storage-agnostic saved-view contract.
 *
 * Proves modified-state comparison and graceful handling of a view referencing an
 * obsolete filter field.
 */

import { describe, expect, it } from "vitest";

import {
  findSavedView,
  isViewModified,
  readFilterExpression,
  writeFilterExpression,
} from "~/shared/filters";
import type { FilterFieldRegistry, SavedView } from "~/shared/filters";

const FIELDS: FilterFieldRegistry = [
  { id: "type", label: "Type", type: "enum", options: [] },
  { id: "status", label: "Status", type: "enum", options: [] },
];

const VIEW: SavedView = {
  id: "v1",
  name: "Open tasks",
  expression: {
    mode: "and",
    clauses: [{ id: "0", field: "type", operator: "is", value: "task" }],
  },
};

describe("saved views", () => {
  it("finds a view by id", () => {
    expect(findSavedView([VIEW], "v1")).toBe(VIEW);
    expect(findSavedView([VIEW], "none")).toBeUndefined();
    expect(findSavedView([VIEW], undefined)).toBeUndefined();
  });

  it("is not modified when the expression matches", () => {
    expect(isViewModified(VIEW, VIEW.expression)).toBe(false);
  });

  it("is modified when the expression diverges", () => {
    expect(
      isViewModified(VIEW, {
        mode: "and",
        clauses: [{ id: "0", field: "type", operator: "is", value: "goal" }],
      }),
    ).toBe(true);
  });

  it("an undefined active view is never 'modified'", () => {
    expect(isViewModified(undefined, VIEW.expression)).toBe(false);
  });

  it("a view referencing an obsolete field fails gracefully through the URL", () => {
    const obsolete: SavedView = {
      id: "v2",
      name: "Legacy",
      expression: {
        mode: "and",
        clauses: [
          { id: "0", field: "removed-field", operator: "is", value: "x" },
        ],
      },
    };
    // Applying it writes the URL, but reading sanitises the obsolete clause away —
    // no throw, and the restored expression is simply empty.
    const written = writeFilterExpression(
      new URLSearchParams(),
      obsolete.expression,
    );
    const restored = readFilterExpression(
      new URLSearchParams(written.toString()),
      FIELDS,
    );
    expect(restored.clauses).toHaveLength(0);
  });
});
