/**
 * PERF-01 — measure what a real navigation actually costs, against a real server.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * Everything else in this programme is a STRUCTURAL proxy: statement counts,
 * round-trip depth, query plans, payload bounds. Those are what a test can pin,
 * because a CI runner's wall clock is not evidence about production. But the
 * question the owner asked — *does navigation feel instant?* — is a wall-clock
 * question, and it needs an instrument that reports wall-clock time from a real
 * client against a real server.
 *
 * This is that instrument. It requests the React Router `.data` endpoint for a
 * list of routes, N times each, and reports TTFB and total per sample plus p50
 * and p95. It is the same measurement the owner took by hand in Safari's network
 * panel, made repeatable.
 *
 * ── It never holds a credential ───────────────────────────────────────────────
 * DalyHub production sits behind Cloudflare Access. This script does NOT
 * authenticate, does not read a token file, and does not accept a password. It
 * takes a cookie header from the ENVIRONMENT (`DALYHUB_PERF_COOKIE`) if the
 * operator chooses to export one for the duration of a run, and it never writes
 * it anywhere — not to stdout, not to a report file. With no cookie it still
 * runs, and it reports what it actually got: an Access redirect, which is a
 * useful measurement of its own (it is the network floor every authenticated
 * request is measured against).
 *
 * If you would rather not put a session cookie in an environment variable at
 * all, don't: §"Measuring by hand" in `docs/development/PERFORMANCE.md`
 * documents the DevTools workflow that produces the same numbers from a browser
 * that is already signed in.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   pnpm run perf:navigation                       # localhost:4173, defaults
 *   pnpm run perf:navigation -- --base=https://hub.daly.id.au --samples=10
 *   pnpm run perf:navigation -- --routes=/today,/tasks --json
 *
 * Options:
 *   --base=<url>       Origin to measure. Default http://localhost:4173 (the
 *                      port `e2e/dev-server.ts` runs the development server on).
 *   --routes=a,b,c     Routes to measure. Default: the seven hot destinations.
 *   --samples=<n>      Samples per route (default 5). The first is reported
 *                      separately as the COLD sample and excluded from p50/p95.
 *   --json             Emit machine-readable JSON instead of a table.
 *   --timeout=<ms>     Per-request timeout (default 30000).
 *
 * Exit code is 0 whenever the measurement itself succeeded. This script reports;
 * it does not gate. A wall-clock threshold in CI would be a flaky test, and the
 * repository's budgets are pinned structurally instead — see
 * `test/kernel/navigation-statement-budget.test.ts`.
 */

const DEFAULT_ROUTES = [
  "/today",
  "/tasks",
  "/projects",
  "/goals",
  "/obligations",
  "/finance",
  "/analytics",
];

function parseArgs(argv) {
  const options = {
    base: "http://localhost:4173",
    routes: DEFAULT_ROUTES,
    samples: 5,
    json: false,
    timeout: 30_000,
  };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg.startsWith("--base=")) options.base = arg.slice(7);
    else if (arg.startsWith("--routes="))
      options.routes = arg
        .slice(9)
        .split(",")
        .map((one) => one.trim())
        .filter((one) => one.length > 0);
    else if (arg.startsWith("--samples="))
      options.samples = Math.max(1, Number.parseInt(arg.slice(10), 10) || 1);
    else if (arg.startsWith("--timeout="))
      options.timeout = Math.max(
        1000,
        Number.parseInt(arg.slice(10), 10) || 30_000,
      );
    else if (arg === "--help" || arg === "-h") options.help = true;
    else {
      console.error(`Unknown option: ${arg}`);
      process.exit(2);
    }
  }
  return options;
}

/**
 * The URL React Router asks for when it navigates client-side.
 *
 * Single fetch appends `.data` to the pathname, which is exactly the request the
 * owner watched take 450 ms and 850 ms in Safari. Measuring the HTML document
 * instead would measure a different thing (a full SSR render), and measuring
 * `/route` with an `Accept: application/json` would measure nothing the product
 * sends.
 */
function dataUrl(base, route) {
  const url = new URL(route, base);
  url.pathname = `${url.pathname.replace(/\/$/, "")}.data`;
  return url.toString();
}

/** One request, timed. Returns TTFB (first byte) and total (body complete). */
async function sample(url, { cookie, timeout }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "*/*",
        // React Router marks its data requests; some servers vary on it.
        "x-dalyhub-perf": "1",
        ...(cookie ? { cookie } : {}),
      },
    });
    const ttfb = performance.now() - startedAt;
    const body = await response.arrayBuffer();
    const total = performance.now() - startedAt;
    return {
      ok: true,
      status: response.status,
      ttfbMs: ttfb,
      totalMs: total,
      bytes: body.byteLength,
      // A 3xx here means Cloudflare Access answered instead of the application.
      redirected: response.status >= 300 && response.status < 400,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ttfbMs: performance.now() - startedAt,
      totalMs: performance.now() - startedAt,
      bytes: 0,
      redirected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function round(value) {
  return value === null ? null : Math.round(value * 10) / 10;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "pnpm run perf:navigation -- [--base=URL] [--routes=a,b] [--samples=N] [--json]",
        "",
        "Measures the React Router `.data` request for each route and reports",
        "TTFB / total / p50 / p95. Reads an optional session cookie from the",
        "DALYHUB_PERF_COOKIE environment variable; it is never printed or stored.",
      ].join("\n"),
    );
    return;
  }

  const cookie = process.env.DALYHUB_PERF_COOKIE ?? "";
  const results = [];

  for (const route of options.routes) {
    const url = dataUrl(options.base, route);
    const samples = [];
    for (let index = 0; index < options.samples; index += 1) {
      samples.push(await sample(url, { cookie, timeout: options.timeout }));
    }
    const [cold, ...warm] = samples;
    const warmTotals = warm.filter((one) => one.ok).map((one) => one.totalMs);
    const warmTtfbs = warm.filter((one) => one.ok).map((one) => one.ttfbMs);
    results.push({
      route,
      status: cold.status,
      // Named honestly: a 3xx is Cloudflare Access answering, and the number is
      // then the network floor rather than an application measurement.
      /*
       * Three outcomes, kept apart on purpose. A run that could not CONNECT is
       * not the same as one Cloudflare Access answered, and neither is the same
       * as an application measurement — reporting all three as "not
       * authenticated" is how an operator spends an afternoon looking for an
       * auth problem that is a wrong port.
       */
      outcome: !cold.ok
        ? "unreachable"
        : cold.redirected
          ? "redirected"
          : cold.status === 200
            ? "measured"
            : "refused",
      bytes: cold.bytes,
      coldTtfbMs: round(cold.ttfbMs),
      coldTotalMs: round(cold.totalMs),
      warmTtfbP50Ms: round(percentile(warmTtfbs, 50)),
      warmTotalP50Ms: round(percentile(warmTotals, 50)),
      warmTotalP95Ms: round(percentile(warmTotals, 95)),
      samples: samples.length,
      error: cold.ok ? undefined : cold.error,
    });
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        { base: options.base, samples: options.samples, results },
        null,
        2,
      ),
    );
    return;
  }

  const unmeasured = results.filter((one) => one.outcome !== "measured");
  console.log(`\nDalyHub navigation benchmark — ${options.base}`);
  console.log(
    `${options.samples} samples per route; the first is the cold one.\n`,
  );
  const header = [
    "route".padEnd(16),
    "outcome".padStart(11),
    "status".padStart(7),
    "bytes".padStart(9),
    "cold TTFB".padStart(11),
    "cold tot".padStart(10),
    "p50 TTFB".padStart(10),
    "p50 tot".padStart(9),
    "p95 tot".padStart(9),
  ].join(" ");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const row of results) {
    console.log(
      [
        row.route.padEnd(16),
        row.outcome.padStart(11),
        String(row.status).padStart(7),
        String(row.bytes).padStart(9),
        `${row.coldTtfbMs ?? "-"}`.padStart(11),
        `${row.coldTotalMs ?? "-"}`.padStart(10),
        `${row.warmTtfbP50Ms ?? "-"}`.padStart(10),
        `${row.warmTotalP50Ms ?? "-"}`.padStart(9),
        `${row.warmTotalP95Ms ?? "-"}`.padStart(9),
      ].join(" "),
    );
  }
  if (unmeasured.length > 0) {
    const lines = ["", "Not every route produced an application measurement:"];
    for (const row of unmeasured) {
      if (row.outcome === "unreachable") {
        lines.push(
          `  ${row.route}: could not connect — ${row.error ?? "no response"}.`,
        );
      } else if (row.outcome === "redirected") {
        lines.push(
          `  ${row.route}: answered by Cloudflare Access (${row.status}). That figure is the NETWORK FLOOR, not the application.`,
        );
      } else {
        lines.push(`  ${row.route}: answered ${row.status}.`);
      }
    }
    lines.push(
      "",
      "Is the server running, and is --base pointing at it? For an",
      "authenticated production measurement, export DALYHUB_PERF_COOKIE for the",
      "run, or use the DevTools workflow in",
      "docs/development/PERFORMANCE.md §11.2.",
    );
    console.log(lines.join("\n"));
  }
  console.log("");
}

await main();
