/**
 * DS-05 — the stream state hook: initial load, load-more, retry, dedup and merge.
 *
 * It owns pagination against an opaque cursor loader and nothing else — it never
 * touches a repository, D1 or a Cloudflare binding. The loader (supplied by the
 * route) makes the `activity.listForWorkspace` / `activity.listForEntity` call and
 * maps records → items; this hook merges pages by stable id, exposes the loading /
 * error / end states, and reloads cleanly when the loader identity changes (e.g. a
 * different scope). Stale responses are ignored via a monotonic request sequence.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { mergeActivityPage } from "./activity-paging";
import type { ActivityItem, ActivityPageLoader } from "./types";

/** Which load a pending/failed operation belongs to. */
export type ActivityLoadPhase = "initial" | "more";

/** Options for the stream hook. */
export interface UseActivityStreamOptions {
  readonly loadPage: ActivityPageLoader;
  /** Load the first page automatically on mount / loader change. Default true. */
  readonly autoLoadInitial?: boolean;
}

/** The observable stream state plus its controls. */
export interface ActivityStreamState {
  readonly items: readonly ActivityItem[];
  readonly isLoadingInitial: boolean;
  readonly isLoadingMore: boolean;
  /** The current error, if the most recent load failed. */
  readonly error: Error | null;
  readonly errorPhase: ActivityLoadPhase | null;
  readonly hasMore: boolean;
  /** True once a load has completed and there are zero items. */
  readonly isEmpty: boolean;
  /** True once at least one page has resolved (success). */
  readonly hasLoaded: boolean;
  /** A polite-live-region message for newly-loaded events (or ""). */
  readonly announcement: string;
  /** Load the next page (no-op while loading or at end). */
  readonly loadMore: () => void;
  /** Retry the load that failed (initial or more). */
  readonly retry: () => void;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(
    typeof cause === "string" ? cause : "Failed to load activity",
  );
}

export function useActivityStream(
  options: UseActivityStreamOptions,
): ActivityStreamState {
  const { loadPage, autoLoadInitial = true } = options;

  const [items, setItems] = useState<readonly ActivityItem[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [errorPhase, setErrorPhase] = useState<ActivityLoadPhase | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  // Refs so the load callbacks read fresh values without re-subscribing.
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  // Bumped on every loader change; async resolutions from a prior loader are
  // ignored so a slow response can never clobber a newer scope.
  const seqRef = useRef(0);

  const runLoad = useCallback(
    async (phase: ActivityLoadPhase) => {
      if (loadingRef.current) {
        return;
      }
      loadingRef.current = true;
      const seq = seqRef.current;
      const cursor = phase === "initial" ? null : cursorRef.current;

      if (phase === "initial") {
        setIsLoadingInitial(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);
      setErrorPhase(null);

      try {
        const page = await loadPage(cursor);
        if (seq !== seqRef.current) {
          return; // superseded by a newer loader
        }
        cursorRef.current = page.nextCursor;
        setHasMore(page.hasMore && page.nextCursor !== null);
        setHasLoaded(true);
        if (phase === "initial") {
          setItems(page.items);
          setAnnouncement(
            page.items.length === 0
              ? "No activity to show."
              : `${page.items.length} ${page.items.length === 1 ? "event" : "events"} loaded.`,
          );
        } else {
          setItems((prev) => {
            const merged = mergeActivityPage(prev, page.items);
            setAnnouncement(
              merged.addedCount === 0
                ? "No new events."
                : `${merged.addedCount} more ${merged.addedCount === 1 ? "event" : "events"} loaded.`,
            );
            return merged.items;
          });
        }
      } catch (cause) {
        if (seq !== seqRef.current) {
          return;
        }
        setError(toError(cause));
        setErrorPhase(phase);
      } finally {
        if (seq === seqRef.current) {
          if (phase === "initial") {
            setIsLoadingInitial(false);
          } else {
            setIsLoadingMore(false);
          }
        }
        loadingRef.current = false;
      }
    },
    [loadPage],
  );

  // Reset and (optionally) load the first page when the loader identity changes.
  useEffect(() => {
    seqRef.current += 1;
    cursorRef.current = null;
    loadingRef.current = false;
    setItems([]);
    setError(null);
    setErrorPhase(null);
    setHasMore(false);
    setHasLoaded(false);
    setIsLoadingMore(false);
    setAnnouncement("");
    if (autoLoadInitial) {
      void runLoad("initial");
    } else {
      setIsLoadingInitial(false);
    }
    // runLoad is derived from loadPage, so this re-runs exactly when loadPage does.
  }, [runLoad, autoLoadInitial]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || cursorRef.current === null) {
      return;
    }
    void runLoad("more");
  }, [runLoad]);

  const retry = useCallback(() => {
    const phase = errorPhase ?? "initial";
    void runLoad(phase);
  }, [errorPhase, runLoad]);

  return {
    items,
    isLoadingInitial,
    isLoadingMore,
    error,
    errorPhase,
    hasMore,
    isEmpty: hasLoaded && items.length === 0,
    hasLoaded,
    announcement,
    loadMore,
    retry,
  };
}
