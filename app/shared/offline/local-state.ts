/**
 * PWA-11 — the offline surface's local-storage state, as a closed set of
 * OUTCOMES rather than an open-ended wait.
 *
 * ── Why this replaced a boolean ──────────────────────────────────────────────
 * The offline page used to render from `initialised: boolean`. False meant
 * "Checking what this device has stored…", and nothing in the system guaranteed
 * it would ever become true: it was set after an IndexedDB read that, on iOS, can
 * fire no event at all. An installed app that launched offline could therefore
 * sit on that sentence indefinitely, which is not a loading state — it is a hang
 * wearing a loading state's clothes.
 *
 * So the read now resolves into ONE of five outcomes, every one of them a thing
 * the owner can act on, and the read itself is bounded by a deadline
 * (`offline-database.ts`) so one of them always arrives:
 *
 *   checking      the read is in flight, and is guaranteed to end
 *   loaded        a local snapshot is on this device
 *   empty         no local snapshot exists yet — the honest empty state
 *   unavailable   this browser will not store offline data at all
 *   unreadable    storage exists but this device's copy could not be read
 *
 * Capture availability is derived from the same values rather than tracked
 * separately, so the two can never disagree about whether this device is usable.
 */

import type { OfflineDatabaseFailure } from "./offline-database";
import type { OfflineMetaRecord } from "./offline-store";

/** What this device's own storage turned out to hold. Always resolves. */
export type OfflineLocalState =
  | { readonly kind: "checking" }
  | {
      readonly kind: "loaded";
      readonly namespace: string;
      readonly lastSyncedAt: string;
    }
  | { readonly kind: "empty" }
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "unreadable"; readonly reason: string };

/** Whether a new offline capture can be filed on this device, and if not, why. */
export type OfflineCaptureAvailability =
  | { readonly kind: "checking" }
  | { readonly kind: "available" }
  | { readonly kind: "unavailable"; readonly reason: string };

/** The initial state, before this device's storage has been looked at. */
export const OFFLINE_LOCAL_CHECKING: OfflineLocalState = { kind: "checking" };

/**
 * Turn a storage failure into a local state.
 *
 * The split is between "this browser does not do offline storage" — which the
 * owner cannot fix by trying again — and "storage is there, and this particular
 * read did not work", which they often can.
 */
export function localStateFromFailure(
  failure: OfflineDatabaseFailure,
): OfflineLocalState {
  switch (failure.kind) {
    case "unavailable":
    case "blocked":
      return { kind: "unavailable", reason: failure.message };
    case "newerSchema":
    case "migrationFailed":
    case "timedOut":
      return { kind: "unreadable", reason: failure.message };
  }
}

/** Turn a successful metadata read into a local state. */
export function localStateFromMeta(
  meta: OfflineMetaRecord | null,
): OfflineLocalState {
  if (!meta) return { kind: "empty" };
  return {
    kind: "loaded",
    namespace: meta.namespace,
    lastSyncedAt: meta.lastSyncedAt,
  };
}

/** True once the read has produced an outcome — anything but `checking`. */
export function isLocalStateResolved(state: OfflineLocalState): boolean {
  return state.kind !== "checking";
}

/** The heading and body the offline snapshot surface renders for a state. */
export function localStateCopy(state: OfflineLocalState): {
  readonly title: string;
  readonly description: string;
} {
  switch (state.kind) {
    case "checking":
      return {
        title: "Reading the copy stored on this device",
        description: "This takes a moment, and it always finishes.",
      };
    case "loaded":
      return {
        title: "Local snapshot loaded",
        description: "The copy stored on this device is shown below.",
      };
    case "empty":
      return {
        title: "No local snapshot exists yet",
        description:
          "DalyHub stores a seven-day snapshot after you have opened it online while signed in. Once you have, this page works without a connection.",
      };
    case "unavailable":
      return {
        title: "Local storage is unavailable",
        description: state.reason,
      };
    case "unreadable":
      return {
        title: "Local data could not be read",
        description: state.reason,
      };
  }
}

/**
 * Whether offline capture is available on this device, and the exact reason when
 * it is not.
 *
 * A capture needs a namespace, and a namespace comes from a snapshot the server
 * produced — so "you have never been online here" is a real reason, not a
 * technicality: a capture with no namespace could be replayed into the wrong
 * workspace when someone signs in later.
 */
export function captureAvailability(input: {
  readonly local: OfflineLocalState;
  readonly namespace: string | null;
}): OfflineCaptureAvailability {
  switch (input.local.kind) {
    case "checking":
      return { kind: "checking" };
    case "unavailable":
    case "unreadable":
      return { kind: "unavailable", reason: input.local.reason };
    case "empty":
      return {
        kind: "unavailable",
        reason:
          "Offline capture becomes available after DalyHub has loaded online at least once on this device, so a capture is always filed under the right sign-in and workspace.",
      };
    case "loaded":
      return input.namespace
        ? { kind: "available" }
        : {
            kind: "unavailable",
            reason:
              "This device has a stored snapshot but no sign-in to file a capture under. Open DalyHub online once to restore it.",
          };
  }
}
