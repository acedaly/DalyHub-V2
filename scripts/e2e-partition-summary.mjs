#!/usr/bin/env node
/**
 * The end-of-job answer to "what actually happened in this E2E partition?"
 * (HARDEN-04).
 *
 * Before this existed, a partition that ran out of time and a partition that
 * failed an assertion looked the same from the outside — a red job — and a
 * partition that ran two thirds of its tests and then stopped could be read as
 * evidence about the third it never reached. HARDEN-02 put it exactly: *a suite
 * that cannot finish stops reporting, and a report that stops is
 * indistinguishable from a pass.*
 *
 * So this reads Playwright's own `results.json` and states, in the job log and
 * in the GitHub step summary:
 *
 *   - which partition ran, and which spec files were assigned to it
 *   - how many tests it collected, and how many actually EXECUTED
 *   - passed / failed / intentionally skipped
 *   - how long it took against the partition's measured budget
 *   - whether anything was left unexecuted — and if so, it FAILS
 *
 * The last point is the load-bearing one. A test that never ran has no result at
 * all in the report; Playwright counts it under "skipped", where it is
 * indistinguishable from a `test.skip(…)` the suite meant. This tells them
 * apart (an intentional skip has a result; an unexecuted test has none) and
 * refuses to let the second kind pass silently.
 */

import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT =
  process.env.E2E_RESULTS_JSON ??
  join(ROOT, "playwright-report", "results.json");

const name = process.argv[2];
if (!name) {
  console.error("usage: e2e-partition-summary.mjs <partition>");
  process.exit(2);
}

const manifest = JSON.parse(
  readFileSync(join(ROOT, "e2e", "partitions.json"), "utf8"),
);
const partition = manifest.partitions.find((entry) => entry.name === name);
if (!partition) {
  console.error(`::error::No E2E partition "${name}" in e2e/partitions.json.`);
  process.exit(2);
}

const lines = [];
const say = (line) => {
  console.log(line);
  lines.push(line);
};

if (!existsSync(REPORT)) {
  console.error(
    `::error::E2E partition ${name} produced no ${REPORT}. Playwright did not ` +
      `reach the end of its run, so this job has NO result to read — treat it as ` +
      `a failed partition, not as an absence of failures.`,
  );
  process.exit(1);
}

const report = JSON.parse(readFileSync(REPORT, "utf8"));

/** Flatten the report into one row per test. */
const rows = [];
const visit = (suite, file) => {
  const current = suite.file ?? file;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const results = test.results ?? [];
      rows.push({
        file: `e2e/${String(current ?? "").replace(/^e2e\//, "")}`,
        title: [...(spec.title ? [spec.title] : [])].join(" › "),
        line: spec.line,
        executed: results.length > 0,
        status: test.status,
        durationMs: results.reduce(
          (sum, result) => sum + (result.duration ?? 0),
          0,
        ),
      });
    }
  }
  for (const child of suite.suites ?? []) visit(child, current);
};
for (const suite of report.suites ?? []) visit(suite, null);

const collected = rows.length;
const executed = rows.filter((row) => row.executed);
const neverRan = rows.filter((row) => !row.executed);
const failed = rows.filter(
  (row) => row.executed && row.status === "unexpected",
);
const flaky = rows.filter((row) => row.status === "flaky");
const skipped = rows.filter((row) => row.executed && row.status === "skipped");
const passed = executed.length - failed.length - skipped.length - flaky.length;
const elapsedMs = report.stats?.duration ?? 0;
const budgetMin = partition.estimateSeconds / 60;

/**
 * The run-level errors Playwright records outside any test — the
 * `Timed out waiting …s for the test suite to run` a `globalTimeout` writes is
 * the one that matters here, and naming it is the difference between "a shard
 * failed" and "a shard ran out of time".
 */
const runErrors = (report.errors ?? []).map((error) =>
  String(error.message ?? error)
    .split("\n")[0]
    .trim(),
);
const timedOut = runErrors.some((error) =>
  /Timed out waiting .* for the test suite/i.test(error),
);

const minutes = (ms) => `${(ms / 60000).toFixed(1)} min`;

say(`──────── E2E partition ${name} of ${manifest.partitions.length} ────────`);
say(
  `spec files assigned   ${partition.specs.length}${partition.shard ? ` (slice ${partition.shard})` : ""}`,
);
say(`tests collected       ${collected}`);
say(`tests executed        ${executed.length}`);
say(`  passed              ${passed}`);
say(`  failed              ${failed.length}`);
say(`  skipped (by a test) ${skipped.length}`);
say(`tests NEVER EXECUTED  ${neverRan.length}`);
say(
  `elapsed               ${minutes(elapsedMs)} against a ${budgetMin.toFixed(1)} min budget`,
);
say(
  `completed             ${neverRan.length === 0 && !timedOut ? "yes" : "NO"}`,
);
for (const error of runErrors) say(`run error             ${error}`);
for (const row of failed) say(`FAILED  ${row.file}:${row.line} › ${row.title}`);
if (neverRan.length > 0) {
  const byFile = new Map();
  for (const row of neverRan)
    byFile.set(row.file, (byFile.get(row.file) ?? 0) + 1);
  for (const [file, count] of [...byFile].sort()) {
    say(`NEVER RAN  ${count} test${count === 1 ? "" : "s"} in ${file}`);
  }
}

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  const table = [
    `### E2E partition \`${name}\` — ${neverRan.length === 0 && !timedOut ? "complete" : "**INCOMPLETE**"}`,
    "",
    "| | |",
    "| --- | --- |",
    `| spec files | ${partition.specs.length}${partition.shard ? ` (slice ${partition.shard})` : ""} |`,
    `| tests collected | ${collected} |`,
    `| tests executed | ${executed.length} |`,
    `| passed | ${passed} |`,
    `| failed | ${failed.length} |`,
    `| skipped by a test | ${skipped.length} |`,
    `| never executed | ${neverRan.length} |`,
    `| elapsed | ${minutes(elapsedMs)} (budget ${budgetMin.toFixed(1)} min) |`,
    "",
    ...failed.map((row) => `- ❌ \`${row.file}:${row.line}\` — ${row.title}`),
    ...(neverRan.length > 0
      ? [
          `- ⏱️ **${neverRan.length} tests never executed** — this partition did not finish.`,
        ]
      : []),
    "",
  ];
  appendFileSync(summaryFile, `${table.join("\n")}\n`);
}

if (timedOut || neverRan.length > 0) {
  console.error(
    `::error::E2E partition ${name} DID NOT COMPLETE — ${neverRan.length} of ${collected} ` +
      `assigned tests never executed${timedOut ? " (Playwright globalTimeout)" : ""}. ` +
      `This is a partition-budget failure, not a test failure: nothing can be concluded ` +
      `about the tests it never reached. Re-derive the split from measured time ` +
      `(pnpm run e2e:partitions:generate) rather than raising a timeout.`,
  );
  process.exit(1);
}

if (collected === 0) {
  console.error(
    `::error::E2E partition ${name} collected NO tests. Its spec files ` +
      `(${partition.specs.join(", ")}) matched nothing — a partition that runs nothing ` +
      `must never report success.`,
  );
  process.exit(1);
}

process.exit(failed.length > 0 ? 1 : 0);
