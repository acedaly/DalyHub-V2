/**
 * Sample the memory of a long Playwright shard — the WHOLE run, not just the
 * browser.
 *
 * DEBT-125 records a `browser.newContext: Target page, context or browser has
 * been closed` that lands at a POSITION rather than on a test: always shard 1,
 * always ~185 tests into one long-lived browser, always inside
 * `ai-assistance.spec.ts`'s responsive/phone-matrix block, but on a different
 * victim each time. A failure that repeats by position and not by subject is not
 * a bug in any of those tests — it is the process running out of something at
 * about that point. This measures the thing it would be running out of.
 *
 * Deliberately a SAMPLER rather than a fix: the entry says, in terms, that the
 * evidence to gather is RSS across a shard and NOT a higher retry count, because
 * a retry destroys the only property that makes this diagnosable.
 *
 * ── HARDEN-01 widened what it samples, because the first version could not
 * answer the question it was built to answer ────────────────────────────────
 * It measured Chromium alone. Run against a full shard that told us Chromium's
 * tree is FLAT — and left the actual answer invisible, because on this suite the
 * two local servers dwarf the browser: a `react-router dev` Node process past a
 * gigabyte and a `workerd` past half of one, against a Chromium tree of ~1.4 GB
 * spread over eleven processes. "Is the pressure the browser, the test runner or
 * the Cloudflare worker?" is exactly the question DEBT-125 poses, and one column
 * cannot tell them apart. So each cohort is now its own column, plus the
 * system's own `MemAvailable`, which is the number a kernel OOM decision is
 * actually made against.
 *
 * Usage:
 *   node scripts/measure-e2e-browser-rss.mjs -- <playwright args...>
 *
 * Writes two files into `--out` (default `rss-evidence/`):
 *   - `rss.csv`     one row per sample: elapsed seconds, per-cohort RSS, counts,
 *                   and system MemAvailable
 *   - `tests.csv`   one row per test result, with the elapsed second it ended
 * so the two can be joined on time and each curve read against test index.
 */

import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const separator = argv.indexOf("--");
const outFlag = argv.indexOf("--out");
const outDir =
  outFlag !== -1 && argv[outFlag + 1] ? argv[outFlag + 1] : "rss-evidence";
const playwrightArgs =
  separator === -1 ? ["test"] : ["test", ...argv.slice(separator + 1)];

const INTERVAL_MS = 2_000;

mkdirSync(outDir, { recursive: true });
const rss = createWriteStream(`${outDir}/rss.csv`);
const tests = createWriteStream(`${outDir}/tests.csv`);
rss.write(
  [
    "elapsed_s",
    "total_rss_kb",
    "peak_process_rss_kb",
    "process_count",
    "node_rss_kb",
    "node_peak_rss_kb",
    "node_count",
    "workerd_rss_kb",
    "workerd_peak_rss_kb",
    "workerd_count",
    "mem_available_kb",
  ].join(",") + "\n",
);
tests.write("elapsed_s,index,status,title\n");

const started = Date.now();
const elapsed = () => ((Date.now() - started) / 1000).toFixed(1);

/**
 * The kernel's own view of how much room is left.
 *
 * `MemAvailable` — not `MemFree` — because that is the number an out-of-memory
 * decision is actually made against: free pages plus the reclaimable page cache.
 * A run can sit at almost zero `MemFree` and be perfectly healthy. Absent on
 * platforms without procfs, in which case the column is empty rather than a lie.
 */
function memAvailableKb() {
  try {
    const match = /^MemAvailable:\s+(\d+) kB$/m.exec(
      readFileSync("/proc/meminfo", "utf8"),
    );
    return match ? Number.parseInt(match[1], 10) : "";
  } catch {
    return "";
  }
}

/** An empty cohort, so a sample always has the same shape. */
const emptyCohort = () => ({ total: 0, peak: 0, count: 0 });

/**
 * Every process the run owns, summed BY COHORT.
 *
 * Three cohorts, because DEBT-125 asks which of them the pressure is in and one
 * column cannot tell them apart:
 *
 *   - **chromium** — the browser and its helpers. Multi-process, so both the
 *     tree total and the largest single process matter: a renderer hitting a
 *     per-process ceiling and the whole tree exhausting the machine are
 *     different failures with different answers.
 *   - **node** — the Playwright runner and the `react-router dev` server. On
 *     this suite the dev server alone is the largest single process in the run,
 *     which is not what "the browser ran out of memory" would predict.
 *   - **workerd** — the Cloudflare runtime behind both local servers.
 *
 * The sampler's own `ps` is excluded from every cohort, and the node cohort
 * excludes this script so the measurement never measures itself.
 */
function sampleRss() {
  let out;
  try {
    out = execFileSync("ps", ["-eo", "rss=,comm=,args="], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null;
  }
  const chromium = emptyCohort();
  const node = emptyCohort();
  const workerd = emptyCohort();
  const add = (cohort, kb) => {
    cohort.total += kb;
    cohort.peak = Math.max(cohort.peak, kb);
    cohort.count += 1;
  };
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    if (/measure-e2e-browser-rss/.test(line)) continue;
    const kb = Number.parseInt(line.trim().split(/\s+/)[0], 10);
    if (!Number.isFinite(kb)) continue;
    // Order matters: the browser cohort is decided first, because a node
    // process whose ARGV happens to mention chromium is still node.
    if (/headless_shell|\/chrome\b|\/chromium\b/i.test(line)) {
      add(chromium, kb);
    } else if (/(^|\s|\/)workerd(\s|$)/.test(line)) {
      add(workerd, kb);
    } else if (/(^|\s|\/)node(\s|$)|\bvite\b|playwright/i.test(line)) {
      add(node, kb);
    }
  }
  return { chromium, node, workerd, memAvailable: memAvailableKb() };
}

const timer = setInterval(() => {
  const sample = sampleRss();
  if (sample) {
    rss.write(
      [
        elapsed(),
        sample.chromium.total,
        sample.chromium.peak,
        sample.chromium.count,
        sample.node.total,
        sample.node.peak,
        sample.node.count,
        sample.workerd.total,
        sample.workerd.peak,
        sample.workerd.count,
        sample.memAvailable,
      ].join(",") + "\n",
    );
  }
}, INTERVAL_MS);

const child = spawn("npx", ["playwright", ...playwrightArgs], {
  env: { ...process.env, FORCE_COLOR: "0" },
  stdio: ["ignore", "pipe", "inherit"],
});

// The `list` reporter's per-test line carries the index and the outcome, which
// is what turns a memory curve into "…and it died HERE, at test N".
const TEST_LINE = /^\s+(✓|✘|-|×)\s+(\d+)\s+(.*)$/;
let buffer = "";
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    const match = TEST_LINE.exec(line);
    if (!match) continue;
    const status =
      match[1] === "✓" ? "passed" : match[1] === "-" ? "skipped" : "failed";
    tests.write(
      `${elapsed()},${match[2]},${status},"${match[3].replace(/"/g, "'")}"\n`,
    );
  }
});

child.on("exit", (code) => {
  clearInterval(timer);
  rss.end();
  tests.end();
  console.log(
    `\nRSS evidence written to ${outDir}/rss.csv and ${outDir}/tests.csv`,
  );
  process.exit(code ?? 1);
});
