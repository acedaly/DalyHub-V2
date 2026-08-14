#!/usr/bin/env node
/**
 * The E2E gate's time-balanced partition (HARDEN-04, DEBT-128).
 *
 * Playwright's own `--shard=n/N` divides the suite by TEST COUNT. DalyHub's
 * tests are not equal: measured on `main`, the cheapest spec file averages 0.8 s
 * a test and the dearest 53 s, so an equal COUNT is an unequal amount of WORK.
 * That is why shards 4 and 8 repeatedly reached `globalTimeout` with tests never
 * started while shard 6 finished in a third of the budget — and why the answer
 * is a split derived from measured time rather than a bigger ceiling.
 *
 * The mechanism is deliberately small:
 *
 *   1. `e2e/partitions.json` holds the MEASURED seconds per spec file and the
 *      partition each file belongs to. It is generated, committed, and checked
 *      in CI (`pnpm run e2e:partitions:check`) exactly as the generated colour
 *      scheme and the icon assets are.
 *   2. A partition is one Playwright invocation over WHOLE spec files, so a
 *      file's tests always run together in one browser, in one workspace.
 *   3. A file heavier than a partition's budget — today only
 *      `responsive.spec.ts` — gets its own partitions and is divided between
 *      them with Playwright's `--shard` applied to that one file. Inside a
 *      single generated matrix file, count IS time.
 *
 * There is no scheduler, no history service and nothing that learns. Re-deriving
 * the split is a person running `pnpm run e2e:partitions:generate` against a
 * finished run's `results.json`, reading the diff, and committing it.
 *
 * Commands:
 *   generate [--from <results.json> …]  rewrite the manifest (optionally
 *                                       refreshing the durations first)
 *   check                               fail if the manifest is not what the
 *                                       committed durations and the spec files
 *                                       on disk derive
 *   matrix                              the partition names, as JSON, for the
 *                                       workflow's matrix
 *   specs <partition>                   the Playwright arguments for one
 *                                       partition
 *   describe <partition>                the human-readable header a CI job
 *                                       prints before it runs
 *   plan                                the whole split, with estimates
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_DIR = join(ROOT, "e2e");
const MANIFEST = join(ROOT, "e2e", "partitions.json");

/**
 * How many partitions the gate runs.
 *
 * TEN, and the number is bounded by the RUNNER POOL rather than by the suite.
 * MEASURED on runs 31675715619, 31690164253 and 31697528360: all eight E2E jobs
 * started within 0.1 min of each other, so eight is not yet contended — but run
 * 31445526789 (eighteen shards) had six jobs QUEUED for 5.5–7.0 minutes, which
 * puts the pool's practical ceiling at roughly twelve concurrent jobs. Ten
 * leaves the margin and still starts in one wave.
 *
 * It is also bounded from BELOW by the fixed cost of a partition: 0.8 min of
 * checkout, toolchain, artifact download and browser install, plus ~1.5 min of
 * server boot before the first test — 2.3 min per partition that buys no
 * coverage. Ten partitions spend 23 minutes of runner time on setup; eighteen
 * spent 41 and finished no sooner.
 */
export const PARTITION_COUNT = 10;

/**
 * The estimate a spec file gets when nothing has measured it yet.
 *
 * Deliberately PESSIMISTIC — five times the median spec file (10.9 s) and above
 * three quarters of the suite — because the cost of over-estimating a new file
 * is a slightly light partition, and the cost of under-estimating it is the
 * failure this whole mechanism exists to end. The first run after a new spec
 * lands measures it for real, and `generate --from` replaces the guess.
 */
export const DEFAULT_SPEC_SECONDS = 120;

/** Spec files the run itself ignores unless a capture variable is set. */
const CAPTURE_SUFFIX = "-screenshots.spec.ts";

/** Every spec file the ordinary (non-capture) gate is required to run. */
export function listSpecFiles() {
  return readdirSync(SPEC_DIR)
    .filter(
      (name) => name.endsWith(".spec.ts") && !name.endsWith(CAPTURE_SUFFIX),
    )
    .map((name) => `e2e/${name}`)
    .sort();
}

export function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

/**
 * Derive the split: pure, total, and a function of nothing but the committed
 * durations and the spec files present on disk.
 */
export function derivePartitions(durations, files, count = PARTITION_COUNT) {
  const seconds = (file) => durations[file] ?? DEFAULT_SPEC_SECONDS;
  const total = files.reduce((sum, file) => sum + seconds(file), 0);
  const target = total / count;

  // A file bigger than one partition's share of the work gets its own
  // partitions and is divided between them by Playwright, inside that one file.
  const sliced = files
    .filter((file) => seconds(file) > target)
    .map((file) => ({ file, slices: Math.ceil(seconds(file) / target) }));
  const slicePartitions = sliced.flatMap(({ file, slices }) =>
    Array.from({ length: slices }, (_, index) => ({
      specs: [file],
      shard: `${index + 1}/${slices}`,
      estimateSeconds: seconds(file) / slices,
    })),
  );

  const remaining = count - slicePartitions.length;
  if (remaining < 1) {
    throw new Error(
      `${slicePartitions.length} sliced partitions leave no room for the other ` +
        `${files.length - sliced.length} spec files in ${count}. Raise PARTITION_COUNT ` +
        `or split the heavy spec file.`,
    );
  }

  // Longest-processing-time first: the classic greedy makespan heuristic. The
  // heaviest file goes into the emptiest partition, so one heavy spec can never
  // land on top of another.
  const bins = Array.from({ length: remaining }, () => ({
    specs: [],
    estimateSeconds: 0,
  }));
  const whole = files
    .filter((file) => !sliced.some((entry) => entry.file === file))
    .sort((a, b) => seconds(b) - seconds(a) || a.localeCompare(b));
  for (const file of whole) {
    let lightest = 0;
    for (let index = 1; index < bins.length; index += 1) {
      if (bins[index].estimateSeconds < bins[lightest].estimateSeconds) {
        lightest = index;
      }
    }
    bins[lightest].specs.push(file);
    bins[lightest].estimateSeconds += seconds(file);
  }

  // Heaviest partition first, so `E2E p01` is always the one to watch, and the
  // specs inside each partition are alphabetical so a diff is readable.
  return [...slicePartitions, ...bins]
    .sort((a, b) => b.estimateSeconds - a.estimateSeconds)
    .map((partition, index) => ({
      name: `p${String(index + 1).padStart(2, "0")}`,
      estimateSeconds: Math.round(partition.estimateSeconds * 10) / 10,
      testEstimate: null,
      ...(partition.shard ? { shard: partition.shard } : {}),
      specs: [...partition.specs].sort(),
    }));
}

/** Per-spec-file seconds and test counts from Playwright's JSON report(s). */
function durationsFromReports(paths) {
  const totals = new Map();
  for (const path of paths) {
    const report = JSON.parse(readFileSync(path, "utf8"));
    const visit = (suite, file) => {
      const current = suite.file
        ? `e2e/${suite.file.replace(/^e2e\//, "")}`
        : file;
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          for (const result of test.results ?? []) {
            if (typeof result.duration !== "number") continue;
            const entry = totals.get(current) ?? { seconds: 0, tests: 0 };
            entry.seconds += result.duration / 1000;
            entry.tests += 1;
            totals.set(current, entry);
          }
        }
      }
      for (const child of suite.suites ?? []) visit(child, current);
    };
    for (const suite of report.suites ?? []) visit(suite, null);
  }
  return totals;
}

function writeManifest(manifest) {
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

function partitionFor(manifest, name) {
  const partition = manifest.partitions.find((entry) => entry.name === name);
  if (!partition) {
    throw new Error(
      `No partition "${name}". Known partitions: ${manifest.partitions
        .map((entry) => entry.name)
        .join(", ")}`,
    );
  }
  return partition;
}

function minutes(seconds) {
  return `${(seconds / 60).toFixed(1)} min`;
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                    */
/* -------------------------------------------------------------------------- */

function commandGenerate(args) {
  const manifest = loadManifest();
  const reports = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--from") reports.push(args[index + 1]);
  }
  const durations = { ...manifest.durations };
  const tests = { ...(manifest.tests ?? {}) };
  if (reports.length > 0) {
    for (const [file, entry] of durationsFromReports(reports)) {
      durations[file] = Math.round(entry.seconds * 10) / 10;
      tests[file] = entry.tests;
    }
  }
  const files = listSpecFiles();
  for (const file of Object.keys(durations)) {
    if (!files.includes(file)) {
      delete durations[file];
      delete tests[file];
    }
  }
  const partitions = derivePartitions(durations, files).map((partition) => ({
    ...partition,
    testEstimate: partition.shard
      ? Math.round(
          (tests[partition.specs[0]] ?? 0) /
            Number(partition.shard.split("/")[1]),
        )
      : partition.specs.reduce((sum, spec) => sum + (tests[spec] ?? 0), 0),
  }));
  writeManifest({
    ...manifest,
    partitionCount: PARTITION_COUNT,
    defaultSpecSeconds: DEFAULT_SPEC_SECONDS,
    durations: Object.fromEntries(
      Object.keys(durations)
        .sort()
        .map((file) => [file, durations[file]]),
    ),
    tests: Object.fromEntries(
      Object.keys(tests)
        .sort()
        .map((file) => [file, tests[file]]),
    ),
    partitions,
  });
  commandPlan();
}

function commandCheck() {
  const manifest = loadManifest();
  const files = listSpecFiles();
  const problems = [];

  const seen = new Map();
  for (const partition of manifest.partitions) {
    for (const spec of partition.specs) {
      const owners = seen.get(spec) ?? [];
      owners.push(partition.name);
      seen.set(spec, owners);
    }
  }
  for (const file of files) {
    const owners = seen.get(file);
    if (!owners) {
      problems.push(
        `${file} is not in any partition — it would never run in the gate. ` +
          `Run: pnpm run e2e:partitions:generate`,
      );
      continue;
    }
    const slices = manifest.partitions.filter(
      (partition) => partition.specs.includes(file) && partition.shard,
    );
    if (owners.length > 1 && slices.length !== owners.length) {
      problems.push(
        `${file} is in ${owners.length} partitions (${owners.join(", ")})`,
      );
    }
  }
  for (const spec of seen.keys()) {
    if (!files.includes(spec)) {
      problems.push(`${spec} is in a partition but does not exist on disk`);
    }
  }
  const derived = derivePartitions(manifest.durations, files);
  const shape = (partitions) =>
    JSON.stringify(
      partitions.map((partition) => ({
        name: partition.name,
        shard: partition.shard ?? null,
        specs: partition.specs,
      })),
    );
  if (shape(derived) !== shape(manifest.partitions)) {
    problems.push(
      "the committed partitions are not what the committed durations derive. " +
        "Run: pnpm run e2e:partitions:generate",
    );
  }

  if (problems.length > 0) {
    console.error("E2E partition manifest is out of date:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `E2E partitions OK — ${files.length} spec files across ` +
      `${manifest.partitions.length} partitions, heaviest ` +
      `${minutes(manifest.partitions[0].estimateSeconds)}.`,
  );
}

function commandMatrix() {
  console.log(
    JSON.stringify(loadManifest().partitions.map((entry) => entry.name)),
  );
}

function commandSpecs(name) {
  const partition = partitionFor(loadManifest(), name);
  const args = [...partition.specs];
  if (partition.shard) args.push(`--shard=${partition.shard}`);
  console.log(args.join(" "));
}

function commandDescribe(name) {
  const manifest = loadManifest();
  const partition = partitionFor(manifest, name);
  const lines = [
    `E2E partition ${partition.name} of ${manifest.partitions.length}`,
    `  spec files      ${partition.specs.length}${
      partition.shard ? ` (slice ${partition.shard} of one file)` : ""
    }`,
    `  tests expected  ~${partition.testEstimate ?? "?"}`,
    `  budget          ${minutes(partition.estimateSeconds)} of measured test time`,
    "  specs",
    ...partition.specs.map(
      (spec) =>
        `    ${spec}${
          manifest.durations[spec] === undefined
            ? "  (not yet measured)"
            : `  ${manifest.durations[spec].toFixed(1)}s`
        }`,
    ),
  ];
  console.log(lines.join("\n"));
}

function commandPlan() {
  const manifest = loadManifest();
  const total = manifest.partitions.reduce(
    (sum, partition) => sum + partition.estimateSeconds,
    0,
  );
  const mean = total / manifest.partitions.length;
  console.log(
    `${manifest.partitions.length} partitions · ${minutes(total)} of measured test ` +
      `time · mean ${minutes(mean)}`,
  );
  for (const partition of manifest.partitions) {
    console.log(
      `  ${partition.name}  ${minutes(partition.estimateSeconds).padStart(9)}  ` +
        `${String(partition.specs.length).padStart(2)} specs  ` +
        `~${String(partition.testEstimate ?? 0).padStart(4)} tests` +
        `${partition.shard ? `  --shard=${partition.shard}` : ""}`,
    );
  }
  const worst = Math.max(...manifest.partitions.map((p) => p.estimateSeconds));
  console.log(`  worst/mean ${(worst / mean).toFixed(2)}`);
}

// Importable as a module — `test/unit/ci/e2e-partitions.test.ts` exercises
// `derivePartitions` directly — so the CLI only runs when this file IS the
// entry point.
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const [command, ...rest] = invokedDirectly ? process.argv.slice(2) : ["noop"];
switch (command) {
  case "noop":
    break;
  case "generate":
    commandGenerate(rest);
    break;
  case "check":
    commandCheck();
    break;
  case "matrix":
    commandMatrix();
    break;
  case "specs":
    commandSpecs(rest[0]);
    break;
  case "describe":
    commandDescribe(rest[0]);
    break;
  case "plan":
    commandPlan();
    break;
  default:
    console.error(
      "usage: e2e-partitions.mjs <generate|check|matrix|specs|describe|plan>",
    );
    process.exitCode = 2;
}
