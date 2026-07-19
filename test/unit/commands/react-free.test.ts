import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * DS-09 — the shared Command Palette MODEL must never import React, React Router,
 * Cloudflare types, D1 adapters, Worker bindings, the app shell or product
 * modules. This guard proves it by static inspection, so the server (catalogue
 * builder, execution boundary) and a module's command handler can reuse the model
 * without pulling any UI into the bundle (ADR-024 §24.2/§24.10). It may reuse
 * DS-08's React-free search model and the kernel contracts — those are allowed.
 */

const COMMANDS_DIR = path.resolve(
  import.meta.dirname,
  "../../../app/shared/commands",
);

/** Every file the model entry (`model.ts`) may reach. */
const PURE_FILES = [
  "types.ts",
  "limits.ts",
  "context.ts",
  "catalogue.ts",
  "ranking.ts",
  "grouping.ts",
  "merge.ts",
  "selection.ts",
  "shortcut.ts",
  "execution.ts",
  "model.ts",
];

const FORBIDDEN_IMPORT =
  /\bfrom\s+["'](react|react-dom|react-router|react-router-dom|@react-router\/[^"']*|cloudflare:[^"']*|~\/platform\/[^"']*|~\/modules\/[^"']*|~\/shared\/shell[^"']*|~\/routes\/[^"']*)["']/;

const DRAWER_COMPONENT_IMPORT = /\bfrom\s+["']~\/shared\/drawer["']/;
const SEARCH_UI_IMPORT = /\bfrom\s+["']~\/shared\/search["']/;

describe("shared command model is React-free and boundary-clean", () => {
  for (const file of PURE_FILES) {
    it(`${file} imports no React/UI/platform/module package`, () => {
      const source = readFileSync(path.join(COMMANDS_DIR, file), "utf8");
      expect(source).not.toMatch(FORBIDDEN_IMPORT);
      expect(source).not.toMatch(DRAWER_COMPONENT_IMPORT);
      // Reuse the DS-08 *model* (`~/shared/search/model`), never the Search UI
      // barrel (`~/shared/search`), which would pull React in.
      expect(source).not.toMatch(SEARCH_UI_IMPORT);
    });
  }

  it("the model entry re-exports the core model API and excludes UI", async () => {
    const model = await import("~/shared/commands/model");
    expect(typeof model.rankCommands).toBe("function");
    expect(typeof model.groupCommands).toBe("function");
    expect(typeof model.buildPaletteView).toBe("function");
    expect(typeof model.decodeCommandCatalogue).toBe("function");
    expect(typeof model.sanitiseOutcome).toBe("function");
    expect(typeof model.matchesShortcut).toBe("function");
    expect(typeof model.nextIndex).toBe("function");
    expect("CommandPalette" in model).toBe(false);
    expect("useCommandController" in model).toBe(false);
  });
});
