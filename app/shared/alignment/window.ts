/**
 * DEBT-23 — the EXACT owner-calendar active/neglected boundary instant for the
 * Alignment ranking, kept React-free so both the loader and the kernel tests can
 * import it.
 *
 * `evaluateGoalAlignment` decides `active` vs `neglected` by mapping the most-recent
 * contributing activity to the OWNER's calendar date and comparing it against the
 * recent window (ADR-040 §40.4). The repository ranks the same split in SQL against
 * a single instant bound, so that bound MUST be the exact UTC instant of owner-zone
 * midnight on the window's first recent day — NOT the approximate UTC-midnight
 * `recentWindowStartIso` (which stays the supporting-count bound, where a few hours
 * of slack is immaterial). Using the exact boundary here makes the SQL rank agree
 * with the evaluator for every instant, including one at, say, 09:00 owner-time on
 * the first recent day (before UTC midnight) — which the approximate bound would
 * mis-rank as neglected while the evaluator renders it active.
 *
 * AUDIT-14 — "the owner's zone" is the OWNER's stored timezone, passed in by the
 * caller, not a module constant. The boundary instant and the evaluator's
 * calendar day must be computed in the SAME zone or the disagreement this
 * function exists to remove comes straight back for a non-Sydney owner.
 */

import {
  addDaysToIsoDate,
  RECENT_ACTION_WINDOW_DAYS,
} from "~/kernel/alignment";

/** The offset (owner-zone wall clock − UTC), in ms, at a given instant. */
function ownerZoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const f: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      f[p.type] = Number(p.value);
    }
  }
  const localAsUtc = Date.UTC(
    f.year!,
    f.month! - 1,
    f.day!,
    f.hour!,
    f.minute!,
    f.second!,
  );
  return localAsUtc - instantMs;
}

/** The UTC instant (ISO string) of 00:00 on `dateIso` in the owner's timezone. */
export function ownerZonedMidnightUtcIso(
  dateIso: string,
  timeZone: string,
): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const wallMidnightAsUtc = Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  // First approximation, then one refinement so a DST boundary resolves correctly
  // (owner-zone DST transitions are never at midnight, so a single refine suffices).
  let utc = wallMidnightAsUtc - ownerZoneOffsetMs(wallMidnightAsUtc, timeZone);
  utc = wallMidnightAsUtc - ownerZoneOffsetMs(utc, timeZone);
  return new Date(utc).toISOString();
}

/**
 * The exact owner-calendar instant separating `active` from `neglected`: owner-zone
 * midnight on `todayIso − (RECENT_ACTION_WINDOW_DAYS − 1)`. A contributing activity
 * at/after this instant ranks the Goal `active`, matching the evaluator's owner-
 * calendar-day comparison exactly.
 */
export function recentBoundaryStartIso(
  todayIso: string,
  timeZone: string,
): string {
  return ownerZonedMidnightUtcIso(
    addDaysToIsoDate(todayIso, -(RECENT_ACTION_WINDOW_DAYS - 1)),
    timeZone,
  );
}
