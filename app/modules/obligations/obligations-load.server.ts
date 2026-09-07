/**
 * V2.10 LIFE-02 — the Life Admin collection's ONE loader body.
 *
 * `/obligations` with any combination of its URL state is the same read, so it
 * has one function rather than one per entry point. A scope, preference or list
 * failure degrades to a calm error state so the shell stays usable — never a
 * 500, exactly as every other collection route behaves.
 *
 * ── The default lens is OPEN WORK ───────────────────────────────────────────
 * The question this surface answers is "what do I need to deal with?", and a
 * list that opens on every obligation the owner has ever completed answers a
 * different one. Status is a FILTER, not a band (D10): on hold, dismissed and
 * completed are one control away, and choosing them changes the bands too — the
 * Done band exists only when the owner has asked to see finished work, rather
 * than sitting empty at the bottom of every page.
 *
 * ── The query budget ────────────────────────────────────────────────────────
 * Three bounded statements whatever the workspace holds: the owner's calendar
 * day, then `readObligationPage`'s two. Flat at one obligation and at ten
 * thousand; `test/unit/obligations/obligation-query-bounds.test.ts` asserts it.
 */

import type { AuthenticatedSession } from "~/kernel/auth";
import {
  OBLIGATION_CATEGORIES,
  OBLIGATION_STATUSES,
  type ObligationBandCounts,
} from "~/kernel/obligations";
import {
  OBLIGATION_STATUS_FILTERS,
  type ObligationStatusFilter,
  type ObligationsCollectionData,
} from "./obligations-view";
import {
  readObligationPage,
  type ObligationPageResult,
} from "~/platform/obligations/obligation-facts.server";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { WorkspaceScopeEnv } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

const EMPTY_COUNTS: ObligationBandCounts = {
  overdue: 0,
  this_week: 0,
  this_month: 0,
  later: 0,
  done: 0,
};

function parseStatus(value: string | null): ObligationStatusFilter {
  const found = OBLIGATION_STATUS_FILTERS.find(
    (option) => option.value === value,
  );
  return found ? found.value : "open";
}

function parseCategory(value: string | null): string {
  return value && (OBLIGATION_CATEGORIES as readonly string[]).includes(value)
    ? value
    : "";
}

/** The statuses the repository should read, from the owner's chosen lens. */
function statusesFor(status: ObligationStatusFilter): readonly string[] {
  return status === "any" ? [...OBLIGATION_STATUSES] : [status];
}

export async function loadObligationsCollection(input: {
  readonly env: WorkspaceScopeEnv;
  readonly session: AuthenticatedSession;
  readonly request: Request;
}): Promise<ObligationsCollectionData> {
  const url = new URL(input.request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const category = parseCategory(url.searchParams.get("category"));
  const status = parseStatus(url.searchParams.get("status"));
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const base = {
    query,
    category,
    status,
  };

  // A calm fallback day, so a preferences failure still renders a usable page
  // rather than one that cannot say what "overdue" means.
  let todayIso = ownerCalendarIso(new Date(), DEFAULT_OWNER_TIME_ZONE);
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(
      input.env,
      input.session,
      {
        // PERF-01 — this loader reads the owner's preferences immediately, so
        // the read is started before the workspace check rather than after it.
        warmOwnerPreferences: true,
      },
    );
    todayIso = await scope.ownerTodayIso();
    const page: ObligationPageResult = await readObligationPage({
      scope,
      today: todayIso,
      query,
      filters: {
        categories: category ? [category] : [],
        statuses: statusesFor(status),
      },
      cursor,
    });
    return {
      ...base,
      obligations: page.items,
      nextCursor: page.nextCursor,
      counts: page.counts,
      todayIso,
      failed: false,
    };
  } catch {
    return {
      ...base,
      obligations: [],
      nextCursor: null,
      counts: EMPTY_COUNTS,
      todayIso,
      failed: true,
    };
  }
}
