/**
 * CAL-01 — the synchroniser: one source, one refresh, one truthful outcome.
 *
 * This is the ONLY place external network work happens on behalf of the Calendar
 * feature. It is reached from exactly three callers, none of which is a page
 * load:
 *
 *   - the Worker's `scheduled` handler (every 15 minutes),
 *   - "Refresh now" in Settings,
 *   - validating a source at the moment it is added.
 *
 * `GET /today` fetches nothing. Today reads the local projection, so the day
 * renders at the same speed whether Outlook is up, down or slow — which is the
 * whole reason the projection exists (CAL-01 §33).
 *
 * ── The properties this file is written to hold ─────────────────────────────
 *   - **Idempotent.** Two refreshes of an unchanged feed produce no writes
 *     beyond `last_seen_at`. Identity is `(uid, recurrence-id)`, never the
 *     title or the time — see `~/kernel/calendar/sync-plan`.
 *   - **Isolated.** One source failing never affects another. Sources are
 *     refreshed in sequence with independent outcomes, and a failure is recorded
 *     against that source alone.
 *   - **Non-destructive on failure.** A failed refresh records the failure and
 *     leaves the previous projection in place, so the owner keeps a real (if
 *     older) day and the UI states its age rather than pretending.
 *   - **Silent in Activity.** Nothing here appends an Activity event.
 *     Synchronisation is infrastructure, not something the owner did, and a
 *     stream carrying "imported 43 events" four times an hour would drown the
 *     things that are (CAL-01 §7, ADR-012).
 *   - **Bounded.** Response size, redirect count, component count, occurrences
 *     per series and per source are all capped in the layers below.
 */

import {
  CALENDAR_SYNC_ERROR_MESSAGES,
  calendarSyncWindow,
  planHasChanges,
  planSync,
  type CalendarSource,
  type CalendarSourceRepository,
  type CalendarSyncErrorCode,
  type ExternalCalendarEventRepository,
  type ScheduleWindow,
} from "~/kernel/calendar";
import { EncryptionKeyUnavailableError } from "~/kernel/secrets";

import {
  openFeedUrl,
  type CalendarSecretsEnv,
} from "./calendar-secrets.server";
import {
  FeedFetchError,
  fetchFeedBody,
  type FeedFetcher,
} from "./feed-fetch.server";
import { IcsParseError, parseIcsOccurrences } from "./ics-parser.server";

/**
 * How long a refresh claim is honoured before another may take it.
 *
 * Long enough that a slow feed is not refreshed twice concurrently, short enough
 * that a Worker killed mid-refresh does not lock the source out for an hour.
 * Two minutes comfortably exceeds one fetch (10s) plus one parse plus one write.
 */
const REFRESH_CLAIM_STALE_MS = 2 * 60 * 1000;

/** The result of refreshing one source. Never carries feed content. */
export interface SourceRefreshResult {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly ok: boolean;
  readonly errorCode: CalendarSyncErrorCode | null;
  /** The owner-facing sentence, from the closed message table. */
  readonly message: string | null;
  /** Occurrences in the window after this refresh. Zero on failure. */
  readonly eventCount: number;
  /** True when the source was already being refreshed and this call did nothing. */
  readonly skipped: boolean;
}

export interface CalendarSyncDependencies {
  readonly sources: CalendarSourceRepository;
  readonly events: ExternalCalendarEventRepository;
  readonly env: CalendarSecretsEnv;
  readonly workspaceId: string;
  /** The owner's calendar date and timezone — the window's anchor (AUDIT-14). */
  readonly todayIso: string;
  readonly timeZone: string;
  readonly now?: Date;
  /** Test seam. Production passes nothing and the runtime `fetch` is used. */
  readonly fetcher?: FeedFetcher;
}

/** Map any thrown value onto the closed error vocabulary. Never rethrows detail. */
function errorCodeFor(cause: unknown): CalendarSyncErrorCode {
  if (cause instanceof FeedFetchError) return cause.code;
  if (cause instanceof IcsParseError) return cause.failure;
  if (cause instanceof EncryptionKeyUnavailableError) return "not_configured";
  return "storage";
}

/**
 * Refresh ONE source.
 *
 * Returns a result rather than throwing, because the caller's job is to record
 * the outcome and carry on to the next source — an exception escaping here would
 * make one bad feed cost every other one.
 */
export async function refreshCalendarSource(
  dependencies: CalendarSyncDependencies,
  source: CalendarSource,
  sealedFeedUrl: string,
  window: ScheduleWindow,
): Promise<SourceRefreshResult> {
  const now = dependencies.now ?? new Date();
  const base = { sourceId: source.id, sourceName: source.name };

  /*
   * Claim the refresh before doing anything expensive.
   *
   * A conditional UPDATE, so the DATABASE decides the winner. This is what makes
   * a double-tap on "Refresh now" — and a manual refresh racing the cron — do
   * the work once rather than twice, without a lock or a queue.
   */
  const claimed = await dependencies.sources
    .claimRefresh(source.id, now, REFRESH_CLAIM_STALE_MS)
    .catch(() => false);
  if (!claimed) {
    return {
      ...base,
      ok: true,
      errorCode: null,
      message: null,
      eventCount: source.eventCount,
      skipped: true,
    };
  }

  try {
    const feedUrl = await openFeedUrl(
      dependencies.env,
      dependencies.workspaceId,
      sealedFeedUrl,
    );
    const body = await fetchFeedBody(feedUrl, {
      fetcher: dependencies.fetcher,
    });
    const parsed = parseIcsOccurrences({
      body,
      from: window.fromInstant,
      to: window.toInstant,
    });
    /*
     * A TRUNCATED parse is refused, and is refused BEFORE reconciliation.
     *
     * This used to compare `occurrences.length` against the bound, which is dead
     * code: the parser stops AT the bound, so the length can never exceed it.
     * The guard therefore accepted the partial result — and a partial result is
     * the one input reconciliation must never see, because every occurrence
     * missing only because of truncation looks exactly like an occurrence the
     * feed has removed, and would be DELETED. An oversized or pathological feed
     * could quietly replace a complete projection with a fragment of one.
     *
     * Refusing keeps the last complete projection in place and reports
     * `too_many_events`, which is the same non-destructive failure shape every
     * other error here has.
     */
    if (parsed.truncated) {
      throw new IcsParseError("too_many_events");
    }

    const stored = await dependencies.events.listForSync(source.id, window);
    const plan = planSync({ parsed: parsed.occurrences, stored });
    // A no-change refresh still records `last_seen_at`, because that is what
    // makes the retention pruner able to tell a vanished event from an unread
    // one — but it issues no create/update/delete at all.
    if (planHasChanges(plan) || plan.touched.length > 0) {
      await dependencies.events.applySync({
        sourceId: source.id,
        seenAt: now,
        created: plan.created,
        updated: plan.updated,
        touched: plan.touched,
        vanished: plan.vanished,
      });
    }

    const eventCount = parsed.occurrences.length;
    await dependencies.sources.recordSyncOutcome(source.id, {
      attemptedAt: now,
      status: "ok",
      errorCode: null,
      eventCount,
    });
    return {
      ...base,
      ok: true,
      errorCode: null,
      message: null,
      eventCount,
      skipped: false,
    };
  } catch (cause) {
    const errorCode = errorCodeFor(cause);
    // Recorded, never logged: the only thing that survives this catch is a code
    // from a closed set. The feed's body, its headers and its URL do not.
    await dependencies.sources
      .recordSyncOutcome(source.id, {
        attemptedAt: now,
        status: "failed",
        errorCode,
      })
      .catch(() => undefined);
    return {
      ...base,
      ok: false,
      errorCode,
      message: CALENDAR_SYNC_ERROR_MESSAGES[errorCode],
      // The previous projection is deliberately still in place, and the previous
      // count is still the truth about what is on screen.
      eventCount: source.eventCount,
      skipped: false,
    };
  }
}

/**
 * Refresh every enabled source in the workspace, or one named source.
 *
 * Sequential rather than concurrent, deliberately: a personal deployment has a
 * handful of calendars, a cron tick has no deadline pressure, and issuing them
 * one at a time keeps the isolate's memory and subrequest use flat and
 * predictable. The isolation property that matters is not parallelism — it is
 * that one failure cannot affect another source, which is true either way.
 */
export async function refreshCalendarSources(
  dependencies: CalendarSyncDependencies,
  options: { readonly sourceId?: string } = {},
): Promise<readonly SourceRefreshResult[]> {
  const window = calendarSyncWindow({
    todayIso: dependencies.todayIso,
    timeZone: dependencies.timeZone,
  });
  const targets = await dependencies.sources.listForRefresh({
    sourceId: options.sourceId,
  });
  const results: SourceRefreshResult[] = [];
  for (const target of targets) {
    results.push(
      await refreshCalendarSource(
        dependencies,
        target.source,
        target.sealedFeedUrl,
        window,
      ),
    );
  }
  // Pruning is a whole-workspace operation and runs once, after every source has
  // had its chance — so an event that moved from one source's window into
  // another's is not pruned and immediately re-imported.
  await dependencies.events.pruneOutsideWindow(window).catch(() => 0);
  return results;
}

/**
 * Validate a feed the owner is ADDING: fetch it, confirm it parses, count it.
 *
 * Done before the source is persisted, so a mistyped or non-calendar address is
 * refused at the moment the owner can still see what they pasted — rather than
 * being stored as a source that silently never works. The URL is passed in
 * plaintext because it has not been sealed yet; it is never returned.
 */
export async function validateFeed(input: {
  readonly feedUrl: string;
  readonly window: ScheduleWindow;
  readonly fetcher?: FeedFetcher;
}): Promise<
  | { readonly ok: true; readonly eventCount: number }
  | {
      readonly ok: false;
      readonly errorCode: CalendarSyncErrorCode;
      readonly message: string;
    }
> {
  try {
    const body = await fetchFeedBody(input.feedUrl, {
      fetcher: input.fetcher,
    });
    const parsed = parseIcsOccurrences({
      body,
      from: input.window.fromInstant,
      to: input.window.toInstant,
    });
    return { ok: true, eventCount: parsed.occurrences.length };
  } catch (cause) {
    const errorCode = errorCodeFor(cause);
    return {
      ok: false,
      errorCode,
      message: CALENDAR_SYNC_ERROR_MESSAGES[errorCode],
    };
  }
}
