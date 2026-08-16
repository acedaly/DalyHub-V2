/**
 * NOTIFY-01 — `Settings → Notifications`.
 *
 * The owner-facing surface for everything DalyHub may say outside the
 * application: whether it says anything at all, when the daily digest goes, in
 * which timezone, which sources may speak, and where it is delivered.
 *
 * ── Off by default, and the surface says so ─────────────────────────────────
 * A product that reaches a phone must be asked to. Nothing here is on until the
 * master switch is, and the section explains what each source will actually
 * cause to arrive before the owner turns it on — rather than leaving them to
 * find out at 7am tomorrow.
 *
 * ── In-app has no toggle, on purpose ────────────────────────────────────────
 * The in-app inbox IS the ledger: every notification is a row before it is a
 * push, and a switch that stopped writing rows would leave DalyHub unable to say
 * what it had already said, and unable to avoid saying it twice. The section
 * states that plainly instead of offering a control that would break the system.
 *
 * ── The honest copy about Pushover ──────────────────────────────────────────
 * Notification content — record titles, obligation dates — transits Pushover's
 * servers and is retained under Pushover's policy, not DalyHub's. That is said
 * on this page, at the point of the decision, in the register's usual style. The
 * in-app inbox never leaves the Worker.
 */

import { useEffect, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";

import { SettingsGroup, SettingsLayout, SettingsRow } from "~/shared/settings";
import { Switch, TextField } from "~/shared/forms";

import type {
  NotificationActionResult,
  NotificationSettingsView,
} from "./routes/notifications";

/** Everything this section renders that only the server can know. */
export type NotificationSettingsData = {
  readonly settings: NotificationSettingsView;
  /** The zone list the Date & time section offers, so the two agree. */
  readonly timezoneOptions: readonly string[];
  /**
   * Whether the deployment knows its own public address. Without one a Pushover
   * message still arrives — it simply has no tappable link — and saying so here
   * is better than letting it be discovered on a phone.
   */
  readonly deepLinksConfigured: boolean;
};

/** "12 August 2026" — the calm date form, for the validation stamp. */
function formatStamp(iso: string | null): string | null {
  if (iso === null) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(at);
}

export function NotificationsSection({
  data,
}: {
  readonly data: NotificationSettingsData;
}) {
  const settings = data.settings;
  return (
    <SettingsLayout
      title="Notifications"
      description="DalyHub can tell you what needs you without you opening it — a short digest each morning, and a heads-up before an asset obligation falls due. It is off until you turn it on, and it stays quiet on a day with nothing to say."
    >
      {/* NOT titled "Notifications": the section's own heading already is, and two
          headings with one name is a worse outline for a screen reader (and an
          ambiguous target for anything looking one up by name). */}
      <SettingsGroup
        title="Turning notifications on"
        description="The master switch. Nothing below happens while this is off."
      >
        <ToggleRow
          field="enabled"
          label="Send me notifications"
          description="Turn this off and DalyHub goes completely silent — no digest, no reminders, nothing written to your notification list."
          checked={settings.enabled}
        />
      </SettingsGroup>

      <SettingsGroup
        title="What DalyHub may tell you"
        description="Two sources, each with a different rhythm."
      >
        <ToggleRow
          field="digestEnabled"
          label="Daily digest"
          description="One message each morning: what is on today, what is overdue, what is waiting, and anything drifting. If there is nothing to report, nothing is sent — silence means everything is fine."
          checked={settings.digestEnabled}
          disabled={!settings.enabled}
        />
        <ToggleRow
          field="assetObligationsEnabled"
          label="Asset obligations"
          description="A heads-up 30 days, 7 days and 1 day before an obligation falls due — a registration renewal, a service, a warranty. Each one is sent once, ever."
          checked={settings.assetObligationsEnabled}
          disabled={!settings.enabled}
        />
        <SettingsRow
          label="Overdue tasks are digest-only"
          description="Deliberately. Overdue work changes every day, so a message for each one would arrive every morning until it was done — which is how a notification channel becomes something you ignore. It is counted in the digest instead."
          control={null}
        />
      </SettingsGroup>

      <DigestTimeGroup data={data} />

      <SettingsGroup
        title="Where it arrives"
        description="In DalyHub always; on your phone if you connect Pushover."
      >
        <SettingsRow
          label="In DalyHub"
          description="The bell in the top bar. Every notification appears here first — it is the record of what DalyHub said, which is also how it knows not to say the same thing twice."
          status="Always on while notifications are on. There is nothing to switch, because turning it off would stop DalyHub keeping that record."
          control={null}
        />
        <SettingsRow
          label="What stays here and what leaves"
          description="Your notification list never leaves this workspace. A Pushover message does: the title and body — which can include a record title and a date — pass through Pushover's servers and are kept under Pushover's retention policy, not DalyHub's."
          control={null}
        />
      </SettingsGroup>

      <PushoverGroup data={data} />
    </SettingsLayout>
  );
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One immediate toggle.
 *
 * Settings apply on change — the DS-10b IMMEDIATE contract every other toggle in
 * this screen uses — and the surface revalidates so what is shown is what was
 * stored, never what was asked for. That distinction matters here: asking to
 * enable Pushover without validated keys is a legitimate save that leaves the
 * channel off, and the switch must snap back rather than lie.
 */
function ToggleRow({
  field,
  label,
  description,
  checked,
  disabled = false,
  status,
}: {
  readonly field: string;
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly status?: string | null;
}) {
  const fetcher = useFetcher<NotificationActionResult>();
  const revalidator = useRevalidator();
  const failure =
    fetcher.data !== undefined && !fetcher.data.ok
      ? fetcher.data.message
      : null;

  useEffect(() => {
    if (fetcher.data?.ok === true) revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  return (
    <SettingsRow
      label={label}
      description={description}
      status={failure ?? status ?? null}
      statusTone={failure === null ? undefined : "danger"}
      statusLive
      // The row's own label already names the setting, so the switch is
      // `labelledBy` rather than carrying a second copy of the words — the
      // shared control's documented way of not producing two labels for one
      // thing.
      control={(ids) => (
        <Switch
          id={ids.controlId}
          labelledBy={ids.labelId}
          describedBy={ids.describedById}
          checked={checked}
          disabled={disabled || fetcher.state !== "idle"}
          data-testid={`notification-toggle-${field}`}
          onChange={(next) => {
            fetcher.submit(
              { [field]: next ? "true" : "false" },
              { method: "post", action: "/settings/notifications/update" },
            );
          }}
        />
      )}
    />
  );
}

/** When the digest goes, and in which zone — stated, never implied. */
function DigestTimeGroup({
  data,
}: {
  readonly data: NotificationSettingsData;
}) {
  const settings = data.settings;
  const fetcher = useFetcher<NotificationActionResult>();
  const revalidator = useRevalidator();
  const [sendTime, setSendTime] = useState(settings.digestSendTime);
  const failure =
    fetcher.data !== undefined && !fetcher.data.ok
      ? fetcher.data.message
      : null;

  useEffect(() => {
    setSendTime(settings.digestSendTime);
  }, [settings.digestSendTime]);

  useEffect(() => {
    if (fetcher.data?.ok === true) revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  function save(patch: Record<string, string>) {
    fetcher.submit(patch, {
      method: "post",
      action: "/settings/notifications/update",
    });
  }

  return (
    <SettingsGroup
      title="When the digest goes"
      description="DalyHub checks every 15 minutes, so the digest arrives at or shortly after the time you choose."
    >
      <SettingsRow
        label="Send time"
        description="The local time of day the digest is due."
        status={failure}
        statusTone={failure === null ? undefined : "danger"}
        statusLive
        control={
          <input
            type="time"
            aria-label="Digest send time"
            className="dh-input"
            value={sendTime}
            data-testid="notification-send-time"
            disabled={!settings.enabled}
            onChange={(event) => setSendTime(event.target.value)}
            onBlur={() => {
              if (sendTime !== settings.digestSendTime && sendTime !== "") {
                save({ digestSendTime: sendTime });
              }
            }}
          />
        }
      />
      <SettingsRow
        label="Timezone"
        description="The zone that send time is read in. By default DalyHub follows the timezone in Date & time."
        // The EFFECTIVE zone, always, so a setting the owner cannot otherwise
        // see is stated rather than left to be inferred from when a message
        // arrives.
        status={`Currently using ${settings.effectiveTimeZone}${
          settings.timeZone === null ? " — from your profile" : ""
        }.`}
        control={
          <select
            aria-label="Notification timezone"
            className="dh-select"
            value={settings.timeZone ?? ""}
            data-testid="notification-timezone"
            disabled={!settings.enabled}
            onChange={(event) => save({ timeZone: event.target.value })}
          >
            <option value="">Follow my profile</option>
            {data.timezoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        }
      />
    </SettingsGroup>
  );
}

/**
 * Pushover: two credentials, a test, and only then a switch.
 *
 * The switch is DISABLED until the keys have been proven, because a channel that
 * has never worked is a channel that fails at 7am with nobody watching. The
 * database refuses the same thing independently — this control is the honest
 * surface of a rule that is enforced underneath it, not the rule itself.
 */
function PushoverGroup({ data }: { readonly data: NotificationSettingsData }) {
  const settings = data.settings;
  const save = useFetcher<NotificationActionResult>();
  const test = useFetcher<NotificationActionResult>();
  const revalidator = useRevalidator();
  const [userKey, setUserKey] = useState("");
  const [appToken, setAppToken] = useState("");

  const saveFailure =
    save.data !== undefined && !save.data.ok ? save.data : null;
  const testResult = test.data;

  useEffect(() => {
    if (save.data?.ok === true) {
      // Cleared the moment they are accepted. They are never read back from the
      // server, so nothing on this page can redisplay them — and leaving them in
      // the fields would keep a credential on screen.
      setUserKey("");
      setAppToken("");
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.data]);

  useEffect(() => {
    if (test.data?.ok === true) revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test.data]);

  const validatedOn = formatStamp(settings.pushoverValidatedAt);
  const canTest =
    settings.pushoverConfigured && test.state === "idle" && settings.enabled;

  return (
    <SettingsGroup
      title="Pushover"
      description="A one-off paid app for iPhone and Android that turns a message into a push notification. DalyHub needs two values from it: your user key, and an application token you create in your Pushover account."
    >
      <SettingsRow
        label="What DalyHub sends"
        description="A title, a short body and a link back into DalyHub. Never your notes, never a person's details, and never anything from Diary."
        status={
          data.deepLinksConfigured
            ? null
            : "This deployment has no public address configured, so messages will arrive without a tappable link."
        }
        control={null}
      />

      <save.Form method="post" action="/settings/notifications/update">
        <SettingsRow
          align="start"
          label="User key"
          description="From the front page of your Pushover account."
          control={
            <>
              <TextField
                label="Pushover user key"
                value={userKey}
                onChange={setUserKey}
                maxLength={64}
                autoComplete="off"
              />
              {/* The shared DS-06 control is a controlled React field rather
                  than a form-post field, so the posted value comes from a
                  hidden mirror. One state, one submitted value. */}
              <input type="hidden" name="pushoverUserKey" value={userKey} />
            </>
          }
        />
        <SettingsRow
          align="start"
          label="Application token"
          description="Create an application in Pushover called DalyHub; it gives you a token."
          status="Both values are stored in this workspace's database. That is a deliberate choice for a single-owner deployment behind Cloudflare Access — see the architecture decision record."
          control={
            <>
              <TextField
                label="Pushover application token"
                value={appToken}
                onChange={setAppToken}
                maxLength={64}
                autoComplete="off"
              />
              <input type="hidden" name="pushoverAppToken" value={appToken} />
            </>
          }
        />
        <SettingsRow
          status={
            saveFailure?.message ??
            (settings.pushoverConfigured
              ? "Saved. DalyHub will not show these again."
              : "Not set up yet.")
          }
          statusTone={saveFailure === null ? undefined : "danger"}
          statusLive
          control={
            <button
              type="submit"
              className="dh-btn dh-btn--filled"
              disabled={
                save.state !== "idle" ||
                userKey.trim() === "" ||
                appToken.trim() === ""
              }
              data-testid="pushover-save"
            >
              {save.state === "idle" ? "Save keys" : "Saving…"}
            </button>
          }
        />
      </save.Form>

      <SettingsRow
        label="Send a test notification"
        description="DalyHub checks the keys with Pushover and sends one real message. The channel cannot be switched on until this has worked."
        status={
          testResult === undefined
            ? validatedOn === null
              ? "Not tested yet."
              : `Last confirmed working on ${validatedOn}.`
            : testResult.ok
              ? (testResult.message ?? "Sent.")
              : testResult.message
        }
        statusTone={
          testResult !== undefined && !testResult.ok ? "danger" : undefined
        }
        statusLive
        control={
          <test.Form method="post" action="/settings/notifications/test">
            <button
              type="submit"
              className="dh-btn dh-btn--outlined"
              disabled={!canTest}
              data-testid="pushover-test"
            >
              {test.state === "idle" ? "Send test notification" : "Sending…"}
            </button>
          </test.Form>
        }
      />

      <ToggleRow
        field="pushoverEnabled"
        label="Send to Pushover"
        description="Deliver every notification to your phone as well as to DalyHub."
        checked={settings.pushoverEnabled}
        disabled={!settings.enabled || settings.pushoverValidatedAt === null}
        status={
          settings.pushoverValidatedAt === null
            ? "Send a test notification first — DalyHub will not enable a channel it has never seen work."
            : null
        }
      />
    </SettingsGroup>
  );
}
