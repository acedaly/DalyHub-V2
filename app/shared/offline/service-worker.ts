/**
 * PWA-02 — the page's side of the service-worker relationship.
 *
 * Registration, the "an update is ready" state, and the small message protocol
 * the worker speaks. Everything here is defensive: a service worker is optional,
 * unavailable in several real situations (an insecure origin, some embedded
 * webviews, Firefox private windows), and its absence must degrade DalyHub to an
 * ordinary online web app rather than break it.
 *
 * ── Updates are offered, never forced ────────────────────────────────────────
 * A new worker installs and WAITS. Activating it under a page that is already
 * running would swap the asset cache beneath a loaded document — the classic way
 * to end up running one build's JavaScript against another build's server. So the
 * page is told, and the owner chooses; the only automatic activation is when
 * there is no controlled page to disturb (a first install).
 */

export type ServiceWorkerStatus =
  /** The platform has no service worker, or registration is not possible. */
  | { readonly kind: "unsupported"; readonly reason: string }
  /** Registration has not been attempted yet in this page. */
  | { readonly kind: "pending" }
  /** Registered and controlling this page. */
  | { readonly kind: "active"; readonly buildId: string | null }
  /** Registered but not yet controlling (a first load before activation). */
  | { readonly kind: "registered" }
  /** A newer DalyHub is installed and waiting for permission to take over. */
  | { readonly kind: "updateReady" }
  /** Registration failed. DalyHub still works; offline support does not. */
  | { readonly kind: "failed"; readonly reason: string };

/** True when this browser can run a DalyHub service worker at all. */
export function isServiceWorkerSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  // Service workers require a secure context. Localhost counts as secure, which
  // is why local development and the Playwright suite work unchanged.
  return typeof window !== "undefined" && window.isSecureContext !== false;
}

/** The URL the worker is served from, and the scope it claims. */
export const SERVICE_WORKER_URL = "/sw.js";
export const SERVICE_WORKER_SCOPE = "/";

export interface RegisterOptions {
  /** Called whenever the status changes, including the first resolution. */
  readonly onStatus: (status: ServiceWorkerStatus) => void;
}

/**
 * Register the DalyHub service worker and report its lifecycle.
 *
 * Returns a cleanup function; calling it stops the listeners but deliberately
 * does NOT unregister the worker — offline support must survive a React unmount.
 */
export function registerServiceWorker(options: RegisterOptions): () => void {
  if (!isServiceWorkerSupported()) {
    options.onStatus({
      kind: "unsupported",
      reason:
        typeof window !== "undefined" && window.isSecureContext === false
          ? "Offline support needs a secure (HTTPS) connection."
          : "This browser does not support offline support for web apps.",
    });
    return () => {};
  }

  let disposed = false;
  const disposers: (() => void)[] = [];

  const watchInstalling = (registration: ServiceWorkerRegistration) => {
    const installing = registration.installing;
    if (!installing) return;
    const onStateChange = () => {
      if (installing.state !== "installed") return;
      if (navigator.serviceWorker.controller) {
        // Something was already controlling this page, so this is an UPDATE.
        options.onStatus({ kind: "updateReady" });
      } else {
        options.onStatus({ kind: "registered" });
      }
    };
    installing.addEventListener("statechange", onStateChange);
    disposers.push(() =>
      installing.removeEventListener("statechange", onStateChange),
    );
  };

  navigator.serviceWorker
    .register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE })
    .then((registration) => {
      if (disposed) return;
      if (registration.waiting && navigator.serviceWorker.controller) {
        options.onStatus({ kind: "updateReady" });
      } else if (navigator.serviceWorker.controller) {
        options.onStatus({ kind: "active", buildId: null });
        void requestBuildId().then((buildId) => {
          if (!disposed && buildId) {
            options.onStatus({ kind: "active", buildId });
          }
        });
      } else {
        options.onStatus({ kind: "registered" });
      }
      watchInstalling(registration);
      const onUpdateFound = () => watchInstalling(registration);
      registration.addEventListener("updatefound", onUpdateFound);
      disposers.push(() =>
        registration.removeEventListener("updatefound", onUpdateFound),
      );
    })
    .catch((cause: unknown) => {
      if (disposed) return;
      options.onStatus({
        kind: "failed",
        reason:
          cause instanceof Error
            ? cause.message
            : "The offline worker could not be registered.",
      });
    });

  return () => {
    disposed = true;
    for (const dispose of disposers) dispose();
  };
}

/** Ask the ACTIVE worker which build it is. Resolves null if it does not answer. */
export function requestBuildId(timeoutMs = 1_500): Promise<string | null> {
  if (!isServiceWorkerSupported() || !navigator.serviceWorker.controller) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, timeoutMs);
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "VERSION") {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("message", onMessage);
        resolve(
          typeof event.data.buildId === "string" ? event.data.buildId : null,
        );
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.controller?.postMessage({ type: "GET_VERSION" });
    setTimeout(() => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    }, timeoutMs + 100);
  });
}

/**
 * The one-shot update-reload guard, at MODULE scope.
 *
 * PWA-11 — deliberately not a local variable. A guard inside
 * `applyServiceWorkerUpdate` protects one call; two calls (two presses, or a
 * press plus a retry) each installed their own `controllerchange` listener with
 * its own flag, so the page could be reloaded more than once per lifecycle. A
 * page lifecycle gets at most ONE service-worker-driven reload, full stop —
 * because an unbounded reload is precisely how an installed PWA ends up being
 * killed by the platform.
 */
let updateReloadArmed = false;
let updateReloadUsed = false;

/** True when a service-worker update has already reloaded this page lifecycle. */
export function hasUsedUpdateReload(): boolean {
  return updateReloadUsed;
}

/** Test seam: forget the one-shot guard. Never called by application code. */
export function resetUpdateReloadGuardForTests(): void {
  updateReloadArmed = false;
  updateReloadUsed = false;
}

/**
 * Activate a waiting worker and reload once it takes control.
 *
 * The reload is what makes the update real: after `controllerchange` the page is
 * still running the OLD bundle, which is precisely the stale-JavaScript state
 * this whole mechanism exists to avoid. Guarded so it can only reload once per
 * page lifecycle, however many times this is called and however many times the
 * controller changes.
 */
export async function applyServiceWorkerUpdate(): Promise<void> {
  if (!isServiceWorkerSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const waiting = registration?.waiting;
  if (!waiting) return;
  if (!updateReloadArmed) {
    updateReloadArmed = true;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (updateReloadUsed) return;
      updateReloadUsed = true;
      window.location.reload();
    });
  }
  waiting.postMessage({ type: "SKIP_WAITING" });
}

/**
 * Tell the ACTIVE worker that the offline surface reached a resolved state.
 *
 * This is what clears the worker's offline-boot loop breaker: a boot that got as
 * far as showing the owner a settled state is, by definition, not the restart
 * loop the breaker exists to stop.
 */
export async function reportOfflineShellReady(): Promise<void> {
  if (!isServiceWorkerSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    (registration.active ?? navigator.serviceWorker.controller)?.postMessage({
      type: "OFFLINE_SHELL_READY",
    });
  } catch {
    // No worker: there is no breaker to clear, and nothing to report.
  }
}

/**
 * Ask the worker to fetch and cache the offline shell document.
 *
 * Posts to the ACTIVE registration rather than to `controller`, because the two
 * differ exactly when this matters most: immediately after a first registration
 * the worker is active but is not yet controlling this page, and a
 * `controller`-only message would be dropped — leaving a device with a worker
 * and no offline shell until its next sync.
 */
export async function refreshOfflineShell(): Promise<void> {
  if (!isServiceWorkerSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    (registration.active ?? navigator.serviceWorker.controller)?.postMessage({
      type: "REFRESH_OFFLINE_SHELL",
    });
  } catch {
    // No worker: DalyHub degrades to an ordinary online web app.
  }
}

/**
 * Ask the worker to drop every cache it owns. Used by the "clear cached
 * application files" control in Settings — a separate, less destructive action
 * than clearing the offline database.
 */
export async function clearServiceWorkerCaches(): Promise<void> {
  if (!isServiceWorkerSupported()) return;
  navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_CACHES" });
  // Also clear from the page: if no worker is controlling (a first load, or a
  // failed registration) the message above goes nowhere, and the caches would
  // survive a control the owner just used.
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith("dalyhub-"))
      .map((name) => caches.delete(name)),
  );
}

/** True when the page is running as an installed / standalone application. */
export function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  if (window.matchMedia?.("(display-mode: minimal-ui)").matches) return true;
  // iOS Safari predates `display-mode` and exposes this non-standard flag
  // instead. It is read ONLY as a fallback, for that demonstrated reason.
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
