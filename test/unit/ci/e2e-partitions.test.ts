import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * Loaded through `import()` at run time rather than as a static import, which is
 * how every other script test in this repository reaches a `.mjs` build script
 * (see `test/unit/deploy/`): the script is plain Node, not part of the
 * application's TypeScript project, and pulling it into `tsc -b` would ask the
 * build to type-check the toolchain.
 */
interface Partition {
  readonly name: string;
  readonly shard?: string;
  readonly specs: readonly string[];
  readonly estimateSeconds: number;
}
interface Manifest {
  readonly durations: Record<string, number>;
  readonly tests?: Record<string, number>;
  readonly partitions: readonly Partition[];
}
let DEFAULT_SPEC_SECONDS: number;
let PARTITION_COUNT: number;
let GLOBAL_TIMEOUT_SECONDS: number;
let MAX_PARTITION_SECONDS: number;
let PARTITION_OVERHEAD_FACTOR: number;
let derivePartitions: (
  durations: Record<string, number>,
  files: readonly string[],
) => Partition[];
let listSpecFiles: () => string[];
let manifestProblems: (
  manifest: Manifest,
  files: readonly string[],
) => string[];
let durationsFromReportData: (
  reports: readonly unknown[],
) => Map<string, { seconds: number; tests: number }>;
let manifest: Manifest;
let files: string[];

beforeAll(async () => {
  const module = (await import(
    pathToFileURL(join(process.cwd(), "scripts", "e2e-partitions.mjs")).href
  )) as {
    DEFAULT_SPEC_SECONDS: number;
    PARTITION_COUNT: number;
    GLOBAL_TIMEOUT_SECONDS: number;
    MAX_PARTITION_SECONDS: number;
    PARTITION_OVERHEAD_FACTOR: number;
    derivePartitions: typeof derivePartitions;
    listSpecFiles: typeof listSpecFiles;
    manifestProblems: typeof manifestProblems;
    durationsFromReportData: typeof durationsFromReportData;
    loadManifest: () => Manifest;
  };
  ({
    DEFAULT_SPEC_SECONDS,
    PARTITION_COUNT,
    GLOBAL_TIMEOUT_SECONDS,
    MAX_PARTITION_SECONDS,
    PARTITION_OVERHEAD_FACTOR,
    derivePartitions,
    listSpecFiles,
    manifestProblems,
    durationsFromReportData,
  } = module);
  manifest = module.loadManifest();
  files = listSpecFiles();
});

/**
 * HARDEN-04 / DEBT-128 — the E2E gate's partition is a PURE FUNCTION of the
 * committed measurements and the spec files on disk.
 *
 * The property that matters is not "the split is optimal", it is that the split
 * cannot silently lose a test. Six of the seven `main` runs after HARDEN-02 lost
 * 27–118 tests because a count-based shard ran out of time, and the gate could
 * not tell the difference between "did not fail" and "did not run". A partition
 * mechanism that can drop a spec file would reintroduce exactly that, quietly.
 */
describe("E2E partitions", () => {
  it("assigns every spec file on disk to exactly one partition", () => {
    const owners = new Map<string, string[]>();
    for (const partition of manifest.partitions) {
      for (const spec of partition.specs) {
        owners.set(spec, [...(owners.get(spec) ?? []), partition.name]);
      }
    }
    for (const file of files) {
      const assigned = owners.get(file) ?? [];
      expect(
        assigned.length,
        `${file} is in ${assigned.length} partitions`,
      ).toBeGreaterThan(0);
      // A file may appear in more than one partition ONLY when those partitions
      // are the slices of that one file, and then in all of them.
      if (assigned.length > 1) {
        const slices = manifest.partitions.filter(
          (partition) => partition.specs.includes(file) && partition.shard,
        );
        expect(slices.length).toBe(assigned.length);
        expect(new Set(slices.map((slice) => slice.shard)).size).toBe(
          assigned.length,
        );
      }
    }
    for (const spec of owners.keys()) {
      expect(files, `${spec} is partitioned but absent from e2e/`).toContain(
        spec,
      );
    }
  });

  it("is what the committed durations derive — the manifest is generated, not written", () => {
    const derived = derivePartitions(manifest.durations, files);
    const shape = (partitions: readonly Partition[]) =>
      partitions.map((partition) => ({
        name: partition.name,
        shard: partition.shard ?? null,
        specs: partition.specs,
      }));
    expect(shape(derived)).toEqual(shape(manifest.partitions));
  });

  it("is deterministic — the same inputs give the same split, every time", () => {
    const once = derivePartitions(manifest.durations, files);
    const twice = derivePartitions(manifest.durations, [...files].reverse());
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("keeps a NEW, unmeasured spec file in the gate rather than losing it", () => {
    const withNew = derivePartitions(manifest.durations, [
      ...files,
      "e2e/brand-new.spec.ts",
    ]);
    const home = withNew.filter((partition) =>
      partition.specs.includes("e2e/brand-new.spec.ts"),
    );
    expect(home).toHaveLength(1);
    // …and it is sized pessimistically until something measures it, so a heavy
    // newcomer cannot quietly overload the partition it lands in.
    expect(DEFAULT_SPEC_SECONDS).toBeGreaterThan(60);
  });

  it("holds the runner-pool and budget constraints the split was reasoned against", () => {
    expect(manifest.partitions).toHaveLength(PARTITION_COUNT);
    /*
     * The count is BOUNDED rather than "as many as fit", and the bound is the
     * runner pool: past roughly a dozen concurrent jobs the GitHub-hosted pool
     * queues (run 31445526789: six of EIGHTEEN shards waited 5.5–7.0 minutes).
     *
     * THIRTEEN since V2.4 FOLLOW-01, and the move is measured rather than
     * convenient. At twelve the heaviest partition derived to 16.80 min against
     * a 16.73 min ceiling once FOLLOW-01's 43.2 s spec file was measured in, and
     * the MEAN of the ten non-sliced partitions was already 1005.0 s — so no
     * packing fits and no cheaper spec absorbs it. `PARTITION_COUNT` is the lever
     * this derivation exposes for exactly that case. The bound stays a bound:
     * fourteen would need its own evidence, and the pool figure it is being
     * checked against was interpolated from eighteen shards, not from thirteen.
     */
    expect(PARTITION_COUNT).toBeLessThanOrEqual(13);
    const worst = Math.max(
      ...manifest.partitions.map(
        (p: { estimateSeconds: number }) => p.estimateSeconds,
      ),
    );
    /*
     * Comfortably inside Playwright's 25-minute `globalTimeout`, which neither
     * HARDEN-04 nor HARDEN-06A raised.
     *
     * This used to be a flat `worst < 20 * 60`, and that is exactly what let
     * F-03 through: run 32321840125's p05 was budgeted 19.4 min, satisfied this
     * assertion, and then ran out of time with 33 tests never executed. The
     * ceiling is now DERIVED from the timeout and the measured wall-clock
     * overhead (`MAX_PARTITION_SECONDS`) and enforced by
     * `pnpm run e2e:partitions:check`, which CI runs; this asserts the committed
     * manifest against it and that the derivation still leaves real headroom.
     */
    expect(worst).toBeLessThanOrEqual(MAX_PARTITION_SECONDS);
    // And the ceiling itself has to mean something: a partition run right at it
    // is predicted to finish with at least five minutes of `globalTimeout`
    // unspent, which is the margin runner-to-runner variance has to fit inside.
    const predictedWall = MAX_PARTITION_SECONDS * PARTITION_OVERHEAD_FACTOR;
    expect(GLOBAL_TIMEOUT_SECONDS - predictedWall).toBeGreaterThanOrEqual(
      5 * 60,
    );
  });

  it("mirrors the globalTimeout the Playwright config actually sets", () => {
    // `GLOBAL_TIMEOUT_SECONDS` is a copy — the script is plain Node and cannot
    // import the TypeScript config — so the copy is checked rather than trusted.
    // HARDEN-06A's whole point is that the budget is derived from this number;
    // a silent divergence would make the derivation fiction.
    const config = readFileSync(
      join(process.cwd(), "playwright.config.ts"),
      "utf8",
    );
    expect(config).toContain(
      `globalTimeout: process.env.CI ? ${GLOBAL_TIMEOUT_SECONDS / 60} * 60_000`,
    );
  });

  /*
   * F-03 — the manifest may not carry a GUESS for a spec file the gate runs.
   *
   * `DEFAULT_SPEC_SECONDS` keeps a brand-new spec IN the gate (the test above),
   * and that is all it is for. On run 32321840125 ten spec files had been
   * carried on the guess across four merges; one of them cost 324 s against its
   * 120 s placeholder, p05 exceeded `globalTimeout`, and 33 tests never ran.
   */
  describe("manifest completeness", () => {
    it("has a measured duration and test count for every gate spec on disk", () => {
      const unmeasured = files.filter(
        (file) => manifest.durations[file] === undefined,
      );
      expect(unmeasured, "unmeasured spec files").toEqual([]);
      const uncounted = files.filter(
        (file) => manifest.tests?.[file] === undefined,
      );
      expect(uncounted, "spec files with no measured test count").toEqual([]);
    });

    it("fails, naming the spec, when a participating spec file has no duration", () => {
      const newcomer = "e2e/brand-new.spec.ts";
      const problems = manifestProblems(manifest, [...files, newcomer]);
      const named = problems.filter((line) => line.includes(newcomer));
      // Both things are true of a spec file that has just landed on disk, and
      // the second is the one HARDEN-06A added: it stays true after the next
      // `generate` puts the file into a partition on the 120 s guess.
      expect(named).toHaveLength(2);
      expect(named.some((line) => /is not in any partition/.test(line))).toBe(
        true,
      );
      expect(named.some((line) => /no measured duration/.test(line))).toBe(
        true,
      );
    });

    it("still fails after the newcomer has been GIVEN a partition on the guess", () => {
      // The realistic regression: someone adds a spec file, runs
      // `e2e:partitions:generate` with no report, sees a green partition
      // assignment and commits. That is exactly how ten guesses accumulated.
      const newcomer = "e2e/brand-new.spec.ts";
      const withNewcomer = [...files, newcomer];
      const derived = derivePartitions(manifest.durations, withNewcomer);
      const problems = manifestProblems(
        { ...manifest, partitions: derived },
        withNewcomer,
      );
      expect(problems.filter((line) => line.includes(newcomer))).toEqual([
        expect.stringContaining("has no measured duration"),
      ]);
    });

    it("fails when a measured spec has no measured test count", () => {
      const victim = files[0];
      const tests = { ...(manifest.tests ?? {}) };
      delete tests[victim];
      const problems = manifestProblems({ ...manifest, tests }, files);
      expect(problems.some((line) => line.includes(victim))).toBe(true);
      expect(problems.find((line) => line.includes(victim))).toMatch(
        /no measured test count/,
      );
    });

    it("fails when a partition is budgeted past the ceiling", () => {
      const [first, ...rest] = manifest.partitions;
      const problems = manifestProblems(
        {
          ...manifest,
          partitions: [
            { ...first, estimateSeconds: MAX_PARTITION_SECONDS + 1 },
            ...rest,
          ],
        },
        files,
      );
      expect(problems.some((line) => line.includes("over the"))).toBe(true);
    });

    it("accepts the committed manifest exactly as it stands", () => {
      expect(manifestProblems(manifest, files)).toEqual([]);
    });
  });

  /*
   * Reading the measurements back out of Playwright's reports has to survive
   * both shapes the gate actually produces, and they pull in opposite
   * directions: `responsive.spec.ts` is measured across the TWO shard reports
   * of the partitions it is split between, so those must ADD UP, while the same
   * tests seen in two reports (a re-run, or a local measurement handed in
   * alongside the CI run that later measured it) must not be counted twice.
   */
  describe("reading durations out of a report", () => {
    const report = (
      file: string,
      tests: readonly (readonly [string, number])[],
    ) => ({
      suites: [
        {
          file,
          specs: tests.map(([title, seconds], index) => ({
            title,
            line: index + 1,
            id: `${file}:${title}`,
            tests: [{ results: [{ duration: seconds * 1000 }] }],
          })),
        },
      ],
    });

    it("adds up the two shard reports of one sliced spec file", () => {
      const totals = durationsFromReportData([
        report("responsive.spec.ts", [["a", 10]]),
        report("responsive.spec.ts", [["b", 15]]),
      ]);
      expect(totals.get("e2e/responsive.spec.ts")).toEqual({
        seconds: 25,
        tests: 2,
      });
    });

    it("does not double a spec file that appears in two reports", () => {
      const totals = durationsFromReportData([
        report("notes.spec.ts", [
          ["a", 10],
          ["b", 4],
        ]),
        report("notes.spec.ts", [
          ["a", 12],
          ["b", 4],
        ]),
      ]);
      // The later report replaces the earlier one, test by test.
      expect(totals.get("e2e/notes.spec.ts")).toEqual({
        seconds: 16,
        tests: 2,
      });
    });

    it("ignores a test that never executed", () => {
      const totals = durationsFromReportData([
        {
          suites: [
            {
              file: "today.spec.ts",
              specs: [
                {
                  title: "ran",
                  line: 1,
                  id: "1",
                  tests: [{ results: [{ duration: 3000 }] }],
                },
                {
                  title: "never ran",
                  line: 2,
                  id: "2",
                  tests: [{ results: [] }],
                },
              ],
            },
          ],
        },
      ]);
      expect(totals.get("e2e/today.spec.ts")).toEqual({ seconds: 3, tests: 1 });
    });
  });

  it("slices a spec file only when it is heavier than a whole partition", () => {
    for (const partition of manifest.partitions) {
      if (!partition.shard) continue;
      // A sliced partition runs ONE file: `--shard` applies to everything
      // selected, and count-only slicing is safe only inside a single generated
      // matrix file where a test's count IS its cost.
      expect(partition.specs).toHaveLength(1);
      const total = manifest.durations[partition.specs[0]];
      const mean =
        manifest.partitions.reduce(
          (sum: number, p: { estimateSeconds: number }) =>
            sum + p.estimateSeconds,
          0,
        ) / manifest.partitions.length;
      expect(total).toBeGreaterThan(mean);
    }
  });
});
