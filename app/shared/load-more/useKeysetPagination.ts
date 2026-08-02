/**
 * UX-01 — the ONE keyset-pagination hook every collection configures.
 *
 * Every "Load more" collection in DalyHub was the same forty lines copied five
 * times (`useAreaPagination`, `useGoalPagination`, `useDeletedGoalPagination`,
 * `useNotePagination`, `useProjectPagination`, Assets' `usePagination`) — the same
 * `useFetcher`, the same accumulator, the same de-duplication, the same reset. Two
 * collections (Meetings, Reviews) never got a copy at all and paginated by
 * NAVIGATING to the next page, which replaced the list and threw away the owner's
 * place; Meetings even labelled that control "Load more", which is not what it did.
 * That is [DEBT-45] and [DEBT-01] wearing a pagination hat: one idea, six
 * implementations, two absences and an inconsistent behaviour.
 *
 * This is that one implementation. It is deliberately generic — it knows about a
 * page shape (`items` + `nextCursor` + `failed`) and a URL, and nothing about any
 * entity.
 *
 * The rule this encodes, which the copies got wrong (DEBT-45's real defect):
 * **a page is consumed only if it was ASKED FOR since the current scope began.**
 * React Router revalidates an active fetcher after a navigation, so a scope change
 * (an Active ⇄ Deleted switch, a filter change) can deliver a newly-identified copy
 * of the page last loaded in the very render where the reset has just run. The
 * copies de-duplicated by object identity alone, which that defeats — the stale
 * page is appended on top of the new first page and the cursor advances past
 * everything between, silently stranding records. Here every request is stamped
 * with a monotonic id and a response is only applied while that stamp still belongs
 * to the current scope.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";

/** The minimum shape a paginated loader must return. */
export interface KeysetPage<TItem> {
  readonly items: readonly TItem[];
  readonly nextCursor: string | null;
  /** True when the page could not be read; surfaces as a retryable failure. */
  readonly failed?: boolean;
}

export interface UseKeysetPaginationOptions<TItem, TData> {
  /** The first page, from the route loader. */
  readonly firstPage: readonly TItem[];
  /** The cursor for the page after `firstPage`, or null when exhausted. */
  readonly initialCursor: string | null;
  /**
   * The route path (plus any current query, WITHOUT a cursor) the next page is
   * fetched from. Changing it is a scope change and resets the accumulation.
   */
  readonly path: string;
  /** Pull the page out of the fetched loader data. */
  readonly select: (data: TData) => KeysetPage<TItem>;
  /** A stable identity for an item, so a boundary duplicate appears once. */
  readonly getId: (item: TItem) => string;
}

export interface KeysetPagination<TItem> {
  /** The first page plus every accumulated page, de-duplicated, in order. */
  readonly items: readonly TItem[];
  /** Whether another page exists. */
  readonly hasMore: boolean;
  /** Whether a page fetch is in flight. */
  readonly loading: boolean;
  /** Whether the last fetch failed (the shared LoadMore offers a retry). */
  readonly loadFailed: boolean;
  /** Fetch the next page. A no-op when exhausted or already loading. */
  readonly loadMore: () => void;
}

export function useKeysetPagination<TItem, TData>({
  firstPage,
  initialCursor,
  path,
  select,
  getId,
}: UseKeysetPaginationOptions<TItem, TData>): KeysetPagination<TItem> {
  const fetcher = useFetcher<TData>();
  const [appended, setAppended] = useState<readonly TItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadFailed, setLoadFailed] = useState(false);

  // The request-scoped guard. `requested` is the id of the page fetch this scope
  // is waiting for; `applied` is the last one consumed. A response is applied only
  // while `requested` is still set — a reset clears it, so a revalidated copy of a
  // previous scope's page can never be appended to a fresh first page.
  const nextRequestId = useRef(0);
  const requested = useRef<number | null>(null);
  const applied = useRef<unknown>(null);
  // Whether the fetcher has actually LEFT idle for the outstanding request. See the
  // `data === undefined` branch below for why "idle" alone cannot be trusted.
  const started = useRef(false);

  // The scope this accumulation belongs to. Compared by VALUE, and seeded with the
  // scope the hook mounted in, so the reset below fires on a genuine scope CHANGE
  // and never merely because an effect ran.
  const scopeKey = `${path}\u0000${initialCursor ?? ""}`;
  const scope = useRef(scopeKey);

  // A scope change (new filter, new view, new first page) restarts the accumulation.
  //
  // The guard is load-bearing, and its absence was a real defect. `useEffect` runs
  // AFTER paint, and `findBy*`/a fast click can land before React has flushed the
  // mount effect — so this effect would run for the FIRST time after `loadMore` had
  // already stamped its request, clear `requested.current`, and the page that then
  // arrived was discarded as belonging to a previous scope. The owner saw "Load
  // more" clear its spinner and add nothing, with the cursor un-advanced; a second
  // click worked. Intermittent, scheduler-dependent, and present in all eight
  // collections that share this hook.
  //
  // Resetting only on a REAL change fixes it without weakening the DEBT-45 rule this
  // hook exists to encode: a scope that genuinely changes still discards an in-flight
  // request, which is exactly what must happen.
  useEffect(() => {
    if (scope.current === scopeKey) {
      return;
    }
    scope.current = scopeKey;
    setAppended([]);
    setCursor(initialCursor);
    setLoadFailed(false);
    requested.current = null;
    applied.current = null;
    started.current = false;
  }, [scopeKey, initialCursor]);

  useEffect(() => {
    if (fetcher.state !== "idle") {
      // The fetch is genuinely under way, so a later idle state is a real result.
      started.current = true;
      return;
    }
    const data = fetcher.data;
    if (requested.current === null) {
      return;
    }
    if (data === undefined) {
      // `fetcher.load()` does NOT synchronously leave the idle state, so
      // `idle && data === undefined` has TWO meanings: "settled with nothing" and
      // "has not started yet". Treating them alike is what made this branch drop
      // real pages — it fired in the render between stamping the request and the
      // fetcher going "loading", cleared the request, and the page that then
      // arrived was discarded as unrequested. The owner saw "Load more" clear its
      // spinner, add nothing and leave the cursor un-advanced; a second click
      // worked. Intermittent, scheduler-dependent, and shared by all eight
      // collections.
      //
      // `started` is the discriminator: only a fetcher that actually left idle can
      // have settled. Until then this effect simply waits.
      if (!started.current) {
        return;
      }
      // The fetcher settled with nothing to apply — the load did not produce a
      // page. Release the outstanding request and offer a retry, rather than
      // leaving `loadMore` permanently blocked behind a request that will never
      // be answered (which would present an enabled button that does nothing).
      requested.current = null;
      started.current = false;
      setLoadFailed(true);
      return;
    }
    if (applied.current === data) {
      return;
    }
    applied.current = data;
    requested.current = null;
    started.current = false;

    // React Router types a fetcher's data as `SerializeFrom<TData>`. Every
    // collection loader here already returns a plain, JSON-safe payload (no `Date`,
    // no class instances — the modules serialise before returning), so the
    // serialised shape IS `TData`; the cast records that rather than pushing
    // `SerializeFrom` into every collection's selector signature.
    const page = select(data as TData);
    if (page.failed === true) {
      setLoadFailed(true);
      return;
    }
    setAppended((prev) => [...prev, ...page.items]);
    setCursor(page.nextCursor);
    setLoadFailed(false);
  }, [fetcher.state, fetcher.data, select]);

  const loadMore = useCallback(() => {
    if (cursor === null || requested.current !== null) {
      return;
    }
    setLoadFailed(false);
    nextRequestId.current += 1;
    requested.current = nextRequestId.current;
    started.current = false;
    const separator = path.includes("?") ? "&" : "?";
    fetcher.load(`${path}${separator}cursor=${encodeURIComponent(cursor)}`);
  }, [cursor, path, fetcher]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: TItem[] = [];
    for (const item of [...firstPage, ...appended]) {
      const id = getId(item);
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      out.push(item);
    }
    return out;
  }, [firstPage, appended, getId]);

  return {
    items,
    hasMore: cursor !== null,
    loading: fetcher.state !== "idle",
    loadFailed,
    loadMore,
  };
}
