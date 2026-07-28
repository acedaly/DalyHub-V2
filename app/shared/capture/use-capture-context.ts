/**
 * MOBILE-01 — load the shared Quick Capture context on demand.
 *
 * Fetched when a panel that needs it first mounts, NOT in the app-shell loader:
 * the shell renders on every navigation, and resolving the default capture parent
 * there would add a workspace read to every page load just so the bottom
 * navigation can draw a "+" (the performance requirement is explicit about not
 * loading modules merely to render the bar).
 *
 * The request is aborted if the sheet closes first, and a failure degrades to
 * `null` context — the panel then asks for the missing field explicitly rather
 * than blocking capture.
 */

import { useEffect, useState } from "react";

import type { CaptureContextPayload } from "~/routes/capture-context";

export type CaptureContextState = {
  readonly context: CaptureContextPayload | null;
  readonly loading: boolean;
};

export function useCaptureContext(): CaptureContextState {
  const [context, setContext] = useState<CaptureContextPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/capture/context", {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        const data = (await response.json()) as CaptureContextPayload;
        if (!cancelled) {
          setContext(data);
        }
      } catch {
        // Aborted or failed — capture continues without the convenience defaults.
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return { context, loading };
}
