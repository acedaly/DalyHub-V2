import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const DIR = path.resolve(import.meta.dirname, "../../../app/kernel/areas");
const PURE_FILES = [
  "area.ts",
  "area-cursor.ts",
  "area-errors.ts",
  "area-momentum.ts",
  "area-repository.ts",
  "index.ts",
];
const REACT_IMPORT =
  /\bfrom\s+["'](react|react-dom|react-router)(\/[^"']*)?["']/;

describe("Areas kernel is React-free", () => {
  for (const file of PURE_FILES) {
    it(`${file} imports no React/UI package`, () => {
      const source = readFileSync(path.join(DIR, file), "utf8");
      expect(source).not.toMatch(REACT_IMPORT);
    });
  }
});
