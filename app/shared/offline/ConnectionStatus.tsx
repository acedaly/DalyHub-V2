/**
 * PWA-03 — the shared connection/sync status surface.
 *
 * ── Calm by default ──────────────────────────────────────────────────────────
 * When DalyHub is online, up to date and has nothing queued, this renders
 * NOTHING visible. A permanent green "you are online" badge would be exactly the
 * manufactured-urgency chrome `AGENTS.md §2` rules out: the absence of a warning
 * is the healthy state.
 *
 * ── Accessible, and never colour alone ───────────────────────────────────────
 * Every state carries a TEXT label and a distinct icon shape. Colour is a third,
 * redundant signal. State changes are announced through a polite live region that
 * holds only the SUMMARY sentence — a live region carrying the whole panel would
 * re-announce every count change and become noise.
 */

import { useEffect, useRef, useState } from "react";

import {
  connectionStateDescription,
  connectionStateLabel,
  syncStateLabel,
  type OfflineStatus,
} from "~/kernel/offline";

import { useOffline } from "./OfflineProvider";

/**
 * A distinct glyph per state. Shapes, not colours: a slashed cloud reads as
 * "offline" in monochrome, at 200% zoom and to a screen reader via its label.
 */
function StateIcon({ state }: { readonly state: OfflineStatus["connection"] }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
  switch (state) {
    case "offline":
      return (
        <svg {...common}>
          <path d="M5 18h11a4 4 0 0 0 .9-7.9A6 6 0 0 0 6.3 8.3" />
          <path d="m3 3 18 18" />
        </svg>
      );
    case "authRequired":
      return (
        <svg {...common}>
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0" />
        </svg>
      );
    case "backendUnavailable":
      return (
        <svg {...common}>
          <path d="M12 4 2.5 20h19L12 4Z" />
          <path d="M12 10v4M12 17.5v.01" />
        </svg>
      );
    case "reconnecting":
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v4h-4" />
        </svg>
      );
    case "online":
      return (
        <svg {...common}>
          <path d="M5 18h11a4 4 0 0 0 0-8 6 6 0 0 0-11.2 1.6A3.5 3.5 0 0 0 5 18Z" />
        </svg>
      );
  }
}

/** The single sentence announced when the status changes. */
export function statusSummary(status: OfflineStatus): string {
  const parts = [connectionStateLabel(status.connection)];
  if (status.sync !== "upToDate") parts.push(syncStateLabel(status.sync));
  if (status.pendingCaptures > 0) {
    parts.push(
      `${status.pendingCaptures} capture${status.pendingCaptures === 1 ? "" : "s"} waiting to sync`,
    );
  }
  if (status.failedCaptures > 0) {
    parts.push(
      `${status.failedCaptures} capture${status.failedCaptures === 1 ? "" : "s"} need attention`,
    );
  }
  return `${parts.join(". ")}.`;
}

/** True when the status is worth showing at all. */
export function shouldShowStatus(status: OfflineStatus): boolean {
  return (
    status.connection !== "online" ||
    status.sync === "failed" ||
    status.pendingCaptures > 0 ||
    status.failedCaptures > 0
  );
}

export interface ConnectionStatusProps {
  /** Extra classes for placement. The component owns no layout of its own. */
  readonly className?: string;
}

export function ConnectionStatus({ className }: ConnectionStatusProps) {
  const offline = useOffline();
  const [announcement, setAnnouncement] = useState("");
  const lastAnnounced = useRef("");

  const status = offline?.status;

  useEffect(() => {
    if (!status) return;
    const summary = statusSummary(status);
    // Announce only genuine CHANGES, so a re-render or a count that settles back
    // does not re-interrupt a screen-reader user mid-sentence.
    if (summary === lastAnnounced.current) return;
    lastAnnounced.current = summary;
    setAnnouncement(summary);
  }, [status]);

  if (!offline || !status) return null;

  const visible = shouldShowStatus(status);
  const tone =
    status.connection === "online"
      ? status.failedCaptures > 0
        ? "attention"
        : "info"
      : status.connection === "authRequired" ||
          status.connection === "backendUnavailable"
        ? "attention"
        : "info";

  return (
    <>
      {/* The live region exists even when nothing is displayed, so the first
       * transition into an unhealthy state is announced rather than appearing
       * silently alongside a newly-inserted element. */}
      <p className="dh-visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
      {visible && (
        <div
          className={`dh-connection-status dh-connection-status--${tone}${className ? ` ${className}` : ""}`}
          data-connection={status.connection}
          data-sync={status.sync}
        >
          <span className="dh-connection-status__icon">
            <StateIcon state={status.connection} />
          </span>
          <span className="dh-connection-status__body">
            <span className="dh-connection-status__label">
              {connectionStateLabel(status.connection)}
            </span>
            <span className="dh-connection-status__detail">
              {connectionStateDescription(status.connection)}
            </span>
          </span>
          {status.connection === "authRequired" && (
            <a className="dh-connection-status__action" href="/today">
              Sign in again
            </a>
          )}
          {status.connection === "offline" && offline.meta && (
            <a className="dh-connection-status__action" href="/offline">
              Offline snapshot
            </a>
          )}
        </div>
      )}
    </>
  );
}
