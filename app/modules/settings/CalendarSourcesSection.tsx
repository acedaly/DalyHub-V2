/**
 * CAL-01 — `Settings → Calendars`.
 *
 * The owner-facing surface for external calendars: what they are, which ones are
 * connected, when each last worked, and how to add, pause, rename, refresh or
 * remove one. No Cloudflare CLI, no environment editing, no provider OAuth —
 * adding a calendar is a name and a link.
 *
 * ── The language rule this file is written to ───────────────────────────────
 * DalyHub is a personal product, not an integrations console. The words here are
 * "calendar", "link", "paused", "refresh" and "last synced" — never "feed
 * endpoint", "subscription resource", "ICS ingestion" or "sync job". The
 * implementation underneath is rigorous; the surface is not.
 *
 * ── The link is a secret, and the surface says so ───────────────────────────
 * A published calendar link is a credential: anyone holding it can read the
 * calendar. It is accepted once, encrypted before it is stored, and never shown
 * again — and that is stated on screen rather than left to be discovered when
 * someone goes looking for an "edit link" control that does not exist.
 */

import { useEffect, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";

import { SettingsGroup, SettingsLayout, SettingsRow } from "~/shared/settings";
import { TextField } from "~/shared/forms";

import type {
  CalendarActionResult,
  CalendarSourceView,
} from "./routes/calendars";

/** Everything this section renders that only the server can know. */
export type CalendarSettingsData = {
  readonly sources: readonly CalendarSourceView[];
  /**
   * Whether the deployment has an encryption key configured. Without one a feed
   * URL cannot be stored safely, so adding a calendar is refused — and the
   * surface says why, rather than failing on submit.
   */
  readonly encryptionConfigured: boolean;
  /** How many calendars this workspace may hold. */
  readonly limit: number;
};

export function CalendarSourcesSection({
  data,
}: {
  readonly data: CalendarSettingsData;
}) {
  return (
    <SettingsLayout
      title="Calendars"
      description="Connect a read-only calendar link and DalyHub will show your day alongside your tasks. Your calendar stays the place you schedule things — DalyHub never writes to it."
    >
      <SettingsGroup
        title="How this works"
        description="DalyHub subscribes to a published calendar link and refreshes it in the background."
      >
        <SettingsRow
          label="Read-only, always"
          description="DalyHub never creates, edits, moves, cancels or replies to anything in your calendar. Nothing you do here can change what your calendar shows."
          control={null}
        />
        <SettingsRow
          label="What DalyHub imports"
          description="The title, the time, the location and an online meeting link when there is one."
          status="It does not import event descriptions, attendees, organisers or attachments, and it never creates People from a calendar."
          control={null}
        />
        <SettingsRow
          label="Refreshing"
          description="Every 15 minutes or so, plus whenever you press Refresh. This is not live: a change you make in your calendar shows up at the next refresh."
          control={null}
        />
      </SettingsGroup>

      {data.encryptionConfigured ? (
        <AddCalendarGroup
          atLimit={data.sources.length >= data.limit}
          limit={data.limit}
        />
      ) : (
        <SettingsGroup
          title="Add a calendar"
          description="Not available on this deployment yet."
        >
          <SettingsRow
            label="Encrypted storage is not configured"
            description="A calendar link is a secret, so DalyHub will not store one until this deployment has an encryption key configured."
            status="See docs/development/DEPLOYMENT.md — the setting is APP_ENCRYPTION_KEY."
            control={null}
          />
        </SettingsGroup>
      )}

      <SettingsGroup
        title="Your calendars"
        description="Every calendar you have connected, and when each last worked."
      >
        {data.sources.length === 0 ? (
          <SettingsRow
            label="No calendars yet"
            description="Add one above and today's schedule appears on Today, Tomorrow and Next 7 days."
            control={null}
          />
        ) : (
          data.sources.map((source) => (
            <CalendarRow key={source.id} source={source} />
          ))
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Finding your calendar link"
        description="Every calendar app calls it something slightly different."
      >
        <SettingsRow
          label="Outlook / Microsoft 365"
          description="Calendar settings → Shared calendars → Publish a calendar → choose “Can view all details” → copy the ICS link (not the HTML one)."
          control={null}
        />
        <SettingsRow
          label="Apple / iCloud"
          description="In Calendar, right-click the calendar → Share Calendar → Public Calendar → copy the webcal:// link."
          control={null}
        />
        <SettingsRow
          label="Anything else"
          description="Any standards-compliant calendar link works. DalyHub is not built around one provider."
          status="Treat the link like a password: anyone who has it can read that calendar."
          control={null}
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}

/**
 * Add a calendar: a name and a link.
 *
 * Two fields, because that is genuinely all it takes. The submit is slow on
 * purpose — DalyHub fetches and parses the calendar before saving anything, so a
 * mistyped or non-calendar address is refused while the owner can still see what
 * they pasted.
 */
function AddCalendarGroup({
  atLimit,
  limit,
}: {
  readonly atLimit: boolean;
  readonly limit: number;
}) {
  const fetcher = useFetcher<CalendarActionResult>();
  const revalidator = useRevalidator();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const result = fetcher.data;
  const error = result !== undefined && !result.ok ? result : null;
  const submitting = fetcher.state !== "idle";

  useEffect(() => {
    if (result !== undefined && result.ok) {
      // The link is cleared the moment it has been accepted. It is never read
      // back from the server, so nothing on this page can redisplay it — and
      // leaving it in the field would keep a credential on screen.
      setName("");
      setUrl("");
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  if (atLimit) {
    return (
      <SettingsGroup title="Add a calendar">
        <SettingsRow
          label={`You have reached ${limit} calendars`}
          description="Remove one below to add another."
          control={null}
        />
      </SettingsGroup>
    );
  }

  return (
    <SettingsGroup
      title="Add a calendar"
      description="Give it a name you will recognise on your schedule — “Work”, “Family”, “Kids”."
    >
      <fetcher.Form method="post" action="/settings/calendars/add">
        <SettingsRow
          align="start"
          control={
            <>
              <TextField
                label="Name"
                value={name}
                onChange={setName}
                required
                maxLength={60}
                autoComplete="off"
              />
              {/* The shared DS-06 control is a controlled React field rather
                  than a form-post field, so the posted value comes from a
                  hidden mirror. One state, one submitted value. */}
              <input type="hidden" name="name" value={name} />
            </>
          }
        />
        <SettingsRow
          align="start"
          label="Calendar link"
          description="The published ICS or webcal link from your calendar app."
          status="DalyHub encrypts this link and never shows it again — not here, not in errors, not anywhere."
          control={
            <>
              <TextField
                label="Link"
                value={url}
                onChange={setUrl}
                required
                maxLength={2048}
                autoComplete="off"
              />
              <input type="hidden" name="url" value={url} />
            </>
          }
        />
        <SettingsRow
          status={error?.message ?? null}
          statusTone={error === null ? undefined : "danger"}
          statusLive
          control={
            <button
              type="submit"
              className="dh-btn dh-btn--filled"
              disabled={submitting || name.trim() === "" || url.trim() === ""}
              data-testid="calendar-add-submit"
            >
              {submitting ? "Checking the link…" : "Add calendar"}
            </button>
          }
        />
      </fetcher.Form>
    </SettingsGroup>
  );
}

/** One connected calendar: its state, and the four things you can do to it. */
function CalendarRow({ source }: { readonly source: CalendarSourceView }) {
  const fetcher = useFetcher<CalendarActionResult>();
  const revalidator = useRevalidator();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(source.name);
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data !== undefined && fetcher.data.ok) {
      setRenaming(false);
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  const failure =
    fetcher.data !== undefined && !fetcher.data.ok
      ? fetcher.data.message
      : null;

  return (
    <SettingsRow
      align="start"
      label={source.name}
      description={source.providerLabel}
      // The truthful sentence, from the one place it is written. A source that
      // has never loaded says "Never synced" — never "Connected".
      status={failure ?? source.syncText}
      statusTone={
        failure !== null || source.syncTone === "danger" ? "danger" : undefined
      }
      statusLive
      control={
        <div className="dh-calendar-source__controls">
          {renaming ? (
            <fetcher.Form method="post" action="/settings/calendars/rename">
              <input type="hidden" name="id" value={source.id} />
              <TextField
                label="Name"
                value={name}
                onChange={setName}
                maxLength={60}
                autoComplete="off"
              />
              <input type="hidden" name="name" value={name} />
              <button
                type="submit"
                className="dh-btn dh-btn--filled dh-btn--sm"
              >
                Save
              </button>
              <button
                type="button"
                className="dh-btn dh-btn--ghost dh-btn--sm"
                onClick={() => {
                  setName(source.name);
                  setRenaming(false);
                }}
              >
                Cancel
              </button>
            </fetcher.Form>
          ) : (
            <>
              <fetcher.Form method="post" action="/settings/calendars/refresh">
                <input type="hidden" name="id" value={source.id} />
                <button
                  type="submit"
                  className="dh-btn dh-btn--outlined dh-btn--sm"
                  disabled={busy}
                  data-testid="calendar-refresh"
                >
                  {busy ? "Refreshing…" : "Refresh now"}
                  <span className="dh-visually-hidden">{` ${source.name}`}</span>
                </button>
              </fetcher.Form>

              <button
                type="button"
                className="dh-btn dh-btn--ghost dh-btn--sm"
                onClick={() => setRenaming(true)}
              >
                Rename
                <span className="dh-visually-hidden">{` ${source.name}`}</span>
              </button>

              <fetcher.Form method="post" action="/settings/calendars/toggle">
                <input type="hidden" name="id" value={source.id} />
                <input
                  type="hidden"
                  name="enabled"
                  value={source.enabled ? "false" : "true"}
                />
                <button
                  type="submit"
                  className="dh-btn dh-btn--ghost dh-btn--sm"
                  disabled={busy}
                  data-testid="calendar-toggle"
                >
                  {source.enabled ? "Pause" : "Resume"}
                  <span className="dh-visually-hidden">{` ${source.name}`}</span>
                </button>
              </fetcher.Form>

              <fetcher.Form method="post" action="/settings/calendars/remove">
                <input type="hidden" name="id" value={source.id} />
                <button
                  type="submit"
                  className="dh-btn dh-btn--ghost dh-btn--sm"
                  disabled={busy}
                  data-testid="calendar-remove"
                >
                  Remove
                  <span className="dh-visually-hidden">{` ${source.name}`}</span>
                </button>
              </fetcher.Form>
            </>
          )}
        </div>
      }
    />
  );
}
