/**
 * PWA-06 — the "Offline & installed app" Settings surface.
 *
 * Everything the owner needs to understand and control what DalyHub keeps on
 * this device, and nothing they do not:
 *
 *   - whether it is installed / running standalone, and how to install it;
 *   - the service-worker state and the running build;
 *   - what is available offline, in plain words;
 *   - the last successful snapshot sync and roughly how much storage it uses;
 *   - how many captures are queued, and the identity + workspace they belong to;
 *   - three SEPARATE, individually-explained destructive controls.
 *
 * ── What is deliberately not shown ───────────────────────────────────────────
 * No Cloudflare Access token, cookie, header, JWT claim, team domain or AUD. No
 * workspace id and no Access subject — the identity is shown as the owner's own
 * email plus a short fragment of the opaque namespace digest, which is enough to
 * tell two sign-ins apart and useless to anyone else.
 *
 * ── The encryption claim that is NOT made ────────────────────────────────────
 * DalyHub does not encrypt this data and this panel says so in the owner's own
 * words. Claiming encryption without real key management would be worse than
 * saying nothing, because it would change how someone treats a lost phone.
 */

import { namespaceDisplayFragment, syncStateLabel } from "~/kernel/offline";
import { DangerousAction, SettingsGroup, SettingsRow } from "~/shared/settings";

import { useOffline } from "./OfflineProvider";
import { OfflineSyncPanel } from "./OfflineSyncPanel";
import { GENERIC_INSTALL_STEPS, IOS_INSTALL_STEPS } from "./install";

/** Human-readable bytes. Returns null when the browser reported nothing. */
export function formatBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function OfflineSettingsPanel() {
  const offline = useOffline();

  if (!offline) {
    return (
      <SettingsGroup title="Offline">
        <SettingsRow
          label="Offline support"
          description="Offline status is only available inside the DalyHub application shell."
          control={<span className="dh-settings-page__text-value">—</span>}
        />
      </SettingsGroup>
    );
  }

  const worker = offline.serviceWorker;
  const workerText =
    worker.kind === "active"
      ? `Active${worker.buildId ? ` · build ${worker.buildId}` : ""}`
      : worker.kind === "updateReady"
        ? "A newer DalyHub is ready"
        : worker.kind === "registered"
          ? "Installed — active after the next reload"
          : worker.kind === "unsupported"
            ? worker.reason
            : worker.kind === "failed"
              ? `Not running — ${worker.reason}`
              : "Starting…";

  const usage = formatBytes(offline.storage.usageBytes);
  const quota = formatBytes(offline.storage.quotaBytes);

  return (
    <>
      <SettingsGroup
        title="Installed app"
        description="DalyHub can be installed so it opens in its own window, with its own icon, and starts without a browser tab."
      >
        <SettingsRow
          label="Installation"
          description={
            offline.install.kind === "installed"
              ? "DalyHub is running as an installed app on this device."
              : "DalyHub is running in a browser tab on this device."
          }
          control={
            <span className="dh-settings-page__text-value">
              {offline.install.kind === "installed"
                ? "Installed"
                : "Not installed"}
            </span>
          }
        />
        {offline.install.kind === "prompt" && (
          <SettingsRow
            label="Install DalyHub"
            description="Your browser can install DalyHub as an app."
            control={
              <button
                type="button"
                className="dh-offline-button"
                onClick={() => void offline.promptInstall()}
              >
                Install
              </button>
            }
          />
        )}
        {offline.install.kind === "manual" && (
          <SettingsRow
            label={
              offline.install.platform === "ios"
                ? "Add DalyHub to your Home Screen"
                : "Install DalyHub from your browser"
            }
            align="start"
            description={
              // iOS installation is a user action in the Share menu; there is no
              // event a web app can trigger. So DalyHub gives the real steps
              // instead of a button that would do nothing.
              <ol className="dh-offline-install__steps">
                {(offline.install.platform === "ios"
                  ? IOS_INSTALL_STEPS
                  : GENERIC_INSTALL_STEPS
                ).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            }
            control={
              <span className="dh-settings-page__text-value">Manual</span>
            }
          />
        )}
        <SettingsRow
          label="Offline worker"
          description="The background component that lets DalyHub open without a connection."
          control={
            <span className="dh-settings-page__text-value">{workerText}</span>
          }
        />
        {worker.kind === "updateReady" && (
          <SettingsRow
            label="Update available"
            description="A newer DalyHub has been downloaded. It takes over when you reload — until then this tab keeps running the version it started with."
            control={
              <button
                type="button"
                className="dh-offline-button"
                onClick={() => void offline.applyUpdate()}
              >
                Reload to update
              </button>
            }
          />
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Offline data on this device"
        description="After you have opened DalyHub online while signed in, it keeps a seven-day snapshot on this device so it can still open, and still be useful, without a connection."
      >
        <SettingsRow
          label="What is available offline"
          align="start"
          description={
            <>
              Tasks due, scheduled or overdue around today; tasks completed in
              the last seven days; notes and diary entries from the last seven
              days; meetings in the surrounding fortnight; and the project, area
              and person labels those records need. Notes and diary entries are
              stored as excerpts, not in full. Everything else — including
              creating, editing, completing and deleting existing records —
              needs a connection.
            </>
          }
          control={
            <span className="dh-settings-page__text-value">Read-only</span>
          }
        />
        <SettingsRow
          label="Status"
          description={
            // Until this device's storage has been read, say so. Reporting
            // "not stored offline yet" before looking would be a claim.
            !offline.initialised
              ? "Checking what this device has stored…"
              : offline.status.lastSyncedAt
                ? `Last synchronised ${new Date(offline.status.lastSyncedAt).toLocaleString("en-AU")}.`
                : "This device has not stored a snapshot yet."
          }
          control={
            <span className="dh-settings-page__text-value">
              {offline.initialised ? syncStateLabel(offline.status.sync) : "…"}
            </span>
          }
        />
        <SettingsRow
          label="Offline sign-in"
          description={
            !offline.initialised
              ? "Checking what this device has stored…"
              : offline.meta
                ? `Stored for ${offline.meta.identityLabel} in ${offline.meta.workspaceLabel}. Data is filed under an identity key (…${namespaceDisplayFragment(offline.meta.namespace)}) so a different sign-in on this browser never sees it.`
                : "No offline data is stored for any sign-in on this device."
          }
          align="start"
          control={
            <span className="dh-settings-page__text-value">
              {!offline.initialised ? "…" : offline.meta ? "Scoped" : "None"}
            </span>
          }
        />
        <SettingsRow
          label="Storage used"
          description={
            usage
              ? `Reported by this browser for all of DalyHub's storage on this origin${quota ? `, out of about ${quota} available` : ""}. It is an estimate, not an exact figure.`
              : "This browser does not report storage usage."
          }
          control={
            <span className="dh-settings-page__text-value">
              {usage ?? "Not reported"}
            </span>
          }
        />
        <SettingsRow
          label="Queued offline captures"
          description="Captures made without a connection, waiting to reach DalyHub."
          control={
            <span className="dh-settings-page__text-value">
              {offline.status.pendingCaptures + offline.status.failedCaptures}
            </span>
          }
        />
        <SettingsRow
          label="How this data is protected"
          align="start"
          description={
            <>
              DalyHub does <strong>not</strong> encrypt this data itself. It
              relies on your device and browser's own protection — the device
              passcode, disk encryption and the browser profile. Anyone who can
              unlock this device and open this browser profile can read it. It
              is never sent anywhere: it is only ever downloaded from DalyHub to
              this device. No sign-in token or password is stored offline, so
              holding this data is not the same as being signed in — anything
              that touches the server still needs a valid DalyHub sign-in.
            </>
          }
          control={
            <span className="dh-settings-page__text-value">Not encrypted</span>
          }
        />
        <SettingsRow
          label="Refresh offline data"
          description="Download a fresh seven-day snapshot now and retry anything queued."
          control={
            <button
              type="button"
              className="dh-offline-button"
              onClick={() => void offline.sync()}
              disabled={offline.busy}
            >
              {offline.busy ? "Refreshing…" : "Refresh now"}
            </button>
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Queued captures">
        <OfflineSyncPanel headingLevel={3} />
      </SettingsGroup>

      {/* Three SEPARATE destructive controls, each with its own consequence.
       * Combining them would hide the one that is genuinely irreversible
       * (discarding queued captures) behind the two that are not. */}
      <SettingsGroup
        title="Clear offline data"
        description="These controls only affect this device. None of them deletes anything from DalyHub's server, and none of them affects any other device."
        tone="danger"
      >
        <DangerousAction
          label="Clear the cached snapshot"
          description="Removes the read-only seven-day copy stored on this device. Queued captures are kept. DalyHub downloads a fresh copy next time it is online."
          actionLabel="Clear snapshot…"
          confirmTitle="Clear the cached snapshot?"
          confirmBody="The offline copy of your tasks, notes, diary and meetings is removed from this device. Nothing is deleted from DalyHub, and anything you captured offline is kept."
          confirmLabel="Clear snapshot"
          successMessage="Offline snapshot cleared."
          onConfirm={offline.clearCachedData}
        />
        <DangerousAction
          label="Discard queued captures"
          description="Permanently deletes captures made offline that have not reached DalyHub yet. They exist only on this device and cannot be recovered."
          actionLabel="Discard queued captures…"
          confirmTitle="Discard every queued capture?"
          confirmBody="These captures have never reached DalyHub. They exist only on this device, so discarding them deletes them permanently — there is no copy on the server to restore them from."
          confirmLabel="Discard captures"
          typedConfirmation={{
            phrase: "discard",
            label: "Type discard to confirm",
          }}
          successMessage="Queued captures discarded."
          disabled={
            offline.status.pendingCaptures + offline.status.failedCaptures === 0
          }
          onConfirm={offline.discardQueued}
        />
        <DangerousAction
          label="Reset all offline data on this device"
          description="Removes the snapshot, the queued captures and DalyHub's cached application files. DalyHub returns to a clean, online-only state on this device."
          actionLabel="Reset offline data…"
          confirmTitle="Reset all DalyHub offline data on this device?"
          confirmBody="This removes the cached snapshot, every queued offline capture and DalyHub's cached application files from this device. Queued captures have never reached the server and cannot be recovered. Nothing is deleted from DalyHub itself."
          confirmLabel="Reset offline data"
          typedConfirmation={{
            phrase: "reset",
            label: "Type reset to confirm",
          }}
          successMessage="Offline data reset on this device."
          onConfirm={offline.resetDevice}
        />
      </SettingsGroup>
    </>
  );
}
