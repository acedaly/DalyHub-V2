/**
 * CAL-01 — the scheduled calendar refresh.
 *
 * The Worker's `scheduled` handler, given its own module so `workers/app.ts`
 * stays a three-line composition rather than becoming a place logic
 * accumulates.
 *
 * ── Why a cron trigger and not something cleverer ───────────────────────────
 * DalyHub already deploys as one Cloudflare Worker with one D1 binding.
 * Cloudflare Cron Triggers run that same Worker on a schedule with the same
 * bindings and no new infrastructure — no Durable Object, no Queue, no second
 * service, nothing to provision and nothing to keep in step. Every alternative
 * would have added a component to a personal deployment in order to do the same
 * thing.
 *
 * ── Every fifteen minutes, and not a promise of realtime ────────────────────
 * The cadence is a bound on cost and on politeness to the publisher, and the
 * product says so in plain words: "this is not live". Anything faster would be
 * polling someone else's server harder for a schedule that changes a few times
 * a day; anything with a push channel would need provider OAuth, which CAL-01
 * explicitly does not do (§45).
 *
 * ── It fails quietly and independently ──────────────────────────────────────
 * The handler resolves the configured workspace, refreshes each enabled source
 * in turn, and prunes. One source failing costs that source alone; the whole
 * handler failing costs one tick, and the next one is fifteen minutes away. It
 * never throws into the runtime, because a `scheduled` handler that throws is
 * only ever a log line nobody reads.
 *
 * Nothing here logs a URL, a response body, or an event title.
 */

import { calendarEncryptionConfigured } from "./calendar-secrets.server";
import type { CalendarSecretsEnv } from "./calendar-secrets.server";
import { refreshCalendarSources } from "./calendar-sync.server";

/**
 * What the scheduled handler needs. Deliberately structural rather than the
 * generated `Env`: the encryption key is a `wrangler secret` and is absent from
 * that type, and the handler is exercised by the Workers-pool tests with a
 * hand-built environment.
 */
export type ScheduledCalendarEnv = CalendarSecretsEnv & {
  readonly DB: D1Database;
  readonly DEFAULT_WORKSPACE_ID?: string;
};

/** The result, returned rather than logged, so tests can assert on it. */
export interface ScheduledRefreshSummary {
  readonly ran: boolean;
  readonly sources: number;
  readonly failed: number;
  /** Why the tick did nothing, when it did nothing. Never an exception. */
  readonly skippedReason?: "not_configured" | "no_workspace";
}

export async function runScheduledCalendarRefresh(
  env: ScheduledCalendarEnv,
): Promise<ScheduledRefreshSummary> {
  // Without a key, no stored feed URL can be opened. Refusing here means the
  // tick is a no-op rather than a run of guaranteed failures that would mark
  // every source red.
  if (!calendarEncryptionConfigured(env)) {
    return {
      ran: false,
      sources: 0,
      failed: 0,
      skippedReason: "not_configured",
    };
  }

  try {
    // Imported here rather than at module scope: the composition boundary pulls
    // in every repository in the product, and the scheduled path needs two of
    // them. A dynamic import keeps the cron entry point cheap.
    const { resolveWorkspaceScope } = await import("~/platform/workspaces");
    const scope = await resolveWorkspaceScope(env);
    const timeZone = await scope.ownerTimeZone();
    const todayIso = await scope.ownerTodayIso();

    const results = await refreshCalendarSources({
      sources: scope.calendarSources,
      events: scope.calendarEvents,
      env,
      workspaceId: scope.context.workspaceId,
      todayIso,
      timeZone,
    });
    return {
      ran: true,
      sources: results.length,
      failed: results.filter((result) => !result.ok).length,
    };
  } catch {
    // A workspace that cannot be resolved (an unprovisioned deployment, a
    // database blip) costs this tick and nothing else.
    return { ran: false, sources: 0, failed: 0, skippedReason: "no_workspace" };
  }
}
