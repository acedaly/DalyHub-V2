/**
 * PWA-03 — run offline work only once the page the owner is looking at is done.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Priming offline support costs real network: registering the worker, letting it
 * precache the shell, probing reachability, and downloading a snapshot. None of
 * that is what the owner opened DalyHub to do, and all of it competes with the
 * page that is. Starting it during load makes the visible page slower for a
 * feature whose entire value is availability *later*.
 *
 * It also broke something concrete: `waitForLoadState("networkidle")`, which the
 * end-to-end suite uses as its hydration gate on roughly a thousand tests, waits
 * for 500 ms of network quiet. Offline priming kept the network busy past that
 * window on a cold development server, so an unrelated test timed out. That was
 * a real signal, not test friction — the same contention exists on a real
 * device, on a real connection, at exactly the moment the owner is waiting.
 *
 * So all of it waits for two things, in order:
 *   1. the document's `load` event — everything the page needs is fetched;
 *   2. an idle callback (with a timeout, so a permanently busy page still primes).
 *
 * Registering a service worker after `load` is the long-standing recommended
 * practice for exactly this reason; the idle step extends the same idea to the
 * snapshot fetch.
 */

/** How long to wait for genuine idleness before priming anyway. */
const IDLE_TIMEOUT_MS = 3_000;

/** The fallback delay where `requestIdleCallback` is unavailable (Safari < 16.4). */
const FALLBACK_DELAY_MS = 1_000;

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Run `work` after the page has loaded and the browser is idle.
 *
 * Returns a cleanup function that cancels the pending work if the component
 * unmounts first, so a fast navigation does not start priming for a page that is
 * no longer there.
 */
export function afterPageIdle(work: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const view = window as IdleWindow;
  let cancelled = false;
  let idleHandle: number | null = null;
  let timerHandle: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    if (cancelled) return;
    work();
  };

  const scheduleIdle = () => {
    if (cancelled) return;
    if (typeof view.requestIdleCallback === "function") {
      idleHandle = view.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
      return;
    }
    timerHandle = setTimeout(run, FALLBACK_DELAY_MS);
  };

  if (document.readyState === "complete") {
    scheduleIdle();
  } else {
    window.addEventListener("load", scheduleIdle, { once: true });
  }

  return () => {
    cancelled = true;
    window.removeEventListener("load", scheduleIdle);
    if (idleHandle !== null && typeof view.cancelIdleCallback === "function") {
      view.cancelIdleCallback(idleHandle);
    }
    if (timerHandle !== null) clearTimeout(timerHandle);
  };
}
