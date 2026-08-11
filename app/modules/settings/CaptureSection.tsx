/**
 * CAPTURE-01 — `Settings → Capture`.
 *
 * The owner-facing surface for external capture: what it is, which devices can
 * do it, when each last did, and how to stop one immediately.
 *
 * ── The language rule this file is written to ───────────────────────────────
 * DalyHub is a personal productivity product, not an API console (CAPTURE-01 §34). So the
 * words here are "capture device", "permissions", "last used", "revoke" — never
 * "OAuth principal", "service account grant", "API consumer" or "resource scope
 * binding". The implementation underneath is rigorous; the surface is not.
 *
 * ── The one moment a secret is visible ──────────────────────────────────────
 * A token is shown exactly once, immediately after it is created, in a panel that
 * says so plainly. Nothing on this page can show an existing token, because
 * nothing in DalyHub can: only a digest is stored. That is stated on screen
 * rather than left to be discovered when someone goes looking for a "reveal"
 * control that does not exist.
 */

import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";

import { CAPTURE_CAPABILITY_LABELS } from "~/kernel/capture";
import { SettingsGroup, SettingsLayout, SettingsRow } from "~/shared/settings";
import { TextField } from "~/shared/forms";

import type { CaptureActionResult, CaptureDeviceView } from "./routes/capture";

/** Everything this section renders that only the server can know. */
export type CaptureSettingsData = {
  readonly devices: readonly CaptureDeviceView[];
  /** The absolute capture endpoint, so the setup instructions are copy-ready. */
  readonly endpoint: string;
  /** Whether inbound email capture is configured, and at which address(es). */
  readonly email: {
    readonly enabled: boolean;
    readonly recipients: readonly string[];
    readonly allowedSenders: readonly string[];
  };
};

const STATUS_LABELS: Readonly<Record<CaptureDeviceView["status"], string>> = {
  active: "Active",
  revoked: "Revoked",
  expired: "Expired",
};

function formatMoment(iso: string | null): string {
  if (iso === null) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function capabilityLabels(capabilities: readonly string[]): string {
  const labels = capabilities.map(
    (capability) =>
      CAPTURE_CAPABILITY_LABELS[
        capability as keyof typeof CAPTURE_CAPABILITY_LABELS
      ] ?? capability,
  );
  return labels.length === 0 ? "Nothing" : labels.join(" · ");
}

export function CaptureSection({
  data,
}: {
  readonly data: CaptureSettingsData;
}) {
  return (
    <SettingsLayout
      title="Capture"
      description="Capture a thought from your phone — by Shortcut, Siri, the Share Sheet or email — without opening DalyHub first."
    >
      <SettingsGroup
        title="What external capture is"
        description="A capture device can add a task or a note to DalyHub. It cannot read, change or delete anything."
      >
        <SettingsRow
          label="What a capture device can do"
          description="Create tasks · Create notes"
          status="It cannot read your records, edit them, delete them, export anything or change settings. If a device is lost, revoke it here and nothing it held can be used again."
          control={null}
        />
        <SettingsRow
          label="Where captures go"
          description="Tasks arrive unassigned, in your Inbox. Notes arrive in Notes. Nothing is filed under a Project or Area automatically — organise afterwards, with the context you have."
          control={null}
        />
      </SettingsGroup>

      <NewDeviceGroup />

      <SettingsGroup
        title="Capture devices"
        description="Every device you have set up, and when it last captured something."
      >
        {data.devices.length === 0 ? (
          <SettingsRow
            label="No capture devices yet"
            description="Create one above, then follow the setup instructions to add the Shortcut to your phone."
            control={null}
          />
        ) : (
          data.devices.map((device) => (
            <DeviceRow key={device.id} device={device} />
          ))
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Email capture"
        description="Forward an email to DalyHub and it becomes an Inbox capture."
      >
        {data.email.enabled ? (
          <>
            <SettingsRow
              label="Capture address"
              description={data.email.recipients.join(", ")}
              status="Start the subject with “task:” to make it a task, or “note:” to make it a note. Anything else lands in your Inbox."
              control={null}
            />
            <SettingsRow
              label="Who may send"
              description={data.email.allowedSenders.join(", ")}
              status="Mail from any other address is refused, and must also pass SPF, DKIM or DMARC."
              control={null}
            />
          </>
        ) : (
          <SettingsRow
            label="Not configured"
            description="Email capture is off until a capture address and an allowed sender are configured for this deployment."
            control={null}
          />
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Setting up your phone"
        description="The Shortcut is a few steps in Apple's Shortcuts app — there is no DalyHub app to install."
      >
        <SettingsRow
          label="Capture endpoint"
          description={data.endpoint}
          status="Full setup instructions, including the Share Sheet and Siri variants, are in docs/development/UNIVERSAL_CAPTURE.md."
          control={null}
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}

/**
 * Create a capture device.
 *
 * Two fields and a button (CAPTURE-01 §33). Anything more would be a setup wizard for a
 * thing whose entire purpose is to remove steps.
 */
function NewDeviceGroup() {
  const fetcher = useFetcher<CaptureActionResult>();
  const revalidator = useRevalidator();
  const [name, setName] = useState("");
  const [allowTasks, setAllowTasks] = useState(true);
  const [allowNotes, setAllowNotes] = useState(true);
  const tokenRef = useRef<HTMLElement | null>(null);

  const result = fetcher.data;
  const created =
    result !== undefined && result.ok && "token" in result ? result : null;
  const error = result !== undefined && !result.ok ? result.message : null;

  useEffect(() => {
    if (created !== null) {
      revalidator.revalidate();
      tokenRef.current?.focus();
    }
    // The token panel appears once per creation; re-running on every render
    // would re-focus while the owner is trying to copy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created?.device.id]);

  const submitting = fetcher.state !== "idle";
  const canSubmit = name.trim().length > 0 && (allowTasks || allowNotes);

  return (
    <SettingsGroup
      title="New capture device"
      description="Give it a name you will recognise later — “Aidan’s iPhone”, “Work laptop”."
    >
      <fetcher.Form method="post" action="/settings/capture/create">
        <SettingsRow
          align="start"
          control={
            <>
              <TextField
                label="Name"
                value={name}
                onChange={setName}
                maxLength={60}
                autoComplete="off"
              />
              {/* The shared DS-06 control is deliberately name-less (it is a
                  controlled React field, not a form-post field), so the posted
                  value comes from a hidden mirror. One state, one submitted
                  value — no second source of truth. */}
              <input type="hidden" name="name" value={name} />
            </>
          }
        />
        <SettingsRow
          label="Allow"
          description="What this device may create. Both are usually right for a phone."
          control={(ids) => (
            <div
              role="group"
              aria-labelledby={ids.labelId}
              aria-describedby={ids.describedById}
              className="dh-capture-permissions"
            >
              <label>
                <input
                  type="checkbox"
                  name="capabilities"
                  value="task"
                  checked={allowTasks}
                  onChange={(event) => setAllowTasks(event.target.checked)}
                />{" "}
                {CAPTURE_CAPABILITY_LABELS.task}
              </label>
              <label>
                <input
                  type="checkbox"
                  name="capabilities"
                  value="note"
                  checked={allowNotes}
                  onChange={(event) => setAllowNotes(event.target.checked)}
                />{" "}
                {CAPTURE_CAPABILITY_LABELS.note}
              </label>
            </div>
          )}
        />
        <SettingsRow
          status={error}
          statusTone={error === null ? undefined : "danger"}
          statusLive
          control={
            <button
              type="submit"
              className="dh-btn dh-btn--filled"
              disabled={!canSubmit || submitting}
            >
              {submitting ? "Creating…" : "Create token"}
            </button>
          }
        />
      </fetcher.Form>

      {created === null ? null : (
        <SettingsRow
          align="start"
          label="Copy this token now"
          description="It will not be shown again. DalyHub stores only a one-way fingerprint of it, so there is no way to look it up later — create a new device if you lose it."
          control={
            <output
              ref={tokenRef as never}
              tabIndex={-1}
              className="dh-capture-token"
            >
              <code>{created.token}</code>
            </output>
          }
        />
      )}
    </SettingsGroup>
  );
}

/** One capture device, with its permissions, its history and its revoke control. */
function DeviceRow({ device }: { readonly device: CaptureDeviceView }) {
  const fetcher = useFetcher<CaptureActionResult>();
  const revalidator = useRevalidator();
  const revoking = fetcher.state !== "idle";
  const revoked = device.status !== "active";

  useEffect(() => {
    if (fetcher.data !== undefined && fetcher.data.ok) revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  return (
    <SettingsRow
      label={device.name}
      description={`${capabilityLabels(device.capabilities)} · Added ${formatMoment(device.createdAt)}`}
      status={`${STATUS_LABELS[device.status]} · Last used ${formatMoment(device.lastUsedAt)} · Fingerprint ${device.fingerprint}`}
      statusTone={revoked ? "danger" : undefined}
      control={
        revoked ? (
          <span className="dh-capture-device__state">
            {STATUS_LABELS[device.status]}
          </span>
        ) : (
          <fetcher.Form method="post" action="/settings/capture/revoke">
            <input type="hidden" name="id" value={device.id} />
            <button
              type="submit"
              className="dh-btn dh-btn--outlined"
              disabled={revoking}
            >
              {revoking ? "Revoking…" : "Revoke"}
            </button>
          </fetcher.Form>
        )
      }
    />
  );
}
