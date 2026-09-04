#!/usr/bin/env node
/**
 * DEBT-173's proof: the same tree, under two derived splits, gives the same
 * answers (V2.8 CONV-03).
 *
 * The entry's closing condition is written in one sentence — *"the split can be
 * re-derived and the partition assignment materially reshuffled without any spec
 * changing its result, demonstrated by two runs of the same commit under two
 * different derived splits"* — and until now nothing in the repository could
 * read that sentence back off two runs. Somebody had to compare thirteen JSON
 * reports against thirteen others by eye, which is why the condition had been
 * argued about for five programmes and never once performed.
 *
 * So this performs it. Given two directories of per-partition Playwright JSON
 * reports — what `pnpm run e2e:gate --out=<dir>` writes — it builds one row per
 * TEST from each side, keyed by the test's own identity rather than by which
 * partition happened to run it, and reports:
 *
 *   - tests present on one side and absent from the other (a coverage change,
 *     which is a worse failure than a differing result and is reported first);
 *   - tests whose OUTCOME differs.
 *
 * It exits non-zero if either set is non-empty. A green exit is the sentence
 * above, demonstrated.
 *
 *   node scripts/e2e-order-proof.mjs playwright-report/gate playwright-report/gate-b
 *
 * What it deliberately does NOT compare is DURATION. Two runs of one tree differ
 * in wall clock by more than the split's own imbalance — measured, twice, on
 * runs 32821202642 and 32823892606 — and a proof that failed on that would be
 * measuring the machine.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const [left, right] = process.argv.slice(2);
if (!left || !right) {
  console.error(
    "usage: e2e-order-proof.mjs <arrangement-a-dir> <arrangement-b-dir>",
  );
  process.exit(2);
}

for (const dir of [left, right]) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`Not a directory: ${dir}`);
    process.exit(2);
  }
}

/**
 * Every test in one arrangement, as identity → { label, outcome }.
 *
 * Keyed on the test's OWN identity and never on its partition, because the whole
 * point is that the partition changed. Playwright's `spec.id` is that identity —
 * the same string it uses to match a test across reports, which is why
 * `durationsFromReports` keys on it too. The fallback is the file, the line and
 * the full title path together: two tests in one file can share a title under
 * different `describe`s, and a key that merged them would quietly compare four
 * results as two. Both sides are the same commit, so a line number is stable.
 *
 * The label is what a difference is REPORTED as, and it carries the describe
 * path so the line naming a disagreement is readable without opening a report.
 */
function outcomes(dir) {
  const rows = new Map();
  const reports = readdirSync(dir).filter(
    (name) => name.endsWith(".json") && name !== "gate-summary.json",
  );
  if (reports.length === 0) {
    console.error(`No partition reports in ${dir}.`);
    process.exit(2);
  }
  for (const report of reports) {
    const parsed = JSON.parse(readFileSync(join(dir, report), "utf8"));
    // `depth` rather than the presence of `suite.file`: EVERY suite carries the
    // file it came from, including the nested `describe`s, so a test's describe
    // path is the titles of every suite below the top-level file suite.
    const visit = (suite, file, titles, depth) => {
      const current = suite.file
        ? `e2e/${String(suite.file).replace(/^e2e\//, "")}`
        : file;
      const path = depth === 0 ? titles : [...titles, suite.title];
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const label = `${current} › ${[...path, spec.title].join(" › ")}`;
          const key =
            spec.id ??
            `${current}:${spec.line}:${[...path, spec.title].join("›")}`;
          const executed = (test.results ?? []).length > 0;
          rows.set(key, {
            label,
            outcome: executed ? test.status : "never-executed",
          });
        }
      }
      for (const child of suite.suites ?? [])
        visit(child, current, path, depth + 1);
    };
    for (const suite of parsed.suites ?? []) visit(suite, null, [], 0);
  }
  return rows;
}

const a = outcomes(left);
const b = outcomes(right);

const onlyLeft = [...a.keys()]
  .filter((key) => !b.has(key))
  .map((key) => a.get(key).label)
  .sort();
const onlyRight = [...b.keys()]
  .filter((key) => !a.has(key))
  .map((key) => b.get(key).label)
  .sort();
const differing = [...a.keys()]
  .filter((key) => b.has(key) && a.get(key).outcome !== b.get(key).outcome)
  .map((key) => ({
    label: a.get(key).label,
    left: a.get(key).outcome,
    right: b.get(key).outcome,
  }))
  .sort((one, other) => one.label.localeCompare(other.label));

const summary = JSON.parse(
  existsSync(join(left, "gate-summary.json"))
    ? readFileSync(join(left, "gate-summary.json"), "utf8")
    : "{}",
);
const summaryB = JSON.parse(
  existsSync(join(right, "gate-summary.json"))
    ? readFileSync(join(right, "gate-summary.json"), "utf8")
    : "{}",
);

/**
 * How much the two arrangements actually differ.
 *
 * A proof that both runs used the SAME split would be vacuous, and that is the
 * exact way this check could quietly stop meaning anything — so the reshuffle is
 * measured and printed beside the result: for each spec file, whether the set of
 * spec files it shares a partition with changed at all.
 */
function neighbourSets(arrangement) {
  const map = new Map();
  for (const partition of arrangement ?? []) {
    for (const spec of partition.specs) {
      map.set(
        spec,
        partition.specs
          .filter((other) => other !== spec)
          .sort()
          .join(","),
      );
    }
  }
  return map;
}
const neighboursA = neighbourSets(summary.partitions);
const neighboursB = neighbourSets(summaryB.partitions);
const moved = [...neighboursA.keys()].filter(
  (spec) => neighboursA.get(spec) !== neighboursB.get(spec),
).length;

console.log("──────── DEBT-173 · two derived splits, one tree ────────");
console.log(`arrangement A         ${summary.arrangement ?? "?"}  (${left})`);
console.log(`arrangement B         ${summaryB.arrangement ?? "?"}  (${right})`);
console.log(`tests compared        ${a.size} / ${b.size}`);
if (neighboursA.size > 0 && neighboursB.size > 0) {
  console.log(
    `spec files reshuffled ${moved} of ${neighboursA.size} got a different neighbour set`,
  );
}
console.log(`outcomes that differ  ${differing.length}`);
console.log(`tests only in A       ${onlyLeft.length}`);
console.log(`tests only in B       ${onlyRight.length}`);

for (const label of onlyLeft) console.log(`  ONLY IN A  ${label}`);
for (const label of onlyRight) console.log(`  ONLY IN B  ${label}`);
for (const row of differing) {
  console.log(`  DIFFERS    ${row.label}  (A: ${row.left}, B: ${row.right})`);
}

if (moved === 0 && neighboursA.size > 0) {
  console.error(
    "::error::The two arrangements are the same split — nothing was reshuffled, " +
      "so an identical result proves nothing. Derive the second arrangement at a " +
      "different partition count.",
  );
  process.exit(1);
}

if (onlyLeft.length > 0 || onlyRight.length > 0 || differing.length > 0) {
  console.error(
    "::error::The two arrangements do NOT agree. A spec whose result depends on " +
      "which other specs preceded it is asserting against accumulated state, not " +
      "against the product (DEBT-173).",
  );
  process.exit(1);
}

console.log(
  "\nThe same tests produced the same results under both arrangements.",
);
