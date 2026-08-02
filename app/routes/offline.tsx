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

import { Link } from "react-router";

import { APP_VERSION } from "~/lib/version";
import { requireAuthenticatedSession } from "~/platform/request";
import {
  OfflineCaptureForm,
  OfflineProvider,
  OfflineSnapshotView,
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
  return { version: APP_VERSION };
}

export default function OfflineRoute({ loaderData }: Route.ComponentProps) {
  return (
    <OfflineProvider>
      <main className="dh-offline-page" id="main">
        <header className="dh-offline-page__header">
          <h1 className="dh-offline-page__title">DalyHub offline</h1>
          <p className="dh-offline-page__lead">
            This is DalyHub's offline surface. It shows the snapshot stored on
            this device and lets you capture new items that sync when a
            connection returns. Being able to open this page is not a DalyHub
            sign-in: anything that touches the server still needs one.
          </p>
          <p className="dh-offline-page__links">
            <Link to="/today">Try DalyHub online</Link>
            <span aria-hidden="true"> · </span>
            <Link to="/settings?section=offline">Offline settings</Link>
          </p>
        </header>

        <OfflineCaptureForm headingLevel={2} />
        <OfflineSyncPanel headingLevel={2} />
        <OfflineSnapshotView />

        <footer className="dh-offline-page__footer">
          <p>DalyHub {loaderData.version}</p>
        </footer>
      </main>
    </OfflineProvider>
  );
}
