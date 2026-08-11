/**
 * PWA-12 — the mutation queue GATEWAY: the one place a Task edit becomes queued
 * intent.
 *
 * ── Why this is not a React hook ─────────────────────────────────────────────
 * Task mutations are submitted from `task-inline-edit.ts`, which is a plain
 * module: DS-16's inline fields want a promise-returning `onSave`, so every
 * inline Task edit in the product — the row, the Drawer, the quick-edit panel —
 * already goes through three ordinary functions rather than through a fetcher.
 * That seam is where offline handling belongs, because it is the only place that
 * sees EVERY supported edit and the only place that sees a request FAIL.
 *
 * A hook could not sit there. So this module owns the queue directly (the store
 * is plain async functions over IndexedDB, with no React in it either) and
 * publishes changes; `OfflineProvider` subscribes and renders them. The provider
 * remains the single REPLAY authority — nothing here sends anything.
 *
 * ── The active namespace is the isolation boundary ───────────────────────────
 * Nothing can be queued until the provider has resolved a namespace from a
 * SERVER-produced snapshot, and every record is stamped with it. A device with no
 * prior successful authenticated session therefore has nowhere to put an offline
 * edit, and a queued edit can never be replayed by a different identity or
 * workspace — replay refuses a record whose namespace does not match the session
 * signed in at replay time. That is the same rule PWA-05 established for capture,
 * enforced by the data model rather than by a flag.
 */

import {
  checkMutationBounds,
  coalesceInto,
  createMutationRecord,
  findCoalesceTarget,
  nextSequence,
  summariseMutations,
  type OfflineEnqueueRefusal,
  type OfflineMutationOperation,
  type OfflineMutationRecord,
  type OfflineMutationValue,
} from "~/kernel/offline";

import { recordOfflineDiagnostic } from "./diagnostics";
import {
  putMutationRecord,
  readMutations,
  type OfflineStoreResult,
} from "./offline-store";

/* -------------------------------------------------------------------------- */
/* The active namespace                                                       */
/* -------------------------------------------------------------------------- */

let activeNamespace: string | null = null;

/**
 * Publish the identity + workspace the running session belongs to.
 *
 * Called by `OfflineProvider` whenever it resolves or changes a namespace, and
 * with `null` when a device has none. It is deliberately a single module-level
 * value: two namespaces active at once would mean two identities signed in at
 * once, which the shell does not permit.
 */
export function setActiveOfflineNamespace(namespace: string | null): void {
  activeNamespace = namespace;
}

/** The namespace queued mutations are being filed under, if any. */
export function getActiveOfflineNamespace(): string | null {
  return activeNamespace;
}

/* -------------------------------------------------------------------------- */
/* Change notification                                                        */
/* -------------------------------------------------------------------------- */

type QueueListener = () => void;

const listeners = new Set<QueueListener>();

/** Subscribe to queue changes. Returns an unsubscribe function. */
export function subscribeMutationQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tell every subscriber the queue changed. Exported for the replay engine. */
export function notifyMutationQueueChanged(): void {
  for (const listener of [...listeners]) listener();
}

/**
 * The event a surface listens for when replay has actually changed server state.
 *
 * A DOM event rather than a router revalidation call, for one reason: the
 * provider is the replay authority, but it does not own any route's data. Only
 * the surface knows what needs re-reading — and only the SERVER knows what a
 * replayed completion did to a recurring series. This is the signal that says
 * "the truth moved; go and read it", and it is what closes the loop between an
 * offline completion and the one authoritative successor appearing (§10).
 */
export const OFFLINE_REPLAY_APPLIED_EVENT = "dalyhub:offline-replay-applied";

/** Announce that replay applied at least one change. No-op outside a browser. */
export function announceReplayApplied(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OFFLINE_REPLAY_APPLIED_EVENT));
}

/* -------------------------------------------------------------------------- */
/* Enqueueing                                                                 */
/* -------------------------------------------------------------------------- */

/** What a queued Task edit needs to say. */
export interface TaskMutationIntent {
  readonly entityId: string;
  readonly operation: OfflineMutationOperation;
  /**
   * The intended value, already CANONICAL. A date must be a resolved
   * `YYYY-MM-DD` — never "tomorrow" — because replay may happen on a different
   * day, and re-interpreting a relative phrase then would silently mean a
   * different date than the owner chose (§12). The inline date controls already
   * resolve against the owner's server-derived calendar day before this is
   * reached, so the canonical value is what arrives here.
   */
  readonly value?: OfflineMutationValue;
  /** The value the surface was showing when the owner acted. The conflict base. */
  readonly baseValue?: OfflineMutationValue;
  readonly baseUpdatedAt?: string | null;
}

export type EnqueueResult =
  | { readonly ok: true; readonly record: OfflineMutationRecord }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly refusal: OfflineEnqueueRefusal["kind"] | "unavailable";
    };

/** The refusal when this device has never completed an authenticated session. */
const NO_NAMESPACE =
  "DalyHub has not stored anything on this device yet, so this change cannot be " +
  "saved offline. Reconnect and try again.";

/** The refusal when this device cannot store anything at all. */
const NO_STORAGE =
  "This device is not storing offline data, so this change could not be saved. " +
  "Reconnect and try again.";

/**
 * Queue one Task edit as intent.
 *
 * Bounds are checked BEFORE anything is written, and a refusal is returned rather
 * than thrown: the caller has an interface element in the owner's hand and needs
 * a truthful answer either way. Nothing is ever silently dropped — when the queue
 * is full DalyHub says so and declines the new change, because discarding the
 * OLDEST would discard the one the later changes were built on.
 */
export async function enqueueTaskMutation(
  intent: TaskMutationIntent,
  now: Date = new Date(),
): Promise<EnqueueResult> {
  const namespace = activeNamespace;
  if (!namespace) {
    return { ok: false, reason: NO_NAMESPACE, refusal: "unavailable" };
  }

  const existing = await readMutations(namespace);
  if (!existing.ok) {
    recordOfflineDiagnostic("indexedDb", existing.failure.message);
    return { ok: false, reason: NO_STORAGE, refusal: "unavailable" };
  }
  const queued = existing.value;

  const bounds = checkMutationBounds({
    value: intent.value ?? null,
    // Only OUTSTANDING work counts against the bound. A conflict awaiting the
    // owner's decision does count (it is still holding a change), but a record
    // already confirmed by the server does not — it is about to be pruned.
    queuedCount: queued.filter((record) => record.status !== "synced").length,
  });
  if (bounds) {
    return { ok: false, reason: bounds.message, refusal: bounds.kind };
  }

  // Coalescing: a third title edit made before the first has been sent REPLACES
  // it rather than joining it. The rules — and every clause of why they are as
  // conservative as they are — live in the kernel.
  const target = findCoalesceTarget(queued, intent);
  const record = target
    ? coalesceInto(target, { value: intent.value ?? null, now })
    : createMutationRecord({
        namespace,
        entityId: intent.entityId,
        operation: intent.operation,
        value: intent.value ?? null,
        baseValue: intent.baseValue ?? null,
        baseUpdatedAt: intent.baseUpdatedAt ?? null,
        now,
        sequence: nextSequence(queued),
      });

  const stored = await putMutationRecord(record);
  if (!stored.ok) {
    recordOfflineDiagnostic("storageUnavailable", stored.failure.message);
    return { ok: false, reason: NO_STORAGE, refusal: "unavailable" };
  }
  notifyMutationQueueChanged();
  return { ok: true, record };
}

/** Read the active namespace's queue. Empty (not an error) when there is none. */
export async function readActiveMutations(): Promise<
  readonly OfflineMutationRecord[]
> {
  const namespace = activeNamespace;
  if (!namespace) return [];
  const result: OfflineStoreResult<readonly OfflineMutationRecord[]> =
    await readMutations(namespace);
  return result.ok ? result.value : [];
}

/** True when this device is holding unsynchronised Task changes right now. */
export async function hasOutstandingMutations(): Promise<boolean> {
  return summariseMutations(await readActiveMutations()).outstanding > 0;
}
