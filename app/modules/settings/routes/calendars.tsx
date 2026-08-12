/**
 * CAL-01 — the calendar-source endpoints
 * (`POST /settings/calendars/:action`, where `action` is `add`, `rename`,
 * `toggle`, `refresh` or `remove`).
 *
 * A resource route: it renders no UI, and it has no `GET` on purpose. Every
 * action here either accepts a credential or acts on one, and nothing about
 * either should be reachable by following a link or replayable from history.
 *
 * ── The feed URL never comes back ───────────────────────────────────────────
 * `add` is the only place a feed URL is ever accepted, and it leaves this
 * function sealed. No response below contains it, no response contains its
 * fingerprint, and the repository's ordinary reads do not select the column — so
 * there is no code path from storage to the browser, not merely no code that
 * currently takes one. The URL is likewise absent from every error message: a
 * failure message is exactly where a leaked credential ends up in a screenshot.
 *
 * ── Validation happens BEFORE anything is stored ────────────────────────────
 * `add` normalises and policy-checks the URL, then FETCHES and PARSES it, and
 * only persists a source once the feed has genuinely produced a calendar. A
 * source that is stored first and validated later is a source the owner has to
 * discover is broken.
 */

import { env } from "cloudflare:workers";

import {
  CALENDAR_SYNC_ERROR_MESSAGES,
  CalendarSourceDuplicateError,
  CalendarSourceLimitError,
  CalendarSourceNotFoundError,
  CalendarValidationError,
  FEED_URL_MESSAGES,
  FeedUrlError,
  calendarSyncWindow,
  describeSyncState,
  normaliseFeedUrl,
  parseCalendarSourceId,
  parseCalendarSourceName,
  providerHintForUrl,
  type CalendarSource,
} from "~/kernel/calendar";
import { EncryptionKeyUnavailableError } from "~/kernel/secrets";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import {
  calendarEncryptionConfigured,
  refreshCalendarSources,
  sealFeedUrl,
  validateFeed,
  type CalendarSecretsEnv,
} from "~/platform/calendar";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

import type { Route } from "./+types/calendars";

const ACTIONS = new Set(["add", "rename", "toggle", "refresh", "remove"]);

/**
 * The encryption key is deploy-time configuration supplied through `wrangler
 * secret`, deliberately NOT declared as a committed `var` (a committed var of
 * the same name would override the secret and clobber it), so it is absent from
 * the generated `Env` type. It is read through the optional config shape, the
 * same way the Access values and the capture email addresses are.
 */
const secretsEnv = env as unknown as CalendarSecretsEnv;

/**
 * A source as the Settings surface sees it.
 *
 * Note what is not here: no URL, no fingerprint, no host, no ciphertext. This
 * type IS the leak boundary — if a field cannot be added to it, it cannot reach
 * the browser.
 */
export type CalendarSourceView = {
  readonly id: string;
  readonly name: string;
  /** "Outlook calendar" — a presentational guess, never authoritative. */
  readonly providerLabel: string;
  readonly enabled: boolean;
  /** The one truthful sentence about freshness. */
  readonly syncText: string;
  readonly syncTone: "neutral" | "danger";
  /** True when what is on screen came from an earlier, successful refresh. */
  readonly stale: boolean;
  readonly eventCount: number;
};

export type CalendarActionResult =
  | { readonly ok: true; readonly message?: string }
  | { readonly ok: false; readonly message: string; readonly field?: string };

/** Project a stored source into the view Settings renders. Never adds a URL. */
export function toCalendarSourceView(
  source: CalendarSource,
  now: Date,
): CalendarSourceView {
  const summary = describeSyncState(source, now);
  return {
    id: source.id,
    name: source.name,
    providerLabel: PROVIDER_LABELS[source.providerHint],
    enabled: source.enabled,
    syncText: summary.text,
    syncTone: summary.tone,
    stale: summary.stale,
    eventCount: source.eventCount,
  };
}

const PROVIDER_LABELS: Readonly<
  Record<CalendarSource["providerHint"], string>
> = {
  outlook: "Outlook calendar",
  apple: "Apple calendar",
  google: "Google calendar",
  fastmail: "Fastmail calendar",
  generic: "Calendar feed",
};

function json(data: CalendarActionResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const step = String(params.action ?? "");
  if (!ACTIONS.has(step)) {
    throw new Response("Not Found", { status: 404 });
  }

  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const form = await request.formData();
  const now = new Date();

  try {
    if (step === "add") {
      if (!calendarEncryptionConfigured(secretsEnv)) {
        // Refused BEFORE the URL is read from the form, so an unconfigured
        // deployment never holds a feed address in memory at all.
        return json(
          { ok: false, message: CALENDAR_SYNC_ERROR_MESSAGES.not_configured },
          503,
        );
      }
      const name = parseCalendarSourceName(form.get("name"));
      const feedUrl = normaliseFeedUrl(String(form.get("url") ?? ""));

      const timezone = await scope
        .ownerTimeZone()
        .catch(() => DEFAULT_OWNER_TIME_ZONE);
      const window = calendarSyncWindow({
        todayIso: ownerCalendarIso(now, timezone),
        timeZone: timezone,
      });

      // Fetch and parse BEFORE storing. A source is only ever persisted once the
      // address has genuinely produced a calendar.
      const validation = await validateFeed({ feedUrl, window });
      if (!validation.ok) {
        return json(
          { ok: false, message: validation.message, field: "url" },
          400,
        );
      }

      const { sealed, fingerprint } = await sealFeedUrl(
        secretsEnv,
        scope.context.workspaceId,
        feedUrl,
      );
      const source = await scope.calendarSources.create({
        name,
        providerHint: providerHintForUrl(feedUrl),
        sealedFeedUrl: sealed,
        feedFingerprint: fingerprint,
      });

      // The first refresh runs immediately, so the schedule is populated by the
      // time the owner reaches Today rather than up to fifteen minutes later.
      await refreshCalendarSources(
        {
          sources: scope.calendarSources,
          events: scope.calendarEvents,
          env: secretsEnv,
          workspaceId: scope.context.workspaceId,
          todayIso: ownerCalendarIso(now, timezone),
          timeZone: timezone,
          now,
        },
        { sourceId: source.id },
      );
      return json({ ok: true });
    }

    const id = parseCalendarSourceId(form.get("id"));

    if (step === "rename") {
      await scope.calendarSources.update(id, {
        name: parseCalendarSourceName(form.get("name")),
      });
      return json({ ok: true });
    }

    if (step === "toggle") {
      await scope.calendarSources.update(id, {
        enabled: String(form.get("enabled") ?? "") === "true",
      });
      return json({ ok: true });
    }

    if (step === "remove") {
      // Removes the source, its projected events and its Meeting LINKS. No
      // Meeting is touched: a Meeting is a DalyHub record and removing a
      // calendar is not authority to delete one (CAL-01 §24).
      await scope.calendarSources.remove(id);
      return json({ ok: true });
    }

    // `refresh` — "Refresh now".
    const timezone = await scope
      .ownerTimeZone()
      .catch(() => DEFAULT_OWNER_TIME_ZONE);
    const results = await refreshCalendarSources(
      {
        sources: scope.calendarSources,
        events: scope.calendarEvents,
        env: secretsEnv,
        workspaceId: scope.context.workspaceId,
        todayIso: ownerCalendarIso(now, timezone),
        timeZone: timezone,
        now,
      },
      { sourceId: id },
    );
    const result = results[0];
    if (result === undefined) {
      // A disabled source is not refreshed, and saying "refreshed" would be
      // false. The owner is told what actually happened.
      return json({
        ok: true,
        message: "This calendar is paused, so it was not refreshed.",
      });
    }
    if (result.skipped) {
      return json({ ok: true, message: "A refresh is already running." });
    }
    return result.ok
      ? json({ ok: true })
      : json(
          { ok: false, message: result.message ?? "That did not work." },
          502,
        );
  } catch (cause) {
    if (cause instanceof FeedUrlError) {
      return json(
        { ok: false, message: FEED_URL_MESSAGES[cause.reason], field: "url" },
        400,
      );
    }
    if (cause instanceof CalendarValidationError) {
      return json(
        { ok: false, message: cause.message, field: cause.field },
        400,
      );
    }
    if (cause instanceof CalendarSourceDuplicateError) {
      return json({ ok: false, message: cause.message, field: "url" }, 409);
    }
    if (cause instanceof CalendarSourceLimitError) {
      return json({ ok: false, message: cause.message }, 409);
    }
    if (cause instanceof CalendarSourceNotFoundError) {
      return json({ ok: false, message: cause.message }, 404);
    }
    if (cause instanceof EncryptionKeyUnavailableError) {
      return json(
        { ok: false, message: CALENDAR_SYNC_ERROR_MESSAGES.not_configured },
        503,
      );
    }
    // One sentence, no internals — the same restraint the Capture and Account
    // endpoints exercise. There is nothing actionable in the detail for the
    // owner and plenty in it for anyone else.
    return json(
      { ok: false, message: "That couldn’t be saved. Please try again." },
      500,
    );
  }
}
