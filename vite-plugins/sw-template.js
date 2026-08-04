/**
 * PWA-02 — the DalyHub service worker.
 *
 * A TEMPLATE: `vite-plugins/service-worker.ts` substitutes the three placeholders
 * below and emits the result as `/sw.js`, so the cache names are tied to a real
 * deployment identifier and the precache list is the actual hashed filenames Vite
 * produced. Plain, dependency-free JavaScript — a service worker is the one place
 * in DalyHub where a bug is genuinely hard to roll back.
 *
 * The FULL rationale — the cache allow-list and why it is an allow-list, the
 * update-and-wait protocol, and the two PWA-11 rules learned from a real iPhone
 * restart loop — lives in `docs/development/PWA_AND_OFFLINE.md` (§4, §4.5). It
 * used to be restated here at length; that duplication was both a doc-rot source
 * and, because this file is SERVED, real bytes on every device's first install.
 * The rules themselves are stated inline beside the code that enforces each one.
 *
 * The four load-bearing rules, in one line each:
 *
 *   1. Cache only content-hashed build assets (`/assets/`), the static public
 *      files (`/icons/`, `/fonts/`, the manifest, the favicon), and EXACTLY ONE
 *      HTML document — the `/offline` shell, whose loader is incapable of reading
 *      workspace data. Never another document, never a `.data` request, never an
 *      API surface, never a non-GET, cross-origin or partial response.
 *   2. A new deployment installs alongside the running one and WAITS, because
 *      swapping the asset cache beneath a loaded document runs one build's
 *      JavaScript against another build's server.
 *   3. The offline document is only ever served at its OWN url; a navigation
 *      elsewhere is redirected to it, so the document always matches the url it
 *      was rendered for.
 *   4. Nothing but a document navigation may ever receive HTML. Everything else
 *      fails CLEANLY (504, empty body) — HTML arriving where JavaScript was
 *      expected is a syntax error inside the running application.
 *
 * Plus one backstop: if the offline document is served more than
 * `OFFLINE_BOOT_LIMIT` times inside `OFFLINE_BOOT_WINDOW_MS`, the worker serves a
 * SCRIPT-FREE safe-mode page instead. A page with no JavaScript cannot reload
 * itself, so a loop terminates deterministically rather than being terminated by
 * the platform.
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
const STATIC_PREFIXES = ["/assets/", "/icons/", "/fonts/"];

/** Individual static files safe to serve cache-first. */
const STATIC_FILES = ["/favicon.ico", "/manifest.webmanifest"];

/**
 * The loop breaker's bookkeeping. The log lives in the shell cache rather than in
 * a module variable because a service worker is terminated between navigations —
 * an in-memory counter would reset exactly when it is needed.
 */
const OFFLINE_BOOT_LOG_URL = "/__dalyhub/offline-boot-log";
const OFFLINE_BOOT_WINDOW_MS = 60_000;
const OFFLINE_BOOT_LIMIT = 4;

/** The query parameter safe mode's "try again" link carries. */
const OFFLINE_RECOVER_PARAM = "dh-recover";

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

/**
 * True for a request that is a genuine top-level document navigation.
 *
 * This is the ONLY shape of request the offline HTML document may answer. The
 * `destination` check is what separates a document from a `fetch()` a page made
 * with `mode: "navigate"`-adjacent options, and the empty string is accepted
 * because some engines (and some test doubles) leave `destination` unset on a
 * request that is still, by `mode`, a navigation.
 */
function isDocumentNavigation(request) {
  if (request.method !== "GET") return false;
  if (request.mode !== "navigate") return false;
  const destination = request.destination;
  return destination === "document" || destination === "";
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
    // A shell that was just fetched over a working connection supersedes any
    // record of the previous one failing to boot.
    await clearBootLog();
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

/**
 * Cache-first for immutable build assets; the network fills a miss.
 *
 * A miss that the network cannot fill fails CLEANLY — an empty 504 with a plain
 * text content type. It is deliberately not the offline document: a script,
 * module or stylesheet that receives an HTML body is a syntax error inside the
 * running application, and that is one of the two ways an offline launch ends up
 * restarting until the platform kills it.
 */
async function serveStatic(request) {
  const cached = await caches.match(request, { cacheName: STATIC_CACHE });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (isStorable(response)) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", {
      status: 504,
      statusText: "Offline",
      headers: securityHeaders({
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-DalyHub-Offline": "unavailable",
      }),
    });
  }
}

/* ---- the offline-boot loop breaker --------------------------------------- */

/** Read the recorded offline-boot timestamps. Never throws. */
async function readBootLog() {
  try {
    const cache = await caches.open(SHELL_CACHE);
    const stored = await cache.match(OFFLINE_BOOT_LOG_URL);
    if (!stored) return [];
    const parsed = await stored.json();
    return Array.isArray(parsed)
      ? parsed.filter((value) => typeof value === "number")
      : [];
  } catch {
    return [];
  }
}

/**
 * Forget every recorded offline boot. Never throws.
 *
 * Called from the two places that are EVIDENCE the device is healthy — a shell
 * that refreshed over a working connection, and the page reporting it reached a
 * settled state — and deliberately NOT from the navigation handler.
 *
 * Clearing it per navigation was tried and reverted. It put a Cache Storage open
 * and delete on the success path of every page load, and `tasks-journey`'s
 * "no horizontal overflow" test — thirty-six real navigations, each gated on
 * `waitForLoadState("networkidle")` — went from passing to exceeding its
 * ninety-second budget. The hot path must stay exactly as fast as it was: this
 * is a backstop for a broken device, and a broken device is not the common case.
 *
 * Nothing is lost by the omission. Entries expire after `OFFLINE_BOOT_WINDOW_MS`
 * on their own, and both callers below fire on any healthy online session.
 */
async function clearBootLog() {
  try {
    const cache = await caches.open(SHELL_CACHE);
    await cache.delete(OFFLINE_BOOT_LOG_URL);
  } catch {
    /* The breaker is a backstop; failing to clear it must never fail a request. */
  }
}

/**
 * Record one offline boot and answer how many happened inside the window.
 * Bounded on write, so the log cannot grow with uptime.
 */
async function recordOfflineBoot(now) {
  const recent = (await readBootLog()).filter(
    (at) => now - at < OFFLINE_BOOT_WINDOW_MS,
  );
  recent.push(now);
  try {
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(
      OFFLINE_BOOT_LOG_URL,
      new Response(JSON.stringify(recent.slice(-(OFFLINE_BOOT_LIMIT + 2))), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch {
    /* Unwritable storage disables the breaker; it must not disable the page. */
  }
  return recent.length;
}

/**
 * The Worker's baseline security headers, restated here.
 *
 * A response this worker SYNTHESISES never passed through the Worker boundary,
 * so it would otherwise be the one DalyHub document served without them. They
 * are duplicated deliberately rather than derived: `security-headers.ts` remains
 * the source of truth, and the emitted-worker test asserts they are present here
 * too, so the duplication cannot rot silently.
 */
function securityHeaders(extra) {
  return new Headers({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy":
      "base-uri 'none'; frame-ancestors 'none'; object-src 'none'",
    "X-Frame-Options": "DENY",
    ...extra,
  });
}

/** A complete document with NO script of any kind, so it cannot reload itself. */
function plainDocument(status, marker, title, body) {
  // DS-14 §16: card-on-tint, with every value INLINED — no stylesheet, no
  // token layer, no persisted theme, no font request, and in safe mode no
  // script. The only two documents in the product not painted by tokens.
  // No favicon link either (BRAND-01): zero subresources is what makes this
  // page survivable. This file is SERVED, so its comments cost budget too.
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
      `<title>${title} · DalyHub</title>` +
      '<meta name="theme-color" content="#ecebe8">' +
      "<style>:root{--p:#ecebe8;--c:#f6f5f4;--t:#26221c;--s:#5c564c;--b:#dedbd4}" +
      "@media(prefers-color-scheme:dark){:root{--p:#101215;--c:#181c22;--t:#e7e5e1;--s:#a9a49c;--b:#2a2f37}}" +
      "body{font:16px/1.6 system-ui,-apple-system,sans-serif;margin:0;" +
      "padding:2.5rem 1.25rem;background:var(--p);color:var(--t)}" +
      "main{max-width:34rem;margin:0 auto;padding:1.75rem;background:var(--c);" +
      "border:1px solid var(--b);border-radius:16px}" +
      "h1{font-size:1.25rem;font-weight:500;margin:0 0 .75rem;letter-spacing:-.01em}" +
      "p{margin:0 0 .75rem;color:var(--s)}p:last-child{margin-bottom:0}" +
      "strong{color:var(--t);font-weight:500}a{color:var(--t)}" +
      "</style></head><body><main>" +
      `<h1>${title}</h1>${body}</main></body></html>`,
    {
      status,
      headers: securityHeaders({
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-DalyHub-Offline": marker,
      }),
    },
  );
}

/** Served when this device has no connection AND has never stored the shell. */
function missingShellDocument() {
  return plainDocument(
    503,
    "unavailable",
    "DalyHub is offline",
    "<p>This device has no connection, and DalyHub has not yet stored an offline " +
      "copy of the application. Reconnect and open DalyHub once to make it " +
      "available offline.</p>",
  );
}

/**
 * Served when the offline shell has restarted too many times too quickly.
 *
 * The link is the ONLY way out, and it is the owner's choice rather than a timer:
 * an automatic retry is how a loop breaker becomes a loop.
 */
function safeModeDocument() {
  return plainDocument(
    200,
    "safe-mode",
    "DalyHub offline — safe mode",
    "<p>The offline page restarted several times in a row, so DalyHub stopped it " +
      "rather than letting it keep trying. This page has no moving parts, so it " +
      "will stay exactly as it is.</p>" +
      "<p><strong>Nothing has been lost.</strong> Anything you captured offline is " +
      "still stored on this device and will still sync when DalyHub is reachable " +
      "again.</p>" +
      "<p>Reconnecting and opening DalyHub is the reliable fix. If you would rather " +
      `try the offline page again now, <a href="${OFFLINE_DOCUMENT}?${OFFLINE_RECOVER_PARAM}=1">open it once more</a>.</p>`,
  );
}

/**
 * Answer a navigation that the network could not.
 *
 * The order here is the fix: a navigation whose url is NOT the offline document
 * is redirected to it rather than being answered with its HTML, because a
 * server-rendered document served under a foreign url hydrates against routes
 * whose modules are not on this device. `/offline` itself never redirects, so the
 * chain is exactly one hop and cannot cycle.
 */
async function serveOfflineNavigation(url) {
  const shell = await caches.match(OFFLINE_DOCUMENT, {
    cacheName: SHELL_CACHE,
  });
  if (!shell) return missingShellDocument();

  if (url.pathname !== OFFLINE_DOCUMENT) {
    try {
      return Response.redirect(
        new URL(OFFLINE_DOCUMENT, self.location.origin).toString(),
        302,
      );
    } catch {
      // An engine that refuses a worker-synthesised redirect for a navigation
      // would otherwise turn the fix into a hard navigation failure. Falling
      // through and serving the document is the lesser evil, and it is not
      // unguarded: the shell corrects its own url with `history.replaceState`
      // before React Router reads it (`app/routes/offline.tsx`).
    }
  }

  if (url.searchParams.get(OFFLINE_RECOVER_PARAM) === "1") {
    await clearBootLog();
  } else if ((await recordOfflineBoot(Date.now())) > OFFLINE_BOOT_LIMIT) {
    return safeModeDocument();
  }

  // Served with 200 so the browser renders it as a normal page. The document
  // itself states plainly that it is the offline shell, and shows the last
  // successful sync time — it never pretends to be the live page.
  return new Response(shell.body, {
    status: 200,
    statusText: "OK",
    headers: securityHeaders({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-DalyHub-Offline": "shell",
    }),
  });
}

/**
 * Network-first for navigations. The network is ALWAYS tried first, so an online
 * user is never served a stale page and an expired Access session still redirects
 * to the identity provider exactly as it would without a service worker. Only a
 * genuine network failure falls back — the request outcome is authoritative, not
 * `navigator.onLine`.
 */
async function serveNavigation(request, url) {
  try {
    return await fetch(request);
  } catch {
    return serveOfflineNavigation(url);
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

  // Navigations are handled FIRST, and are the only requests the offline HTML
  // document can answer. The handler is network-first and writes to no cache, so
  // it is unaffected by the never-cache rules below.
  if (isDocumentNavigation(request)) {
    event.respondWith(serveNavigation(request, url));
    return;
  }

  if (isNeverCacheable(url)) return;

  // Everything else is either a static asset (cache-first, failing cleanly) or
  // not this worker's business at all. A request that is not answered here goes
  // to the network untouched and fails as an ordinary network error — which is
  // what an API, a JSON fetch, a `.data` request or an authentication endpoint
  // must do offline. None of them can receive an HTML document from this worker.
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
  if (type === "OFFLINE_SHELL_READY") {
    // The offline page reached the point where it can show the owner a resolved
    // state. Whatever the loop breaker had recorded describes a boot that is now
    // known to have succeeded, so it is discarded.
    event.waitUntil(clearBootLog());
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
