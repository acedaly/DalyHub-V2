import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SETTINGS_DIR = path.resolve(
  import.meta.dirname,
  "../../../app/shared/settings",
);

const UI_DIR = path.resolve(import.meta.dirname, "../../../app/shared/ui");

/**
 * The pure model surface — must stay React-free (DS-05/DS-06/DS-07/DS-10
 * discipline).
 *
 * DS-02 moved `confirmation.ts` to `~/shared/ui` with the dialog it drives, so
 * it is checked at its new home. The discipline is the file's, not the
 * directory's: the reason it must import no React is that server loaders and
 * pure tests reach it through `~/shared/settings/model`, and that is still true
 * from either side of the move.
 */
const PURE_FILES: ReadonlyArray<readonly [string, string]> = [
  [SETTINGS_DIR, "types.ts"],
  [UI_DIR, "confirmation.ts"],
  [SETTINGS_DIR, "immediate.ts"],
  [SETTINGS_DIR, "model.ts"],
];

const REACT_IMPORT =
  /\bfrom\s+["'](react|react-dom|react-router)(\/[^"']*)?["']/;

describe("pure settings model is React-free", () => {
  for (const [dir, file] of PURE_FILES) {
    it(`${file} imports no React/UI package`, () => {
      const source = readFileSync(path.join(dir, file), "utf8");
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
