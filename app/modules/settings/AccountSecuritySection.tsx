/**
 * SET-03 — `Settings → Account & security`.
 *
 * The surface answers three questions and refuses to imply a fourth:
 *
 *   1. Who am I signed in as?
 *   2. What security state does DalyHub actually know about?
 *   3. What security actions can I actually take?
 *
 * ── The rule this file is written to ─────────────────────────────────────────
 * The page must not look more powerful than the architecture beneath it. DalyHub
 * does not own authentication — Cloudflare Access does (ADR-016) — so there is no
 * password control, no MFA control, no device list, no "last login", no IP
 * address, no location and no session inventory anywhere below. Not because they
 * were forgotten, but because DalyHub cannot observe any of them, and a security
 * page showing inferred facts as though they were observed is worse than one that
 * shows fewer facts.
 *
 * Most conspicuously ABSENT: a "Sign out everywhere" button. The roadmap named
 * one. DalyHub has no Cloudflare API credential, no Access service token and no
 * revocation endpoint — see `SET-03` in `ROADMAP_V2_1.md` for the audit — so it
 * cannot revoke anything beyond this browser. A button that ended one browser's
 * session while claiming to end all of them would be the single most dangerous
 * thing this page could contain: it is exactly the control an owner reaches for
 * when they believe a device is compromised. So the Session group states what
 * DalyHub can and cannot do, and points at the place that genuinely can.
 *
 * ── What every value here is sourced from ────────────────────────────────────
 * Identity and session facts come from `loaderData`, derived server-side from the
 * boundary-validated session (`requireAuthenticatedSession`) — never from a
 * browser-submitted field, and never from a client-readable cookie. Local-data
 * facts come from the offline context, because they describe THIS DEVICE and the
 * server does not know them. The two are visually and verbally separated for that
 * reason: "DalyHub knows" and "this device holds" are different claims.
 *
 * No token, cookie, JWT, claim, team domain, AUD, workspace id, API key or secret
 * appears anywhere in this file.
 */

import { useState } from "react";

import {
  describeSessionExpiry,
  formatSessionRemaining,
  type SessionExpiryState,
} from "~/kernel/account-security";
import { recordLocalDataCleared, useSignOut } from "~/shared/account-security";
import { useOffline } from "~/shared/offline";
import {
  DangerousAction,
  SettingsGroup,
  SettingsLayout,
  SettingsRow,
} from "~/shared/settings";

/** Everything the section renders that only the server can know. */
export type AccountSecurityData = {
  readonly identity: {
    readonly email: string;
    readonly displayName: string | null;
    readonly subjectFragment: string | null;
    /** Which authenticator validated this request. */
    readonly source: "cloudflare-access" | "development";
  };
  readonly session: {
    /** The credential's `iat`, ISO-8601, or null when it carried none. */
    readonly issuedAt: string | null;
    /** The credential's `exp`, ISO-8601. Always present on a valid token. */
    readonly expiresAt: string | null;
  };
  /**
   * Whether DalyHub can genuinely revoke every Access session for this owner.
   * A SERVER-derived capability, not a preference: the surface renders a global
   * sign-out control if and only if this is true, so the control cannot exist
   * without the capability behind it.
   */
  readonly globalSignOutSupported: boolean;
  /** The recent security-relevant events, newest first. Bounded server-side. */
  readonly securityActivity: readonly {
    readonly id: string;
    readonly type: string;
    readonly occurredAt: string;
    readonly summary: string;
  }[];
  /** The deployment environment label, from the one version authority. */
  readonly environment: string;
};

/** How a date is written on this surface. One helper, so it cannot drift. */
function formatMoment(iso: string | null): string | null {
  if (iso === null) return null;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return null;
  return value.toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** The words for each expiry state. Never a colour on its own (AGENTS.md §15). */
const EXPIRY_LABEL: Record<SessionExpiryState, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  unknown: "Not reported",
};

const SOURCE_LABEL: Record<AccountSecurityData["identity"]["source"], string> =
  {
    "cloudflare-access": "Cloudflare Access",
    development: "Local development identity",
  };

export function AccountSecuritySection({
  data,
}: {
  readonly data: AccountSecurityData;
}) {
  return (
    <SettingsLayout
      title="Account & security"
      description="Who you are signed in as, what DalyHub knows about this session, and what this device keeps. DalyHub does not manage your password or sign-in method — Cloudflare Access does."
    >
      <IdentityGroup data={data} />
      <SessionGroup data={data} />
      <LocalDataGroup />
      <SecurityActivityGroup data={data} />
      <SignOutGroup data={data} />
    </SettingsLayout>
  );
}

function IdentityGroup({ data }: { readonly data: AccountSecurityData }) {
  const { identity } = data;
  return (
    <SettingsGroup
      title="Identity"
      description="Read from the session the server validated for this request, not from anything this browser sent."
    >
      {identity.displayName ? (
        <SettingsRow
          label="Name"
          description="Supplied by your identity provider."
          control={
            <span className="dh-settings-page__text-value">
              {identity.displayName}
            </span>
          }
        />
      ) : (
        <SettingsRow
          label="Name"
          description="Your identity provider did not supply a name for this sign-in."
          control={<span className="dh-settings-page__text-value">—</span>}
        />
      )}
      <SettingsRow
        label="Email"
        description="The verified address DalyHub checks against the configured owner on every request."
        align="start"
        control={
          <span className="dh-settings-page__text-value dh-account-security__value--wrap">
            {identity.email}
          </span>
        }
      />
      {identity.subjectFragment ? (
        <SettingsRow
          label="Identity reference"
          description="The last few characters of your stable identity subject. Useful for telling two sign-ins apart; it is not a password and not a session token."
          align="start"
          control={
            <span className="dh-settings-page__text-value">
              …{identity.subjectFragment}
            </span>
          }
        />
      ) : null}
      <SettingsRow
        label="Signed in through"
        description="The authenticator that validated this request."
        control={
          <span className="dh-settings-page__text-value">
            {SOURCE_LABEL[identity.source]}
          </span>
        }
      />
      <SettingsRow
        label="Environment"
        description="Which DalyHub deployment you are looking at."
        control={
          <span className="dh-settings-page__text-value">
            {data.environment}
          </span>
        }
      />
    </SettingsGroup>
  );
}

function SessionGroup({ data }: { readonly data: AccountSecurityData }) {
  // Derived on the client from the server's ISO timestamps so the remaining time
  // stays honest while the page is open, rather than freezing at render time.
  const expiresAt = data.session.expiresAt
    ? new Date(data.session.expiresAt)
    : null;
  const expiry = describeSessionExpiry(expiresAt, new Date());
  const remaining = formatSessionRemaining(expiry);
  const issued = formatMoment(data.session.issuedAt);
  const expires = formatMoment(data.session.expiresAt);

  return (
    <SettingsGroup
      title="This session"
      description="What DalyHub can see about the sign-in this browser is using. It is one session, not a list of every session you have."
    >
      <SettingsRow
        label="Status"
        description={
          expiry.state === "unknown"
            ? "Your sign-in did not include an expiry time, so DalyHub cannot say how long it lasts."
            : expiry.state === "expired"
              ? "This sign-in has passed its expiry time. The next request will send you back to sign in."
              : remaining
                ? `${remaining} left, based on the expiry time in your sign-in. It can also end sooner for reasons DalyHub cannot see.`
                : "Valid."
        }
        align="start"
        control={
          <span
            className="dh-settings-page__text-value"
            data-session-state={expiry.state}
          >
            {EXPIRY_LABEL[expiry.state]}
          </span>
        }
      />
      <SettingsRow
        label="Signed in at"
        description={
          issued
            ? "When the sign-in DalyHub is using was issued."
            : "Your sign-in did not include an issue time, so DalyHub does not know when it started."
        }
        align="start"
        control={
          <span className="dh-settings-page__text-value">
            {issued ?? "Not reported"}
          </span>
        }
      />
      <SettingsRow
        label="Expires"
        description={
          expires
            ? "The expiry time carried by the sign-in itself."
            : "Not reported by this sign-in."
        }
        align="start"
        control={
          <span className="dh-settings-page__text-value">
            {expires ?? "Not reported"}
          </span>
        }
      />
      {/*
        The honest statement of the boundary, in the place an owner would go
        looking for a device list. It is a row rather than a footnote because it
        is the most load-bearing sentence on this page.
      */}
      <SettingsRow
        label="Other sessions"
        description="DalyHub cannot see your other sessions or devices. Sign-in is handled by Cloudflare Access, which does not tell DalyHub about sessions on other browsers — so nothing here can list them, and nothing here should claim to."
        align="start"
        control={
          <span className="dh-settings-page__text-value">Not available</span>
        }
      />
    </SettingsGroup>
  );
}

/**
 * The local-data group. Every value is read from the offline context on the
 * CLIENT, because none of it is a server fact — the snapshot, the queue and the
 * caches all live on this device.
 *
 * It deliberately does not duplicate `Settings → Offline & app`. That section is
 * about keeping DalyHub working without a connection; this one is about what a
 * person holding this device could read. The two overlap in mechanism and not in
 * question, so this group answers the security question and links to the other
 * for the rest.
 */
function LocalDataGroup() {
  const offline = useOffline();
  const [busy, setBusy] = useState(false);

  if (!offline) {
    return (
      <SettingsGroup title="Data on this device">
        <SettingsRow
          label="Local data"
          description="Local storage status is only available inside the DalyHub application shell."
          control={<span className="dh-settings-page__text-value">—</span>}
        />
      </SettingsGroup>
    );
  }

  const queued = offline.status.pendingCaptures + offline.status.failedCaptures;
  const hasSnapshot = offline.meta !== null;

  return (
    <>
      <SettingsGroup
        title="Data on this device"
        description="DalyHub keeps a read-only copy of recent records on each device it is opened on, so it still works without a connection. Anyone who can unlock this device and open this browser profile can read it — DalyHub does not encrypt it."
      >
        <SettingsRow
          label="Personal copy"
          description={
            hasSnapshot
              ? "Recent tasks, meetings, and excerpts of notes and diary entries. Every one of them also exists on the server, so removing them from this device loses nothing."
              : "This device has not stored a copy of your records."
          }
          align="start"
          control={
            <span className="dh-settings-page__text-value">
              {hasSnapshot ? "Stored" : "None"}
            </span>
          }
        />
        <SettingsRow
          label="Work only on this device"
          description={
            queued === 0
              ? "Nothing you captured offline is waiting. Everything on this device also exists on the server."
              : `${queued} capture${queued === 1 ? "" : "s"} made offline ${queued === 1 ? "has" : "have"} not reached DalyHub yet. ${queued === 1 ? "It exists" : "They exist"} only on this device. Signing out keeps ${queued === 1 ? "it" : "them"}; clearing everything below would destroy ${queued === 1 ? "it" : "them"}.`
          }
          align="start"
          control={
            <span className="dh-settings-page__text-value">{queued}</span>
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title="Clear this device"
        tone="danger"
        description="These controls only affect this device. Neither deletes anything from DalyHub's server, and neither affects any other device."
      >
        <DangerousAction
          label="Clear your personal data on this device"
          description="Removes the stored copy of your records, your recent searches and DalyHub's cached application files. Anything you captured offline is kept. DalyHub downloads a fresh copy next time it is online."
          actionLabel="Clear personal data…"
          confirmTitle="Clear your personal data on this device?"
          confirmBody="The offline copy of your tasks, notes, diary and meetings, your recent searches, and DalyHub's cached files are removed from this device. Nothing is deleted from DalyHub, and anything you captured offline is kept."
          confirmLabel="Clear personal data"
          successMessage="Personal data cleared on this device."
          disabled={busy}
          onConfirm={async () => {
            setBusy(true);
            try {
              await offline.clearCachedData();
              await recordLocalDataCleared({
                scope: "snapshot",
                queuedCapturesDiscarded: 0,
              });
            } finally {
              setBusy(false);
            }
          }}
        />
        <DangerousAction
          label="Clear everything DalyHub keeps on this device"
          description={
            queued === 0
              ? "Removes the stored copy, the cached application files and the offline capture queue. Nothing you captured offline is waiting, so nothing is lost."
              : `Removes the stored copy, the cached application files AND ${queued} offline capture${queued === 1 ? "" : "s"} that ${queued === 1 ? "has" : "have"} never reached DalyHub. ${queued === 1 ? "That capture exists" : "Those captures exist"} only here and cannot be recovered.`
          }
          actionLabel="Clear everything…"
          confirmTitle="Clear everything DalyHub keeps on this device?"
          confirmBody={
            queued === 0
              ? "This removes the stored copy of your records, DalyHub's cached application files and the empty capture queue. Nothing is deleted from DalyHub itself."
              : `This also permanently deletes ${queued} offline capture${queued === 1 ? "" : "s"} that ${queued === 1 ? "has" : "have"} never reached DalyHub. ${queued === 1 ? "It exists" : "They exist"} only on this device, so there is no copy on the server to restore ${queued === 1 ? "it" : "them"} from.`
          }
          confirmLabel="Clear everything"
          // A typed phrase, not because a second click is hard, but because this
          // is the one control on the page that can destroy something that exists
          // nowhere else. It stays typed even when the queue is empty: the
          // confirmation should not be easier on the day it happens to be safe.
          typedConfirmation={{
            phrase: "clear",
            label: "Type clear to confirm",
          }}
          successMessage="DalyHub data cleared on this device."
          disabled={busy}
          onConfirm={async () => {
            setBusy(true);
            try {
              await offline.resetDevice();
              await recordLocalDataCleared({
                scope: "everything",
                queuedCapturesDiscarded: queued,
              });
            } finally {
              setBusy(false);
            }
          }}
        />
      </SettingsGroup>
    </>
  );
}

function SecurityActivityGroup({
  data,
}: {
  readonly data: AccountSecurityData;
}) {
  return (
    <SettingsGroup
      title="Security activity"
      description="Security-relevant actions DalyHub recorded, newest first. It is the same Activity history the rest of DalyHub uses — not a separate log — so it holds what DalyHub genuinely observed and nothing else. Sign-ins, failed sign-ins and sessions on other devices are handled by Cloudflare Access and never reach DalyHub, so they are not here."
    >
      {data.securityActivity.length === 0 ? (
        <SettingsRow
          label="No security activity yet"
          description="Signing out through DalyHub, and clearing a device's local data, both appear here once they happen."
          align="start"
          control={<span className="dh-settings-page__text-value">—</span>}
        />
      ) : (
        <ul className="dh-account-security__events">
          {data.securityActivity.map((entry) => (
            <li key={entry.id} className="dh-account-security__event">
              <span className="dh-account-security__event-summary">
                {entry.summary}
              </span>
              <time
                className="dh-account-security__event-time"
                dateTime={entry.occurredAt}
              >
                {formatMoment(entry.occurredAt) ?? entry.occurredAt}
              </time>
            </li>
          ))}
        </ul>
      )}
    </SettingsGroup>
  );
}

function SignOutGroup({ data }: { readonly data: AccountSecurityData }) {
  const signOut = useSignOut();
  const busy = signOut.state !== "idle";

  return (
    <SettingsGroup
      title="Sign out"
      description="Ends this browser's session by handing you back to Cloudflare Access, which is what actually holds it."
    >
      <SettingsRow
        label="Sign out of this browser"
        description={
          signOut.queuedCaptures === 0
            ? "Your personal data on this device is removed first: the stored copy of your records, your recent searches and DalyHub's cached files. Then Cloudflare Access ends the session."
            : `Your personal data on this device is removed first, but the ${signOut.queuedCaptures} capture${signOut.queuedCaptures === 1 ? "" : "s"} waiting to reach DalyHub ${signOut.queuedCaptures === 1 ? "is" : "are"} kept — ${signOut.queuedCaptures === 1 ? "it exists" : "they exist"} only on this device. Sign in again on this device to finish sending ${signOut.queuedCaptures === 1 ? "it" : "them"}.`
        }
        align="start"
        control={
          <button
            type="button"
            className="dh-btn dh-btn--secondary"
            disabled={busy}
            onClick={() => void signOut.signOut()}
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        }
      />
      {/*
        The presence of a global sign-out is a SERVER capability, not a layout
        choice. Today `globalSignOutSupported` is false everywhere, so this
        branch renders the truth instead of a button. If DalyHub ever gains a
        real Access revocation credential, the control appears because the
        capability did — never the other way round.
      */}
      {data.globalSignOutSupported ? null : (
        <SettingsRow
          label="Sign out everywhere"
          description="DalyHub cannot do this. Your sessions belong to Cloudflare Access, and DalyHub holds no credential that can revoke them — so a button here would only sign out this browser while appearing to do more. To end sessions on every device, revoke them in your Cloudflare Zero Trust dashboard."
          align="start"
          control={
            <span className="dh-settings-page__text-value">Not available</span>
          }
        />
      )}
    </SettingsGroup>
  );
}
