#!/usr/bin/env node
/**
 * Run the WHOLE E2E gate locally, partition by partition, exactly the way CI
 * runs it (HARDEN-04).
 *
 * CI runs the ten partitions concurrently on ten runners; this runs them in
 * sequence in one place, which is the only way a person can answer "does the
 * complete intended suite pass, and did every test in it actually execute?"
 * before pushing. It uses the same manifest, the same Playwright arguments and
 * the same summary script the workflow uses, so a green run here means the same
 * thing it means there — and the per-partition table it prints at the end is the
 * evidence a re-derivation of the split needs.
 *
 *   node scripts/e2e-gate.mjs                  every partition
 *   node scripts/e2e-gate.mjs p03 p07          only these
 *
 * `PLAYWRIGHT_SKIP_BUILD=1` is honoured by `playwright.config.ts` exactly as in
 * CI, and the servers are started once by the first partition and reused.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(join(ROOT, "e2e", "partitions.json"), "utf8"),
);

const wanted = process.argv.slice(2);
// EVERY name has to exist, not just one of them. `e2e-gate.mjs p03 p99` running
// p03 and exiting green would report success for a partition it never ran, which
// is the same class of lie this whole mechanism was built to end.
const unknown = wanted.filter(
  (name) => !manifest.partitions.some((partition) => partition.name === name),
);
if (unknown.length > 0) {
  console.error(
    `Unknown partition${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. ` +
      `Known: ${manifest.partitions.map((partition) => partition.name).join(", ")}`,
  );
  process.exit(2);
}
const partitions = manifest.partitions.filter(
  (partition) => wanted.length === 0 || wanted.includes(partition.name),
);

const outDir = join(ROOT, "playwright-report", "gate");
mkdirSync(outDir, { recursive: true });

const results = [];
for (const partition of partitions) {
  const json = join(outDir, `${partition.name}.json`);
  const args = [
    "exec",
    "playwright",
    "test",
    ...partition.specs,
    ...(partition.shard ? [`--shard=${partition.shard}`] : []),
    "--workers=1",
    "--reporter=list,json",
  ];
  console.log(
    `\n\n=== E2E partition ${partition.name} — ${partition.specs.length} spec files ===\n`,
  );
  const started = Date.now();
  const run = spawnSync("pnpm", args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: json },
  });
  const elapsed = (Date.now() - started) / 1000;
  const summary = spawnSync(
    "node",
    ["scripts/e2e-partition-summary.mjs", partition.name],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, E2E_RESULTS_JSON: json },
    },
  );
  results.push({
    name: partition.name,
    specs: partition.specs.length,
    budget: partition.estimateSeconds,
    elapsed,
    ok: run.status === 0 && summary.status === 0,
  });
}

console.log("\n\n=== E2E gate ===");
console.log("partition   specs   budget    elapsed   result");
for (const result of results) {
  console.log(
    `${result.name.padEnd(11)} ${String(result.specs).padStart(5)}   ` +
      `${(result.budget / 60).toFixed(1).padStart(5)}m   ` +
      `${(result.elapsed / 60).toFixed(1).padStart(6)}m   ` +
      `${result.ok ? "pass" : "FAIL"}`,
  );
}
const total = results.reduce((sum, result) => sum + result.elapsed, 0);
const worst = Math.max(...results.map((result) => result.elapsed));
console.log(
  `total ${(total / 60).toFixed(1)} min of test time · worst partition ` +
    `${(worst / 60).toFixed(1)} min · ${results.filter((r) => r.ok).length}/${results.length} partitions green`,
);
process.exit(results.every((result) => result.ok) ? 0 : 1);
