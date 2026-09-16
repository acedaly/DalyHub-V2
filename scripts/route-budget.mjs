#!/usr/bin/env node
/**
 * PERF-02 — the per-route JavaScript budget, checked against the real build.
 *
 * ── What this exists to stop ────────────────────────────────────────────────
 *
 * A route's cost is not decided by the route's own file. It is decided by the
 * STATIC import graph of that file plus every parent layout — and the cheapest
 * possible line of code can add 100 KB to it, because importing one name from a
 * barrel loads everything that barrel names. Nothing in review shows that.
 * MEASURED on `main` @ `482ddd6`, three one-line imports were costing:
 *
 *   - `import { Sparkline } from "~/shared/charts"` in Today — 111.6 KB gzip of
 *     Recharts, for a 2.3 KB inline SVG, on the product's default landing route;
 *   - `import { useOffline } from "~/shared/offline"` in `usePendingTasks` —
 *     ~44 KB raw of Settings and `/offline` panels, on five routes that draw
 *     none of them;
 *   - `import { COLOR_SCHEME_PALETTES }` in `root.tsx` — 78.4 KB of generated
 *     colour data in the chunk EVERY route loads, to read ten strings.
 *
 * All three were invisible until someone measured the built artefact, and all
 * three could come back in a one-line diff. This is the measurement, run on
 * every build.
 *
 * ── The two assertions, and why the second one matters more ─────────────────
 *
 * 1. A **gzip ceiling** per route. Blunt, and it catches gross regressions.
 * 2. A **forbidden-runtime list** per route: a named third-party runtime that
 *    must not be in that route's STATIC graph at all. This is the assertion with
 *    teeth, because it names the defect rather than its size — "Today must not
 *    load the charting runtime" survives a legitimate 20 KB of new Today code,
 *    where a byte ceiling would just be raised.
 *
 * A runtime is identified by a CONTENT FINGERPRINT — a string its own source
 * emits (`recharts-wrapper`, `cm-content`) — not by a chunk name. Chunk names
 * are derived from whichever module rolldown happened to name the chunk after
 * and change without anyone touching the dependency.
 *
 * ── Raising a budget ────────────────────────────────────────────────────────
 *
 * `--generate` re-derives every ceiling from the current build. That is the
 * right thing to do when a route legitimately grew, and the wrong thing to do
 * when this script has just told you a runtime came back: re-generating clears
 * the ceiling and leaves the `forbid` list, which is the one that failed. The
 * `forbid` list is edited by hand, deliberately, with a reason.
 *
 * Run `pnpm run perf:budget` after `pnpm run build`.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const ROOT = process.cwd();
const CLIENT = path.join(ROOT, "build", "client");
const ASSETS = path.join(CLIENT, "assets");
const BUDGETS = path.join(ROOT, "scripts", "route-budgets.json");

/** Headroom over the measured figure, so ordinary churn is not a failure. */
const HEADROOM = 1.08;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

/**
 * Read the React Router client manifest.
 *
 * It is emitted as `window.__reactRouterManifest = {…};` — a plain object
 * literal with no computed members, so it is read with `eval` in this
 * build-time script rather than by hand-parsing JavaScript. The input is the
 * repository's own build output, produced seconds earlier by `pnpm run build`.
 */
function readRouteManifest() {
  if (!existsSync(ASSETS)) {
    throw new Error(
      "build/client/assets is missing — run `pnpm run build` first.",
    );
  }
  const file = readdirSync(ASSETS).find((name) => name.startsWith("manifest-"));
  if (!file) {
    throw new Error("No React Router manifest in build/client/assets.");
  }
  const source = readFileSync(path.join(ASSETS, file), "utf8");
  const literal = /=\s*(\{[\s\S]*\});?\s*$/.exec(source);
  if (!literal) {
    throw new Error(`Could not read the route manifest out of ${file}.`);
  }
  // See this function's own comment for why the manifest is read this way.
  return eval(`(${literal[1]})`).routes;
}

const sizeCache = new Map();

/** The raw and gzip size of one emitted asset, by its client-root URL. */
function sizeOf(url) {
  if (sizeCache.has(url)) return sizeCache.get(url);
  const file = path.join(CLIENT, url.replace(/^\//, ""));
  if (!existsSync(file)) return null;
  const buffer = readFileSync(file);
  const value = {
    raw: buffer.length,
    gzip: gzipSync(buffer, { level: 9 }).length,
    text: buffer.toString("latin1"),
  };
  sizeCache.set(url, value);
  return value;
}

/**
 * The chunks a route loads BEFORE it renders: its own module, every parent
 * layout's module, and everything any of them statically imports. Dynamic
 * imports are deliberately excluded — a lazily-loaded chart is the fix, not the
 * defect.
 */
function staticGraph(routes, id) {
  const out = new Set();
  const seen = new Set();
  let current = id;
  while (current && routes[current] && !seen.has(current)) {
    seen.add(current);
    const route = routes[current];
    if (route.module) out.add(route.module);
    for (const imported of route.imports ?? []) out.add(imported);
    current = route.parentId;
  }
  return [...out].filter((url) => sizeOf(url) !== null);
}

function measure(routes, id, fingerprints) {
  const chunks = staticGraph(routes, id);
  let gzip = 0;
  let raw = 0;
  const present = new Set();
  for (const url of chunks) {
    const size = sizeOf(url);
    gzip += size.gzip;
    raw += size.raw;
    for (const [name, marker] of Object.entries(fingerprints)) {
      if (size.text.includes(marker)) present.add(name);
    }
  }
  return { chunks, gzip, raw, present };
}

function main() {
  const generate = process.argv.includes("--generate");
  const manifest = JSON.parse(readFileSync(BUDGETS, "utf8"));
  const routes = readRouteManifest();
  const fingerprints = manifest.fingerprints;

  const results = [];
  for (const [id, budget] of Object.entries(manifest.routes)) {
    if (!routes[id]) {
      fail(
        `route-budget: "${id}" is in scripts/route-budgets.json but not in the ` +
          `built route manifest. Either the route was renamed (update the ` +
          `budget) or removed (delete its entry).`,
      );
      continue;
    }
    results.push({ id, budget, ...measure(routes, id, fingerprints) });
  }

  if (generate) {
    for (const result of results) {
      manifest.routes[result.id].gzipBudgetBytes = Math.ceil(
        result.gzip * HEADROOM,
      );
      manifest.routes[result.id].measuredGzipBytes = result.gzip;
    }
    manifest.measuredFrom = new Date().toISOString().slice(0, 10);
    writeFileSync(BUDGETS, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(
      `route-budget --generate — re-derived ${results.length} ceilings at ` +
        `${Math.round((HEADROOM - 1) * 100)}% headroom. The \`forbid\` lists were NOT touched.`,
    );
    return;
  }

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(
    "route".padEnd(18),
    "chunks",
    "gzip".padStart(10),
    "budget".padStart(10),
  );
  for (const result of results) {
    const over = result.gzip > result.budget.gzipBudgetBytes;
    console.log(
      result.id.padEnd(18),
      String(result.chunks.length).padStart(6),
      kb(result.gzip).padStart(10),
      kb(result.budget.gzipBudgetBytes).padStart(10),
      over ? "OVER" : "",
    );

    if (over) {
      fail(
        `\nroute-budget: ${result.budget.path} statically loads ${kb(result.gzip)} ` +
          `of JavaScript, past its ${kb(result.budget.gzipBudgetBytes)} ceiling.\n` +
          `  A route's cost is its own module plus every parent layout plus ` +
          `everything they statically import.\n` +
          `  Look for a barrel import first: one name from a module that ` +
          `re-exports something heavy loads all of it.\n` +
          `  If the growth is genuinely this route's own code, ` +
          `\`node scripts/route-budget.mjs --generate\` re-derives the ceiling.`,
      );
    }

    for (const forbidden of result.budget.forbid ?? []) {
      if (!result.present.has(forbidden)) continue;
      fail(
        `\nroute-budget: ${result.budget.path} statically loads the ` +
          `"${forbidden}" runtime, which this route forbids.\n` +
          `  Detected by the content fingerprint ${JSON.stringify(fingerprints[forbidden])} ` +
          `in one of its ${result.chunks.length} static chunks.\n` +
          `  This is almost always a barrel: importing one cheap name from a ` +
          `module that also re-exports\n` +
          `  something built on "${forbidden}" loads the whole runtime. Import ` +
          `the cheap thing from its own module,\n` +
          `  or move it out of that barrel. Do NOT answer this by raising a ` +
          `budget — the ceiling is not what failed.`,
      );
    }
  }

  if (process.exitCode !== 1) {
    console.log(
      `\nroute-budget — ${results.length} routes within budget, and none loads a forbidden runtime.`,
    );
  }
}

main();
