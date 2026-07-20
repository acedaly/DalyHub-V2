import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const INSPECTOR_DIR = path.resolve(
  import.meta.dirname,
  "../../../app/shared/inspector",
);

// The pure model surface — must stay React-free.
const PURE_FILES = ["inspector-url.ts", "types.ts", "model.ts"];

const REACT_IMPORT =
  /\bfrom\s+["'](react|react-dom|react-router)(\/[^"']*)?["']/;

describe("pure inspector model is React-free", () => {
  for (const file of PURE_FILES) {
    it(`${file} imports no React/UI package`, () => {
      const source = readFileSync(path.join(INSPECTOR_DIR, file), "utf8");
      expect(source).not.toMatch(REACT_IMPORT);
    });
  }

  it("the model entry re-exports the pure API", async () => {
    const model = await import("~/shared/inspector/model");
    expect(typeof model.readInspectorKey).toBe("function");
    expect(typeof model.withInspector).toBe("function");
    expect(typeof model.withoutInspector).toBe("function");
    expect(typeof model.clampInspectorWidth).toBe("function");
    expect(model.DEFAULT_INSPECTOR_PARAM).toBe("inspector");
  });

  it("does not leak React components/hooks into the pure entry", async () => {
    const model = await import("~/shared/inspector/model");
    expect("InspectorProvider" in model).toBe(false);
    expect("useInspector" in model).toBe(false);
  });

  it("clamps widths to the docked bounds", async () => {
    const { clampInspectorWidth, INSPECTOR_MIN_WIDTH, INSPECTOR_MAX_WIDTH } =
      await import("~/shared/inspector/model");
    expect(clampInspectorWidth(10)).toBe(INSPECTOR_MIN_WIDTH);
    expect(clampInspectorWidth(9999)).toBe(INSPECTOR_MAX_WIDTH);
    expect(clampInspectorWidth(Number.NaN)).toBeGreaterThan(0);
  });
});
