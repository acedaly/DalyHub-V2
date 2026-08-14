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
  readonly partitions: readonly Partition[];
}
let DEFAULT_SPEC_SECONDS: number;
let PARTITION_COUNT: number;
let derivePartitions: (
  durations: Record<string, number>,
  files: readonly string[],
) => Partition[];
let listSpecFiles: () => string[];
let manifest: Manifest;
let files: string[];

beforeAll(async () => {
  const module = (await import(
    pathToFileURL(join(process.cwd(), "scripts", "e2e-partitions.mjs")).href
  )) as {
    DEFAULT_SPEC_SECONDS: number;
    PARTITION_COUNT: number;
    derivePartitions: typeof derivePartitions;
    listSpecFiles: typeof listSpecFiles;
    loadManifest: () => Manifest;
  };
  ({ DEFAULT_SPEC_SECONDS, PARTITION_COUNT, derivePartitions, listSpecFiles } =
    module);
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
    // Past roughly twelve concurrent jobs the GitHub-hosted pool queues (run
    // 31445526789: six shards waited 5.5–7.0 minutes), so the count is bounded
    // rather than "as many as fit".
    expect(PARTITION_COUNT).toBeLessThanOrEqual(12);
    const worst = Math.max(
      ...manifest.partitions.map(
        (p: { estimateSeconds: number }) => p.estimateSeconds,
      ),
    );
    // Comfortably inside Playwright's 25-minute `globalTimeout`, which HARDEN-04
    // deliberately did NOT raise.
    expect(worst).toBeLessThan(20 * 60);
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
