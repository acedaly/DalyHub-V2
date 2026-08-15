import { env } from "cloudflare:workers";
import { useMemo, useRef, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";

import {
  DATE_FORMATS,
  DEFAULT_APP_PREFERENCES,
  DIARY_DEFAULT_MODES,
  FIRST_DAY_OF_WEEK_OPTIONS,
  LANDING_DESTINATIONS,
  TASK_DEFAULT_VIEWS,
  formatPreferenceDate,
  isMandatoryNavigationModule,
  parseDateFormat,
  parseDiaryDefaultMode,
  parseFirstDayOfWeek,
  parseLandingDestination,
  parseTaskCaptureParentId,
  parseTaskDefaultView,
  parseTimezone,
  resolveNavigationPreferences,
  type AppPreferencePatch,
  type DateFormat,
  type DiaryDefaultMode,
  type FirstDayOfWeek,
  type LandingDestination,
  type TaskDefaultView,
} from "~/kernel/preferences";
import {
  AppPreferencesConflictError,
  AppPreferencesValidationError,
} from "~/kernel/preferences";
import {
  SECURITY_ACTIVITY_TYPES,
  SECURITY_LOCAL_DATA_CLEARED,
  SECURITY_SIGNED_OUT,
  subjectFragment,
  type LocalDataClearScope,
} from "~/kernel/account-security";
import { buildInfo } from "~/lib/version";
import { getPrimaryNavigation } from "~/platform/modules/primary-navigation";
import { readBackupSettings, type BackupServiceEnv } from "~/platform/backup";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { OfflineChangesPanel, OfflineSettingsPanel } from "~/shared/offline";
import {
  AI_MODEL_TIERS,
  budgetPeriodKeys,
  budgetSnapshot,
  costUnavailable,
  parseAiBoolean,
  parseAiLoggingMode,
  parseAiProvider,
  parseAiResultRetention,
  parseBudgetUsd,
  isAiFeatureId,
  isPrivacyCategory,
  resolveModel,
  MAX_DAILY_BUDGET_USD,
  MAX_MONTHLY_BUDGET_USD,
  MAX_PREMIUM_BUDGET_USD,
  AI_PROVIDERS,
  type AiFeatureId,
  type PrivacyCategory,
} from "~/kernel/ai";
import { resolveAiConfiguration } from "~/platform/ai";
import { resolveAuthConfig } from "~/platform/auth";
import {
  captureEmailIsEnabled,
  resolveCaptureEmailConfig,
  type CaptureEmailConfigEnv,
} from "~/kernel/capture";
import { CAPTURE_PATH } from "~/platform/request";
import { AiSettingsSection } from "../AiSettingsSection";
import {
  AccountSecuritySection,
  type AccountSecurityData,
} from "../AccountSecuritySection";
import { SettingsGroup, SettingsLayout, SettingsRow } from "~/shared/settings";
// The specific module, not the `~/shared/shell` barrel: the barrel also exports
// `AppShell`, and importing it here would pull the whole application frame into
// the Settings route chunk for the sake of one control.
import { AppearanceSelector } from "~/shared/shell/AppearanceSelector";
import { ColorSchemeSelector } from "~/shared/shell/ColorSchemeSelector";
import { SelectField, Switch } from "~/shared/forms";
import { useTaskParentSearch } from "~/shared/task-record/use-task-parent-search";

import { ExportDownloads } from "../ExportDownloads";
import { CaptureSection, type CaptureSettingsData } from "../CaptureSection";
import { toCaptureDeviceView } from "./capture";
import { toCalendarSourceView } from "./calendars";
import {
  CalendarSourcesSection,
  type CalendarSettingsData,
} from "../CalendarSourcesSection";
import { MAX_CALENDAR_SOURCES } from "~/kernel/calendar";
import {
  calendarEncryptionConfigured,
  type CalendarSecretsEnv,
} from "~/platform/calendar";
import { BackupsSection } from "../BackupsSection";
import { RestoreFromBackup } from "../RestoreFromBackup";

import type { Route } from "./+types/index";

type SectionId =
  | "general"
  | "ai"
  | "capture"
  | "calendars"
  | "account-security"
  | "backups"
  | "date-time"
  | "navigation"
  | "privacy-data"
  | "offline"
  | "about";

type ActionResult =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * UIX-05 — the sections, GROUPED, and each with a line saying what it holds.
 *
 * Eight equally-weighted links in one flat column is a menu with no shape: an
 * owner looking for "where does the app open?" has to read all eight, and the
 * two that are about their ACCOUNT sit between two that are about the app's
 * defaults. Three groups is the smallest number that separates the three genuine
 * kinds of thing here — how the app behaves for me, what it may do with my data,
 * and what it IS — and it is a division the owner can hold in their head.
 *
 * The description is not decoration. On a phone the section list IS the Settings
 * screen (see the component below), and a list of eight bare nouns is exactly
 * the surface a description turns into something navigable without guessing.
 */
type SectionGroupId = "app" | "data" | "system";

const SECTION_GROUPS: readonly {
  readonly id: SectionGroupId;
  readonly label: string;
}[] = [
  { id: "app", label: "How DalyHub works" },
  { id: "data", label: "Your data" },
  { id: "system", label: "This app" },
];

const SECTIONS: readonly {
  readonly id: SectionId;
  readonly label: string;
  readonly group: SectionGroupId;
  /** One line saying what is inside — the phone list's supporting text. */
  readonly summary: string;
}[] = [
  {
    id: "general",
    label: "General",
    group: "app",
    summary: "Appearance, where DalyHub opens, and how new work starts.",
  },
  {
    id: "date-time",
    label: "Date & time",
    group: "app",
    summary: "Your timezone, date format and the first day of your week.",
  },
  {
    id: "navigation",
    label: "Navigation",
    group: "app",
    summary: "Which modules appear in the sidebar, and what they are called.",
  },
  {
    id: "ai",
    label: "AI",
    group: "data",
    summary:
      "Which features may use a model, what they may send, and a budget.",
  },
  {
    // CAPTURE-01 — external capture sits in "Your data" beside AI and Account &
    // security, because what it really configures is who may write into DalyHub
    // from outside it.
    id: "capture",
    label: "Capture",
    group: "data",
    summary: "Capture from your phone, Siri, the Share Sheet or email.",
  },
  {
    // CAL-01 — connected calendars sit in "Your data" beside Capture, because
    // what they really configure is what DalyHub reads from outside itself.
    id: "calendars",
    label: "Calendars",
    group: "data",
    summary: "Read-only calendar links, and how fresh each one is.",
  },
  {
    id: "account-security",
    label: "Account & security",
    group: "data",
    summary: "Who you are signed in as, recent activity, and signing out.",
  },
  {
    id: "privacy-data",
    label: "Privacy & data",
    group: "data",
    summary: "Export everything, restore from a backup, and what is stored.",
  },
  {
    id: "offline",
    label: "Offline & app",
    group: "system",
    summary: "Installing DalyHub, and what works without a connection.",
  },
  {
    // BACKUP-02 — Backups sits in "This app" rather than in "Your data". What it
    // shows is the health of the INFRASTRUCTURE underneath the workspace, not a
    // choice about the owner's data: there is nothing to configure here and
    // nothing to consent to. "Your data" answers "what may DalyHub do with my
    // information?"; this answers "is the thing I am trusting actually working?"
    id: "backups",
    label: "Backups",
    group: "system",
    summary: "Whether your data is being backed up, and a backup on demand.",
  },
  {
    id: "about",
    label: "About",
    group: "system",
    summary: "Version, build and the licences behind this workspace.",
  },
];

const TIMEZONE_OPTIONS = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Pacific/Auckland",
  "Europe/London",
  "Europe/Dublin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
] as const;

const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  dmy_slash: "DD/MM/YYYY",
  d_mmm_yyyy: "D MMM YYYY",
  iso: "YYYY-MM-DD",
};

const FIRST_DAY_LABELS: Record<FirstDayOfWeek, string> = {
  monday: "Monday",
  sunday: "Sunday",
};

const LANDING_LABELS: Record<LandingDestination, string> = {
  today: "Today",
  tasks: "Tasks",
  diary: "Diary",
  projects: "Projects",
  notes: "Notes",
};

const TASK_VIEW_LABELS: Record<TaskDefaultView, string> = {
  focus: "List — this week",
  sectors: "Time Sectors",
  all: "List — all tasks",
};

const DIARY_MODE_LABELS: Record<DiaryDefaultMode, string> = {
  day: "Day",
  timeline: "Timeline",
};

function json(data: ActionResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function sectionFromUrl(request: Request): SectionId {
  const value = new URL(request.url).searchParams.get("section");
  return SECTIONS.some((section) => section.id === value)
    ? (value as SectionId)
    : "general";
}

/**
 * Whether the owner CHOSE a section, as opposed to landing on the default.
 *
 * The distinction only matters on a phone, where "the settings list" and "one
 * settings section" are two screens rather than two columns — but it is resolved
 * on the SERVER and rendered into the markup, so the phone composition is
 * correct on the first byte with no viewport sniffing and no hydration mismatch.
 * That is the same mechanism the shared collection layout uses for its own
 * phone/desktop control swap.
 */
function sectionWasChosen(request: Request): boolean {
  const value = new URL(request.url).searchParams.get("section");
  return value !== null && SECTIONS.some((section) => section.id === value);
}

export function meta() {
  return [
    { title: "Settings · DalyHub" },
    {
      name: "description",
      content: "App, workspace and account configuration.",
    },
  ];
}

/**
 * CAPTURE-01 — the Capture section's server data.
 *
 * Everything here is either public configuration (the endpoint URL, the
 * configured email addresses) or a credential's non-secret metadata. The stored
 * digest is never selected by the repository and the token never existed on the
 * server after creation, so there is nothing in this payload that could
 * authenticate anything.
 */
async function readCaptureSettings(
  scope: Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>,
  request: Request,
): Promise<CaptureSettingsData> {
  const now = new Date();
  const devices = await scope.captureTokens.list();
  // The capture email addresses are deploy-time configuration, deliberately not
  // declared as committed `vars` (like the Access values), so they are absent
  // from the generated `Env` type and read through the optional config shape.
  const emailConfig = resolveCaptureEmailConfig(
    env as unknown as CaptureEmailConfigEnv,
  );
  return {
    devices: devices.map((device) => toCaptureDeviceView(device, now)),
    endpoint: new URL(CAPTURE_PATH, new URL(request.url).origin).toString(),
    email: {
      enabled: captureEmailIsEnabled(emailConfig),
      recipients: emailConfig.recipients,
      allowedSenders: emailConfig.allowedSenders,
    },
  };
}

/**
 * CAL-01 — the connected calendars, read ONLY for the section that shows them.
 *
 * `toCalendarSourceView` is the leak boundary: it has no URL, host or
 * fingerprint field, so no feed address can cross into the loader payload even
 * by accident. The repository's ordinary read does not select the sealed column
 * either, so there are two independent reasons this cannot leak.
 */
async function readCalendarSettings(
  scope: Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>,
): Promise<CalendarSettingsData> {
  const now = new Date();
  const sources = await scope.calendarSources.list().catch(() => []);
  return {
    sources: sources.map((source) => toCalendarSourceView(source, now)),
    // Read through the optional config shape: the key is a `wrangler secret`,
    // never a committed `var`, so it is absent from the generated `Env` type.
    encryptionConfigured: calendarEncryptionConfigured(
      env as unknown as CalendarSecretsEnv,
    ),
    limit: MAX_CALENDAR_SOURCES,
  };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const section = sectionFromUrl(request);
  const preferences = await scope.appPreferences.get(session.user.subject);
  const navigation = getPrimaryNavigation();
  const resolvedNavigation = resolveNavigationPreferences(
    preferences.navigation,
    navigation.map((item) => ({ moduleId: item.moduleId, label: item.label })),
  );
  const availablePaths = new Set(navigation.map((item) => item.href));
  return {
    section,
    sectionChosen: sectionWasChosen(request),
    // SET-03 — assembled ONLY for the section that renders it. It costs three
    // bounded Activity reads, and every other Settings section would pay for
    // them without showing anything.
    accountSecurity:
      section === "account-security"
        ? await readAccountSecurity(scope, session)
        : null,
    // CAPTURE-01 — read ONLY for the section that renders it, like the Account &
    // security block above. No token, digest or fingerprint-bearing secret
    // crosses this boundary: `toCaptureDeviceView` cannot express one.
    capture:
      section === "capture" ? await readCaptureSettings(scope, request) : null,
    // CAL-01 — read ONLY for the section that renders it. No feed URL, host or
    // fingerprint crosses this boundary: `CalendarSourceView` cannot hold one.
    calendars:
      section === "calendars" ? await readCalendarSettings(scope) : null,
    // BACKUP-02 — read ONLY for the section that renders it, like the blocks
    // above. It costs one service-binding round trip to the private backup
    // Worker, and every other Settings section would pay for it while showing
    // nothing. No SQL, no signed URL and no credential can cross this boundary:
    // `BackupStatusView`/`BackupRunView` cannot express one.
    backups:
      section === "backups"
        ? await readBackupSettings(
            env as unknown as BackupServiceEnv,
            await scope.ownerTimeZone().catch(() => preferences.timezone),
          )
        : null,
    preferences: {
      timezone: preferences.timezone,
      dateFormat: preferences.dateFormat,
      firstDayOfWeek: preferences.firstDayOfWeek,
      defaultLandingDestination: preferences.defaultLandingDestination,
      defaultTasksView: preferences.defaultTasksView,
      defaultTaskDestination: preferences.defaultTaskDestination,
      defaultTaskCaptureParentId: preferences.defaultTaskCaptureParentId,
      defaultTaskCaptureParentKind: preferences.defaultTaskCaptureParentKind,
      defaultDiaryMode: preferences.defaultDiaryMode,
      appearance: preferences.appearance,
      colorScheme: preferences.colorScheme,
      version: preferences.version,
    },
    defaultTaskCaptureParent:
      preferences.defaultTaskDestination === "chosen_parent" &&
      preferences.defaultTaskCaptureParentId !== null
        ? await scope.tasks.getTaskParentCandidate(
            preferences.defaultTaskCaptureParentId,
          )
        : null,
    navigation: resolvedNavigation.items,
    landingOptions: LANDING_DESTINATIONS.filter((destination) =>
      availablePaths.has(`/${destination}`),
    ),
    // AI-01 — the owner's non-secret AI policy plus this period's usage. No key,
    // no gateway id and no provider URL crosses this boundary.
    ai: await readAiSettings(scope, session.user.subject),
    // RELEASE-01 — the allow-listed build facts, from the one version authority.
    build: buildInfo(env),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  try {
    if (intent === "update") {
      const field = String(form.get("field") ?? "");
      const value = String(form.get("value") ?? "");
      const patch = patchForField(field, value);
      await scope.appPreferences.update(session.user.subject, patch);
      return json({ ok: true });
    }
    if (intent === "update-task-capture-parent") {
      const parentId = parseTaskCaptureParentId(
        String(form.get("parentId") ?? ""),
      );
      if (parentId === null) {
        await scope.appPreferences.update(session.user.subject, {
          defaultTaskDestination: "inbox",
          defaultTaskCaptureParentId: null,
          defaultTaskCaptureParentKind: null,
        });
        return json({ ok: true });
      }
      const parent = await scope.tasks.getTaskParentCandidate(parentId);
      if (!parent) {
        return json(
          {
            ok: false,
            message: "Choose an active Area or non-archived Project.",
          },
          400,
        );
      }
      await scope.appPreferences.update(session.user.subject, {
        defaultTaskDestination: "chosen_parent",
        defaultTaskCaptureParentId: parent.id,
        defaultTaskCaptureParentKind: parent.kind,
      });
      return json({ ok: true });
    }
    if (intent === "toggle-navigation") {
      const moduleId = String(form.get("moduleId") ?? "");
      /*
       * The LAST `visible` entry wins, and that is the whole contract of the
       * hidden-default idiom this row uses.
       *
       * The row posts `visible=0` from a hidden input and `visible=1` from the
       * checkbox, so an unchecked box sends only "0" and a checked box sends
       * "0" then "1". `FormData.get` returns the FIRST entry, so it read "0"
       * every time: a module could be hidden from navigation and then never
       * restored from its own toggle — flipping it back posted a save, reported
       * "Saved", and left the module hidden. The only way back was the "Reset
       * navigation" button.
       *
       * A pre-existing defect, found by `e2e/interaction-consistency.spec.ts`
       * when it asserted that toggling a switch and reloading keeps the new
       * value. Fixed here rather than worked around in the test, because the
       * test is asserting the right thing.
       */
      const visibleEntries = form.getAll("visible");
      const visible = String(visibleEntries.at(-1) ?? "") === "1";
      if (isMandatoryNavigationModule(moduleId)) return json({ ok: true });
      /*
       * AUDIT-07 — the ONE preference write whose new value is DERIVED from the
       * old one, so it is the one that needs the version precondition.
       *
       * Every other setting is an independent field patch: the repository writes
       * only the column it names, so two devices changing two different settings
       * merge. The hidden-module SET does not merge that way — read it, add one
       * id, write the whole set, and a toggle made on another device between the
       * read and the write is simply gone. So this quotes the version it read;
       * the repository refuses to commit against any other, and we re-derive
       * from the newer set and try again. The owner's own toggle is never lost
       * and never overwrites someone else's, and neither device is asked to
       * resolve anything.
       */
      const navigation = getPrimaryNavigation();
      const items = navigation.map((item) => ({
        moduleId: item.moduleId,
        label: item.label,
      }));
      const applied = await withPreferenceRetry(async () => {
        const current = await scope.appPreferences.get(session.user.subject);
        const resolved = resolveNavigationPreferences(
          current.navigation,
          items,
        );
        const hidden = new Set(resolved.preferences.hiddenModuleIds);
        if (visible) hidden.delete(moduleId);
        else hidden.add(moduleId);
        await scope.appPreferences.update(
          session.user.subject,
          { navigation: { version: 1, hiddenModuleIds: [...hidden] } },
          { expectedVersion: current.version },
        );
      });
      if (!applied) {
        return json(
          {
            ok: false,
            message:
              "Navigation changed on another device. Reload and try again.",
          },
          409,
        );
      }
      return json({ ok: true });
    }
    if (intent === "ai-update") {
      const field = String(form.get("field") ?? "");
      const value = String(form.get("value") ?? "");
      const current = await scope.aiPreferences.get(session.user.subject);
      await scope.aiPreferences.update(
        session.user.subject,
        aiPatchForField(
          field,
          value,
          current.allowedFeatures,
          current.allowedCategories,
        ),
      );
      return json({ ok: true });
    }
    if (intent === "reset-navigation") {
      await scope.appPreferences.update(session.user.subject, {
        navigation: DEFAULT_APP_PREFERENCES.navigation,
      });
      return json({ ok: true });
    }
  } catch (cause) {
    if (cause instanceof AppPreferencesValidationError) {
      return json({ ok: false, message: cause.message }, 400);
    }
    // A concurrency conflict is an EXPECTED outcome, not an infrastructure
    // failure: it says the data moved, and the answer is to reload — never a 500.
    if (cause instanceof AppPreferencesConflictError) {
      return json(
        {
          ok: false,
          message: "That setting changed on another device. Reload to see it.",
        },
        409,
      );
    }
    return json(
      {
        ok: false,
        message: "That setting couldn’t be saved. Please try again.",
      },
      500,
    );
  }
  return json({ ok: false, message: "Unknown settings action." }, 400);
}

/** How many times a derived preference write re-derives before giving up. */
const PREFERENCE_RETRY_ATTEMPTS = 3;

/**
 * AUDIT-07 — run a read-derive-write preference update, re-deriving from the
 * newer stored value when the compare-and-set is refused.
 *
 * Bounded on purpose: a handful of attempts absorbs the realistic two-device
 * race, and anything beyond that is a signal to tell the owner rather than to
 * keep spinning. Only `AppPreferencesConflictError` is retried — a validation or
 * storage failure is re-thrown for the caller's own handling.
 */
async function withPreferenceRetry(
  apply: () => Promise<void>,
): Promise<boolean> {
  for (let attempt = 0; attempt < PREFERENCE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await apply();
      return true;
    } catch (cause) {
      if (!(cause instanceof AppPreferencesConflictError)) throw cause;
    }
  }
  return false;
}

/**
 * SET-03 — how many security events the Account & security surface shows.
 *
 * Bounded and small on purpose. This is a "did anything happen I did not do?"
 * glance, not an audit console; the full history is the workspace Activity feed,
 * which renders these same events from the same stream.
 */
const SECURITY_ACTIVITY_LIMIT = 8;

/** The owner-facing sentence for each recorded security event. */
function summariseSecurityEvent(
  type: string,
  payload: Record<string, unknown>,
): string {
  if (type === SECURITY_SIGNED_OUT) {
    const kept = Number(payload.queuedCapturesKept ?? 0);
    const cleared = payload.localSnapshotCleared === true;
    const base = cleared
      ? "Signed out of DalyHub and cleared this device's personal data"
      : "Signed out of DalyHub; this device's personal data could not be cleared";
    return kept > 0
      ? `${base}. ${kept} offline capture${kept === 1 ? "" : "s"} kept on the device.`
      : `${base}.`;
  }
  if (type === SECURITY_LOCAL_DATA_CLEARED) {
    const scope = payload.scope as LocalDataClearScope | undefined;
    const discarded = Number(payload.queuedCapturesDiscarded ?? 0);
    const what =
      scope === "everything"
        ? "Cleared everything DalyHub keeps on a device"
        : scope === "snapshot_and_caches"
          ? "Cleared a device's stored copy and cached files"
          : "Cleared a device's personal data";
    return discarded > 0
      ? `${what}, discarding ${discarded} offline capture${discarded === 1 ? "" : "s"} that had never reached DalyHub.`
      : `${what}.`;
  }
  // Unreachable for the declared vocabulary, and deliberately not a payload dump.
  return "A security-relevant action was recorded.";
}

/**
 * SET-03 — assemble the Account & security payload.
 *
 * Note what crosses this boundary and what does not. OUT: the verified email,
 * the provider display name, a trailing FRAGMENT of the identity subject, the
 * authenticator's mode, the credential's own `iat`/`exp`, and a bounded list of
 * events DalyHub itself recorded. NOT OUT, at any point: the Access JWT, any
 * cookie, the raw subject, the team domain, the AUD tag, the configured owner
 * email, the workspace id, or any AI or deployment credential.
 *
 * The security history is read with the ordinary workspace Activity repository —
 * one bounded query per declared type, merged and re-sorted here. There is no
 * second store and no security-specific table: these are ordinary events in the
 * one Activity stream, which is the whole point of resolving DEBT-33 this way
 * rather than building a parallel log.
 */
async function readAccountSecurity(
  scope: Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>,
  session: {
    readonly user: {
      readonly subject: string;
      readonly email: string;
      readonly displayName: string | null;
    };
    readonly issuedAt: Date;
    readonly expiresAt: Date;
  },
): Promise<AccountSecurityData> {
  const authMode = resolveAuthConfig(env).mode;

  const pages = await Promise.all(
    SECURITY_ACTIVITY_TYPES.map((type) =>
      scope.activity
        .listForWorkspace({ type, limit: SECURITY_ACTIVITY_LIMIT })
        // A history read must never be able to break the security page. An
        // empty list is the honest degradation: the surface says "no security
        // activity yet", which is also what a genuinely empty stream says, and
        // nothing on the page depends on telling those two apart.
        .catch(() => ({ items: [], nextCursor: null, hasMore: false })),
    ),
  );

  const securityActivity = pages
    .flatMap((page) => page.items)
    .sort((left, right) => {
      const byTime = right.occurredAt.getTime() - left.occurredAt.getTime();
      return byTime !== 0 ? byTime : right.id.localeCompare(left.id);
    })
    .slice(0, SECURITY_ACTIVITY_LIMIT)
    .map((item) => ({
      id: item.id,
      type: item.type as string,
      occurredAt: item.occurredAt.toISOString(),
      summary: summariseSecurityEvent(
        item.type as string,
        item.payload as Record<string, unknown>,
      ),
    }));

  /*
   * A Cloudflare Access token need not carry `iat`; the authenticator maps an
   * absent one to the epoch rather than inventing a time. That sentinel must not
   * reach the surface as a plausible 1970 timestamp, so it becomes `null` here
   * and the surface says "Not reported".
   */
  const issuedAtMs = session.issuedAt.getTime();

  return {
    identity: {
      email: session.user.email,
      displayName: session.user.displayName,
      subjectFragment: subjectFragment(session.user.subject),
      source: authMode === "development" ? "development" : "cloudflare-access",
    },
    session: {
      issuedAt: issuedAtMs > 0 ? session.issuedAt.toISOString() : null,
      expiresAt: Number.isFinite(session.expiresAt.getTime())
        ? session.expiresAt.toISOString()
        : null,
    },
    /*
     * FALSE, and it is a measured answer rather than a placeholder.
     *
     * Revoking every Access session for an owner needs a Cloudflare API call —
     * `POST /accounts/{account}/access/users/{user}/revoke`, or the equivalent
     * Zero Trust action — which needs an account id and an API token with Access
     * write scope. DalyHub is configured with the team domain, the application
     * AUD and the owner email (`auth-configuration.ts`), and nothing else: there
     * is no Cloudflare credential of any kind in the Worker's environment, no
     * binding for one, and no deploy step that supplies one. So the capability
     * is genuinely absent, and the surface says so instead of shipping a button
     * that would sign out one browser while implying it had signed out all of
     * them. Recorded as remaining SET-03 scope in ROADMAP_V2_1.md.
     */
    globalSignOutSupported: false,
    securityActivity,
    environment: buildInfo(env).environment,
  };
}

/**
 * AI-01 — assemble the AI settings payload.
 *
 * Note what it reads and what it returns: the owner's stored policy, this
 * period's usage totals, and BOOLEANS about configuration. No key, no gateway
 * identifier, no provider URL and no model provider-string leaves the server.
 */
async function readAiSettings(
  scope: Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>,
  ownerId: string,
) {
  const preferences = await scope.aiPreferences.get(ownerId);
  const configuration = resolveAiConfiguration(env).summary;
  const keys = budgetPeriodKeys(new Date());
  const totals = await scope.aiUsage.totals({
    day: keys.day,
    month: keys.month,
    featureId: "workspace-question-answer",
  });
  const snapshot = budgetSnapshot(preferences, totals, keys);
  const featureUsage = await scope.aiUsage.featureTotals(keys.month);

  const models = AI_PROVIDERS.flatMap((provider) =>
    AI_MODEL_TIERS.map((tier) => {
      const entry = resolveModel(provider, tier);
      return entry === null
        ? null
        : {
            tier,
            provider,
            label: entry.label,
            costUnavailable: costUnavailable(entry),
          };
    }).filter((entry): entry is NonNullable<typeof entry> => entry !== null),
  );

  return {
    enabled: preferences.enabled,
    defaultProvider: preferences.defaultProvider,
    configuredProviders: configuration.configuredProviders,
    gatewayConfigured: configuration.gatewayConfigured,
    routingMode: configuration.mode,
    inconsistency: configuration.inconsistency,
    allowedFeatures: preferences.allowedFeatures,
    monthlyBudgetUsd: preferences.monthlyBudgetUsd,
    dailyBudgetUsd: preferences.dailyBudgetUsd,
    premiumBudgetUsd: preferences.premiumBudgetUsd,
    premiumAllowed: preferences.premiumAllowed,
    monthSpentUsd: snapshot.monthSpentUsd,
    daySpentUsd: snapshot.daySpentUsd,
    premiumSpentUsd: snapshot.premiumSpentUsd,
    allowedCategories: preferences.allowedCategories,
    loggingMode: preferences.loggingMode,
    resultRetention: preferences.resultRetention,
    providerFallbackAllowed: preferences.providerFallbackAllowed,
    featureUsage,
    models,
  };
}

/**
 * Translate one AI settings control into a validated patch. Every value goes
 * through the kernel's own parsers, so a hand-crafted POST cannot widen a budget
 * past its ceiling, enable an unknown feature or allow an unknown category.
 */
function aiPatchForField(
  field: string,
  value: string,
  features: readonly AiFeatureId[],
  categories: readonly PrivacyCategory[],
) {
  switch (field) {
    case "enabled":
      return { enabled: parseAiBoolean(value, "enabled") };
    case "defaultProvider":
      return { defaultProvider: parseAiProvider(value) };
    case "premiumAllowed":
      return { premiumAllowed: parseAiBoolean(value, "premiumAllowed") };
    case "providerFallbackAllowed":
      return {
        providerFallbackAllowed: parseAiBoolean(
          value,
          "providerFallbackAllowed",
        ),
      };
    case "monthlyBudgetUsd":
      return {
        monthlyBudgetUsd: parseBudgetUsd(
          value,
          "monthlyBudgetUsd",
          MAX_MONTHLY_BUDGET_USD,
        ),
      };
    case "dailyBudgetUsd":
      return {
        dailyBudgetUsd: parseBudgetUsd(
          value,
          "dailyBudgetUsd",
          MAX_DAILY_BUDGET_USD,
        ),
      };
    case "premiumBudgetUsd":
      return {
        premiumBudgetUsd: parseBudgetUsd(
          value,
          "premiumBudgetUsd",
          MAX_PREMIUM_BUDGET_USD,
        ),
      };
    case "loggingMode":
      return { loggingMode: parseAiLoggingMode(value) };
    case "resultRetention":
      return { resultRetention: parseAiResultRetention(value) };
    case "feature": {
      const [id, on] = value.split(":");
      if (!isAiFeatureId(id)) return {};
      const next = new Set(features);
      if (on === "1") next.add(id);
      else next.delete(id);
      return { allowedFeatures: [...next] };
    }
    case "category": {
      const [id, on] = value.split(":");
      if (!isPrivacyCategory(id)) return {};
      const next = new Set(categories);
      if (on === "1") next.add(id);
      else next.delete(id);
      return { allowedCategories: [...next] };
    }
    default:
      return {};
  }
}

function patchForField(field: string, value: string): AppPreferencePatch {
  switch (field) {
    case "timezone":
      return { timezone: parseTimezone(value) };
    case "dateFormat":
      return { dateFormat: parseDateFormat(value) };
    case "firstDayOfWeek":
      return { firstDayOfWeek: parseFirstDayOfWeek(value) };
    case "defaultLandingDestination":
      return { defaultLandingDestination: parseLandingDestination(value) };
    case "defaultTasksView":
      return { defaultTasksView: parseTaskDefaultView(value) };
    case "defaultDiaryMode":
      return { defaultDiaryMode: parseDiaryDefaultMode(value) };
    default:
      throw new AppPreferencesValidationError(
        "navigation",
        "Unknown preference.",
      );
  }
}

export default function SettingsRoute({ loaderData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const active = loaderData.section;
  const sectionChosen = loaderData.sectionChosen;
  /*
   * Every section names itself in the URL, INCLUDING General.
   *
   * It used to drop the param for General, on the reasoning that a default needs
   * no parameter — true while the parameter only chose a column. It now also
   * distinguishes "the settings list" from "one section" on a phone, so an
   * absent parameter has to mean the list and nothing else. General is a
   * destination like the other seven and says so.
   */
  const sectionHref = (section: SectionId) => {
    const next = new URLSearchParams(searchParams);
    next.set("section", section);
    return `?${next.toString()}`;
  };

  const activeSection = SECTIONS.find((section) => section.id === active);

  /*
   * UIX-05 — one DOM, two compositions.
   *
   * DESKTOP is a grouped section rail beside the chosen section, which is what
   * Settings has always been and what it should be: eight destinations and one
   * pane, with the rail persistent so moving between two settings is one click.
   *
   * PHONE is two screens, because a horizontally-scrolling rail of eight labels
   * above every section was the module's worst surface — "an action the user has
   * to swipe to find is not a quick action" is DalyHub's own rule, written in
   * `people.css`, and it applies here exactly. Without a chosen section the phone
   * shows the LIST, with each section's own summary line under it; with one, it
   * shows that section and a way back. That is the native pattern on every
   * platform, and it is the reason each section now carries a description.
   *
   * `data-chosen` is resolved on the SERVER from the presence of `?section=`, so
   * the phone lands on the right screen on the first byte — no viewport sniffing,
   * no hydration mismatch, and Back genuinely returns to the list because each
   * section is a real URL.
   */
  return (
    <div
      className="dh-settings-page"
      data-chosen={sectionChosen ? "true" : "false"}
    >
      <header className="dh-settings-page__header">
        <h1 className="dh-settings-page__title">Settings</h1>
        <p className="dh-settings-page__description">
          Application preferences for this owner and workspace.
        </p>
      </header>

      {/* A list of links between sections is navigation, not complementary
       * content. It was an <aside>; RELEASE-01 added a top-level /about route,
       * which made an unscoped "About" link ambiguous and surfaced the wrong
       * landmark role at the same time. */}
      <nav className="dh-settings-page__nav" aria-label="Settings sections">
        {SECTION_GROUPS.map((group) => (
          <div key={group.id} className="dh-settings-page__nav-group">
            {/*
             * The group label is a real heading for the list beneath it, and the
             * list is named BY it — so a screen reader hears "Your data, list, 3
             * items" rather than eight links in one undifferentiated run.
             */}
            <h2
              className="dh-settings-page__nav-group-label"
              id={`dh-settings-group-${group.id}`}
            >
              {group.label}
            </h2>
            <ul
              className="dh-settings-page__nav-list"
              aria-labelledby={`dh-settings-group-${group.id}`}
            >
              {SECTIONS.filter((section) => section.group === group.id).map(
                (section) => (
                  <li
                    key={section.id}
                    /* FINAL-UI — the ROW is the state-layer host, because the
                     * row is what the link's `::after` makes clickable. */
                    className="dh-settings-page__nav-item md-state-layer"
                  >
                    <Link
                      to={sectionHref(section.id)}
                      className={
                        active === section.id
                          ? "dh-settings-page__nav-link dh-settings-page__nav-link--active"
                          : "dh-settings-page__nav-link"
                      }
                      aria-current={active === section.id ? "page" : undefined}
                      aria-describedby={`dh-settings-summary-${section.id}`}
                      preventScrollReset
                    >
                      {section.label}
                    </Link>
                    {/*
                     * The summary is a SIBLING of the link, described by it
                     * rather than inside it.
                     *
                     * Inside, it would join the link's accessible NAME, so a
                     * screen reader would announce "Account & security Who you
                     * are signed in as, recent activity, and signing out, link"
                     * — a name that is a paragraph, on a rail where the summary
                     * is not even visible. As a description it is announced
                     * AFTER the name, which is what supporting text is for, and
                     * the whole row is still one target because the link's
                     * ::after covers the item (the same whole-row-link pattern
                     * every row family in the product uses).
                     */}
                    <span
                      className="dh-settings-page__nav-summary"
                      id={`dh-settings-summary-${section.id}`}
                    >
                      {section.summary}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </nav>

      <div className="dh-settings-page__content">
        {/* Phone only — the way back to the list. It is a real link to the
         * section-less URL, so it is also what Back does. */}
        <p className="dh-settings-page__back">
          <Link to="?" preventScrollReset className="dh-btn dh-btn--ghost">
            <span aria-hidden="true">←</span> All settings
            {activeSection ? (
              <span className="dh-visually-hidden">
                {` — leaving ${activeSection.label}`}
              </span>
            ) : null}
          </Link>
        </p>
        {active === "general" ? <GeneralSection data={loaderData} /> : null}
        {active === "date-time" ? <DateTimeSection data={loaderData} /> : null}
        {active === "navigation" ? (
          <NavigationSection data={loaderData} />
        ) : null}
        {active === "ai" ? <AiSettingsSection data={loaderData.ai} /> : null}
        {active === "calendars" && loaderData.calendars ? (
          <CalendarSourcesSection data={loaderData.calendars} />
        ) : null}
        {active === "capture" && loaderData.capture ? (
          <CaptureSection data={loaderData.capture} />
        ) : null}
        {active === "account-security" && loaderData.accountSecurity ? (
          <AccountSecuritySection data={loaderData.accountSecurity} />
        ) : null}
        {active === "privacy-data" ? <PrivacyDataSection /> : null}
        {active === "offline" ? <OfflineSection /> : null}
        {active === "backups" && loaderData.backups ? (
          <BackupsSection data={loaderData.backups} />
        ) : null}
        {active === "about" ? <AboutSection data={loaderData} /> : null}
      </div>
    </div>
  );
}

function GeneralSection({
  data,
}: {
  readonly data: Route.ComponentProps["loaderData"];
}) {
  return (
    <SettingsLayout
      title="General"
      description="Defaults that shape where DalyHub opens and how daily work starts."
    >
      {/* APPEARANCE-01 — the SAME control the account menu renders, reading the
          same stored preference, so the two surfaces always agree. It leads the
          General section because it is the one setting here that changes what the
          owner is looking at while they look at it. */}
      <SettingsGroup
        title="Appearance"
        description="Light or dark. Every colour scheme has both, so this and the scheme below are independent choices."
      >
        <SettingsRow
          align="start"
          control={
            <AppearanceSelector
              value={data.preferences.appearance}
              variant="settings"
              hideLegend
            />
          }
        />
      </SettingsGroup>
      {/* THEME-01 — the colour-scheme picker, its own group directly under
       * Appearance. Two groups rather than one, because they are two settings
       * that are read together and stored, posted and applied separately; and
       * because "Colour scheme" needs to be a heading the owner can find, not a
       * label buried inside a group called something else. */}
      <SettingsGroup
        title="Colour scheme"
        description="Colour only — layout, type, spacing and shape are the same in every scheme. Changing it applies straight away."
      >
        <SettingsRow
          align="start"
          control={
            <ColorSchemeSelector
              value={data.preferences.colorScheme}
              hideLegend
            />
          }
        />
      </SettingsGroup>
      <SettingsGroup title="Startup">
        <SelectSetting
          field="defaultLandingDestination"
          label="Default landing page"
          description="Used only when opening the root address. Direct links keep going where they point."
          value={data.preferences.defaultLandingDestination}
          options={data.landingOptions.map((value) => ({
            value,
            label: LANDING_LABELS[value],
          }))}
        />
      </SettingsGroup>
      <SettingsGroup title="Module defaults">
        <SelectSetting
          field="defaultTasksView"
          label="Default Tasks view"
          description="Used when opening /tasks without an explicit view in the URL."
          value={data.preferences.defaultTasksView}
          options={TASK_DEFAULT_VIEWS.map((value) => ({
            value,
            label: TASK_VIEW_LABELS[value],
          }))}
        />
        <TaskCaptureParentSetting
          current={data.defaultTaskCaptureParent}
          storedId={data.preferences.defaultTaskCaptureParentId}
        />
        <SelectSetting
          field="defaultDiaryMode"
          label="Default Diary mode"
          description="Used when opening /diary without an explicit mode in the URL."
          value={data.preferences.defaultDiaryMode}
          options={DIARY_DEFAULT_MODES.map((value) => ({
            value,
            label: DIARY_MODE_LABELS[value],
          }))}
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}

function DateTimeSection({
  data,
}: {
  readonly data: Route.ComponentProps["loaderData"];
}) {
  const today = formatPreferenceDate("2026-07-27", data.preferences.dateFormat);
  const timezoneOptions = useMemo(() => {
    const set = new Set<string>(TIMEZONE_OPTIONS);
    set.add(data.preferences.timezone);
    return [...set].sort();
  }, [data.preferences.timezone]);
  return (
    <SettingsLayout
      title="Date & time"
      description="Timezone affects date grouping, Today, due-date interpretation and owner-calendar calculations. Stored date-only values remain YYYY-MM-DD dates; they are not converted into UTC instants."
    >
      <SettingsGroup title="Calendar">
        <SelectSetting
          field="timezone"
          label="Owner timezone"
          description="Choose a valid IANA timezone."
          value={data.preferences.timezone}
          options={timezoneOptions.map((value) => ({ value, label: value }))}
        />
        <SelectSetting
          field="dateFormat"
          label="Date display"
          description={`Example: ${today}`}
          value={data.preferences.dateFormat}
          options={DATE_FORMATS.map((value) => ({
            value,
            label: DATE_FORMAT_LABELS[value],
          }))}
        />
        <SelectSetting
          field="firstDayOfWeek"
          label="First day of week"
          description={`Week views start on ${FIRST_DAY_LABELS[data.preferences.firstDayOfWeek]}.`}
          value={data.preferences.firstDayOfWeek}
          options={FIRST_DAY_OF_WEEK_OPTIONS.map((value) => ({
            value,
            label: FIRST_DAY_LABELS[value],
          }))}
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}

function NavigationSection({
  data,
}: {
  readonly data: Route.ComponentProps["loaderData"];
}) {
  const resetFetcher = useFetcher<ActionResult>();
  return (
    <SettingsLayout
      title="Navigation"
      description="Choose which optional module rows appear in desktop and mobile navigation. Hidden modules remain available through direct URLs and search."
    >
      <SettingsGroup title="Sidebar modules">
        {data.navigation.map((item) => (
          <NavigationToggle key={item.moduleId} item={item} />
        ))}
      </SettingsGroup>
      <SettingsGroup title="Defaults">
        <SettingsRow
          label="Reset navigation"
          description="Restores every current module row. Future modules appear by default."
          status={statusFor(resetFetcher)}
          statusTone={statusToneFor(resetFetcher)}
          statusLive
          control={
            <resetFetcher.Form method="post">
              <input type="hidden" name="intent" value="reset-navigation" />
              <button type="submit" className="dh-settings-danger-button">
                Reset navigation
              </button>
            </resetFetcher.Form>
          }
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}

function PrivacyDataSection() {
  return (
    <SettingsLayout
      title="Privacy & data"
      description="DalyHub keeps personal data scoped to the authenticated owner and workspace."
    >
      <SettingsGroup title="Current handling">
        <SettingsRow
          label="Workspace isolation"
          description="Server-side workspace scope is resolved from trusted configuration, not from request input."
          control={<span className="dh-settings-page__text-value">Active</span>}
        />
      </SettingsGroup>
      {/*
        X-04 — real export, replacing the row that used to say "Deferred". Both
        downloads are built from the SAME canonical workspace snapshot, so they
        can never describe different data.
      */}
      <SettingsGroup
        title="Back up your data"
        description="Your data is yours. Both downloads are generated on demand from one workspace snapshot and are never stored by DalyHub. The full DalyHub export IS the backup format — it is what Restore below reads."
      >
        <ExportDownloads />
      </SettingsGroup>
      {/*
        SET-02 — restore, in its own group with a `danger` tone because the
        populated-workspace path replaces data. The group tone is how DalyHub
        already separates consequential settings; the restore surface adds no new
        pattern of its own.
      */}
      <SettingsGroup
        title="Restore"
        tone="danger"
        description="Bring a DalyHub backup back in. Choosing a file only checks it — nothing in this workspace changes until you confirm, and replacing a workspace that already holds records requires a verified safety backup first."
      >
        <RestoreFromBackup />
      </SettingsGroup>
      <SettingsGroup title="Not available yet">
        <SettingsRow
          label="Deferred data tools"
          description="Import from other products, file attachments, AI-provider credentials, integrations, notifications, reminders, workspace deletion, roles and billing are not built yet."
          control={
            <span className="dh-settings-page__text-value">Deferred</span>
          }
          align="start"
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}

/**
 * PWA-06 — the offline & installed-app section. Everything it shows is read from
 * the shell's one offline context on the CLIENT: none of it is loader data,
 * because none of it is a server fact — the service worker, the stored snapshot
 * and the capture queue all live on this device.
 */
function OfflineSection() {
  return (
    <SettingsLayout
      title="Offline & app"
      description="What DalyHub keeps on this device so it still opens and stays useful without a connection — and how to remove it."
    >
      <OfflineSettingsPanel />
      {/* PWA-12 — renders nothing when this device holds no unsynchronised Task
          changes, which is the steady state. */}
      <OfflineChangesPanel headingLevel={2} />
    </SettingsLayout>
  );
}

function AboutSection({
  data,
}: {
  readonly data: Route.ComponentProps["loaderData"];
}) {
  return (
    <SettingsLayout
      title="About"
      description="Stable application information. The full About screen has the version, environment and build details."
    >
      <SettingsGroup title="Application">
        <SettingsRow
          label="Name"
          description="The personal operating system for one life."
          control={
            <span className="dh-settings-page__text-value">
              {data.build.name}
            </span>
          }
        />
        <SettingsRow
          label="Version"
          // RELEASE-01 — read from the ONE version authority, the same one the
          // About screen and the health endpoint use. This row used to say "No
          // deployment version is exposed to the application yet", which stopped
          // being true when that authority landed.
          description={`Release ${data.build.releaseName}.`}
          control={
            <span className="dh-settings-page__text-value">
              {data.build.version}
            </span>
          }
        />
        <SettingsRow
          label="Preferences schema"
          description="The current owner/workspace preference record version."
          control={
            <span className="dh-settings-page__text-value">
              {data.preferences.version === 0
                ? "Defaults"
                : `v${data.preferences.version}`}
            </span>
          }
        />
        <SettingsRow
          label="Full details"
          description="Environment, build identifier, ownership and what that means for support."
          control={
            <Link className="dh-about__link" to="/about">
              Open About
            </Link>
          }
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}

function SelectSetting({
  field,
  label,
  description,
  value,
  options,
}: {
  readonly field: string;
  readonly label: string;
  readonly description: string;
  readonly value: string;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}) {
  const fetcher = useFetcher<ActionResult>();
  const formRef = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState(value);

  /*
   * M3-INT — one selection control, product-wide (audit finding 6).
   *
   * These rows were native `<select>` elements sitting directly above the
   * shared `SelectField` combobox in the same panel: two select presentations,
   * adjacent, in one Settings group. `DESIGN_SYSTEM.md` → Forms says one
   * control per field type, so the application-style rows converge on the
   * shared control and the native element is kept for the cases that have a
   * genuine reason (see the Forms section of the design system).
   *
   * The row still saves IMMEDIATELY, which is what it always did. `SelectField`
   * is a controlled combobox rather than a form control, so the chosen value is
   * carried by a hidden input and the form is submitted on the frame after the
   * state lands — the same mechanism the task-destination row's "Use Inbox"
   * control already used.
   */
  return (
    <SettingsRow
      label={label}
      description={description}
      status={statusFor(fetcher)}
      statusTone={statusToneFor(fetcher)}
      statusLive
      control={(ids) => (
        <fetcher.Form
          ref={formRef}
          method="post"
          className="dh-settings-page__inline-form"
        >
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="field" value={field} />
          <input type="hidden" name="value" value={selected} />
          <SelectField
            id={ids.controlId}
            label={label}
            labelledBy={ids.labelId}
            describedBy={ids.describedById}
            showOptionalCue={false}
            value={selected}
            options={options}
            disabled={fetcher.state !== "idle"}
            onChange={(next) => {
              setSelected(next);
              window.requestAnimationFrame(() => {
                formRef.current?.requestSubmit();
              });
            }}
          />
        </fetcher.Form>
      )}
    />
  );
}

function TaskCaptureParentSetting({
  current,
  storedId,
}: {
  readonly current: {
    readonly id: string;
    readonly kind: "area" | "project";
    readonly title: string;
  } | null;
  readonly storedId: string | null;
}) {
  const fetcher = useFetcher<ActionResult>();
  const parentSearch = useTaskParentSearch();
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(current?.id ?? "");
  const currentOption = current
    ? [
        {
          value: current.id,
          label: current.title,
          description: current.kind === "project" ? "Project" : "Area",
        },
      ]
    : [];
  const options = [
    ...currentOption,
    ...parentSearch
      .withSelected(value)
      .filter((option) => option.value !== current?.id),
  ];
  const unavailable =
    storedId !== null && value.length > 0 && current === null
      ? "The saved parent is no longer available; choose another or clear it."
      : null;
  return (
    <SettingsRow
      label="Default task destination"
      description="Inbox is the fast default. Choose a Project or Area only when you want ordinary capture filed there."
      status={statusFor(fetcher) ?? unavailable}
      statusTone={
        fetcher.data?.ok === false || unavailable
          ? "danger"
          : statusToneFor(fetcher)
      }
      statusLive
      align="start"
      /*
       * SETTINGS-LABEL — the row owns the NAME, the field owns the control.
       *
       * This row used to render "Default task destination" twice: once as the
       * row's label on the left, and again as the combobox's own field label
       * above the input on the right (finding 7 of the August 2026 interaction
       * audit). One setting, one control, one label: the field is now told which
       * visible element names it, so the accessible name is still real, visible
       * text and there is still exactly one of it. The row's description and
       * status line become the control's description, which they always were in
       * meaning and never were in markup.
       */
      control={(ids) => (
        <fetcher.Form
          ref={formRef}
          method="post"
          className="dh-settings-page__stacked-form"
        >
          <input
            type="hidden"
            name="intent"
            value="update-task-capture-parent"
          />
          <input type="hidden" name="parentId" value={value} />
          <SelectField
            id={ids.controlId}
            label="Default task destination"
            labelledBy={ids.labelId}
            describedBy={ids.describedById}
            showOptionalCue={false}
            value={value}
            onChange={setValue}
            options={options}
            onSearch={parentSearch.search}
            loading={parentSearch.loading}
            placeholder="Inbox, or search Projects and Areas"
            emptyMessage="No matching Projects or Areas"
            disabled={fetcher.state !== "idle"}
          />
          <div className="dh-settings-page__inline-actions">
            <button
              type="submit"
              className="dh-btn dh-btn--secondary"
              disabled={fetcher.state !== "idle"}
            >
              Save destination
            </button>
            <button
              type="button"
              className="dh-btn dh-btn--ghost"
              disabled={fetcher.state !== "idle" || value.length === 0}
              onClick={() => {
                setValue("");
                window.requestAnimationFrame(() => {
                  formRef.current?.requestSubmit();
                });
              }}
            >
              Use Inbox
            </button>
          </div>
        </fetcher.Form>
      )}
    />
  );
}

function NavigationToggle({
  item,
}: {
  readonly item: Route.ComponentProps["loaderData"]["navigation"][number];
}) {
  const fetcher = useFetcher<ActionResult>();
  return (
    <SettingsRow
      label={item.label}
      description={
        item.mandatory
          ? "Required so the app always has a safe home and settings path."
          : "Show this module in desktop and mobile navigation."
      }
      status={statusFor(fetcher)}
      statusTone={statusToneFor(fetcher)}
      statusLive
      /*
       * M3-INT — an immediate preference is a SWITCH (audit finding 8).
       *
       * Showing a module in navigation takes effect the moment it is toggled:
       * there is no Save, and nothing is being selected from a set. That is M3's
       * definition of a switch, and this row was a checkbox wearing a
       * hand-rolled switch skin (`.dh-settings-switch`, drawn in
       * `settings.css`). It now uses the ONE shared `Switch`, which is still a
       * real `<input type="checkbox">` underneath — the row keeps posting the
       * same `visible` field to the same action.
       */
      control={(ids) => (
        <fetcher.Form method="post" className="dh-settings-page__inline-form">
          <input type="hidden" name="intent" value="toggle-navigation" />
          <input type="hidden" name="moduleId" value={item.moduleId} />
          <input type="hidden" name="visible" value="0" />
          <Switch
            id={ids.controlId}
            name="visible"
            value="1"
            labelledBy={ids.labelId}
            describedBy={ids.describedById}
            defaultChecked={!item.hidden}
            disabled={item.mandatory || fetcher.state !== "idle"}
            onChange={(_checked, event) =>
              event.currentTarget.form?.requestSubmit()
            }
          />
        </fetcher.Form>
      )}
    />
  );
}

function statusFor(fetcher: ReturnType<typeof useFetcher<ActionResult>>) {
  if (fetcher.state !== "idle") return "Saving…";
  if (fetcher.data?.ok === true) return "Saved";
  if (fetcher.data?.ok === false) return fetcher.data.message;
  return null;
}

function statusToneFor(
  fetcher: ReturnType<typeof useFetcher<ActionResult>>,
): "neutral" | "success" | "danger" {
  if (fetcher.data?.ok === true) return "success";
  if (fetcher.data?.ok === false) return "danger";
  return "neutral";
}
