#!/usr/bin/env node
/**
 * Run the WHOLE E2E gate locally, partition by partition, exactly the way CI
 * runs it (HARDEN-04) — from a DETERMINISTIC seed, every time (V2.8 CONV-03).
 *
 * CI runs the partitions concurrently, one runner each; this runs them in
 * sequence in one place, which is the only way a person can answer "does the
 * complete intended suite pass, and did every test in it actually execute?"
 * before pushing. It uses the same manifest, the same Playwright arguments and
 * the same summary script the workflow uses, so a green run here means the same
 * thing it means there — and the per-partition table it prints at the end is the
 * evidence a re-derivation of the split needs.
 *
 *   pnpm run e2e:gate                        every partition
 *   pnpm run e2e:gate p03 p07                only these
 *   pnpm run e2e:gate --partitions=11        an alternative derived arrangement
 *   pnpm run e2e:gate --out=/tmp/order-b     write the evidence somewhere else
 *   pnpm run e2e:gate --no-reset             keep the database as it is
 *
 * `PLAYWRIGHT_SKIP_BUILD=1` is honoured by `playwright.config.ts` exactly as in
 * CI. Whether the servers are reused between partitions is Playwright's call and
 * the environment's: `reuseExistingServer` is on outside CI, so a dev server
 * that OUTLIVES a partition is reused — but MEASURED in this repository's
 * sandbox (2026-09-04), Playwright tears its `webServer` processes down when the
 * process exits, so each partition pays its own ~1.5 min of server boot. That is
 * the honest reading of the cost of a local whole-gate run, and it is why the
 * table at the end reports elapsed per partition rather than a single number.
 *
 * ── The clean-start invariant (V2.8 CONV-03, DEBT-173) ───────────────────────
 * Every partition of a CI run gets its own container and its own freshly
 * migrated, freshly seeded D1. A local run got whatever the last one left
 * behind: `setup-local-db.mjs` applies migrations and seeds, and sweeps five
 * named fixture prefixes, but it has never WIPED. V2.4-GATE-02 measured the
 * consequence — one complete 1,928-test run leaves **217 records** it never
 * cleans up, against a 325-entity seed — so the second local gate run of a day
 * was asking a different database the same questions, and three journeys duly
 * failed on it that had passed an hour earlier.
 *
 * So the gate now begins by deleting the local D1 outright and re-migrating and
 * re-seeding it, before any server starts. That is the invariant: **one gate
 * invocation starts clean.** It is not a per-test reset — inside an invocation
 * the specs still share one seeded workspace exactly as a CI partition does,
 * which is the condition DEBT-173's fixture ownership has to hold under, and
 * resetting between tests would hide the very dependence this item exists to
 * remove.
 *
 * It also COUNTS the workspace before and after, so the leak rate above is a
 * number this script prints rather than a number somebody has to go and measure.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { derivePartitions, listSpecFiles } from "./e2e-partitions.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(join(ROOT, "e2e", "partitions.json"), "utf8"),
);

/* -------------------------------------------------------------------------- */
/* Arguments                                                                   */
/* -------------------------------------------------------------------------- */

const argv = process.argv.slice(2);
const flag = (name) => argv.find((arg) => arg.startsWith(`--${name}=`));
const value = (name) => flag(name)?.slice(`--${name}=`.length);

const reset = !argv.includes("--no-reset");
const derivedCount = value("partitions")
  ? Number(value("partitions"))
  : undefined;
const outDir = resolve(ROOT, value("out") ?? join("playwright-report", "gate"));
const wanted = argv.filter((arg) => !arg.startsWith("--"));

if (derivedCount !== undefined && !Number.isInteger(derivedCount)) {
  console.error(
    `--partitions must be a whole number, got "${value("partitions")}".`,
  );
  process.exit(2);
}

/*
 * The arrangement to run.
 *
 * By default it is the committed manifest — the same file CI builds its matrix
 * from. `--partitions=<n>` re-derives one through `derivePartitions`, the SAME
 * pure function `generate` and `check` use, from the SAME committed durations
 * and the same spec files on disk. That is the mechanism DEBT-173's closing
 * condition names: two legitimate splits of one tree, derived rather than
 * hand-written, so "the same tests give the same answers under a different
 * neighbour set" is a claim about the product rather than about a hand-made
 * ordering nobody would ever ship.
 */
const arrangement =
  derivedCount === undefined
    ? manifest.partitions
    : derivePartitions(manifest.durations, listSpecFiles(), derivedCount);

// EVERY name has to exist, not just one of them. `e2e-gate.mjs p03 p99` running
// p03 and exiting green would report success for a partition it never ran, which
// is the same class of lie this whole mechanism was built to end.
const unknown = wanted.filter(
  (name) => !arrangement.some((partition) => partition.name === name),
);
if (unknown.length > 0) {
  console.error(
    `Unknown partition${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. ` +
      `Known: ${arrangement.map((partition) => partition.name).join(", ")}`,
  );
  process.exit(2);
}
const partitions = arrangement.filter(
  (partition) => wanted.length === 0 || wanted.includes(partition.name),
);

/* -------------------------------------------------------------------------- */
/* The clean start                                                             */
/* -------------------------------------------------------------------------- */

const DEV_PORT = 4173;
const PROD_PORT = 4174;
const D1_STATE = join(ROOT, ".wrangler", "state", "v3", "d1");

/** Is something already listening on this port? */
function inUse(port) {
  return new Promise((resolvePort) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.setTimeout(750);
    socket.on("connect", () => {
      socket.destroy();
      resolvePort(true);
    });
    const no = () => {
      socket.destroy();
      resolvePort(false);
    };
    socket.on("error", no);
    socket.on("timeout", no);
  });
}

function node(script) {
  execFileSync("node", [script], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
}

/** How many live entities the seeded workspace holds — the DEBT-173 census. */
function entityCensus() {
  try {
    const out = execFileSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "execute",
        "DB",
        "--local",
        "--json",
        "--command",
        "SELECT COUNT(*) AS n FROM entities WHERE deleted_at IS NULL;",
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      },
    );
    const parsed = JSON.parse(out.slice(out.indexOf("[")));
    return parsed[0]?.results?.[0]?.n ?? null;
  } catch {
    return null;
  }
}

async function resetLocalDatabase() {
  /*
   * A wipe UNDER a running server is worse than no wipe: Miniflare keeps its
   * handle to the deleted file and goes on serving the old rows, while
   * `wrangler d1 execute` in this process creates a new one beside it — two
   * databases, one product, and a gate that cannot be reasoned about.
   *
   * So this refuses rather than guesses. It is the one case where stopping is
   * kinder than continuing, and the message says exactly what to do.
   */
  const busy = [];
  if (await inUse(DEV_PORT)) busy.push(String(DEV_PORT));
  if (await inUse(PROD_PORT)) busy.push(String(PROD_PORT));
  if (busy.length > 0) {
    console.error(
      `A server is already listening on ${busy.join(" and ")}.\n` +
        `The gate resets the local D1 before it runs, and wiping the database ` +
        `underneath a live server leaves the two disagreeing. Stop the dev/preview ` +
        `server and run this again — or pass --no-reset to run against the ` +
        `database as it currently stands (which is not a clean start, and the ` +
        `summary below will say so).`,
    );
    process.exit(2);
  }

  console.log("=== Resetting the local E2E database ===");
  rmSync(D1_STATE, { recursive: true, force: true });
  node("./e2e/setup-dev-auth.mjs");
  node("./e2e/setup-local-db.mjs");
}

/* -------------------------------------------------------------------------- */
/* The run                                                                     */
/* -------------------------------------------------------------------------- */

mkdirSync(outDir, { recursive: true });

if (reset) await resetLocalDatabase();
const censusBefore = entityCensus();
console.log(
  `Workspace at the start of this gate: ${censusBefore ?? "?"} live entities` +
    `${reset ? " (freshly seeded)" : " (NOT reset — --no-reset)"}`,
);

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
      env: {
        ...process.env,
        E2E_RESULTS_JSON: json,
        /*
         * A derived arrangement's partitions are not in the committed manifest,
         * so the summary is told what this one holds rather than looking it up.
         * The numbers it reports — collected, executed, never executed — are the
         * report's own either way.
         */
        E2E_PARTITION_SPECS: JSON.stringify({
          specs: partition.specs,
          shard: partition.shard ?? null,
          estimateSeconds: partition.estimateSeconds,
          of: arrangement.length,
        }),
      },
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

const censusAfter = entityCensus();

console.log("\n\n=== E2E gate ===");
console.log(
  `arrangement  ${
    derivedCount === undefined
      ? `the committed manifest (${manifest.partitions.length} partitions)`
      : `DERIVED at ${derivedCount} partitions from the committed durations`
  }`,
);
console.log(`evidence     ${outDir}`);
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

/*
 * The DEBT-173 census, printed rather than left to be rediscovered.
 *
 * A whole gate that ends with more live entities than it started with has
 * leaked exactly that many fixtures into the workspace the next invocation
 * would have inherited — the measurement V2.4-GATE-02 had to take by hand.
 */
if (censusBefore !== null && censusAfter !== null) {
  const leaked = censusAfter - censusBefore;
  console.log(
    `workspace    ${censusBefore} live entities before · ${censusAfter} after · ` +
      `${leaked >= 0 ? "+" : ""}${leaked} left behind by this run`,
  );
}

// The machine-readable record of what this arrangement did, beside the reports.
writeFileSync(
  join(outDir, "gate-summary.json"),
  `${JSON.stringify(
    {
      arrangement:
        derivedCount === undefined ? "committed" : `derived:${derivedCount}`,
      partitions: arrangement.map((partition) => ({
        name: partition.name,
        specs: partition.specs,
        shard: partition.shard ?? null,
      })),
      results,
      entities: { before: censusBefore, after: censusAfter },
    },
    null,
    2,
  )}\n`,
);

process.exit(results.every((result) => result.ok) ? 0 : 1);
