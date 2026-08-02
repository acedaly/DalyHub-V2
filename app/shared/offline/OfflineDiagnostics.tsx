/**
 * PWA-11 — the offline surface's diagnostic state, rendered.
 *
 * Collapsed by default and quiet when there is nothing to say, because a
 * permanently visible failure panel is exactly the restless chrome `AGENTS.md §2`
 * rules out. Opened, it shows a CODE, a count and the time of the last
 * occurrence — enough to tell a failed module load apart from an IndexedDB that
 * never answered, which is the distinction the iPhone failure could not be
 * diagnosed without.
 *
 * What it deliberately does not show is anything sensitive: the detail strings
 * are redacted in `diagnostics.ts` before they reach the ring, so there is no
 * token, no query string, no response body and no owner content to leak here even
 * if someone photographs the screen.
 */

import { useEffect, useState } from "react";

import {
  readOfflineDiagnostics,
  subscribeOfflineDiagnostics,
  summariseOfflineDiagnostics,
  type OfflineDiagnostic,
  type OfflineDiagnosticCode,
} from "./diagnostics";
import { useOffline } from "./OfflineProvider";

/** One plain-English line per code. Colour is never the only signal. */
const CODE_LABELS: Record<OfflineDiagnosticCode, string> = {
  runtime: "JavaScript runtime failure",
  moduleLoad: "Application code could not be loaded",
  indexedDb: "This device's offline database failed",
  serviceWorker: "The offline worker failed",
  authRedirect: "DalyHub asked for a sign-in",
  snapshotCorrupt: "Stored data could not be understood",
  storageUnavailable: "This browser is not storing offline data",
  network: "A request did not complete",
};

function formatTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "an unknown time";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
}

export function OfflineDiagnosticsPanel() {
  const offline = useOffline();
  const [entries, setEntries] = useState<readonly OfflineDiagnostic[]>([]);

  useEffect(() => {
    setEntries(readOfflineDiagnostics());
    return subscribeOfflineDiagnostics(setEntries);
  }, []);

  const summary = summariseOfflineDiagnostics(entries);

  return (
    <section
      className="dh-offline-diagnostics"
      aria-labelledby="dh-offline-diagnostics-heading"
      // Read by the end-to-end suite, which asserts the offline shell reaches a
      // settled state rather than that it merely painted.
      data-dh-offline-local={offline?.local.kind ?? "checking"}
      data-dh-offline-connection={offline?.status.connection ?? "unknown"}
      data-dh-offline-diagnostics={summary.map((row) => row.code).join(" ")}
    >
      <details>
        <summary id="dh-offline-diagnostics-heading">
          Diagnostics{summary.length > 0 ? ` (${summary.length})` : ""}
        </summary>
        <p className="dh-offline-diagnostics__lead">
          What this page has and has not been able to do on this device. Nothing
          here is sent anywhere, and it contains no sign-in details.
        </p>
        <dl className="dh-offline-diagnostics__list">
          <div>
            <dt>Stored copy</dt>
            <dd>{offline?.local.kind ?? "checking"}</dd>
          </div>
          <div>
            <dt>Offline capture</dt>
            <dd>{offline?.capture.kind ?? "checking"}</dd>
          </div>
          <div>
            <dt>Offline worker</dt>
            <dd>{offline?.serviceWorker.kind ?? "pending"}</dd>
          </div>
          <div>
            <dt>Connection</dt>
            <dd>{offline?.status.connection ?? "unknown"}</dd>
          </div>
        </dl>
        {summary.length === 0 ? (
          <p className="dh-offline-diagnostics__empty">
            No failures have been recorded on this page.
          </p>
        ) : (
          <ul className="dh-offline-diagnostics__failures">
            {summary.map((row) => (
              <li key={row.code} data-dh-diagnostic-code={row.code}>
                <span className="dh-offline-diagnostics__code">
                  {CODE_LABELS[row.code]}
                </span>
                <span className="dh-offline-diagnostics__meta">
                  {row.count} time{row.count === 1 ? "" : "s"} · last at{" "}
                  {formatTime(row.lastAt)}
                </span>
                <span className="dh-offline-diagnostics__detail">
                  {row.lastDetail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
