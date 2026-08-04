/**
 * PWA-11 — the service worker's RUNTIME behaviour, exercised as code.
 *
 * `service-worker.test.ts` next door asserts the worker's build: cache
 * versioning, precache selection, and never-cache rules read out of the emitted
 * source. That is the right test for "does the artefact say the right thing", and
 * the wrong test for the failure this file exists for.
 *
 * The iPhone crash was not a rule that was missing from the source. Every rule
 * was there. It was what the worker DID with a request whose url was `/` while
 * the device had no network: it answered with the `/offline` document's HTML.
 * That is a behaviour, and the only way to assert a behaviour is to run it. So
 * this file evaluates the real emitted worker against fake `caches`, `fetch` and
 * `self`, dispatches real `Request`s at it, and reads the real `Response`s back.
 *
 * The two invariants under test, both learned from that failure:
 *   1. the offline HTML document is served ONLY for a genuine document
 *      navigation, and ONLY at its own url;
 *   2. nothing else — script, module, stylesheet, image, font, manifest, API,
 *      JSON, authentication or background request — can ever receive HTML.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderServiceWorker } from "../../../vite-plugins/service-worker";

const ORIGIN = "https://hub.example.invalid";
const OFFLINE_DOCUMENT = "/offline";

/* -------------------------------------------------------------------------- */
/* A service-worker global scope, small enough to reason about                 */
/* -------------------------------------------------------------------------- */

/** A `Cache` over a Map, keyed by url — which is all this worker uses. */
class FakeCache {
  readonly entries = new Map<string, Response>();

  private key(request: RequestInfo | URL): string {
    if (typeof request === "string") return new URL(request, ORIGIN).toString();
    if (request instanceof URL) return request.toString();
    return new URL((request as Request).url, ORIGIN).toString();
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const stored = this.entries.get(this.key(request));
    return stored ? stored.clone() : undefined;
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(this.key(request), response.clone());
  }

  async delete(request: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(this.key(request));
  }
}

class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>();

  async open(name: string): Promise<FakeCache> {
    const existing = this.caches.get(name);
    if (existing) return existing;
    const created = new FakeCache();
    this.caches.set(name, created);
    return created;
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }

  async match(
    request: RequestInfo | URL,
    options?: { cacheName?: string },
  ): Promise<Response | undefined> {
    const names = options?.cacheName
      ? [options.cacheName]
      : [...this.caches.keys()];
    for (const name of names) {
      const cache = this.caches.get(name);
      const hit = await cache?.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
}

interface WorkerHarness {
  readonly cacheStorage: FakeCacheStorage;
  readonly fetchMock: ReturnType<typeof vi.fn>;
  /** Dispatch a fetch event; resolves to the Response, or null if unhandled. */
  navigate(url: string, init?: RequestInit): Promise<Response | null>;
  request(
    url: string,
    init: RequestInit & { destination?: string },
  ): Promise<Response | null>;
  message(data: unknown): Promise<void>;
}

/** Evaluate the real emitted worker inside a fake global scope. */
function bootWorker(): WorkerHarness {
  const source = renderServiceWorker({
    buildId: "test-build",
    precacheUrls: ["/manifest.webmanifest"],
    offlineDocument: OFFLINE_DOCUMENT,
  });

  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const cacheStorage = new FakeCacheStorage();
  const fetchMock = vi.fn();
  const self = {
    addEventListener(type: string, listener: (event: unknown) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    location: new URL(ORIGIN),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };

  // The worker is a plain script, so a function wrapper is a faithful scope for
  // it: its top-level `const`s become locals and its `self.addEventListener`
  // calls land on the object above.
  new Function("self", "caches", "fetch", source)(
    self,
    cacheStorage,
    fetchMock as unknown as typeof fetch,
  );

  const dispatchFetch = async (request: Request): Promise<Response | null> => {
    let responded: Promise<Response> | null = null;
    const background: Promise<unknown>[] = [];
    const event = {
      request,
      respondWith(value: Promise<Response> | Response) {
        responded = Promise.resolve(value);
      },
      waitUntil(work: Promise<unknown>) {
        background.push(work);
      },
    };
    for (const listener of listeners.get("fetch") ?? []) listener(event);
    const response = responded ? await responded : null;
    // The worker defers its loop-breaker bookkeeping to `waitUntil` so a healthy
    // navigation does not wait on it. A test that ignored those promises would
    // assert against state that had not been written yet.
    await Promise.all(background);
    return response;
  };

  return {
    cacheStorage,
    fetchMock,
    async navigate(url, init) {
      // `mode: "navigate"` cannot be constructed by hand, so the request is
      // built and its navigation-shaped fields are overlaid — which is exactly
      // the shape the worker reads.
      const request = new Request(new URL(url, ORIGIN), init);
      Object.defineProperty(request, "mode", { value: "navigate" });
      Object.defineProperty(request, "destination", { value: "document" });
      return dispatchFetch(request);
    },
    async request(url, init) {
      const { destination = "empty", ...rest } = init;
      const request = new Request(new URL(url, ORIGIN), rest);
      Object.defineProperty(request, "mode", { value: rest.mode ?? "cors" });
      Object.defineProperty(request, "destination", { value: destination });
      return dispatchFetch(request);
    },
    async message(data) {
      const waits: Promise<unknown>[] = [];
      const event = {
        data,
        source: { postMessage: vi.fn() },
        waitUntil(value: Promise<unknown>) {
          waits.push(value);
        },
      };
      for (const listener of listeners.get("message") ?? []) listener(event);
      await Promise.all(waits);
    },
  };
}

/** Put a believable offline shell document into the shell cache. */
async function primeShell(harness: WorkerHarness): Promise<void> {
  const cache = await harness.cacheStorage.open("dalyhub-shell-test-build");
  await cache.put(
    OFFLINE_DOCUMENT,
    new Response(
      '<!doctype html><h1>DalyHub offline</h1><script type="module" src="/assets/entry.js"></script>',
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    ),
  );
}

/** Every network request fails, exactly as it does with no connection. */
function goOffline(harness: WorkerHarness): void {
  harness.fetchMock.mockRejectedValue(new TypeError("Load failed"));
}

let worker: WorkerHarness;

beforeEach(() => {
  worker = bootWorker();
});

/* -------------------------------------------------------------------------- */

describe("offline navigation", () => {
  it("serves the offline document for a navigation to the offline document", async () => {
    await primeShell(worker);
    goOffline(worker);

    const response = await worker.navigate(OFFLINE_DOCUMENT);

    expect(response?.status).toBe(200);
    expect(response?.headers.get("X-DalyHub-Offline")).toBe("shell");
    expect(response?.headers.get("Content-Type")).toContain("text/html");
    await expect(response!.text()).resolves.toContain("DalyHub offline");
  });

  it("REDIRECTS a navigation to any other url rather than serving the shell there", async () => {
    // The whole iPhone crash in one assertion. An installed DalyHub launches at
    // `start_url: "/"`; answering that with the `/offline` document's HTML left
    // React Router hydrating a document rendered for one route under a different
    // url, importing route modules that are not on the device, and calling
    // `window.location.reload()` when that import failed — forever.
    await primeShell(worker);
    goOffline(worker);

    for (const path of ["/", "/today", "/tasks", "/settings?section=offline"]) {
      const response = await worker.navigate(path);
      expect(response?.status).toBe(302);
      expect(response?.headers.get("Location")).toBe(
        `${ORIGIN}${OFFLINE_DOCUMENT}`,
      );
    }
  });

  it("cannot redirect in a cycle: the offline document never redirects", async () => {
    await primeShell(worker);
    goOffline(worker);

    const first = await worker.navigate("/");
    expect(first?.status).toBe(302);
    const second = await worker.navigate(
      first!.headers.get("Location")!.replace(ORIGIN, ""),
    );
    expect(second?.status).toBe(200);
    expect(second?.headers.get("X-DalyHub-Offline")).toBe("shell");
  });

  it("serves a script-free page when no shell has ever been stored", async () => {
    goOffline(worker);

    const response = await worker.navigate("/");

    expect(response?.status).toBe(503);
    const body = await response!.text();
    expect(body).not.toContain("<script");
    expect(body).toContain("has no connection");
  });

  it("tries the network first, so an online navigation is never intercepted", async () => {
    await primeShell(worker);
    worker.fetchMock.mockResolvedValue(
      new Response("<h1>live</h1>", { status: 200 }),
    );

    const response = await worker.navigate("/today");

    await expect(response!.text()).resolves.toBe("<h1>live</h1>");
    expect(response?.headers.get("X-DalyHub-Offline")).toBeNull();
  });

  it("passes an expired Cloudflare Access redirect straight through", async () => {
    // Access answers with a redirect to the identity provider. The worker must
    // not "helpfully" replace it with the offline shell: authentication is the
    // server's decision, and hiding it is how a session silently never renews.
    await primeShell(worker);
    worker.fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "https://idp.example.invalid/authorize" },
      }),
    );

    const response = await worker.navigate("/today");

    expect(response?.status).toBe(302);
    expect(response?.headers.get("Location")).toBe(
      "https://idp.example.invalid/authorize",
    );
  });

  it("ignores a non-GET navigation, so a form post is never answered with HTML", async () => {
    await primeShell(worker);
    goOffline(worker);

    expect(await worker.navigate("/tasks/new", { method: "POST" })).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("nothing but a document may receive the offline document", () => {
  const NON_DOCUMENT = [
    { url: "/assets/entry-abc.js", destination: "script" },
    { url: "/assets/route-abc.js", destination: "script", mode: "cors" },
    { url: "/assets/app-abc.css", destination: "style" },
    { url: "/icons/icon-192.png", destination: "image" },
    { url: "/assets/font-abc.woff2", destination: "font" },
    { url: "/manifest.webmanifest", destination: "manifest" },
  ] as const;

  it.each(NON_DOCUMENT)(
    "fails $destination requests cleanly rather than with HTML ($url)",
    async ({ url, destination }) => {
      await primeShell(worker);
      goOffline(worker);

      const response = await worker.request(url, { destination });

      // Either the worker did not answer at all (the browser then reports an
      // ordinary network error) or it answered with an empty, non-HTML failure.
      // What it must NEVER do is hand an HTML document to a script parser.
      if (response) {
        expect(response.ok).toBe(false);
        expect(response.headers.get("Content-Type") ?? "").not.toContain(
          "text/html",
        );
        await expect(response.text()).resolves.not.toContain("DalyHub offline");
      }
    },
  );

  const API_PATHS = [
    "/offline/snapshot",
    "/offline/ping",
    "/search?q=x",
    "/commands",
    "/links",
    "/capture/context",
    "/preferences/theme",
    "/health",
    "/today.data",
    "/today?_data=routes%2Ftoday",
    "/cdn-cgi/access/get-identity",
  ];

  it.each(API_PATHS)(
    "never answers the API/authentication request %s",
    async (path) => {
      await primeShell(worker);
      goOffline(worker);

      const response = await worker.request(path, {
        destination: "empty",
        headers: { Accept: "application/json" },
      });

      expect(response).toBeNull();
    },
  );

  it("serves a cached asset from the cache rather than failing", async () => {
    const cache = await worker.cacheStorage.open("dalyhub-static-test-build");
    await cache.put(
      `${ORIGIN}/assets/entry-abc.js`,
      new Response("export const a = 1;", {
        status: 200,
        headers: { "Content-Type": "text/javascript" },
      }),
    );
    goOffline(worker);

    const response = await worker.request("/assets/entry-abc.js", {
      destination: "script",
    });

    expect(response?.status).toBe(200);
    await expect(response!.text()).resolves.toBe("export const a = 1;");
  });
});

/* -------------------------------------------------------------------------- */

describe("the offline-boot loop breaker", () => {
  it("stops serving the shell after repeated offline boots and serves a script-free page", async () => {
    await primeShell(worker);
    goOffline(worker);

    const statuses: (string | null)[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await worker.navigate(OFFLINE_DOCUMENT);
      statuses.push(response?.headers.get("X-DalyHub-Offline") ?? null);
    }

    // The first four are the real shell; a fifth boot inside the window is a
    // loop, and from there the worker answers with a page that has no
    // JavaScript at all — a page that cannot reload itself cannot loop.
    expect(statuses.slice(0, 4)).toEqual(["shell", "shell", "shell", "shell"]);
    expect(statuses.slice(4)).toEqual(["safe-mode", "safe-mode"]);

    const safeMode = await worker.navigate(OFFLINE_DOCUMENT);
    const body = await safeMode!.text();
    expect(body).not.toContain("<script");
    expect(body).toContain("Nothing has been lost");
  });

  /*
   * DS-14 §16 — the recovery surfaces must look like DalyHub while depending on
   * NOTHING DalyHub provides.
   *
   * These are asserted rather than reviewed because every one of them is a
   * dependency that would only fail on the day it matters: a font request on a
   * page whose premise is that the network is gone, a script on a page whose
   * entire job is to be unable to reload itself, a `var(--dh-*)` resolving to
   * nothing because the token stylesheet was never fetched.
   */
  it("keeps safe mode script-free, self-contained and readable in both schemes", async () => {
    await primeShell(worker);
    goOffline(worker);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await worker.navigate(OFFLINE_DOCUMENT);
    }
    const safeMode = await worker.navigate(OFFLINE_DOCUMENT);
    expect(safeMode?.headers.get("X-DalyHub-Offline")).toBe("safe-mode");
    const body = await safeMode!.text();

    // No script of any kind. A page with no JavaScript cannot reload itself,
    // which is the whole mechanism by which the loop terminates.
    expect(body).not.toContain("<script");
    expect(body).not.toMatch(/\son[a-z]+\s*=/i);

    // No font request, and no external subresource of any kind: no @font-face,
    // no stylesheet link, no absolute URL to fetch anything from.
    expect(body).not.toContain("@font-face");
    expect(body).not.toMatch(/<link\b/i);
    expect(body).not.toMatch(/https?:\/\//);
    expect(body).toContain("system-ui");

    // No dependency on the token layer: a `var(--dh-*)` here would resolve to
    // nothing, because tokens.css is never loaded on this document.
    expect(body).not.toContain("--dh-");

    // Both colour schemes are answered in plain CSS rather than by a persisted
    // theme, which safe mode has no way to read.
    expect(body).toContain("prefers-color-scheme:dark");
  });

  it("recovers on the owner's explicit request, never on a timer", async () => {
    await primeShell(worker);
    goOffline(worker);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await worker.navigate(OFFLINE_DOCUMENT);
    }
    expect(
      (await worker.navigate(OFFLINE_DOCUMENT))?.headers.get(
        "X-DalyHub-Offline",
      ),
    ).toBe("safe-mode");

    const recovered = await worker.navigate(`${OFFLINE_DOCUMENT}?dh-recover=1`);

    expect(recovered?.headers.get("X-DalyHub-Offline")).toBe("shell");
  });

  it("forgets the evidence when the page reports that it booted", async () => {
    await primeShell(worker);
    goOffline(worker);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await worker.navigate(OFFLINE_DOCUMENT);
    }

    await worker.message({ type: "OFFLINE_SHELL_READY" });

    // The budget is whole again, because the page proved it can reach a settled
    // state — which is the only thing the breaker is trying to measure.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(
        (await worker.navigate(OFFLINE_DOCUMENT))?.headers.get(
          "X-DalyHub-Offline",
        ),
      ).toBe("shell");
    }
  });

  it("forgets the evidence when the shell refreshes over a working connection", async () => {
    await primeShell(worker);
    goOffline(worker);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await worker.navigate(OFFLINE_DOCUMENT);
    }

    // A shell fetched from the network is proof the device is healthy again.
    worker.fetchMock.mockResolvedValue(
      new Response("<!doctype html><h1>DalyHub offline</h1>", {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-DalyHub-Shell": "offline",
        },
      }),
    );
    await worker.message({ type: "REFRESH_OFFLINE_SHELL" });
    goOffline(worker);

    expect(
      (await worker.navigate(OFFLINE_DOCUMENT))?.headers.get(
        "X-DalyHub-Offline",
      ),
    ).toBe("shell");
  });

  it("does NOT touch the boot log on a successful navigation", async () => {
    // The hot path must stay exactly as fast as it was. Clearing the log per
    // navigation put a Cache Storage open and delete on every page load and blew
    // the budget of a thirty-six-navigation end-to-end test; see `clearBootLog`.
    await primeShell(worker);
    const shellCache = await worker.cacheStorage.open(
      "dalyhub-shell-test-build",
    );
    goOffline(worker);
    await worker.navigate(OFFLINE_DOCUMENT);
    expect(shellCache.entries.has(`${ORIGIN}/__dalyhub/offline-boot-log`)).toBe(
      true,
    );

    worker.fetchMock.mockResolvedValue(new Response("<h1>live</h1>"));
    await worker.navigate("/today");

    // Still there: a healthy navigation neither reads nor writes it.
    expect(shellCache.entries.has(`${ORIGIN}/__dalyhub/offline-boot-log`)).toBe(
      true,
    );
  });

  it("does not count a redirected navigation twice", async () => {
    // A launch at `/` is one boot, not two, even though it becomes two
    // navigations. Counting the redirect would halve the budget for exactly the
    // launch shape an installed PWA always uses.
    await primeShell(worker);
    goOffline(worker);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await worker.navigate("/"))?.status).toBe(302);
      // Four launches, four shells. If the redirect were counted the budget
      // would be spent after two.
      expect(
        (await worker.navigate(OFFLINE_DOCUMENT))?.headers.get(
          "X-DalyHub-Offline",
        ),
      ).toBe("shell");
    }

    const fifth = await worker.navigate(OFFLINE_DOCUMENT);
    expect(fifth?.headers.get("X-DalyHub-Offline")).toBe("safe-mode");
  });
});
