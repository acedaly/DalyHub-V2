import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SETTINGS_DIR = path.resolve(
  import.meta.dirname,
  "../../../app/shared/settings",
);

// The pure model surface — must stay React-free (DS-05/DS-06/DS-07/DS-10 discipline).
const PURE_FILES = ["types.ts", "confirmation.ts", "immediate.ts", "model.ts"];

const REACT_IMPORT =
  /\bfrom\s+["'](react|react-dom|react-router)(\/[^"']*)?["']/;

describe("pure settings model is React-free", () => {
  for (const file of PURE_FILES) {
    it(`${file} imports no React/UI package`, () => {
      const source = readFileSync(path.join(SETTINGS_DIR, file), "utf8");
      expect(source).not.toMatch(REACT_IMPORT);
    });
  }

  it("the model entry re-exports the pure API", async () => {
    const model = await import("~/shared/settings/model");
    expect(typeof model.initConfirmation).toBe("function");
    expect(typeof model.reduceConfirmation).toBe("function");
    expect(typeof model.matchesConfirmationPhrase).toBe("function");
    expect(typeof model.canConfirm).toBe("function");
    expect(typeof model.initImmediate).toBe("function");
    expect(typeof model.reduceImmediate).toBe("function");
  });

  it("does not leak React components/hooks into the pure entry", async () => {
    const model = await import("~/shared/settings/model");
    expect("SettingsLayout" in model).toBe(false);
    expect("SettingsRow" in model).toBe(false);
    expect("ConfirmationDialog" in model).toBe(false);
    expect("useImmediateSetting" in model).toBe(false);
  });
});
