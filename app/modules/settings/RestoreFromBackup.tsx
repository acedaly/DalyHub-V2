/**
 * SET-02 — the restore surface in `Settings → Privacy & data`.
 *
 * It replaces the row that said restore was not available. The shape is the one
 * the roadmap item asks for and nothing more:
 *
 *   choose a file → inspect → validate → preview → confirm → restore → report
 *
 * Two rules govern the interaction, and both are visible in the code:
 *
 * - **Choosing a file never writes anything.** Selecting a backup uploads it for
 *   validation and staging only; the workspace is untouched until the owner acts
 *   on a preview they have read.
 * - **A destructive restore is gated twice.** The owner must first save a
 *   verified safety backup of what they have now, and then type `REPLACE` into
 *   DalyHub's existing `ConfirmationDialog` — the same irreversible-action
 *   pattern every other destructive setting uses. No new dialog system, no new
 *   design language: this is `SettingsRow`, `SettingsGroup` and the shared
 *   confirmation, arranged for one task.
 *
 * All state lives in `restore-flow.ts` so the states and their sentences are
 * assertable without mounting anything.
 */

import { useCallback, useId, useRef, useState } from "react";

import { ConfirmationDialog, SettingsRow } from "~/shared/settings";

import {
  RESTORE_CONFIRM_PHRASE,
  RESTORE_COUNT_ROWS,
  canRestore,
  consequenceSentence,
  formatBackupDate,
  rejectionHeading,
  type RestoreCountsView,
  type RestoreFlowState,
  type RestorePreviewView,
  type RestoreRejectionView,
} from "./restore-flow";

/** Read the filename the server chose, exactly as the export controls do. */
function filenameFromDisposition(
  header: string | null,
  fallback: string,
): string {
  if (header === null) return fallback;
  const match = /filename="([^"]{1,120})"/.exec(header);
  return match?.[1] ?? fallback;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

interface FailureBody {
  readonly kind?: string;
  readonly message?: string;
  readonly workspaceReplaced?: boolean;
}

const GENERIC_FAILURE =
  "The restore could not be completed. Your workspace was not changed.";

function CountsTable({
  caption,
  counts,
}: {
  readonly caption: string;
  readonly counts: RestoreCountsView;
}) {
  const rows = RESTORE_COUNT_ROWS.filter(([key]) => counts[key] > 0);
  return (
    <div className="dh-restore__counts">
      <p className="dh-restore__counts-caption">{caption}</p>
      {rows.length === 0 ? (
        <p className="dh-restore__counts-empty">No records.</p>
      ) : (
        <dl className="dh-restore__counts-list">
          {rows.map(([key, label]) => (
            <div key={key} className="dh-restore__counts-item">
              <dt>{label}</dt>
              <dd>{counts[key].toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function RestorePreviewPanel({
  preview,
}: {
  readonly preview: RestorePreviewView;
}) {
  return (
    <div className="dh-restore__preview" data-testid="restore-preview">
      <p className="dh-restore__preview-summary">
        Backup taken {formatBackupDate(preview.backup.createdAt)} by DalyHub{" "}
        {preview.backup.applicationVersion} (snapshot version{" "}
        {preview.backup.schemaVersion}).
      </p>
      <p
        className="dh-restore__preview-consequence"
        data-testid="restore-consequence"
      >
        {consequenceSentence(preview)}
      </p>
      <CountsTable caption="In this backup" counts={preview.backup.counts} />
      <CountsTable
        caption="In this workspace now"
        counts={preview.target.counts}
      />
    </div>
  );
}

/** The owner-facing backup + restore controls. */
export function RestoreFromBackup() {
  const [state, setState] = useState<RestoreFlowState>({ kind: "idle" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Guards a second upload while one is being validated and staged.
  const running = useRef(false);

  const inspect = useCallback(async (file: File) => {
    if (running.current) return;
    running.current = true;
    setState({ kind: "checking", filename: file.name });
    try {
      const body = new FormData();
      body.append("backup", file);
      const response = await fetch("/settings/restore/preview", {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as
        { ok: true; preview: RestorePreviewView } | FailureBody;
      if (!response.ok || !("ok" in payload) || payload.ok !== true) {
        const failure = payload as FailureBody;
        setState({
          kind: "rejected",
          filename: file.name,
          reason: (failure.kind ?? "incompatible") as RestoreRejectionView,
          message:
            failure.message ?? "That file cannot be restored into DalyHub.",
        });
        return;
      }
      setState({
        kind: "ready",
        filename: file.name,
        preview: payload.preview,
        safetyBackupFilename: null,
      });
    } catch {
      setState({
        kind: "rejected",
        filename: file.name,
        reason: "unreadable_archive",
        message:
          "The backup could not be sent to DalyHub. Check your connection and try again.",
      });
    } finally {
      running.current = false;
    }
  }, []);

  const takeSafetyBackup = useCallback(async () => {
    if (state.kind !== "ready") return;
    const { filename, preview } = state;
    setState({ kind: "backing-up", filename, preview });
    try {
      const body = new FormData();
      body.append("operationId", preview.operationId);
      const response = await fetch("/settings/restore/safety-backup", {
        method: "POST",
        body,
      });
      if (!response.ok) {
        const failure = (await response
          .json()
          .catch(() => ({}))) as FailureBody;
        setState({
          kind: "failed",
          message: failure.message ?? GENERIC_FAILURE,
          workspaceReplaced: false,
        });
        return;
      }
      const saved = filenameFromDisposition(
        response.headers.get("content-disposition"),
        "dalyhub-safety-backup.zip",
      );
      saveBlob(await response.blob(), saved);
      setState({
        kind: "ready",
        filename,
        preview,
        safetyBackupFilename: saved,
      });
    } catch {
      setState({
        kind: "failed",
        message:
          "The safety backup could not be downloaded, so the restore was not started. Nothing has changed.",
        workspaceReplaced: false,
      });
    }
  }, [state]);

  const applyRestore = useCallback(async () => {
    if (state.kind !== "ready") return;
    const { filename, preview, safetyBackupFilename } = state;
    setState({ kind: "restoring", filename, preview });
    const body = new FormData();
    body.append("operationId", preview.operationId);
    const response = await fetch("/settings/restore/apply", {
      method: "POST",
      body,
    });
    const payload = (await response.json().catch(() => ({}))) as
      { ok: true; result: { restored: RestoreCountsView } } | FailureBody;
    if (!response.ok || !("ok" in payload) || payload.ok !== true) {
      const failure = payload as FailureBody;
      setState({
        kind: "failed",
        message: failure.message ?? GENERIC_FAILURE,
        workspaceReplaced: failure.workspaceReplaced === true,
      });
      // Throwing keeps the confirmation dialog open with an inline error, which
      // is the shared pattern's contract for a rejected confirmation.
      throw new Error(failure.message ?? GENERIC_FAILURE);
    }
    setState({
      kind: "restored",
      counts: payload.result.restored,
      safetyBackupFilename,
    });
  }, [state]);

  const reset = useCallback(() => {
    setState({ kind: "idle" });
    if (inputRef.current !== null) inputRef.current.value = "";
  }, []);

  const busy =
    state.kind === "checking" ||
    state.kind === "backing-up" ||
    state.kind === "restoring";

  const statusText =
    state.kind === "checking"
      ? "Checking this backup. Nothing has been changed."
      : state.kind === "backing-up"
        ? "Creating and verifying a backup of your current workspace…"
        : state.kind === "restoring"
          ? "Restoring. Do not close this tab."
          : state.kind === "rejected"
            ? `${rejectionHeading(state.reason)}. ${state.message}`
            : state.kind === "failed"
              ? state.message
              : state.kind === "restored"
                ? `Restored ${state.counts.total.toLocaleString()} record(s). Your workspace now matches the backup.`
                : null;

  const statusTone =
    state.kind === "rejected" || state.kind === "failed"
      ? "danger"
      : state.kind === "restored"
        ? "success"
        : "neutral";

  return (
    <>
      <SettingsRow
        label="Restore from a backup"
        description="Choose a full DalyHub export ZIP. DalyHub checks it, shows you exactly what it contains and what would happen to this workspace, and restores nothing until you say so."
        align="start"
        status={statusText}
        statusTone={statusTone}
        statusLive
        control={
          <div className="dh-restore__control">
            <label className="dh-btn dh-btn--secondary" htmlFor={inputId}>
              Choose backup…
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept=".zip,application/zip"
              className="dh-restore__file-input"
              data-testid="restore-file"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file !== undefined) void inspect(file);
              }}
            />
          </div>
        }
      />

      {state.kind === "ready" ||
      state.kind === "backing-up" ||
      state.kind === "restoring" ? (
        <SettingsRow
          label="What this backup contains"
          description={<RestorePreviewPanel preview={state.preview} />}
          align="start"
          control={
            <button
              type="button"
              className="dh-btn dh-btn--ghost"
              onClick={reset}
              disabled={busy}
            >
              Choose a different file
            </button>
          }
        />
      ) : null}

      {state.kind === "ready" && state.preview.safetyBackupRequired ? (
        <SettingsRow
          label="Safety backup of your current workspace"
          description="Before anything is replaced, DalyHub creates a backup of what you have now and checks that it can be read back. Save it somewhere you control — it is your way back if this restore turns out to be the wrong one."
          align="start"
          status={
            state.safetyBackupFilename === null
              ? "Required before restoring over this workspace."
              : `Saved ${state.safetyBackupFilename}.`
          }
          statusTone={
            state.safetyBackupFilename === null ? "neutral" : "success"
          }
          control={
            <button
              type="button"
              className="dh-btn dh-btn--secondary"
              data-testid="restore-safety-backup"
              onClick={() => {
                void takeSafetyBackup();
              }}
            >
              {state.safetyBackupFilename === null
                ? "Create safety backup"
                : "Create another"}
            </button>
          }
        />
      ) : null}

      {state.kind === "ready" ? (
        <SettingsRow
          label={
            state.preview.destructive
              ? "Replace this workspace with the backup"
              : "Restore this backup"
          }
          description={consequenceSentence(state.preview)}
          align="start"
          control={
            <button
              type="button"
              className={
                state.preview.destructive
                  ? "dh-settings-danger-button"
                  : "dh-btn dh-btn--primary"
              }
              data-testid="restore-apply"
              disabled={!canRestore(state)}
              onClick={(event) => {
                setOpener(event.currentTarget);
                setConfirmOpen(true);
              }}
            >
              {state.preview.destructive ? "Replace workspace…" : "Restore…"}
            </button>
          }
        />
      ) : null}

      {state.kind === "restored" ? (
        <SettingsRow
          label="Restore complete"
          description={
            state.safetyBackupFilename === null
              ? "Your workspace now matches the backup."
              : `Your workspace now matches the backup. The safety backup taken beforehand is ${state.safetyBackupFilename} — keep it until you are sure this is the restore you wanted.`
          }
          align="start"
          control={
            <a className="dh-btn dh-btn--primary" href="/">
              Back to DalyHub
            </a>
          }
        />
      ) : null}

      {state.kind === "ready" ? (
        <ConfirmationDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={applyRestore}
          title={
            state.preview.destructive
              ? "Replace this workspace?"
              : "Restore this backup?"
          }
          confirmLabel={
            state.preview.destructive ? "Replace workspace" : "Restore"
          }
          busyLabel="Restoring…"
          tone={state.preview.destructive ? "danger" : "default"}
          typedConfirmation={
            state.preview.destructive
              ? {
                  phrase: RESTORE_CONFIRM_PHRASE,
                  label: `Type ${RESTORE_CONFIRM_PHRASE} to confirm you want this workspace replaced.`,
                }
              : undefined
          }
          opener={opener}
        >
          <p>{consequenceSentence(state.preview)}</p>
          <p>
            Workspace <strong>{state.preview.target.workspaceId}</strong> ·
            backup taken {formatBackupDate(state.preview.backup.createdAt)} ·{" "}
            {state.preview.backup.counts.total.toLocaleString()} record(s) to
            restore.
          </p>
        </ConfirmationDialog>
      ) : null}
    </>
  );
}
