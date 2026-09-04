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
 *   generate [--from <results.json> [--as <label>] …]
 *                                       rewrite the manifest (optionally
 *                                       refreshing the durations, test counts
 *                                       and provenance first)
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
 * THIRTEEN since V2.4 FOLLOW-01. Twelve from HARDEN-06A until then, and the
 * number is bounded by the RUNNER POOL rather than by the suite. MEASURED on
 * runs 31675715619, 31690164253 and 31697528360: all eight E2E jobs started
 * within 0.1 min of each other, so eight is not yet contended — but run
 * 31445526789 (eighteen shards) had six jobs QUEUED for 5.5–7.0 minutes, which
 * put the pool's practical ceiling at roughly twelve concurrent jobs.
 *
 * It is also bounded from BELOW by the fixed cost of a partition: 0.8 min of
 * checkout, toolchain, artifact download and browser install, plus ~1.5 min of
 * server boot before the first test — 2.3 min per partition that buys no
 * coverage. Twelve partitions spend ~28 minutes of runner time on setup;
 * eighteen spent 41 and finished no sooner.
 *
 * ── Why it moved from ten (HARDEN-06A) ──────────────────────────────────────
 * NOT to make a failing run fit — the split is derived, and this is the only
 * knob the derivation exposes. With every spec file finally MEASURED the suite
 * is 175.1 min of test time, and TEN partitions cannot hold that inside a safe
 * budget: `responsive.spec.ts` is one generated matrix file, `--shard` is the
 * only way to divide it, and it takes two partitions of 11.8 min apiece —
 * leaving the other eight carrying 19.0 min each. Derived at each count against
 * run 32333645709's measurements, with predicted wall clock as a share of the
 * ceiling:
 *
 *   10 → worst 19.0 min · wall 21.3 min · 85%  — OVER MAX_PARTITION_SECONDS
 *   11 → worst 16.9 min · wall 18.9 min · 76%  — OVER, by 0.2 min
 *   12 → worst 15.2 min · wall 17.0 min · 68%  ← chosen at HARDEN-06A
 *   13 → worst 13.8 min · wall 15.5 min · 62%  — past the pool's twelve
 *
 * ── Why it moved to THIRTEEN (V2.4 FOLLOW-01), with the measurement ─────────
 * V2.4-GATE-02 left the suite at 191.3 min against a 16.7 min per-partition
 * ceiling and wrote down, in `partitions.json`, that the NEXT item adding E2E
 * coverage would have to confront the split rather than shave seconds. This is
 * that item, and the arithmetic is unambiguous. FOLLOW-01 adds ONE spec file,
 * MEASURED at 43.2 s (four tests, already consolidated from six over eleven page
 * loads to four over eight — assertions unchanged). Derived over the committed
 * durations plus that file:
 *
 *   12 → heaviest partition 1007.7 s = 16.80 min  — OVER the 16.73 min ceiling
 *   13 → heaviest partition  918.7 s = 15.31 min  — 68% of `globalTimeout`
 *
 * Twelve does not fail by a rounding error that a cheaper spec could absorb: the
 * MEAN of the ten non-sliced partitions is already 1005.0 s at twelve, so no
 * packing of any 43-second file fits, and reaching 1004 s would mean deleting
 * roughly a third of the new coverage. The lever this derivation exposes is the
 * COUNT (or a genuinely cheaper spec file) — never the ceiling, which is the one
 * answer HARDEN-04 removed from the table — so the count is what moved.
 *
 * The cost is stated rather than assumed. Thirteen spends ~2.3 min more runner
 * time on setup that buys no coverage, and it is ONE job past the pool figure
 * interpolated from run 31445526789 — which measured EIGHTEEN shards queueing,
 * not thirteen. Run 32333645709 then measured twelve starting within ONE SECOND
 * of each other with none queued, so twelve had headroom rather than sitting on
 * a wall. And the failure mode if the interpolation is right is bounded and
 * already written down above: a queued job costs WALL CLOCK and nothing else,
 * because a job that has not started spends none of its `globalTimeout`.
 *
 * ── The better fix, measured and deliberately NOT taken here ────────────────
 * `responsive.spec.ts` is 1471.6 s in ONE generated matrix file, and `--shard`
 * is the only way to divide it — so it takes two EXCLUSIVE partitions of 735.8 s
 * apiece against a 1004 s ceiling. That strands **536 s of gate capacity, 8.9
 * minutes, that no partition can use**, and it is why twelve looked exhausted.
 * Recovering it needs either a redesign of this function (both shards of a
 * sliced group must carry an IDENTICAL spec list, or tests are lost and
 * duplicated) or a near-50/50 split of that file into two real spec files. Both
 * change what every partition holds, and neither is a change to make inside a
 * feature PR whose own coverage is four tests. Raised as its own entry in
 * `PRODUCT_DEBT.md` with these numbers, so the next pass takes it deliberately.
 */
export const PARTITION_COUNT = 13;

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

/**
 * Playwright's own ceiling for one partition, in seconds — the `globalTimeout`
 * `playwright.config.ts` sets in CI. Mirrored here rather than imported because
 * this file is plain Node and the config is TypeScript; the two are kept honest
 * by `test/unit/ci/e2e-partitions.test.ts`, which reads the config's source and
 * fails if the numbers ever disagree.
 */
export const GLOBAL_TIMEOUT_SECONDS = 25 * 60;

/**
 * Wall-clock seconds a partition spends per second of MEASURED test time.
 *
 * A partition's budget is the sum of its spec files' measured test durations,
 * and that is strictly less than the job's elapsed time: `beforeAll`/`afterEach`
 * fixtures, D1 cleanup, browser context churn and the gaps between tests are all
 * outside a test's own measured duration.
 *
 * MEASURED across all TWELVE partitions of run 32333645709 — 175.1 min of test
 * time in 195.0 min of Playwright wall clock — the factor is **1.114** overall
 * and ranges 1.094 … 1.131 per partition. 1.12 is the mean, rounded up, and the
 * spread above it is carried by `PARTITION_CEILING_UTILISATION` rather than by
 * inflating this number: a mean here and a margin there is legible, whereas
 * padding both hides how much slack there actually is. First estimated at 1.109
 * from the single complete partition of run 32321840125, and the twelve-way
 * measurement agreed with it.
 */
export const PARTITION_OVERHEAD_FACTOR = 1.12;

/**
 * How much of the ceiling a partition's PREDICTED wall clock may occupy.
 *
 * 0.75 — the ~70%-of-ceiling target every split since HARDEN-04 has been tuned
 * to (see `docs/development/SETUP_AND_CI.md` → "Partition budget"). The margin
 * is not decoration and it is not theoretical: run 32321840125 showed the same
 * spec files costing up to 35% more on one runner generation than another, and
 * run 32333645709 measured 175.1 min of test time against a manifest that said
 * 165.4 — 6% of drift in a single run. A quarter of the ceiling is what absorbs
 * that without a partition ever reaching `globalTimeout`.
 */
export const PARTITION_CEILING_UTILISATION = 0.75;

/**
 * The most MEASURED test time one partition may be budgeted, in seconds.
 *
 * Derived, never hand-picked, and deliberately not "whatever today's heaviest
 * partition happens to be": a ceiling fitted to the current split would move
 * every time the split did and would have accepted the p05 that could not
 * finish. 25 min × 0.75 ÷ 1.12 = 16.7 min of measured test time, which predicts
 * ~18.7 min of wall clock and leaves ~6 min of headroom under `globalTimeout`.
 *
 * `check` fails when any committed partition exceeds it. The lever when it does
 * is `PARTITION_COUNT` (or a genuinely cheaper spec file) — never a bigger
 * ceiling, which is the one answer HARDEN-04 removed from the table.
 */
export const MAX_PARTITION_SECONDS = Math.round(
  (GLOBAL_TIMEOUT_SECONDS * PARTITION_CEILING_UTILISATION) /
    PARTITION_OVERHEAD_FACTOR,
);

/**
 * When a partition counts as PRESSED against the ceiling — V2.8 CONV-03,
 * DEBT-205.
 *
 * Above this share of `MAX_PARTITION_SECONDS` a partition has no room to absorb
 * anything, so a lighter partition elsewhere is capacity the gate genuinely
 * cannot reach rather than ordinary slack.
 */
export const PARTITION_PRESSURE_THRESHOLD = 0.9;

/**
 * How far below the heaviest partition the lightest one may sit, as a share of
 * the ceiling, once the heaviest is pressed — V2.8 CONV-03, DEBT-205.
 *
 * This is the invariant that entry was raised for, stated as a rule the split
 * has to satisfy rather than as a number somebody remembers. Before CONV-03,
 * `responsive.spec.ts` was one generated matrix file of 1471.6 s — bigger than
 * any partition's budget — so `derivePartitions` gave it two EXCLUSIVE
 * partitions of 735.8 s divided by `--shard`, and nothing else could be packed
 * into them. Measured on the committed manifest: p01–p11 at 974–976 s, 97% of
 * the ceiling, while p12 and p13 sat at 73% — **536 s, 8.9 minutes, of gate
 * capacity no partition could use**, permanently, and the reason two successive
 * programmes concluded the twelve-way split was exhausted when it was not.
 *
 * 0.15 is a QUARTER of the slack the ceiling already carries
 * (`PARTITION_CEILING_UTILISATION` leaves 25%), which is what makes it a real
 * bound rather than a restatement of the ceiling: the old arrangement's spread
 * was 23.9% of the ceiling and fails it; an ordinary greedy pack of whole files
 * lands inside a per-mille of the mean and passes it comfortably. A single file
 * heavier than the mean but lighter than the ceiling — the shape that would
 * legitimately unbalance a pack — moves the spread by single-digit percent.
 */
export const PARTITION_SPREAD_TOLERANCE = 0.15;

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

/**
 * Per-spec-file seconds and test counts from Playwright's JSON report(s).
 *
 * Accumulated per TEST rather than per file, because both things happen:
 *
 *   - a SLICED spec file (`responsive.spec.ts`) is measured across two
 *     partition reports, each holding half its tests, and its true cost is the
 *     union of the two — so the reports must add up;
 *   - the same tests can appear in two reports (a re-run, or a local
 *     measurement passed alongside the CI run that later measured it), and
 *     there the second report REPLACES the first rather than doubling it.
 *
 * Keying on the test's own identity gets both right. Summing per file got the
 * first right and the second wrong, silently inflating any spec measured twice.
 */
export function durationsFromReports(paths) {
  return durationsFromReportData(
    paths.map((path) => JSON.parse(readFileSync(path, "utf8"))),
  );
}

/** The same, over already-parsed reports — the shape the unit tests drive. */
export function durationsFromReportData(reports) {
  const perFile = new Map();
  for (const report of reports) {
    const visit = (suite, file) => {
      const current = suite.file
        ? `e2e/${suite.file.replace(/^e2e\//, "")}`
        : file;
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          let seconds = 0;
          let executed = false;
          // A test's own cost includes its retries; `retries: 0` makes that one
          // result today, and this stays correct if that ever changes.
          for (const result of test.results ?? []) {
            if (typeof result.duration !== "number") continue;
            seconds += result.duration / 1000;
            executed = true;
          }
          if (!executed) continue;
          const key =
            spec.id ??
            `${current}:${spec.line}:${spec.title}:${test.projectName ?? ""}`;
          const tests = perFile.get(current) ?? new Map();
          tests.set(key, seconds);
          perFile.set(current, tests);
        }
      }
      for (const child of suite.suites ?? []) visit(child, current);
    };
    for (const suite of report.suites ?? []) visit(suite, null);
  }
  const totals = new Map();
  for (const [file, tests] of perFile) {
    let seconds = 0;
    for (const value of tests.values()) seconds += value;
    totals.set(file, { seconds, tests: tests.size });
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
  /*
   * `--from <results.json>` may be followed by `--as <label>`, which is the
   * PROVENANCE recorded against every spec file that report measured — the run
   * it came from, or the local/CI normalisation applied to it.
   *
   * The `source` map used to be maintained by hand, and by 2026-08-20 it was
   * stale in exactly the way the durations were: it had no entry at all for the
   * ten unmeasured files, and still called several files "local/1.13" that CI
   * had since measured directly. A provenance record nobody updates is worse
   * than none, because it reads as evidence. `generate` writes it now, and
   * `check` requires it.
   */
  const reports = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--from") continue;
    const path = args[index + 1];
    const label =
      args[index + 2] === "--as"
        ? args[index + 3]
        : path
            .split("/")
            .pop()
            .replace(/\.json$/, "");
    reports.push({ path, label });
  }
  const durations = { ...manifest.durations };
  const tests = { ...(manifest.tests ?? {}) };
  const source = { ...(manifest.source ?? {}) };
  // One accumulation across every report, so a sliced spec file's shards add up.
  for (const [file, entry] of durationsFromReports(
    reports.map((report) => report.path),
  )) {
    durations[file] = Math.round(entry.seconds * 10) / 10;
    tests[file] = entry.tests;
  }
  // Provenance is per report, last mention winning — which for the two shards
  // of one sliced file is the same run either way.
  for (const report of reports) {
    for (const file of durationsFromReports([report.path]).keys()) {
      source[file] = report.label;
    }
  }
  const files = listSpecFiles();
  // A spec file that has been deleted leaves nothing behind in any of the three
  // maps, so a later `check` cannot trip over a measurement with no spec.
  for (const map of [durations, tests, source]) {
    for (const file of Object.keys(map)) {
      if (!files.includes(file)) delete map[file];
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
    source: Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((file) => [file, source[file]]),
    ),
    partitions,
  });
  commandPlan();
  // Say so loudly rather than leaving it to `check` in CI: a refresh that did
  // not reach every spec file has produced a manifest that will not pass.
  const unmeasured = files.filter((file) => durations[file] === undefined);
  if (unmeasured.length > 0) {
    console.warn(
      `\n  ${unmeasured.length} spec file(s) still have NO measured duration and ` +
        `are sized at the ${DEFAULT_SPEC_SECONDS}s guess. ` +
        `\`e2e:partitions:check\` will fail until they are measured:`,
    );
    for (const file of unmeasured) console.warn(`    ${file}`);
  }
}

/**
 * Everything wrong with a manifest, as a list of sentences — pure, and a
 * function of nothing but the manifest and the spec files on disk.
 *
 * Separated from the CLI so the invariants can be exercised against synthetic
 * manifests (`test/unit/ci/e2e-partitions.test.ts`) rather than only against the
 * committed one, which by construction is always valid.
 */
export function manifestProblems(manifest, files) {
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

  /*
   * Every gate spec file must carry a REAL measurement (F-03).
   *
   * `derivePartitions` sizes an unmeasured file at `DEFAULT_SPEC_SECONDS` so a
   * brand-new spec can never be dropped from the gate between the commit that
   * adds it and the run that measures it. That fallback is a safety net for
   * DERIVATION; it is not evidence, and the committed manifest is not valid
   * while it is load-bearing. On run 32321840125 ten of the 111 spec files were
   * still sized by the guess, one of them (`tasks-dependencies.spec.ts`) cost
   * 324 s against its 120 s placeholder, and p05 hit `globalTimeout` with 33
   * tests never executed. The guess had been carried, silently, across four
   * merges.
   *
   * Asked over `listSpecFiles()` — the same canonical discovery the gate itself
   * runs on — rather than over a second, hand-maintained list, so a spec file
   * cannot be measured-by-omission.
   */
  for (const file of files) {
    if (manifest.durations[file] === undefined) {
      problems.push(
        `${file} has no measured duration — it would be sized at the ` +
          `${DEFAULT_SPEC_SECONDS}s guess, which is not evidence. Measure it ` +
          `and refresh: pnpm run e2e:partitions:generate --from <results.json>`,
      );
    } else if (manifest.tests?.[file] === undefined) {
      problems.push(
        `${file} has a measured duration but no measured test count. Refresh ` +
          `both from the same run: pnpm run e2e:partitions:generate --from <results.json>`,
      );
    } else if (!manifest.source?.[file]) {
      problems.push(
        `${file} is measured but says nothing about WHERE the measurement came ` +
          `from. Re-run the refresh with a label: ` +
          `pnpm run e2e:partitions:generate --from <results.json> --as <label>`,
      );
    }
  }

  /*
   * No partition may be budgeted past the derived ceiling (F-03).
   *
   * The budget assertion used to live only in the unit test, as a flat "worst
   * partition under 20 minutes" — which the p05 that could not finish satisfied,
   * at 19.4 min against a 25-minute `globalTimeout`. It is here now, in the
   * check CI actually runs, and it is derived from the ceiling rather than
   * fitted to the current split. See `MAX_PARTITION_SECONDS`.
   */
  for (const partition of manifest.partitions) {
    if (partition.estimateSeconds > MAX_PARTITION_SECONDS) {
      problems.push(
        `${partition.name} is budgeted ${minutes(partition.estimateSeconds)} of ` +
          `measured test time, over the ${minutes(MAX_PARTITION_SECONDS)} ceiling ` +
          `(${minutes(GLOBAL_TIMEOUT_SECONDS)} globalTimeout × ` +
          `${PARTITION_CEILING_UTILISATION} ÷ ${PARTITION_OVERHEAD_FACTOR} of ` +
          `wall-clock overhead). Raise PARTITION_COUNT or make a spec file ` +
          `cheaper — never the ceiling.`,
      );
    }
  }
  /*
   * No partition may strand capacity while another is pressed against the
   * ceiling (DEBT-205).
   *
   * The ceiling above bounds a partition from ABOVE and says nothing about a
   * partition that is far too light — which is the failure this rule exists for,
   * because the reason a partition is light can be that nothing is ALLOWED to
   * share it. A file heavier than one partition's share of the work gets its own
   * partitions, divided by `--shard`, and a sliced partition may hold nothing
   * else; every second between its budget and the ceiling is then capacity no
   * partition can use, while the packed partitions sit at 100% and the next item
   * to add coverage is told the split is full.
   *
   * Stated as a SPREAD rather than as a floor, because a floor would fire on a
   * suite that is simply small: it is only a defect when something is pressed.
   * See `PARTITION_PRESSURE_THRESHOLD` and `PARTITION_SPREAD_TOLERANCE` for the
   * measurement this is derived from.
   */
  if (manifest.partitions.length > 1) {
    const budgets = manifest.partitions.map(
      (partition) => partition.estimateSeconds,
    );
    const heaviest = Math.max(...budgets);
    const lightest = Math.min(...budgets);
    const spread = (heaviest - lightest) / MAX_PARTITION_SECONDS;
    if (
      heaviest >= MAX_PARTITION_SECONDS * PARTITION_PRESSURE_THRESHOLD &&
      spread > PARTITION_SPREAD_TOLERANCE
    ) {
      const light = manifest.partitions
        .filter((partition) => partition.estimateSeconds === lightest)
        .map((partition) => partition.name)
        .join(", ");
      problems.push(
        `the split strands capacity: the heaviest partition is budgeted ` +
          `${minutes(heaviest)} (${Math.round((heaviest / MAX_PARTITION_SECONDS) * 100)}% of ` +
          `the ${minutes(MAX_PARTITION_SECONDS)} ceiling) while ${light} sits at ` +
          `${minutes(lightest)} (${Math.round((lightest / MAX_PARTITION_SECONDS) * 100)}%) — ` +
          `a spread of ${Math.round(spread * 100)}% of the ceiling against the ` +
          `${Math.round(PARTITION_SPREAD_TOLERANCE * 100)}% this split allows. ` +
          `A partition that cannot be filled is usually one an oversized spec ` +
          `file has taken exclusively: split the file, do not raise the ceiling.`,
      );
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

  return problems;
}

function commandCheck() {
  const manifest = loadManifest();
  const files = listSpecFiles();
  const problems = manifestProblems(manifest, files);

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
