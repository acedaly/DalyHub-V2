/**
 * PWA-03 — the offline shell document (`/offline`).
 *
 * This is the ONE HTML document DalyHub's service worker is allowed to cache, and
 * the navigation fallback a disconnected launch lands on. Everything about it
 * follows from that.
 *
 * ── The data-classification decision ─────────────────────────────────────────
 * Caching an authenticated HTML document is normally forbidden here: a DalyHub
 * page carries the owner's content, and a cached one could be shown to a
 * different identity signing in on the same device. This route is the deliberate
 * exception, and it earns it by being STRUCTURALLY incapable of carrying private
 * data: its loader resolves no workspace scope, reads no repository, and returns
 * nothing but the build metadata already published by `/health`. There is no
 * identity, no email, no workspace and no record in the response.
 *
 * Everything the owner then sees is read CLIENT-SIDE from IndexedDB, which is
 * namespaced per identity + workspace — so the cached shell is an empty vessel
 * and the data it fills with belongs, by construction, to the device's own stored
 * namespace.
 *
 * ── Why it sits outside the app-shell layout ─────────────────────────────────
 * The app shell's loader reads the owner's preferences and display identity. That
 * is exactly what must NOT be baked into a cached document, so this route is a
 * sibling of the shell rather than a child of it, and renders its own minimal
 * chrome from the same design tokens.
 *
 * ── Still authenticated ──────────────────────────────────────────────────────
 * It is not a public path. Cloudflare Access gates it like everything else, and
 * the Worker boundary authenticates it like everything else. It reaches a device
 * only by being fetched during a successfully authenticated session. Holding a
 * cached copy is NOT equivalent to holding a valid session, and the page says so.
 */

import { APP_VERSION } from "~/lib/version";
import { getCspNonce, requireAuthenticatedSession } from "~/platform/request";
import { BrandMark } from "~/shared/brand";
import {
  OfflineCaptureForm,
  OfflineDiagnosticsPanel,
  OfflineProvider,
  OfflineSnapshotView,
  OfflineChangesPanel,
  OfflineSyncPanel,
} from "~/shared/offline";

import type { Route } from "./+types/offline";

export function meta() {
  return [
    { title: "Offline · DalyHub" },
    {
      name: "description",
      content: "DalyHub's offline snapshot and capture queue.",
    },
  ];
}

/**
 * The marker the service worker requires before it will cache this document.
 * Without it a cached Cloudflare Access challenge page — which is also an HTML
 * 200 — could be stored as the offline shell.
 */
export function headers() {
  return { "X-DalyHub-Shell": "offline" };
}

export async function loader({ context }: Route.LoaderArgs) {
  // Authentication is required to FETCH this document. Deliberately nothing else
  // happens here: no workspace scope, no repository, no preference read. What
  // this function returns is what gets baked into a cached document, so it
  // returns only what is already public at `/health`.
  requireAuthenticatedSession(context);
  // AUDIT-10 — this route renders the product's ONE hand-written inline script,
  // so it needs the request's nonce. A nonce is not a secret: it is already on
  // every script tag in the document the browser is reading, and it is worthless
  // outside the response that carries it. Returning it as loader data is what
  // lets the component below emit it without a second nonce channel.
  return { version: APP_VERSION, nonce: getCspNonce(context) };
}

export default function OfflineRoute({ loaderData }: Route.ComponentProps) {
  return (
    // PWA-11 — `autoSyncOnReconnect={false}`. On every other surface a regained
    // connection may synchronise silently, because the owner is inside the
    // running application and a background refresh is what they want. HERE the
    // owner is looking at the one page whose whole job is to be stable and
    // predictable, so a returning connection OFFERS a sync and waits to be
    // asked. Nothing on this page reloads, navigates or authenticates on its own.
    <OfflineProvider autoSyncOnReconnect={false}>
      {/* PWA-11 — the second line of defence behind the service worker's
       * redirect, and the reason this page cannot be made to hydrate against a
       * route whose code is not on the device.
       *
       * The worker redirects an offline navigation to `/offline` so this
       * document is only ever rendered at the url it was rendered FOR. If any
       * engine ever refuses that redirect — a worker-synthesised redirect for a
       * navigation is well specified but this is the one failure mode that
       * bricks an installed app — the worker serves this document anyway, and
       * this line makes that safe: `replaceState` changes what
       * `window.location` reports without a navigation, and it runs while the
       * parser is still ahead of `<Scripts />`, so React Router's hydration
       * matches `/offline` rather than whatever url the launch used.
       *
       * Inline rather than a module: a module is a network fetch, and the whole
       * point is the case where the network is gone. It is a single assignment
       * with no listener, no timer and no navigation, so it cannot loop.
       *
       * AUDIT-10 — it carries the request's CSP nonce, so `script-src` needs no
       * exception for it. When this document is cached as the offline shell the
       * nonce is frozen alongside the `Content-Security-Policy` header the same
       * response carried, and the service worker replays that header rather than
       * substituting its own, so the pair stays consistent for the life of the
       * cache entry. See `docs/development/PWA_AND_OFFLINE.md`. */}
      <script
        nonce={loaderData.nonce || undefined}
        dangerouslySetInnerHTML={{
          __html:
            'if(location.pathname!=="/offline"){try{history.replaceState(null,"","/offline")}catch(e){}}',
        }}
      />
      <main className="dh-offline-page" id="main">
        <header className="dh-offline-page__header">
          {/* BRAND-01 — the offline shell is the one document that can be
           * launched with no connection, so it is the one that most needs to
           * look like DalyHub rather than like a browser error page. The mark is
           * inline SVG from the generated geometry, not an `<img>`: an image
           * would be a second request on a device that by definition has no
           * network, and the precached icon files exist for the OS, not for
           * this page. Decorative — the title names the product. */}
          <span className="dh-offline-page__mark" aria-hidden="true">
            <BrandMark />
          </span>
          <h1 className="dh-offline-page__title">DalyHub offline</h1>
          <p className="dh-offline-page__lead">
            This is DalyHub's offline surface. It shows the snapshot stored on
            this device and lets you capture new items that sync when a
            connection returns. Being able to open this page is not a DalyHub
            sign-in: anything that touches the server still needs one.
          </p>
          {/* Plain anchors, not `<Link>`, and that is load-bearing rather than
           * an oversight. A client-side `<Link>` here makes React Router import
           * the target route's module, which is deliberately NOT precached; with
           * no connection that import fails, and React Router answers a failed
           * route-module import by calling `window.location.reload()`. A full
           * document navigation instead hands the decision to the service
           * worker, which serves this same page again — a bounded, deterministic
           * outcome instead of a reload the page did not ask for. They also
           * carry no `data-discover`, so nothing here triggers React Router's
           * route-discovery fetches while there is no network to answer them. */}
          <p className="dh-offline-page__links">
            <a href="/today">Try DalyHub online</a>
            <span aria-hidden="true"> · </span>
            <a href="/settings?section=offline">Offline settings</a>
          </p>
        </header>

        <OfflineCaptureForm headingLevel={2} />
        <OfflineSyncPanel headingLevel={2} />
        <OfflineChangesPanel headingLevel={2} />
        <OfflineSnapshotView />
        <OfflineDiagnosticsPanel />

        <footer className="dh-offline-page__footer">
          <p>DalyHub {loaderData.version}</p>
        </footer>
      </main>
    </OfflineProvider>
  );
}
