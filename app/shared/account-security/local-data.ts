/**
 * SET-03 — what DalyHub keeps on a device, classified, and how to remove it.
 *
 * The August end-to-end audit found that personal data survives a sign-out on
 * the device (DEBT-68): a synced snapshot and queued captures stay in IndexedDB
 * until the owner clears them by hand. Fixing that needs a distinction the code
 * did not previously make, and this module is that distinction.
 *
 * ── Three classes of local data, and they are not interchangeable ────────────
 *
 *   1. PUBLIC APPLICATION ASSETS — DalyHub's own JavaScript, CSS, fonts, icons
 *      and the offline shell document, in Cache Storage. None of it is personal;
 *      all of it is re-downloadable; the offline shell in particular is
 *      STRUCTURALLY incapable of carrying workspace data (see
 *      `app/routes/offline.tsx`). Removing it costs a download and nothing else.
 *
 *   2. OWNER-SPECIFIC PERSONAL DATA — the seven-day snapshot (tasks, note and
 *      diary excerpts, meeting titles, attendee names), recent search terms, and
 *      the offline diagnostics ring. Every byte of it exists on the server too,
 *      so removing it loses NOTHING. This is the class that should not survive a
 *      sign-out, and after SET-03 it does not.
 *
 *   3. UNSYNCHRONISED OWNER-CREATED WORK — captures made offline that have never
 *      reached DalyHub. There is no copy anywhere else. Deleting it destroys the
 *      only instance, so it is never removed as a side effect of anything: not by
 *      signing out, not by clearing personal data. It goes only when the owner
 *      asks for exactly that, having been told what it means, and having typed a
 *      word to confirm.
 *
 * The rule that follows: SIGN-OUT clears classes 1 and 2 and preserves class 3.
 * When there is no class-3 work on the device, sign-out removes the offline
 * database entirely, so a device with nothing pending is left with nothing at
 * all — which is the outcome DEBT-68 asked for, reached without the destruction
 * it did not ask for.
 *
 * Client-only: it touches IndexedDB, Cache Storage and Web Storage.
 */

import { OFFLINE_DIAGNOSTICS_STORAGE_KEY } from "~/shared/offline/diagnostics";
import { RECENT_SEARCH_STORAGE_KEY } from "~/shared/search/recent";

/**
 * The Web Storage keys holding OWNER-SPECIFIC data (class 2 above).
 *
 * Deliberately an explicit list rather than a `dh*` prefix sweep. A prefix sweep
 * would silently take future keys with it — including, one day, a key holding
 * something unsynchronised — and "we clear everything that looks like ours" is
 * exactly the treat-all-storage-alike behaviour this module exists to avoid.
 *
 * What is NOT here, and why: the Inspector's docked width (`dh-inspector-width`)
 * and the last capture type are UI ergonomics with no personal content — a pane
 * width and the word "task" say nothing about the owner — so removing them would
 * be a cost with no privacy benefit.
 */
export const PERSONAL_LOCAL_STORAGE_KEYS: readonly string[] = [
  RECENT_SEARCH_STORAGE_KEY,
];

/** The session-storage keys holding owner-specific data. */
export const PERSONAL_SESSION_STORAGE_KEYS: readonly string[] = [
  OFFLINE_DIAGNOSTICS_STORAGE_KEY,
];

/**
 * Remove the owner-specific Web Storage entries. Never throws: a browser that
 * refuses storage (private mode, a blocked profile) must not be able to fail a
 * sign-out. Anything it could not remove was, by definition, not readable
 * either.
 */
export function clearPersonalWebStorage(): void {
  const remove = (store: Storage | undefined, keys: readonly string[]) => {
    if (!store) return;
    for (const key of keys) {
      try {
        store.removeItem(key);
      } catch {
        /* Unwritable storage; nothing to remove and nothing to report. */
      }
    }
  };
  if (typeof window === "undefined") return;
  try {
    remove(window.localStorage, PERSONAL_LOCAL_STORAGE_KEYS);
  } catch {
    /* Accessing `localStorage` itself can throw when storage is blocked. */
  }
  try {
    remove(window.sessionStorage, PERSONAL_SESSION_STORAGE_KEYS);
  } catch {
    /* As above. */
  }
}
