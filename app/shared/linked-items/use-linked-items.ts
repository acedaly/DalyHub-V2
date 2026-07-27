/**
 * The Universal Relationship System — the Linked Items controller.
 *
 * Owns the client state for a record's Linked Items: the accumulated (paginated)
 * list, an optimistic add/remove path with rollback, offline awareness, and the
 * bound `searchTargets` / `loadSummary` loaders the section and hover cards use.
 * The transport is injectable so the controller is testable without the network
 * (the default is the real `/links` client). Feedback (toasts, Undo) is left to
 * the section, so this hook stays free of the FeedbackProvider.
 *
 * Pagination matters here: the server filters reserved structural spine links out
 * of the underlying link pages, so a record with many structural links spreads its
 * `link.related` relationships across several server pages. The controller loads a
 * first page and exposes `loadMore`/`hasMore` (a "Load more" affordance) so every
 * later relationship is reachable — never silently omitted.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  EntityLinkPickerDirection,
  EntityLinkTargetOption,
} from "~/shared/forms/model";

import {
  createLink as defaultCreateLink,
  fetchLinkedItems as defaultFetchItems,
  fetchLinkSummary as defaultFetchSummary,
  removeLink as defaultRemoveLink,
  searchLinkTargets as defaultSearchTargets,
  type LinkMutationOutcome,
} from "./linked-items-client";
import type {
  LinkedItem,
  LinkedItemsPage,
  LinkSummary,
} from "./linked-items-model";
import { UNIVERSAL_RELATED_LINK } from "./constants";
import { useOnlineStatus } from "./use-online-status";

/** The injectable transport (defaults to the real `/links` client). */
export interface LinkedItemsTransport {
  readonly fetchItems: (
    anchorId: string,
    signal: AbortSignal,
    cursor?: string,
  ) => Promise<LinkedItemsPage>;
  readonly searchTargets: (
    anchorId: string,
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly EntityLinkTargetOption[]>;
  readonly createLink: (params: {
    readonly anchorId: string;
    readonly targetId: string;
    readonly direction: "outgoing" | "incoming";
  }) => Promise<LinkMutationOutcome>;
  readonly removeLink: (params: {
    readonly anchorId: string;
    readonly linkId: string;
  }) => Promise<LinkMutationOutcome>;
  readonly fetchSummary: (
    anchorId: string,
    targetId: string,
    signal: AbortSignal,
  ) => Promise<LinkSummary | null>;
}

const DEFAULT_TRANSPORT: LinkedItemsTransport = {
  fetchItems: defaultFetchItems,
  searchTargets: defaultSearchTargets,
  createLink: defaultCreateLink,
  removeLink: defaultRemoveLink,
  fetchSummary: defaultFetchSummary,
};

export type LinkedItemsStatus = "loading" | "ready" | "error";

export interface UseLinkedItemsResult {
  readonly status: LinkedItemsStatus;
  readonly items: readonly LinkedItem[];
  readonly online: boolean;
  /** True when more relationships remain beyond the loaded pages. */
  readonly hasMore: boolean;
  /** True while a `loadMore` page fetch is in flight. */
  readonly loadingMore: boolean;
  /** True when the last `loadMore` failed (retryable via `loadMore`). */
  readonly loadMoreFailed: boolean;
  readonly reload: () => void;
  readonly loadMore: () => void;
  readonly searchTargets: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly EntityLinkTargetOption[]>;
  readonly loadSummary: (
    targetId: string,
    signal: AbortSignal,
  ) => Promise<LinkSummary | null>;
  readonly link: (
    target: EntityLinkTargetOption,
    direction: EntityLinkPickerDirection,
  ) => Promise<LinkMutationOutcome>;
  readonly unlink: (item: LinkedItem) => Promise<LinkMutationOutcome>;
}

const OFFLINE_OUTCOME: LinkMutationOutcome = {
  ok: false,
  message: "You're offline — reconnect to change links.",
};

export function useLinkedItems(params: {
  readonly anchorId: string;
  readonly transport?: LinkedItemsTransport;
  readonly initialItems?: readonly LinkedItem[];
}): UseLinkedItemsResult {
  const { anchorId, initialItems } = params;
  const transport = params.transport ?? DEFAULT_TRANSPORT;
  const online = useOnlineStatus();

  const [items, setItems] = useState<readonly LinkedItem[]>(initialItems ?? []);
  const [status, setStatus] = useState<LinkedItemsStatus>(
    initialItems ? "ready" : "loading",
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);

  const mountedRef = useRef(true);
  const reloadSeq = useRef(0);
  const tempSeq = useRef(0);
  // The cursor is mirrored in a ref so `loadMore` reads the latest value without
  // being re-created (and re-triggering effects) on every page.
  const cursorRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyCursor = useCallback((cursor: string | null) => {
    cursorRef.current = cursor;
    setNextCursor(cursor);
  }, []);

  const reload = useCallback(() => {
    const seq = reloadSeq.current + 1;
    reloadSeq.current = seq;
    const controller = new AbortController();
    setStatus("loading");
    setLoadMoreFailed(false);
    transport.fetchItems(anchorId, controller.signal).then(
      (page) => {
        if (!mountedRef.current || reloadSeq.current !== seq) return;
        setItems(page.items);
        applyCursor(page.nextCursor);
        setStatus("ready");
      },
      () => {
        if (!mountedRef.current || reloadSeq.current !== seq) return;
        setStatus("error");
      },
    );
  }, [anchorId, transport, applyCursor]);

  const loadMore = useCallback(() => {
    const cursor = cursorRef.current;
    if (!cursor || loadingMore) return;
    // A load-more is scoped to the CURRENT reload generation: a reload that lands
    // mid-fetch invalidates this page so it can't append onto a fresh list.
    const seq = reloadSeq.current;
    const controller = new AbortController();
    setLoadingMore(true);
    setLoadMoreFailed(false);
    transport.fetchItems(anchorId, controller.signal, cursor).then(
      (page) => {
        if (!mountedRef.current || reloadSeq.current !== seq) return;
        // De-duplicate by linkId in case a boundary link repeats across pages.
        setItems((current) => {
          const seen = new Set(current.map((i) => i.linkId));
          return [...current, ...page.items.filter((i) => !seen.has(i.linkId))];
        });
        applyCursor(page.nextCursor);
        setLoadingMore(false);
      },
      () => {
        if (!mountedRef.current || reloadSeq.current !== seq) return;
        setLoadingMore(false);
        setLoadMoreFailed(true);
      },
    );
  }, [anchorId, transport, loadingMore, applyCursor]);

  // Load on mount / when the anchor changes, unless the caller supplied items.
  useEffect(() => {
    if (initialItems) {
      setItems(initialItems);
      applyCursor(null);
      setStatus("ready");
      return;
    }
    reload();
    // initialItems is a mount-time seed only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorId]);

  const searchTargets = useCallback(
    (query: string, signal: AbortSignal) =>
      transport.searchTargets(anchorId, query, signal),
    [anchorId, transport],
  );

  const loadSummary = useCallback(
    (targetId: string, signal: AbortSignal) =>
      transport.fetchSummary(anchorId, targetId, signal),
    [anchorId, transport],
  );

  const link = useCallback(
    async (
      target: EntityLinkTargetOption,
      direction: EntityLinkPickerDirection,
    ): Promise<LinkMutationOutcome> => {
      if (!online) return OFFLINE_OUTCOME;
      // Optimistic: show the new link immediately under a temporary id.
      const tempId = `temp-${(tempSeq.current += 1)}`;
      const optimistic: LinkedItem = {
        linkId: tempId,
        target,
        linkType: UNIVERSAL_RELATED_LINK,
        direction,
        removable: true,
      };
      setItems((current) => [...current, optimistic]);
      const outcome = await transport.createLink({
        anchorId,
        targetId: target.id,
        direction,
      });
      if (!mountedRef.current) return outcome;
      if (outcome.ok) {
        // Reconcile with the server (replaces the temp id with the real link).
        reload();
      } else {
        // Roll back the optimistic addition.
        setItems((current) => current.filter((i) => i.linkId !== tempId));
      }
      return outcome;
    },
    [anchorId, online, transport, reload],
  );

  const unlink = useCallback(
    async (item: LinkedItem): Promise<LinkMutationOutcome> => {
      if (!online) return OFFLINE_OUTCOME;
      // Optimistic: remove immediately, restore on failure.
      const previous = item;
      setItems((current) => current.filter((i) => i.linkId !== item.linkId));
      const outcome = await transport.removeLink({
        anchorId,
        linkId: item.linkId,
      });
      if (!mountedRef.current) return outcome;
      if (!outcome.ok) {
        setItems((current) =>
          current.some((i) => i.linkId === previous.linkId)
            ? current
            : [...current, previous],
        );
      }
      return outcome;
    },
    [anchorId, online, transport],
  );

  return {
    status,
    items,
    online,
    hasMore: nextCursor !== null,
    loadingMore,
    loadMoreFailed,
    reload,
    loadMore,
    searchTargets,
    loadSummary,
    link,
    unlink,
  };
}
