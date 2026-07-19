/**
 * DS-05 — architectural guard: the pure activity-feed model imports no React.
 *
 * Like DS-07's filter model, the DS-05 presentation model is framework-free so a
 * server surface (or a test) can map, group, order, page, window and build filter
 * fields for activity without resolving React. This static guard fails if any pure
 * model file (or the `model.ts` entry) imports `react`, `react-dom` or
 * `react-router`. UI-only files (the components and the two hooks) are excluded.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const DIR = path.resolve(
  import.meta.dirname,
  "../../../app/shared/activity-feed",
);

const PURE_FILES = [
  "types.ts",
  "activity-dates.ts",
  "activity-type-registry.ts",
  "activity-item-model.ts",
  "activity-grouping.ts",
  "activity-paging.ts",
  "activity-window.ts",
  "activity-filter-fields.ts",
  "model.ts",
];

const REACT_IMPORT =
  /\bfrom\s+["'](react|react-dom|react-router)(\/[^"']*)?["']/;

describe("pure activity-feed model is React-free", () => {
  for (const file of PURE_FILES) {
    it(`${file} imports no React/UI package`, () => {
      const source = readFileSync(path.join(DIR, file), "utf8");
      expect(source).not.toMatch(REACT_IMPORT);
    });
  }

  it("the model entry re-exports the core model API", async () => {
    const model = await import("~/shared/activity-feed/model");
    expect(typeof model.toActivityItem).toBe("function");
    expect(typeof model.groupActivityItemsByDay).toBe("function");
    expect(typeof model.mergeActivityPage).toBe("function");
    expect(typeof model.computeWindow).toBe("function");
    expect(typeof model.createActivityFilterFields).toBe("function");
  });
});
