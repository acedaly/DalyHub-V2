/**
 * PWA-12 — the queued Task CHANGES surface, and the conflict decision.
 *
 * The sibling of `OfflineSyncPanel` (which lists queued CAPTURES), reusing its
 * markup, its wording conventions and its confirmation dialog rather than
 * inventing a second notification system. The split is by what the record IS —
 * a thought waiting to become a record, versus an edit waiting to reach one —
 * because the two need different words and offer different actions.
 *
 * ── Nothing outstanding renders nothing ──────────────────────────────────────
 * The panel returns null when the queue is empty, which is the steady state. A
 * permanent "0 changes pending" panel would be exactly the restless chrome
 * `AGENTS.md §2` rules out.
 *
 * ── The conflict decision, in the owner's words ──────────────────────────────
 * A conflict shows both values — what this device wanted and what the server
 * holds — and offers exactly two choices. There is no three-way merge editor: for
 * a title, a date or a priority, a field-level choice IS the resolution, and a
 * merge UI would be ceremony over a fifteen-character string. There is no
 * automatic default either, because choosing one silently is the thing PWA-12
 * exists not to do.
 */

import { useState } from "react";

import {
  connectionStateLabel,
  mutationOperationLabel,
  mutationStatusLabel,
  type OfflineMutationField,
  type OfflineMutationRecord,
  type OfflineMutationValue,
} from "~/kernel/offline";
import { ConfirmationDialog } from "~/shared/settings";

import { useOffline } from "./OfflineProvider";

/** The owner's name for each contended field. Never an internal column name. */
export function conflictFieldLabel(field: OfflineMutationField): string {
  switch (field) {
    case "title":
      return "Title";
    case "priority":
      return "Priority";
    case "dueDate":
      return "Due date";
    case "scheduledDate":
      return "Planned date";
    case "completedAt":
      return "Completion";
    case "checklistItemCompleted":
      return "Checklist item";
  }
}

/**
 * A value as the owner reads it. An absent value is named, never blank: "no
 * priority" and "the panel failed to render the priority" must not look alike.
 */
export function describeConflictValue(
  value: OfflineMutationValue,
  field?: OfflineMutationField,
): string {
  const text = (value ?? "").trim();
  // TASKS-13 — a checklist tick crosses the wire as the same "1" / "" flag every
  // DalyHub form uses, and "1" is not a sentence. The two states are named in the
  // owner's words, here, where every other conflict value is already worded.
  if (field === "checklistItemCompleted") {
    return text === "1" ? "Done" : "Not done";
  }
  if (text.length === 0) return "Not set";
  return text;
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

export interface OfflineChangesPanelProps {
  /** Heading level, so the panel nests correctly in Settings or on a page. */
  readonly headingLevel?: 2 | 3;
  readonly className?: string;
}

export function OfflineChangesPanel({
  headingLevel = 2,
  className,
}: OfflineChangesPanelProps) {
  const offline = useOffline();
  const [pendingDiscard, setPendingDiscard] =
    useState<OfflineMutationRecord | null>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);

  if (!offline) return null;
  const changes = offline.mutations.filter(
    (record) => record.status !== "synced",
  );
  if (changes.length === 0) return null;

  const Heading = `h${headingLevel}` as const;
  const summary = offline.mutationSummary;
  const online = offline.status.connection === "online";

  return (
    <section
      className={`dh-offline-sync${className ? ` ${className}` : ""}`}
      aria-labelledby="dh-offline-changes-heading"
      data-testid="offline-changes"
    >
      <div className="dh-offline-sync__head">
        <Heading
          id="dh-offline-changes-heading"
          className="dh-offline-sync__title"
        >
          Task changes on this device
        </Heading>
        <p className="dh-offline-sync__summary">
          {summary.outstanding > 0
            ? `${summary.outstanding} change${summary.outstanding === 1 ? "" : "s"} waiting to reach DalyHub.`
            : "Nothing is waiting to sync."}
          {summary.needsAttention > 0
            ? ` ${summary.needsAttention} need${summary.needsAttention === 1 ? "s" : ""} your attention.`
            : ""}
        </p>
      </div>

      <ul className="dh-offline-sync__list">
        {changes.map((record) => (
          <li key={record.id} className="dh-offline-sync__item">
            <div className="dh-offline-sync__item-main">
              <span className="dh-offline-sync__item-kind">
                {mutationOperationLabel(record.operation)}
              </span>
              <span className="dh-offline-sync__item-meta">
                Changed {formatWhen(record.createdAt)} ·{" "}
                {mutationStatusLabel(record.status)}
                {record.attempts > 0
                  ? ` · ${record.attempts} attempt${record.attempts === 1 ? "" : "s"}`
                  : ""}
              </span>

              {record.status === "conflict" && record.conflict ? (
                <div className="dh-offline-sync__conflict">
                  {/* Plain language, never a status code: the owner is told what
                      happened, in the terms they think in (§19). */}
                  <p className="dh-offline-sync__item-error">
                    {record.conflict.message}
                  </p>
                  <dl className="dh-offline-sync__values">
                    <div>
                      <dt>{conflictFieldLabel(record.conflict.field)} here</dt>
                      <dd>
                        {describeConflictValue(
                          record.value,
                          record.conflict.field,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        {conflictFieldLabel(record.conflict.field)} in DalyHub
                      </dt>
                      <dd>
                        {describeConflictValue(
                          record.conflict.serverValue,
                          record.conflict.field,
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
                record.lastError && (
                  <p className="dh-offline-sync__item-error">
                    {record.lastError}
                  </p>
                )
              )}
            </div>

            <div className="dh-offline-sync__item-actions">
              {record.status === "conflict" ? (
                <>
                  <button
                    type="button"
                    className="dh-offline-button"
                    disabled={!online || offline.busy}
                    onClick={() =>
                      void offline.resolveConflict(record.id, "mine")
                    }
                  >
                    Keep my change
                  </button>
                  <button
                    type="button"
                    className="dh-offline-button"
                    onClick={() =>
                      void offline.resolveConflict(record.id, "server")
                    }
                  >
                    Keep DalyHub’s
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="dh-offline-button"
                  onClick={() => void offline.retryMutation(record.id)}
                  disabled={
                    offline.busy || record.status === "syncing" || !online
                  }
                >
                  Retry
                </button>
              )}
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

      {!online && (
        <p className="dh-offline-sync__note">
          {connectionStateLabel(offline.status.connection)} — these changes are
          safe on this device and will be sent when DalyHub can be reached.
          Nothing has been lost.
        </p>
      )}

      <ConfirmationDialog
        open={pendingDiscard !== null}
        title="Discard this change?"
        confirmLabel="Discard change"
        cancelLabel="Keep it"
        busyLabel="Discarding…"
        tone="danger"
        opener={opener}
        onClose={() => setPendingDiscard(null)}
        onConfirm={async () => {
          if (pendingDiscard) await offline.discardMutation(pendingDiscard.id);
        }}
      >
        <p>
          This change has never reached DalyHub. It exists only on this device,
          so discarding it means the task keeps the value DalyHub already holds.
        </p>
      </ConfirmationDialog>
    </section>
  );
}
