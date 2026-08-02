/**
 * PWA-02 — the DalyHub service worker.
 *
 * This file is a TEMPLATE. `vite-plugins/service-worker.ts` substitutes the three
 * build-time placeholders below at build time and emits the result as `/sw.js`, so
 * the cache names are tied to a real deployment identifier and the precache list
 * is the actual hashed filenames Vite produced. It is plain, dependency-free
 * JavaScript: a service worker is the one place in DalyHub where a bug is
 * genuinely hard to roll back, so it stays small enough to read in one sitting.
 *
 * ── What it will and will not cache ──────────────────────────────────────────
 * DalyHub is entirely behind Cloudflare Access, every authenticated response
 * leaves the Worker boundary with `Cache-Control: private, no-store`, and the
 * owner's data is the most private data they have. So the rules are deliberately
 * restrictive and stated as an ALLOW-LIST, never "cache what works":
 *
 *   CACHED  build-versioned bundles under `/assets/` (JS, CSS, fonts) — content
 *           hashed, identical for every identity, no user data.
 *   CACHED  the icon set, `favicon.ico` and the web app manifest — static, public
 *           by nature.
 *   CACHED  exactly ONE HTML document: the `/offline` shell. Its loader is
 *           deliberately incapable of reading workspace data (it returns build
 *           metadata only), which is the data-classification decision that makes
 *           caching an authenticated document acceptable here. Everything the
 *           offline shell then shows is read client-side from IndexedDB, which is
 *           namespaced per identity + workspace.
 *   NEVER   any other HTML document. An authenticated page carries the owner's
 *           content and identity; caching one could show it to a different
 *           identity signing in on the same device.
 *   NEVER   React Router loader/action data requests (`.data`), and never any
 *           `/offline/*`, `/search`, `/commands*`, `/links`, `/capture/*`,
 *           `/preferences/*` or `/health` response. These are API surfaces whose
 *           bodies are user data or authentication-sensitive.
 *   NEVER   a non-GET request, a cross-origin request, or a partial (206)
 *           response.
 *
 * ── Update behaviour ─────────────────────────────────────────────────────────
 * A new deployment installs alongside the running one and WAITS. It never
 * activates under a page that is already running, because swapping the asset
 * cache beneath a loaded document is how a user ends up running one build's
 * JavaScript against another build's server. The page is told an update is ready
 * and offers it; `SKIP_WAITING` is sent only on that explicit action, or
 * automatically when there is no controlled page to disturb. On activation the
 * superseded caches are deleted, so storage does not accumulate one dead cache
 * per deployment.
 */

/** The deployment identifier every cache name is tied to. */
const BUILD_ID = "__DALYHUB_BUILD_ID__";

/** The build-versioned assets that make the application shell bootable offline. */
const PRECACHE_URLS = __DALYHUB_PRECACHE__;

/** The one HTML document this worker is allowed to cache. */
const OFFLINE_DOCUMENT = "__DALYHUB_OFFLINE_DOCUMENT__";

const STATIC_CACHE = `dalyhub-static-${BUILD_ID}`;
const SHELL_CACHE = `dalyhub-shell-${BUILD_ID}`;

/** Every cache name this worker owns, so cleanup never touches a foreign cache. */
const OWNED_CACHE_PREFIXES = ["dalyhub-static-", "dalyhub-shell-"];

/**
 * Path prefixes that must never be served from, or written to, a cache. Matched
 * as a prefix on the pathname. `/offline` itself is deliberately NOT here — the
 * page is cacheable; `/offline/snapshot`, `/offline/ping` and `/offline/sync`
 * under it are not, and are covered by the more specific entries.
 */
const NEVER_CACHE_PREFIXES = [
  "/offline/",
  "/search",
  "/commands",
  "/links",
  "/capture/",
  "/preferences/",
  "/health",
];

/** Static asset prefixes safe to serve cache-first. */
const STATIC_PREFIXES = ["/assets/", "/icons/"];

/** Individual static files safe to serve cache-first. */
const STATIC_FILES = ["/favicon.ico", "/manifest.webmanifest"];

/** True for a request whose response must never enter a cache. */
function isNeverCacheable(url) {
  if (url.searchParams.has("_data")) return true;
  if (url.pathname.endsWith(".data")) return true;
  return NEVER_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

/** True for a build-versioned or static asset. */
function isStaticAsset(url) {
  return (
    STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) ||
    STATIC_FILES.includes(url.pathname)
  );
}

/** True when a response is safe to store (a complete, same-origin 200). */
function isStorable(response) {
  return Boolean(
    response &&
    response.status === 200 &&
    response.type !== "opaque" &&
    response.type !== "opaqueredirect",
  );
}

/**
 * Fetch and cache the offline shell document. Driven ENTIRELY by the page: once
 * after registration when the page is idle, and again after every successful
 * snapshot sync, so the cached shell tracks the running deployment. It is not
 * fetched during install — see the note there.
 *
 * A failure is swallowed on purpose: the offline shell is a resilience feature,
 * and a worker that refuses to install because one optional document 403'd would
 * take the whole PWA down with it.
 */
async function cacheOfflineDocument() {
  try {
    const response = await fetch(OFFLINE_DOCUMENT, {
      credentials: "same-origin",
      cache: "reload",
      headers: { "X-DalyHub-Offline-Shell": "1" },
    });
    if (!isStorable(response)) return false;
    // An Access challenge is an HTML 200 from a different origin's perspective;
    // ours is same-origin and marked by the Worker, so require the marker before
    // trusting the body. Anything else is not the shell.
    if (response.headers.get("X-DalyHub-Shell") !== "offline") return false;
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(OFFLINE_DOCUMENT, response.clone());
    return true;
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // `addAll` is atomic-ish: one failure rejects the whole install. That is
      // wanted for the shell bundles — a half-precached shell is worse than none
      // — but each URL is added individually below so a single missing optional
      // icon cannot block the install of a working deployment.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, {
              credentials: "same-origin",
              cache: "reload",
            });
            if (isStorable(response)) await cache.put(url, response);
          } catch {
            /* Optional asset; the runtime handler will fetch it later. */
          }
        }),
      );
      // The offline SHELL DOCUMENT is deliberately NOT fetched here. It is a
      // server-rendered page, so fetching it during install makes the server
      // render a second document while it is still serving the one the owner is
      // waiting for — measurably so on a cold development server, where it
      // doubled the first page load's compile work and timed out an unrelated
      // test. The page asks for it instead, once it is idle
      // (`REFRESH_OFFLINE_SHELL`), and again after every successful sync.
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              OWNED_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)) &&
              name !== STATIC_CACHE &&
              name !== SHELL_CACHE,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Cache-first for immutable build assets; the network fills a miss. */
async function serveStatic(request) {
  const cached = await caches.match(request, { cacheName: STATIC_CACHE });
  if (cached) return cached;
  const response = await fetch(request);
  if (isStorable(response)) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

/**
 * Network-first for navigations. The network is ALWAYS tried first, so an online
 * user is never served a stale page and an expired Access session still redirects
 * to the identity provider exactly as it would without a service worker. Only a
 * genuine network failure falls back — the request outcome is authoritative, not
 * `navigator.onLine`.
 */
async function serveNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const shell = await caches.match(OFFLINE_DOCUMENT, {
      cacheName: SHELL_CACHE,
    });
    if (shell) {
      // Served with 200 so the browser renders it as a normal page. The document
      // itself states plainly that it is the offline shell, and shows the last
      // successful sync time — it never pretends to be the live page.
      return new Response(shell.body, {
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-DalyHub-Offline": "shell",
        }),
      });
    }
    return new Response(
      "<!doctype html><meta charset=utf-8><title>DalyHub is offline</title>" +
        '<body style="font:16px/1.5 system-ui,sans-serif;margin:0;padding:2rem;background:#faf9f7;color:#26221c">' +
        '<h1 style="font-size:1.25rem">DalyHub is offline</h1>' +
        "<p>This device has no connection, and DalyHub has not yet stored an offline copy of the application. " +
        "Reconnect and open DalyHub once to make it available offline.</p>",
      {
        status: 503,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (isNeverCacheable(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(serveNavigation(request));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(serveStatic(request));
  }
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (type === "REFRESH_OFFLINE_SHELL") {
    event.waitUntil(
      cacheOfflineDocument().then((ok) => {
        if (event.source) {
          event.source.postMessage({
            type: "OFFLINE_SHELL_REFRESHED",
            ok,
            buildId: BUILD_ID,
          });
        }
      }),
    );
    return;
  }
  if (type === "GET_VERSION" && event.source) {
    event.source.postMessage({ type: "VERSION", buildId: BUILD_ID });
    return;
  }
  if (type === "CLEAR_CACHES") {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) =>
              OWNED_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)),
            )
            .map((name) => caches.delete(name)),
        );
        if (event.source) {
          event.source.postMessage({ type: "CACHES_CLEARED" });
        }
      })(),
    );
  }
});
