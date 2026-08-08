/**
 * SET-03 — telling the server that a device's local DalyHub data was cleared.
 *
 * Clearing happens in the browser, because IndexedDB and Cache Storage are the
 * device's, not the server's. The HISTORY of it has to be a server fact, or the
 * Account & security page would be showing an audit trail that lives in the very
 * storage it is reporting on.
 *
 * Best-effort by contract. The clear has ALREADY happened by the time this runs;
 * a failed history write must not turn a completed, irreversible device action
 * into an error the owner is asked to retry. It resolves either way and tells the
 * caller nothing, because there is nothing the caller could usefully do.
 */

import { type LocalDataClearScope } from "~/kernel/account-security";

/** The endpoint that records a local-data clear in the owner's own history. */
export const LOCAL_DATA_CLEARED_RECORD_PATH =
  "/settings/account-security/local-data-cleared";

/**
 * Record that local data was cleared on this device. Never throws.
 *
 * The POST goes through the ordinary same-origin mutation boundary
 * (AUDIT-FIX-04), like every other DalyHub mutation — there is no route-specific
 * token and no bypass.
 */
export async function recordLocalDataCleared(input: {
  readonly scope: LocalDataClearScope;
  readonly queuedCapturesDiscarded: number;
}): Promise<void> {
  try {
    const body = new FormData();
    body.set("scope", input.scope);
    body.set("queuedCapturesDiscarded", String(input.queuedCapturesDiscarded));
    await fetch(LOCAL_DATA_CLEARED_RECORD_PATH, {
      method: "POST",
      body,
      credentials: "same-origin",
    });
  } catch {
    /* See the header: the device action already happened. */
  }
}
