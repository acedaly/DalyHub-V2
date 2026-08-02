/**
 * PWA — the offline lifecycle, end to end in a real browser.
 *
 * ── What this suite proves, and what it deliberately does not ────────────────
 * It runs against the DEVELOPMENT server, because that is the only one of the
 * two Playwright servers with an authenticated session (the production-mode
 * server is deliberately fail-closed, which is its own valuable test). The dev
 * server serves the SAME service-worker code with an empty precache list, so
 * everything about the worker's RUNTIME behaviour — registration, activation,
 * the navigation fallback, the never-cache rules, cache cleanup — is the real
 * thing.
 *
 * What it therefore cannot prove is the fully HYDRATED offline application, because
 * a Vite dev server's module graph is not precached (there are no hashed bundles
 * to precache). Offline, the cached shell document renders and the queue and
 * snapshot are asserted directly in IndexedDB — which is a deterministic state
 * check, not a proxy for one. Hydrated offline rendering from the precached
 * PRODUCTION bundle is the one thing left to the manual device checklist in
 * `docs/development/PWA_AND_OFFLINE.md`, and that limitation is stated there
 * rather than papered over here.
 *
 * There are no sleeps. Every wait is a deterministic condition: the service
 * worker controlling the page, a row appearing in IndexedDB, a queue record
 * reaching a status.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PROD_BASE = "http://localhost:4174";

/* -------------------------------------------------------------------------- */
/* Deterministic waits over real browser state                                */
/* -------------------------------------------------------------------------- */

/** Wait until a DalyHub service worker is controlling the page. */
async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller !== null,
    undefined,
    { timeout: 20_000 },
  );
}

/** Read the offline database's metadata rows. */
async function readMeta(page: Page) {
  return page.evaluate(async () => {
    const open = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("dalyhub-offline");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const database = await open();
    if (!database.objectStoreNames.contains("meta")) {
      database.close();
      return [];
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
    return rows as {
      namespace: string;
      identityLabel: string;
      workspaceLabel: string;
      lastSyncedAt: string;
      window: { startIso: string; todayIso: string; endIso: string };
      counts: Record<string, number>;
    }[];
  });
}

/** Read every queued capture. */
async function readQueue(page: Page) {
  return page.evaluate(async () => {
    const open = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("dalyhub-offline");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const database = await open();
    if (!database.objectStoreNames.contains("queue")) {
      database.close();
      return [];
    }
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = database
        .transaction("queue", "readonly")
        .objectStore("queue")
        .getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return rows as {
      id: string;
      namespace: string;
      kind: string;
      status: string;
      attempts: number;
      serverId: string | null;
      payload: { title: string };
    }[];
  });
}

/** Wait until the device holds a snapshot for some namespace. */
async function waitForSnapshot(page: Page): Promise<void> {
  await expect
    .poll(async () => (await readMeta(page)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);
}

/**
 * Wait until nothing is left waiting to sync.
 *
 * A successfully replayed capture is PRUNED from the queue once it has synced —
 * the queue surface shows work that still needs to reach DalyHub, not a history —
 * so "drained" means every remaining record is `synced`, which in practice means
 * the queue is empty.
 */
async function waitForQueueDrained(
  page: Page,
  timeout = 30_000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const queue = await readQueue(page);
        return queue.every((record) => record.status === "synced");
      },
      { timeout },
    )
    .toBe(true);
}

/** How many records the workspace holds with EXACTLY this title. */
async function countByTitle(page: Page, title: string): Promise<number> {
  return page.evaluate(async (text: string) => {
    const response = await fetch(`/search?q=${encodeURIComponent(text)}`, {
      headers: { Accept: "application/json" },
    });
    const body = (await response.json()) as {
      groups: { results: { title: string }[] }[];
    };
    return body.groups
      .flatMap((group) => group.results)
      .filter((result) => result.title === text).length;
  }, title);
}

/**
 * Make the network genuinely unavailable to EVERYTHING, including the service
 * worker's own fetches.
 *
 * `context.setOffline` alone is not enough: Chromium applies its network
 * emulation to the page's network context, and a fetch issued from inside the
 * service worker can still reach the server — which would silently turn an
 * "offline" assertion into a test of the online path. Aborting at the route
 * level covers the worker too, so the fallback under test is the one that runs.
 */
async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
  await context.route("**/*", (route) => route.abort("internetdisconnected"));
}

/** Restore the network. */
async function goOnline(context: BrowserContext): Promise<void> {
  await context.unroute("**/*");
  await context.setOffline(false);
}

/** Prime a signed-in session: load DalyHub, register the worker, sync. */
async function primeOfflineSession(page: Page): Promise<void> {
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { level: 1, name: "Today" }),
  ).toBeVisible();
  await waitForServiceWorker(page);
  await waitForSnapshot(page);
}

/* -------------------------------------------------------------------------- */
/* The build artefacts a browser actually fetches                             */
/* -------------------------------------------------------------------------- */

test.describe("PWA build artefacts", () => {
  test("the production build serves a manifest and a real service worker", async ({
    request,
  }) => {
    // These are static assets, served ahead of the Worker, so they are reachable
    // on the fail-closed production-mode server. That is the point: a manifest
    // the browser cannot fetch is a PWA that cannot be installed.
    const manifest = await request.get(`${PROD_BASE}/manifest.webmanifest`);
    expect(manifest.ok()).toBe(true);
    const body = (await manifest.json()) as {
      name: string;
      display: string;
      icons: { src: string }[];
    };
    expect(body.name).toBe("DalyHub");
    expect(body.display).toBe("standalone");

    for (const icon of body.icons) {
      const response = await request.get(`${PROD_BASE}${icon.src}`);
      expect(response.ok(), `${icon.src} must be served`).toBe(true);
    }

    const worker = await request.get(`${PROD_BASE}/sw.js`);
    expect(worker.ok()).toBe(true);
    const source = await worker.text();
    // The REAL emitted worker, with a real build id and a real precache list.
    expect(source).not.toContain("__DALYHUB_");
    expect(source).toMatch(/const BUILD_ID = "\d+\.\d+\.\d+-[0-9a-f]{12}"/);
    // And the precache list is the shell, not the whole application.
    const precached = source.match(/"\/assets\/[^"]+"/g) ?? [];
    expect(precached.length).toBeGreaterThan(0);
    expect(precached.length).toBeLessThan(40);
  });

  test("the committed icon assets are the ones the manifest names", async ({
    request,
  }) => {
    const manifestPath = fileURLToPath(
      new URL("../public/manifest.webmanifest", import.meta.url),
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      icons: { src: string; type: string }[];
    };
    for (const icon of manifest.icons) {
      const response = await request.get(`${PROD_BASE}${icon.src}`);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain(
        icon.type.split("/")[1].replace("svg+xml", "svg"),
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The offline lifecycle                                                      */
/* -------------------------------------------------------------------------- */

test.describe("offline lifecycle", () => {
  test.beforeEach(async ({ context }) => {
    await context.setOffline(false);
  });

  test("primes the worker and the offline database from an online session", async ({
    page,
  }) => {
    await primeOfflineSession(page);

    const meta = await readMeta(page);
    expect(meta).toHaveLength(1);
    // Namespaced by identity + workspace + schema, and carrying neither the
    // Access subject nor the workspace id.
    expect(meta[0].namespace).toMatch(/^dh1-\d+-[0-9a-f]{32}$/);
    expect(meta[0].namespace).not.toContain("local-dev-workspace");
    expect(meta[0].namespace).not.toContain("local-development-user");
    // The identity IS shown, as the safe display value.
    expect(meta[0].identityLabel).toBe("owner@example.invalid");
    // A fifteen-day window: seven back, today, seven forward.
    const days =
      (Date.parse(`${meta[0].window.endIso}T00:00:00Z`) -
        Date.parse(`${meta[0].window.startIso}T00:00:00Z`)) /
      86_400_000;
    expect(days).toBe(14);
  });

  test("renders the DalyHub offline shell instead of a browser error", async ({
    page,
    context,
  }) => {
    await primeOfflineSession(page);

    await goOffline(context);
    const response = await page.goto("/today");

    // The navigation did NOT fall through to the browser's network error page:
    // the service worker answered with DalyHub's own offline document.
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: "DalyHub offline" }),
    ).toBeVisible();
    // And it is honest about what it is.
    await expect(page.getByText(/offline surface/i)).toBeVisible();
  });

  test("repeated offline reloads behave identically", async ({
    page,
    context,
  }) => {
    await primeOfflineSession(page);
    await goOffline(context);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.goto("/today");
      await expect(
        page.getByRole("heading", { level: 1, name: "DalyHub offline" }),
      ).toBeVisible();
    }
  });

  test("captures a task, a note and a diary entry offline, then syncs each once", async ({
    page,
    context,
  }) => {
    await primeOfflineSession(page);
    const namespace = (await readMeta(page))[0].namespace;

    // Queue three captures directly through the offline store, exactly as the
    // capture form does — the form's own rendering is covered by unit tests, and
    // this keeps the lifecycle assertions independent of layout.
    await goOffline(context);
    const titles = {
      task: `E2E offline task ${Date.now()}`,
      note: `E2E offline note ${Date.now()}`,
      diary: `E2E offline diary ${Date.now()}`,
    };
    await page.evaluate(
      async ([ns, values]) => {
        const open = (): Promise<IDBDatabase> =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open("dalyhub-offline");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        const database = await open();
        const transaction = database.transaction("queue", "readwrite");
        const store = transaction.objectStore("queue");
        const now = new Date().toISOString();
        const payloads = [
          {
            kind: "task",
            title: (values as Record<string, string>).task,
            dueDate: null,
          },
          { kind: "note", title: (values as Record<string, string>).note },
          {
            kind: "diary",
            title: (values as Record<string, string>).diary,
            entryType: "note",
          },
        ];
        for (const payload of payloads) {
          store.put({
            id: crypto.randomUUID(),
            namespace: ns,
            kind: payload.kind,
            payload,
            payloadVersion: 1,
            createdAt: now,
            queuedAt: now,
            status: "pending",
            attempts: 0,
            lastAttemptAt: null,
            lastError: null,
            serverId: null,
            syncedAt: null,
          });
        }
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
        database.close();
      },
      [namespace, titles] as const,
    );

    const queue = await readQueue(page);
    expect(queue).toHaveLength(3);
    expect(queue.every((record) => record.status === "pending")).toBe(true);
    // Every queued record is filed under this identity + workspace.
    expect(queue.every((record) => record.namespace === namespace)).toBe(true);

    // Reconnect. The provider's own sync pass replays the queue.
    await goOnline(context);
    await page.goto("/today");
    await waitForServiceWorker(page);
    await waitForQueueDrained(page);

    // Each capture produced EXACTLY ONE record on the server.
    for (const title of Object.values(titles)) {
      expect(
        await countByTitle(page, title),
        `"${title}" must exist exactly once`,
      ).toBe(1);
    }
  });

  test("a replayed capture is never created twice", async ({ page }) => {
    await primeOfflineSession(page);

    // Send the SAME idempotency key twice, as an unreliable network would. The
    // second must reconcile to the first record, not create a second one.
    const title = `E2E idempotent task ${Date.now()}`;
    const outcome = await page.evaluate(async (text: string) => {
      const key = crypto.randomUUID();
      const post = async () => {
        const form = new FormData();
        form.set("title", text);
        form.set("idempotencyKey", key);
        const response = await fetch("/tasks/new", {
          method: "POST",
          body: form,
        });
        return (await response.json()) as { ok: boolean; taskId?: string };
      };
      return { first: await post(), second: await post() };
    }, title);

    expect(outcome.first.ok).toBe(true);
    expect(outcome.second.ok).toBe(true);
    expect(outcome.second.taskId).toBe(outcome.first.taskId);

    expect(await countByTitle(page, title)).toBe(1);
  });

  test("queued captures stay pending while authentication has expired", async ({
    page,
    context,
  }) => {
    await primeOfflineSession(page);
    const namespace = (await readMeta(page))[0].namespace;

    // Simulate an expired Cloudflare Access session: the probe and the create
    // route both answer 403, exactly as the Worker boundary does.
    await context.route("**/offline/ping", (route) =>
      route.fulfill({ status: 403, body: "Authentication required." }),
    );
    await context.route("**/tasks/new", (route) =>
      route.fulfill({ status: 403, body: "Authentication required." }),
    );

    await page.evaluate(async (ns: string) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("dalyhub-offline");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction("queue", "readwrite");
      const now = new Date().toISOString();
      transaction.objectStore("queue").put({
        id: crypto.randomUUID(),
        namespace: ns,
        kind: "task",
        payload: { kind: "task", title: "Blocked by sign-in", dueDate: null },
        payloadVersion: 1,
        createdAt: now,
        queuedAt: now,
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        serverId: null,
        syncedAt: null,
      });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    }, namespace);

    await page.goto("/today");
    // Give the provider's own sync pass a chance to run and be REFUSED. The
    // condition, not a sleep, is what is waited on: the record must reach a
    // settled non-synced state and stay there.
    await expect
      .poll(
        async () => {
          const queue = await readQueue(page);
          return queue.length > 0 && queue.every((r) => r.status !== "syncing");
        },
        { timeout: 20_000 },
      )
      .toBe(true);

    const queue = await readQueue(page);
    expect(queue.length).toBeGreaterThan(0);
    for (const record of queue) {
      expect(["pending", "blocked", "syncing"]).toContain(record.status);
      expect(record.serverId).toBeNull();
    }

    await context.unroute("**/offline/ping");
    await context.unroute("**/tasks/new");
  });

  test("clearing offline data removes everything DalyHub stored on the device", async ({
    page,
  }) => {
    await primeOfflineSession(page);
    expect((await readMeta(page)).length).toBe(1);

    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("dalyhub-offline");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction(
        ["meta", "records", "queue"],
        "readwrite",
      );
      transaction.objectStore("meta").clear();
      transaction.objectStore("records").clear();
      transaction.objectStore("queue").clear();
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("dalyhub-"))
          .map((name) => caches.delete(name)),
      );
    });

    expect(await readMeta(page)).toHaveLength(0);
    expect(await readQueue(page)).toHaveLength(0);
    const remaining = await page.evaluate(async () =>
      (await caches.keys()).filter((name) => name.startsWith("dalyhub-")),
    );
    expect(remaining).toEqual([]);

    // Server data is untouched: DalyHub still loads and re-primes.
    await page.goto("/today");
    await expect(
      page.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeVisible();
    await waitForSnapshot(page);
  });

  test("the Settings offline section reports real device state", async ({
    page,
  }) => {
    await primeOfflineSession(page);
    await page.goto("/settings?section=offline");

    await expect(
      page.getByRole("heading", { name: "Offline & app" }),
    ).toBeVisible();
    // The honesty claims are part of the product, so they are asserted.
    await expect(page.getByText(/does not.*encrypt/i).first()).toBeVisible();
    await expect(page.getByText(/Not encrypted/).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Clear snapshot/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Reset offline data/ }),
    ).toBeVisible();
  });

  test("the service worker never caches an authenticated data response", async ({
    page,
  }) => {
    await primeOfflineSession(page);

    // Touch the surfaces whose bodies are the owner's data…
    await page.evaluate(async () => {
      await fetch("/offline/snapshot", {
        headers: { Accept: "application/json" },
      });
      await fetch("/search?q=a", { headers: { Accept: "application/json" } });
      await fetch("/capture/context", {
        headers: { Accept: "application/json" },
      });
    });

    // …and assert none of them landed in any DalyHub cache.
    const cached = await page.evaluate(async () => {
      const names = (await caches.keys()).filter((name) =>
        name.startsWith("dalyhub-"),
      );
      const urls: string[] = [];
      for (const name of names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) urls.push(request.url);
      }
      return urls;
    });

    for (const url of cached) {
      expect(url).not.toContain("/offline/snapshot");
      expect(url).not.toContain("/offline/ping");
      expect(url).not.toContain("/search");
      expect(url).not.toContain("/capture/");
      expect(url).not.toContain("_data");
    }
  });

  test("a foreign namespace's captures are never replayed by this session", async ({
    page,
  }) => {
    await primeOfflineSession(page);
    const namespace = (await readMeta(page))[0].namespace;
    const foreign = "dh1-1-ffffffffffffffffffffffffffffffff";
    expect(foreign).not.toBe(namespace);

    await page.evaluate(async (ns: string) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("dalyhub-offline");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction("queue", "readwrite");
      const now = new Date().toISOString();
      transaction.objectStore("queue").put({
        id: crypto.randomUUID(),
        namespace: ns,
        kind: "task",
        payload: {
          kind: "task",
          title: "Another identity's capture",
          dueDate: null,
        },
        payloadVersion: 1,
        createdAt: now,
        queuedAt: now,
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        serverId: null,
        syncedAt: null,
      });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    }, foreign);

    await page.goto("/today");
    await waitForSnapshot(page);

    // It is STILL pending: this session may not create another identity's
    // capture in this workspace. It is also not discarded.
    await expect
      .poll(async () => {
        const queue = await readQueue(page);
        const record = queue.find((item) => item.namespace === foreign);
        return record?.status ?? "missing";
      })
      .toBe("pending");
  });
});
