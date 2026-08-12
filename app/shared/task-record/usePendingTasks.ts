/**
 * PWA-12 — the two hooks a Task surface needs to be honest about offline state.
 *
 * Both are deliberately tiny and both degrade to nothing outside the application
 * shell: a surface rendered without an `OfflineProvider` (a test, a server render)
 * sees an empty map and no listener, which is exactly the behaviour it had before
 * PWA-12 existed.
 */

import { useEffect, useMemo } from "react";
import { useRevalidator } from "react-router";

import { useOffline } from "~/shared/offline";
import { OFFLINE_REPLAY_APPLIED_EVENT } from "~/shared/offline/mutation-queue";

import { NO_PENDING_TASKS, pendingTaskStates } from "./task-pending";
import type { PendingTaskMap } from "./task-pending";

/**
 * The Task changes this device is holding, as row presentation.
 *
 * Recomputed only when the queue itself changes — which, for the overwhelmingly
 * common case of an empty queue, is never. There is no IndexedDB read per render
 * and no polling anywhere in this path (§40): the provider owns the one read and
 * this reduces its result.
 */
export function usePendingTasks(): PendingTaskMap {
  const offline = useOffline();
  const mutations = offline?.mutations;
  return useMemo(
    () => (mutations ? pendingTaskStates(mutations) : NO_PENDING_TASKS),
    [mutations],
  );
}

/**
 * Re-read this surface's data when replay has actually changed server state.
 *
 * The one thing the client cannot know for itself: what a replayed completion did
 * to a recurring series. The successor is created by the canonical engine, on the
 * server, at replay time — so the only way the surface learns about it is by
 * asking. This is that ask, and it fires once per pass that applied something,
 * never on a timer.
 */
export function useReplayRevalidation(): void {
  const revalidator = useRevalidator();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onApplied = () => void revalidator.revalidate();
    window.addEventListener(OFFLINE_REPLAY_APPLIED_EVENT, onApplied);
    return () =>
      window.removeEventListener(OFFLINE_REPLAY_APPLIED_EVENT, onApplied);
    // `revalidator` is a fresh object each render; its `revalidate` is stable in
    // practice and re-subscribing on every render would be a listener churn this
    // page does not need.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
