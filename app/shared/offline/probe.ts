/**
 * PWA-03 — the reachability probe.
 *
 * Turns "can DalyHub actually be reached and is this sign-in still valid?" into a
 * single classified answer, by making a real request and reading its real
 * outcome. `navigator.onLine` appears here exactly once, as a reason to probe
 * SOONER — never as the answer.
 */

import { classifyProbe, type OfflineConnectionState } from "~/kernel/offline";

/** The probe endpoint: the cheapest authenticated response DalyHub produces. */
export const OFFLINE_PING_PATH = "/offline/ping";

/** How long a probe may take before it counts as unreachable. */
export const PROBE_TIMEOUT_MS = 6_000;

/**
 * Probe DalyHub.
 *
 * `redirect: "manual"` is what makes an expired Cloudflare Access session
 * distinguishable from being offline: Access answers with a cross-origin redirect
 * to the identity provider, which `fetch` surfaces as an opaque redirect instead
 * of silently following it into a login page whose HTML we would then have to
 * guess at.
 */
export async function probeConnection(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = PROBE_TIMEOUT_MS,
  externalSignal?: AbortSignal,
): Promise<OfflineConnectionState> {
  const controller =
    typeof AbortController === "undefined" ? null : new AbortController();
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  // A request still in flight when its document is destroyed is LOST — the
  // browser reports it as neither finished nor failed. Aborting on the caller's
  // signal (which the provider fires on `pagehide`) means the request ends
  // definitively instead of dangling.
  const onExternalAbort = () => controller?.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  try {
    const response = await fetchImpl(OFFLINE_PING_PATH, {
      method: "GET",
      credentials: "same-origin",
      redirect: "manual",
      cache: "no-store",
      headers: { Accept: "application/json" },
      ...(controller ? { signal: controller.signal } : {}),
    });
    return classifyProbe({
      kind: "response",
      status: response.status,
      type: response.type,
      authenticated:
        response.headers.get("X-DalyHub-Authenticated") === "1" ||
        // An opaque response cannot expose headers; classification handles that
        // case on `type`/`status` alone, so this only has to be honest here.
        false,
    });
  } catch {
    // An abort, a DNS failure, a TLS failure and "no network" are all the same
    // fact from here: the request did not complete.
    return "offline";
  } finally {
    if (timer !== null) clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

/** A hint (never an answer) that it is worth probing again immediately. */
export function browserThinksItIsOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}
