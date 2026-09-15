/**
 * PWA-10 — the performance and storage budgets.
 *
 * Numbers in a document rot. These are the same numbers as executable ceilings,
 * so a change that quietly triples what DalyHub downloads to a phone fails here
 * instead of being discovered on a metered connection.
 *
 * Every budget is deliberately set with headroom over the measured value (each
 * one records what it measured when it was written), so this is a ratchet
 * against regression rather than a test that fails on a one-kilobyte change. The
 * measured figures are printed on every run and are the source of the table in
 * `docs/development/PWA_AND_OFFLINE.md`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { expect, test, type Page } from "@playwright/test";

const PROD_BASE = "http://localhost:4174";

/* Budgets. Measured 2026-08-02 against the production build of V2.0.1. */

/*
 * TWO ceilings over the service worker, because it is two things that grow for
 * completely different reasons (DEBT-172).
 *
 * ── What one ceiling was actually measuring ──────────────────────────────────
 * `/sw.js` is `vite-plugins/sw-template.js` with a build id, an offline
 * document and a PRECACHE MANIFEST substituted into it. A single ceiling over
 * the served file therefore moves when somebody adds a ROUTE — and it did:
 * measured 2026-08-19 (TASKS-12) at 24,025 bytes against a 24,000 ceiling,
 * where `main` @ cd14b3e was 23,960 — forty bytes of headroom. The worker's
 * LOGIC was byte-identical on both; TASKS-12 added one resource route and one
 * chunk, and the manifest grew by sixty-five bytes.
 *
 * So the number had stopped answering *"is the worker small enough to read in
 * one sitting?"* and started answering *"has anyone added a route?"* — and,
 * worse, would have gone quiet about real worker growth as soon as somebody
 * re-baselined it.
 *
 * ── The two, and what each is for ────────────────────────────────────────────
 * The LOGIC ceiling is over `sw-template.js` on disk. Nothing but a deliberate
 * change to the worker moves it, so it is the one that means "the worker
 * grew". Measured 2026-08-25: 22,925 bytes.
 *
 * The MANIFEST ceiling is over the URL literals the plugin substitutes, and it
 * sits beside `PRECACHE_MAX_ASSETS`, which already bounds the manifest's
 * LENGTH. This one bounds its BYTES, so a route with a very long path is
 * caught as well as a route that is merely one more. Measured 2026-08-25 and
 * printed on every run.
 *
 * Each carries headroom over its measured value, and the test asserts the two
 * ACCOUNT for the served worker — otherwise a third thing could grow inside
 * `/sw.js` with neither ceiling seeing it, which is the failure this split
 * would otherwise introduce.
 */
const SERVICE_WORKER_LOGIC_MAX_BYTES = 25_000;
const PRECACHE_MANIFEST_MAX_BYTES = 2_000;

/*
 * What the substitutions other than the manifest are worth, plus slack.
 *
 * `__DALYHUB_BUILD_ID__` and `__DALYHUB_OFFLINE_DOCUMENT__` are replaced by
 * short literals, so the served worker is the template plus the manifest plus a
 * few hundred bytes. This bounds "a few hundred": if the served file is bigger
 * than the two ceilings can explain, something is growing that neither of them
 * measures, and that is the one regression a split budget can hide.
 */
const SUBSTITUTION_SLACK_BYTES = 4_000;

/*
 * Measured 2026-09-14 (the CI green pass): 1,605 kB across 31 assets
 * uncompressed, and 349 kB over the wire.
 *
 * ── Why this number moved, and what was done before moving it ────────────────
 * The previous pair — 1,450,000 / 320,000 — was set on 2026-08-17 (HARDEN-05)
 * from a measured 1,321 kB / 284 kB, with the ~10% headroom this file's opening
 * paragraph describes. It then failed on `main` for every run from #282 onward,
 * at 2,046 kB against 1,450 kB: a 41% breach, which is far too big to nudge a
 * threshold past and is not what re-baselining is for.
 *
 * So the breach was measured asset by asset first, and 417 kB of it turned out
 * not to be architecture at all. Three sub-components of the vendored Untitled
 * `EmptyState` each named a DISPATCHER over a whole artwork set — file-type
 * icons, background patterns, illustrations — and naming a dispatcher
 * references every member of its set, so none of it can be tree-shaken.
 * `/offline` renders an EmptyState, which put all three sets inside the OFFLINE
 * SHELL PRECACHE: every DalyHub install downloaded ~150 file-type glyphs, four
 * background patterns (one of them a single 140 kB SVG) and four illustrations
 * before it could boot offline, and the product draws NONE of them — it passed
 * `pattern="none"` and routes its own illustrations around upstream's slot.
 * They are gone, recorded as patches in `scripts/vendor-untitled.mjs` so a
 * re-vendor cannot quietly bring them back:
 *
 *   precache   2,021,193 B → 1,604,768 B   (−416,425, −20.6%)
 *   transfer     405,008 B →   349,133 B   (−55,875,  −13.8%)
 *
 * ── Why the remainder is genuinely bigger than August's shell ────────────────
 * What is left is the shell, and the shell changed on purpose. UNTITLED-01…19
 * moved the whole product onto Untitled UI React Pro, which makes React Aria
 * Components and Untitled's Tailwind v4 layer the FOUNDATION the root route
 * boots on rather than something a feature route pulls in on demand. That is
 * ~195 kB of React Aria and Router runtime plus a stylesheet that grew from
 * 731 kB to 815 kB — deliberate architecture, recorded as complete in
 * `CLAUDE.md`, and not something a budget should be asked to reverse.
 *
 * The single largest entry is still the application stylesheet at 815 kB (96 kB
 * over the wire), 51% of the precache. It is fully minified; the size is that
 * `app.css` composes ~87 stylesheets in ONE cascade-ordered file, and the order
 * is load-bearing because DalyHub's module CSS is unlayered. Splitting it per
 * route is a performance-architecture decision with design consequences and
 * stays DEBT-151, exactly as HARDEN-05 left it.
 *
 * ── Why the new ceilings still protect the product ───────────────────────────
 * Both keep a real ratchet rather than the ~1.8x the original budget carried:
 * ~9% over the measured value, which absorbs ordinary stylesheet growth and
 * still fails on the next dispatcher. For scale, the smallest thing removed
 * above was 76 kB and the largest 429 kB; the headroom below is 145 kB, so any
 * one of them coming back turns this red again. The transfer ceiling is the one
 * that describes a metered connection, and it is the tighter of the two.
 */
const PRECACHE_MAX_BYTES = 1_750_000;

/** Measured: 349 kB over the wire (gzip -9, the transfer encoding a phone gets). */
const PRECACHE_MAX_TRANSFER_BYTES = 380_000;

/** Measured: 31. React Router marks every route an entry; this is the shell. */
const PRECACHE_MAX_ASSETS = 40;

/**
 * And a FLOOR under the same count, because a budget that cannot see the thing
 * it is measuring is not a budget.
 *
 * Every ceiling in this file is a `toBeLessThan`, and zero satisfies all of
 * them. FOUND by tripping over it: a `vite preview` left running across a
 * rebuild serves an empty `/sw.js`, the URL match finds nothing, and this test
 * reported "precache 0 assets, 0 B (0 B over the wire)" and PASSED — a green
 * check over a shell that would not boot offline at all. The per-asset
 * `response.ok()` guard below cannot catch it either, because a loop over an
 * empty list runs no assertions.
 *
 * 20 is the floor rather than the measured 31, because this is a smoke test for
 * "the manifest is real", not a second ratchet — `PRECACHE_MAX_ASSETS` is the
 * ratchet. A shell that genuinely dropped a third of its chunks would still be
 * worth failing on, and the two kind checks beneath it say what "real" means:
 * the application stylesheet and the web manifest are both things the shell
 * cannot boot without, and neither can be absent for an innocent reason.
 */
const PRECACHE_MIN_ASSETS = 20;

/** Measured: 8.5 kB for the seeded workspace (23 tasks, 3 notes, 4 diary, 1 meeting). */
const SNAPSHOT_MAX_BYTES = 2_000_000;

/** Measured: 166 ms end to end (request + server build + transfer). */
const SNAPSHOT_MAX_BUILD_MS = 5_000;

/** Measured: 78 kB total origin usage after a full prime and three syncs. */
const ORIGIN_STORAGE_MAX_BYTES = 20_000_000;

async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => {
      if (navigator.serviceWorker.controller) return;
      return new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        );
      });
    }),
  );
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller != null,
    undefined,
    { timeout: 60_000 },
  );
}

test("the service worker and its precache stay within budget", async ({
  request,
}) => {
  const worker = await request.get(`${PROD_BASE}/sw.js`);
  expect(
    worker.ok(),
    "/sw.js must be served before anything about its size means anything",
  ).toBe(true);
  const source = await worker.text();
  const workerBytes = Buffer.byteLength(source, "utf8");

  /*
   * DEBT-172 — the worker's own LOGIC, from the template on disk rather than
   * from the served file, because the served file is the template plus the
   * manifest and this ceiling is about the template alone.
   */
  const logicBytes = Buffer.byteLength(
    readFileSync(join(process.cwd(), "vite-plugins", "sw-template.js"), "utf8"),
    "utf8",
  );
  expect(
    logicBytes,
    "the service worker's own logic grew; this ceiling is the one that means " +
      "'the worker got bigger', and adding a route must not move it (DEBT-172)",
  ).toBeLessThan(SERVICE_WORKER_LOGIC_MAX_BYTES);

  // `woff2` is in this alternation deliberately (ADR-068 decision 4). DS-14
  // precaches two self-hosted font files; before they were added, this pattern
  // could not see a font at all, which would have made the budget structurally
  // blind to the one asset class being added to it. A budget that cannot see the
  // thing it is measuring is not a budget.
  const urls = [
    ...source.matchAll(
      /"(\/[^"]+\.(?:js|css|png|svg|ico|webmanifest|woff2))"/g,
    ),
  ]
    .map((match) => match[1])
    .filter((url, index, all) => all.indexOf(url) === index);
  expect(urls.length).toBeLessThanOrEqual(PRECACHE_MAX_ASSETS);
  expect(
    urls.length,
    `the precache carries ${urls.length} assets, which is not a shell — the ` +
      "worker is empty or its manifest was never substituted, and every " +
      "ceiling below would pass on it",
  ).toBeGreaterThanOrEqual(PRECACHE_MIN_ASSETS);
  expect(
    urls.some((url) => url.endsWith(".css")),
    "the application stylesheet must be precached; without it a cached route " +
      "renders unstyled offline",
  ).toBe(true);
  expect(
    urls.includes("/manifest.webmanifest"),
    "the web manifest must be precached; it is what makes the installed app " +
      "an app",
  ).toBe(true);

  /*
   * DEBT-172 — the manifest's BYTES, beside its length. A route with a very
   * long path costs a phone the same as several short ones, and
   * `PRECACHE_MAX_ASSETS` cannot see the difference.
   */
  const manifestBytes = urls.reduce(
    // Each URL appears in the substituted list as a quoted literal plus its
    // separator, which is what the worker actually carries.
    (total, url) => total + Buffer.byteLength(url, "utf8") + 3,
    0,
  );
  expect(
    manifestBytes,
    "the precache manifest's byte cost grew; this is the ceiling a new route " +
      "is supposed to move (DEBT-172)",
  ).toBeLessThan(PRECACHE_MANIFEST_MAX_BYTES);

  /*
   * And the two ACCOUNT for the served worker. Without this, a split budget
   * would let a third thing grow inside `/sw.js` with neither ceiling seeing
   * it — which is the one regression splitting a budget can introduce.
   */
  expect(
    workerBytes,
    `the served worker (${workerBytes} B) is larger than its logic ` +
      `(${logicBytes} B) plus its manifest (${manifestBytes} B) can explain — ` +
      "something is growing that neither ceiling measures (DEBT-172)",
  ).toBeLessThan(logicBytes + manifestBytes + SUBSTITUTION_SLACK_BYTES);

  console.log(
    `[budget] sw logic ${logicBytes} B / ${SERVICE_WORKER_LOGIC_MAX_BYTES} · ` +
      `manifest ${manifestBytes} B / ${PRECACHE_MANIFEST_MAX_BYTES} · ` +
      `served ${workerBytes} B`,
  );

  let precacheBytes = 0;
  let transferBytes = 0;
  for (const url of urls) {
    const response = await request.get(`${PROD_BASE}${url}`);
    expect(response.ok(), `${url} must be served`).toBe(true);
    const body = await response.body();
    precacheBytes += body.byteLength;
    // Compressed HERE rather than read off a `content-length`: the preview
    // server's transfer encoding is its own business, and what this budget is
    // about is the SIZE OF THE PAYLOAD, which is a property of the asset.
    transferBytes += gzipSync(body, { level: 9 }).byteLength;
  }
  expect(precacheBytes).toBeLessThan(PRECACHE_MAX_BYTES);
  expect(transferBytes).toBeLessThan(PRECACHE_MAX_TRANSFER_BYTES);

  console.log(
    `[budget] service worker ${workerBytes} B; precache ${urls.length} assets, ${precacheBytes} B (${transferBytes} B over the wire)`,
  );
});

test("the snapshot and the device's storage stay within budget", async ({
  page,
}) => {
  await page.goto("/today");
  await waitForServiceWorker(page);

  // Build time and payload size, measured through the real endpoint.
  const measured = await page.evaluate(async () => {
    const started = performance.now();
    const response = await fetch("/offline/snapshot", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const text = await response.text();
    const elapsed = performance.now() - started;
    const snapshot = JSON.parse(text) as {
      tasks: unknown[];
      notes: unknown[];
      diary: unknown[];
      meetings: unknown[];
      references: unknown[];
    };
    return {
      elapsedMs: elapsed,
      bytes: new TextEncoder().encode(text).byteLength,
      counts: {
        tasks: snapshot.tasks.length,
        notes: snapshot.notes.length,
        diary: snapshot.diary.length,
        meetings: snapshot.meetings.length,
        references: snapshot.references.length,
      },
    };
  });

  expect(measured.bytes).toBeLessThan(SNAPSHOT_MAX_BYTES);
  expect(measured.elapsedMs).toBeLessThan(SNAPSHOT_MAX_BUILD_MS);

  // Storage must not grow with each sync. Each reload below runs the
  // application's OWN sync pass — a real fetch, a real store — and a snapshot
  // REPLACES its namespace's records rather than merging them, so a device left
  // running for a week holds one window, not seven.
  const usages: (number | null)[] = [];
  for (let pass = 0; pass < 3; pass += 1) {
    await page.goto("/today");
    await waitForServiceWorker(page);
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const database = await new Promise<IDBDatabase>(
              (resolve, reject) => {
                const request = indexedDB.open("dalyhub-offline");
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              },
            );
            if (!database.objectStoreNames.contains("meta")) {
              database.close();
              return 0;
            }
            const rows = await new Promise<unknown[]>((resolve, reject) => {
              const request = database
                .transaction("meta", "readonly")
                .objectStore("meta")
                .getAll();
              request.onsuccess = () => resolve(request.result as unknown[]);
              request.onerror = () => reject(request.error);
            });
            database.close();
            return rows.length;
          }),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
    usages.push(
      await page.evaluate(async () => {
        const estimate = await navigator.storage?.estimate?.();
        return estimate?.usage ?? null;
      }),
    );
  }

  const first = usages[0];
  const last = usages[usages.length - 1];
  if (last !== null) {
    expect(last).toBeLessThan(ORIGIN_STORAGE_MAX_BYTES);
  }
  if (first !== null && last !== null) {
    // Three syncs of the same data must not multiply what is stored. The
    // allowance absorbs the runtime asset cache filling as pages are visited;
    // it does not absorb a snapshot being appended instead of replaced.
    expect(last).toBeLessThan(first * 2 + 250_000);
  }

  console.log(
    `[budget] snapshot ${measured.bytes} B in ${Math.round(measured.elapsedMs)} ms ` +
      `(${JSON.stringify(measured.counts)}); origin usage after 3 syncs: ` +
      `${usages.map((usage) => usage ?? "n/a").join(" → ")} B`,
  );
});
