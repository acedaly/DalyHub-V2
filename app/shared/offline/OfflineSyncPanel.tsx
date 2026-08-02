/**
 * PWA-05 — the queued-capture surface.
 *
 * The owner must be able to see exactly what is waiting, why anything failed, and
 * do something about it. "Do something" is two specific things: retry, and
 * discard behind an explicit confirmation.
 *
 * Editing a queued capture BEFORE retrying is deliberately not offered in this
 * milestone. It is recorded as a known limitation in `PWA_AND_OFFLINE.md` rather
 * than half-built: a rejected capture's title can be re-captured in seconds, and
 * an edit control here would be the first mutation surface over queued data —
 * which is exactly the ground this milestone is not meant to break.
 *
 * Discarding is genuinely destructive: a queued capture exists ONLY on this
 * device, so discarding it is the one action here that loses the owner's work
 * permanently. It is confirmed through the shared `ConfirmationDialog`, which
 * also owns focus restoration.
 */

import { useState } from "react";

import {
  connectionStateLabel,
  type OfflineQueueRecord,
  type OfflineQueueStatus,
} from "~/kernel/offline";
import { ConfirmationDialog } from "~/shared/settings";

import { useOffline } from "./OfflineProvider";

/** A colour-independent label for each queue status. */
export function queueStatusLabel(status: OfflineQueueStatus): string {
  switch (status) {
    case "pending":
      return "Waiting to sync";
    case "syncing":
      return "Synchronising";
    case "synced":
      return "Synced";
    case "failed":
      return "Needs attention";
    case "blocked":
      return "Waiting for sign-in";
  }
}

/** What kind of thing a queued capture will become. */
function kindLabel(record: OfflineQueueRecord): string {
  switch (record.kind) {
    case "task":
      return "Inbox task";
    case "note":
      return "Note";
    case "diary":
      return "Diary entry";
  }
}

function formatWhen(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

export interface OfflineSyncPanelProps {
  /** Heading level, so the panel nests correctly in Settings or on a page. */
  readonly headingLevel?: 2 | 3;
  readonly className?: string;
}

export function OfflineSyncPanel({
  headingLevel = 2,
  className,
}: OfflineSyncPanelProps) {
  const offline = useOffline();
  const [pendingDiscard, setPendingDiscard] =
    useState<OfflineQueueRecord | null>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);

  if (!offline) return null;
  const Heading = `h${headingLevel}` as const;
  const queue = offline.queue.filter((record) => record.status !== "synced");

  return (
    <section
      className={`dh-offline-sync${className ? ` ${className}` : ""}`}
      aria-labelledby="dh-offline-sync-heading"
    >
      <div className="dh-offline-sync__head">
        <Heading
          id="dh-offline-sync-heading"
          className="dh-offline-sync__title"
        >
          Offline captures
        </Heading>
        <p className="dh-offline-sync__summary">
          {!offline.initialised
            ? "Checking what this device has stored…"
            : queue.length === 0
              ? "Nothing is waiting to sync."
              : `${queue.length} capture${queue.length === 1 ? "" : "s"} on this device.`}{" "}
          {!offline.initialised
            ? ""
            : offline.status.lastSyncedAt
              ? `Last synchronised ${formatWhen(offline.status.lastSyncedAt)}.`
              : "This device has not synchronised yet."}
        </p>
        <button
          type="button"
          className="dh-offline-button"
          onClick={() => void offline.sync()}
          disabled={offline.busy}
        >
          {offline.busy ? "Synchronising…" : "Sync now"}
        </button>
      </div>

      {queue.length > 0 && (
        <ul className="dh-offline-sync__list">
          {queue.map((record) => (
            <li key={record.id} className="dh-offline-sync__item">
              <div className="dh-offline-sync__item-main">
                <span className="dh-offline-sync__item-kind">
                  {kindLabel(record)}
                </span>
                <span className="dh-offline-sync__item-title">
                  {record.payload.title}
                </span>
                <span className="dh-offline-sync__item-meta">
                  Captured {formatWhen(record.createdAt)} ·{" "}
                  {queueStatusLabel(record.status)}
                  {record.attempts > 0
                    ? ` · ${record.attempts} attempt${record.attempts === 1 ? "" : "s"}`
                    : ""}
                </span>
                {record.lastError && (
                  <p className="dh-offline-sync__item-error">
                    {record.lastError}
                  </p>
                )}
              </div>
              <div className="dh-offline-sync__item-actions">
                <button
                  type="button"
                  className="dh-offline-button"
                  onClick={() => void offline.retry(record.id)}
                  disabled={
                    offline.busy ||
                    record.status === "syncing" ||
                    offline.status.connection !== "online"
                  }
                >
                  Retry
                </button>
                <button
                  type="button"
                  className="dh-offline-button dh-offline-button--danger"
                  onClick={(event) => {
                    setOpener(event.currentTarget);
                    setPendingDiscard(record);
                  }}
                >
                  Discard…
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {offline.status.connection !== "online" && queue.length > 0 && (
        <p className="dh-offline-sync__note">
          {connectionStateLabel(offline.status.connection)} — retrying is
          unavailable until DalyHub can be reached. Nothing has been lost.
        </p>
      )}

      <ConfirmationDialog
        open={pendingDiscard !== null}
        title="Discard this offline capture?"
        confirmLabel="Discard capture"
        cancelLabel="Keep it"
        busyLabel="Discarding…"
        tone="danger"
        opener={opener}
        onClose={() => setPendingDiscard(null)}
        onConfirm={async () => {
          if (pendingDiscard) await offline.discard(pendingDiscard.id);
        }}
      >
        <p>
          “{pendingDiscard?.payload.title}” has never reached DalyHub. It exists
          only on this device, so discarding it deletes it permanently — it
          cannot be recovered from the server.
        </p>
      </ConfirmationDialog>
    </section>
  );
}
