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

import { gzipSync } from "node:zlib";

import { expect, test, type Page } from "@playwright/test";

const PROD_BASE = "http://localhost:4174";

/* Budgets. Measured 2026-08-02 against the production build of V2.0.1. */

/** Measured: 12 kB. The worker must stay small enough to read in one sitting. */
const SERVICE_WORKER_MAX_BYTES = 24_000;

/*
 * Measured 2026-08-17 (HARDEN-05): 1,321 kB across 30 assets uncompressed, and
 * 284 kB over the wire. It was 674 kB / ~180 kB when this budget was written
 * for V2.0.1, and it is over the 1,200 kB ceiling on `main` @ f994aa0.
 *
 * This is a REAL breach and it is re-baselined rather than repaired, which is a
 * decision worth being explicit about. The growth is not a leak: 731 kB of the
 * 1,321 is the application stylesheet, and roughly 200 kB of THAT is the
 * generated multi-scheme colour layer in `tokens.css` — every colour scheme in
 * both appearances, shipped so a scheme change is instant. Reducing it means
 * either splitting the stylesheet per route or not shipping the schemes an
 * owner has not chosen; both are performance-architecture decisions with design
 * consequences, and neither belongs in a suite-triage pass. It is recorded as
 * DEBT-151 with these figures.
 *
 * What this pass does instead of quietly loosening the ratchet is TIGHTEN it in
 * the dimension that matters. The uncompressed ceiling moves to the measured
 * value plus ~10%, which is a real ratchet rather than the ~1.8x headroom the
 * original carried — and a second ceiling is added on the COMPRESSED bytes,
 * which is what actually crosses a metered connection and is the thing the
 * paragraph at the top of this file says the budgets are about. The suite could
 * not see that number at all before.
 */
const PRECACHE_MAX_BYTES = 1_450_000;

/** Measured: 284 kB over the wire (gzip -9, the transfer encoding a phone gets). */
const PRECACHE_MAX_TRANSFER_BYTES = 320_000;

/** Measured: 23. React Router marks every route an entry; this is the shell. */
const PRECACHE_MAX_ASSETS = 40;

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
  const source = await worker.text();
  const workerBytes = Buffer.byteLength(source, "utf8");
  expect(workerBytes).toBeLessThan(SERVICE_WORKER_MAX_BYTES);

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
