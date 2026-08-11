/**
 * Sample Chromium's resident set size across a long Playwright shard.
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
 * evidence to gather is Chromium's RSS across a shard and NOT a higher retry
 * count, because a retry destroys the only property that makes this
 * diagnosable.
 *
 * Usage:
 *   node scripts/measure-e2e-browser-rss.mjs -- <playwright args...>
 *
 * Writes two files into `--out` (default `rss-evidence/`):
 *   - `rss.csv`     one row per sample: elapsed seconds, total/peak RSS, process count
 *   - `tests.csv`   one row per test result, with the elapsed second it ended
 * so the two can be joined on time and the curve read against test index.
 */

import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";

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
rss.write("elapsed_s,total_rss_kb,peak_process_rss_kb,process_count\n");
tests.write("elapsed_s,index,status,title\n");

const started = Date.now();
const elapsed = () => ((Date.now() - started) / 1000).toFixed(1);

/**
 * Every Chromium process the run owns, summed.
 *
 * The browser is multi-process, so the number that matters is the TOTAL across
 * the tree plus the largest single process: a renderer hitting a per-process
 * ceiling and the whole tree exhausting the container's memory are different
 * failures with different answers, and one column cannot tell them apart.
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
  let total = 0;
  let peak = 0;
  let count = 0;
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    // Match the browser binary and its helper processes, not the node harness
    // that spawned them and not this sampler's own `ps`.
    if (!/chrom(e|ium)|headless_shell/i.test(line)) continue;
    if (/measure-e2e-browser-rss/.test(line)) continue;
    const kb = Number.parseInt(line.trim().split(/\s+/)[0], 10);
    if (!Number.isFinite(kb)) continue;
    total += kb;
    peak = Math.max(peak, kb);
    count += 1;
  }
  return { total, peak, count };
}

const timer = setInterval(() => {
  const sample = sampleRss();
  if (sample) {
    rss.write(`${elapsed()},${sample.total},${sample.peak},${sample.count}\n`);
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
