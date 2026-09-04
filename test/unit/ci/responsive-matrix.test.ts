/**
 * V2.8 CONV-03 / DEBT-205 — the responsive sweep was split into two spec files,
 * and the split cost no coverage.
 *
 * `responsive.spec.ts` was 519 tests and 1471.6 s in one file — bigger than any
 * partition's budget — so `derivePartitions` had to hand it two EXCLUSIVE
 * partitions and divide it with `--shard`, which stranded 536 s of gate capacity
 * that nothing else could use while every other partition sat against the
 * ceiling. It is now `responsive-phone.spec.ts` and `responsive-desktop.spec.ts`,
 * one tier each, packed like any other file.
 *
 * The risk a split like that carries is not that it fails; it is that it
 * QUIETLY covers less than the file it replaced. A viewport dropped from a tier
 * takes its routes with it, and nothing goes red — the suite simply stops asking
 * a question, which is the failure mode this whole programme exists to end. So
 * the two properties that make the split lossless are asserted here:
 *
 *   1. the tiers CONCATENATE to the canonical matrix, in order — so a viewport
 *      cannot leave the product's responsive contract by leaving a tier;
 *   2. the two spec files between them run every tier, the audit band and both
 *      overlay extremes — so a whole block cannot be dropped by deleting a call.
 *
 * A text check over the sources, for the reason `toolchain-setup.test.ts` gives
 * for its own: importing `e2e/helpers.ts` into vitest would pull Playwright's
 * runtime into a unit process to read two arrays.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const helpers = read("e2e/helpers.ts");
const phone = read("e2e/responsive-phone.spec.ts");
const desktop = read("e2e/responsive-desktop.spec.ts");
const matrix = read("e2e/responsive-matrix.ts");

/** The `label:` values of a `const NAME = [ … ] as const;` array in a source. */
function labels(source: string, name: string): string[] {
  const start = source.indexOf(`export const ${name} = [`);
  if (start === -1) return [];
  const end = source.indexOf("] as const;", start);
  return [...source.slice(start, end).matchAll(/label:\s*"([^"]+)"/g)].map(
    (match) => match[1]!,
  );
}

describe("the responsive matrix survived its split", () => {
  it("declares the canonical matrix AS the two tiers, in order", () => {
    // Not "contains the same widths somewhere": the canonical list is literally
    // the concatenation, so there is one place a viewport can be added and no
    // way to add it to only one of two lists that are supposed to agree.
    expect(helpers).toContain(
      "export const RESPONSIVE_VIEWPORTS = [\n  ...PHONE_VIEWPORTS,\n  ...WIDE_VIEWPORTS,\n] as const;",
    );
  });

  it("keeps every viewport the matrix had, split between the tiers", () => {
    const phones = labels(helpers, "PHONE_VIEWPORTS");
    const wides = labels(helpers, "WIDE_VIEWPORTS");
    // The matrix as it stood before the split, written out rather than derived
    // from the file under test — a check that reads its expectation out of its
    // subject cannot fail.
    expect([...phones, ...wides]).toEqual([
      "mobile-320",
      "mobile-375",
      "mobile-390",
      "mobile-430",
      "phone-landscape",
      "tablet-768",
      "desktop-1024",
      "desktop-1280",
      "desktop-1440",
      "ultrawide-2560",
    ]);
    // And the tiers are disjoint, so no route is swept twice and billed twice.
    expect(new Set([...phones, ...wides]).size).toBe(
      phones.length + wides.length,
    );
  });

  it("has the two tier spec files, and no third responsive file", () => {
    expect(
      existsSync(join(process.cwd(), "e2e/responsive-phone.spec.ts")),
    ).toBe(true);
    expect(
      existsSync(join(process.cwd(), "e2e/responsive-desktop.spec.ts")),
    ).toBe(true);
    // The file the split replaced is gone rather than left behind to run twice.
    expect(existsSync(join(process.cwd(), "e2e/responsive.spec.ts"))).toBe(
      false,
    );
  });

  it("sweeps each tier exactly once, across the two files", () => {
    expect(phone).toContain("for (const viewport of PHONE_VIEWPORTS)");
    expect(desktop).toContain("for (const viewport of WIDE_VIEWPORTS)");
    expect(phone).not.toContain("WIDE_VIEWPORTS");
    expect(desktop).not.toContain("PHONE_VIEWPORTS");
  });

  it("keeps the audit band and BOTH overlay extremes", () => {
    // POLISH-01's 820/900/1100 band is a tablet/laptop question, so it belongs
    // to the wide file — and it has to be somewhere.
    expect(desktop).toContain("AUDIT_WIDTHS");
    expect(desktop).toContain("DENSE_GRID_ROUTES");
    // The overlay sweep bounds the behaviour at the two extremes: the narrowest
    // phone in one file, the ultra-wide desktop in the other.
    expect(phone).toContain("PHONE_VIEWPORTS[0]");
    expect(desktop).toContain("WIDE_VIEWPORTS[WIDE_VIEWPORTS.length - 1]");
    expect(phone).toContain("OVERLAY_SCENARIOS");
    expect(desktop).toContain("OVERLAY_SCENARIOS");
  });

  it("declares no test in the shared module, so a test is filed under its spec", () => {
    /*
     * Playwright attributes a test to the file its `test()` was declared in, and
     * `e2e/partitions.json` is keyed on that attribution. Declaring the sweeps
     * inside `responsive-matrix.ts` — which is not a spec file — would file all
     * 519 tests under a module the partition manifest has never heard of, and
     * `pnpm run e2e:partitions:check` would have nothing to balance. Measured on
     * the first attempt at this split, which reported "519 tests in 1 file".
     */
    expect(matrix).not.toMatch(/^\s*test(\.describe)?\(/m);
    expect(matrix).not.toContain('from "@playwright/test";\n\nimport { test');
  });
});
