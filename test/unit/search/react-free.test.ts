import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * DS-08 — the shared Search MODEL, the runtime orchestrator and the pure
 * result→destination mapping must never import React, React Router, Cloudflare
 * types, D1 adapters, Worker bindings or product modules. This guard proves it by
 * static inspection, so a server orchestrator or a module's search provider can
 * reuse the model without pulling any UI into its bundle (ADR-023).
 */

const SEARCH_DIR = path.resolve(
  import.meta.dirname,
  "../../../app/shared/search",
);

/** Every file the model entry (`model.ts`) and the runtime layer may reach. */
const PURE_FILES = [
  "types.ts",
  "limits.ts",
  "query.ts",
  "fuzzy.ts",
  "target.ts",
  "result.ts",
  "ranking.ts",
  "grouping.ts",
  "selection.ts",
  "pipeline.ts",
  "navigation.ts",
  "orchestrator.ts",
  "highlight.ts",
  "decode.ts",
  "client.ts",
  "model.ts",
];

const FORBIDDEN_IMPORT =
  /\bfrom\s+["'](react|react-dom|react-router|react-router-dom|@react-router\/[^"']*|cloudflare:[^"']*|~\/platform\/[^"']*|~\/modules\/[^"']*)["']/;

const DRAWER_COMPONENT_IMPORT = /\bfrom\s+["']~\/shared\/drawer["']/;

describe("shared search model is React-free and boundary-clean", () => {
  for (const file of PURE_FILES) {
    it(`${file} imports no React/UI/platform/module package`, () => {
      const source = readFileSync(path.join(SEARCH_DIR, file), "utf8");
      expect(source).not.toMatch(FORBIDDEN_IMPORT);
      // The navigation helper reuses the Drawer's PURE url helpers, never the
      // Drawer React barrel.
      expect(source).not.toMatch(DRAWER_COMPONENT_IMPORT);
    });
  }

  it("the model entry re-exports the core model API and excludes UI", async () => {
    const model = await import("~/shared/search/model");
    expect(typeof model.normaliseQuery).toBe("function");
    expect(typeof model.rankResults).toBe("function");
    expect(typeof model.assembleOutcome).toBe("function");
    expect(typeof model.validateTarget).toBe("function");
    expect(typeof model.groupRankedResults).toBe("function");
    expect("SearchSurface" in model).toBe(false);
    expect("useSearchController" in model).toBe(false);
  });
});
