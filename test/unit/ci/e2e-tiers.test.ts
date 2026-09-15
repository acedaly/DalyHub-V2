/**
 * V3-E2E-01 — the E2E gate is two tiers, and the split cost no coverage.
 *
 * The required PR gate runs the product's correctness journeys, a
 * REPRESENTATIVE accessibility scan plus every open-overlay scan, and the
 * responsive BOUNDARY widths over the daily-driver surfaces. The nightly suite
 * runs the exhaustive matrices: every route × both appearances under axe, and
 * every route × every viewport for horizontal overflow.
 *
 * The risk a split like this carries is not that it fails. It is that it quietly
 * stops asking a question — a route that leaves the fast tier and is in nothing
 * else, a matrix file that is nominally nightly but in no workflow, a
 * `PR_ROUTES` entry that is a typo and therefore sweeps nothing. None of those
 * go red on their own, so they are asserted here.
 *
 * A text check over the sources, for the reason `responsive-matrix.test.ts`
 * gives for its own: importing `e2e/helpers.ts` into vitest would pull
 * Playwright's runtime into a unit process to read a few arrays.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const manifest = JSON.parse(read("e2e/partitions.json")) as {
  tiers?: { nightly?: string[] };
  durations: Record<string, number>;
};
const a11yMatrix = read("e2e/accessibility-matrix.ts");
const a11yPr = read("e2e/accessibility.spec.ts");
const a11yNightly = read("e2e/accessibility-matrix.spec.ts");
const responsiveMatrix = read("e2e/responsive-matrix.ts");
const responsiveCore = read("e2e/responsive-core.spec.ts");
const nightlyWorkflow = read(".github/workflows/nightly.yml");

/** The string entries of an `export const NAME = [ … ] as const;` array. */
function entries(source: string, name: string): string[] {
  const start = source.indexOf(`export const ${name} = [`);
  if (start === -1) return [];
  const end = source.indexOf("] as const;", start);
  return [...source.slice(start, end).matchAll(/"([^"]+)"/g)].map(
    (match) => match[1]!,
  );
}

const nightly = manifest.tiers?.nightly ?? [];

describe("the nightly tier is declared once and honoured everywhere", () => {
  it("names exactly the three exhaustive matrix files", () => {
    // Written out rather than derived from the manifest under test: a check that
    // reads its expectation out of its subject cannot fail. Adding a fourth file
    // to the nightly tier is a decision, and it should have to change this line.
    expect(nightly).toEqual([
      "e2e/accessibility-matrix.spec.ts",
      "e2e/responsive-desktop.spec.ts",
      "e2e/responsive-phone.spec.ts",
    ]);
  });

  it("every nightly file exists and carries a measured duration", () => {
    for (const spec of nightly) {
      expect(existsSync(join(process.cwd(), spec)), `${spec} exists`).toBe(
        true,
      );
      // The nightly suite's cost is derived from the same numbers as the gate's.
      // An unmeasured file there is exactly as invisible as one in the gate.
      expect(manifest.durations[spec], `${spec} is measured`).toBeGreaterThan(
        0,
      );
    }
  });

  it("the nightly workflow runs every nightly file and nothing else", () => {
    const suites = [
      ...nightlyWorkflow.matchAll(
        /^\s+- (accessibility-matrix|responsive-\w+)$/gm,
      ),
    ].map((match) => `e2e/${match[1]}.spec.ts`);
    expect(suites.sort()).toEqual([...nightly].sort());
  });

  it("the nightly workflow is scheduled AND dispatchable", () => {
    // Scheduled, or it is not a safety net. Dispatchable, because the case it
    // exists for is a change to the shell, the cascade or a shared primitive,
    // where the author wants the sweep before merging rather than the morning
    // after.
    expect(nightlyWorkflow).toMatch(/schedule:\s*\n\s*(#.*\n\s*)*- cron:/);
    expect(nightlyWorkflow).toContain("workflow_dispatch:");
  });
});

describe("the accessibility split kept the contract on the PR gate", () => {
  it("PR_ROUTES is a subset of the full sweep", () => {
    const full = new Set([
      ...entries(a11yMatrix, "DESIGN_FIXTURES"),
      ...entries(a11yMatrix, "PRODUCT_ROUTES"),
    ]);
    const pr = entries(a11yMatrix, "PR_ROUTES");
    expect(pr.length).toBeGreaterThan(0);
    for (const route of pr) {
      // A route in the fast tier and in nothing else is a route that stops being
      // swept the day someone renames it.
      expect(full.has(route), `${route} is also in the nightly sweep`).toBe(
        true,
      );
    }
  });

  it("the nightly file sweeps the FULL lists, and the PR file does not", () => {
    expect(a11yNightly).toContain("[...DESIGN_FIXTURES, ...PRODUCT_ROUTES]");
    expect(a11yPr).not.toContain("PRODUCT_ROUTES");
    expect(a11yPr).toContain("PR_ROUTES");
  });

  it("keeps BOTH appearances in both tiers", () => {
    // A contrast or focus regression is routinely one appearance and not the
    // other, so neither tier may quietly become light-only.
    expect(a11yPr.match(/colorScheme: "dark"/g)?.length).toBe(1);
    expect(a11yNightly.match(/colorScheme: "dark"/g)?.length).toBe(1);
  });

  it("keeps EVERY open-overlay scan on the PR gate", () => {
    // These are the highest-value accessibility tests in the product and they
    // exist in one file. §21 of the V3 brief: accessibility stays a first-class
    // PR requirement, and this is the half that is not duplicated anywhere else.
    expect(a11yPr).toContain("automated accessibility — open overlays");
    expect(a11yNightly).not.toContain("open overlays");
    // A sample of the families, so deleting the describe block is not enough to
    // make this pass.
    for (const name of [
      "Drawer (open record)",
      "Command Palette",
      "dangerous confirmation dialog",
      "record overflow menu",
    ]) {
      expect(a11yPr, `${name} is still gated`).toContain(name);
    }
  });

  it("declares no test in the shared matrix module", () => {
    // Playwright attributes a test to the file its `test()` was declared in, and
    // `e2e/partitions.json` is keyed on that attribution.
    expect(a11yMatrix).not.toMatch(/^\s*test[.(]/m);
  });
});

describe("the responsive split kept the contract on the PR gate", () => {
  it("PR_CORE_ROUTES is a subset of the full sweep", () => {
    const full = new Set([
      ...entries(responsiveMatrix, "DESIGN_FIXTURES"),
      ...entries(responsiveMatrix, "PRODUCT_ROUTES"),
      // `DENSE_GRID_ROUTES` is swept nightly too, over the POLISH-01 audit band.
      ...entries(responsiveMatrix, "DENSE_GRID_ROUTES"),
    ]);
    const pr = entries(responsiveMatrix, "PR_CORE_ROUTES");
    expect(pr.length).toBeGreaterThan(0);
    for (const route of pr) {
      expect(full.has(route), `${route} is also in the nightly sweep`).toBe(
        true,
      );
    }
  });

  it("gates both boundary widths, the md swap and the overlays", () => {
    // 320 and 1440 are the two widths the overflow contract actually breaks at;
    // 768 is the shell's own swap; the overlays keep their narrowest extreme,
    // which is where an overlay that overflows does it.
    expect(responsiveMatrix).toContain('label: "mobile-320"');
    expect(responsiveMatrix).toContain('label: "desktop-1440"');
    expect(responsiveMatrix).toContain('label: "tablet-768"');
    expect(responsiveCore).toContain("PR_BOUNDARY_VIEWPORTS");
    expect(responsiveCore).toContain("DENSE_GRID_ROUTES");
    expect(responsiveCore).toContain("OVERLAY_SCENARIOS");
    expect(responsiveCore).toContain("PR_BOUNDARY_VIEWPORTS[0]");
  });

  it("leaves the full matrix files untouched and complete", () => {
    // The nightly files still sweep their whole tier. The PR tier is the fast
    // half of a pair, not a replacement for it.
    const phone = read("e2e/responsive-phone.spec.ts");
    const desktop = read("e2e/responsive-desktop.spec.ts");
    expect(phone).toContain("for (const viewport of PHONE_VIEWPORTS)");
    expect(desktop).toContain("for (const viewport of WIDE_VIEWPORTS)");
    expect(phone).toContain("[...DESIGN_FIXTURES, ...PRODUCT_ROUTES]");
    expect(desktop).toContain("[...DESIGN_FIXTURES, ...PRODUCT_ROUTES]");
  });
});
