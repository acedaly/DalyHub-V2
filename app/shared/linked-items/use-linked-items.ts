/**
 * The Universal Relationship System — the Linked Items controller.
 *
 * Owns the client state for a record's Linked Items: the loaded list, an
 * optimistic add/remove path with rollback, offline awareness, and the bound
 * `searchTargets` / `loadSummary` loaders the section and hover cards use. The
 * transport is injectable so the controller is testable without the network
 * (the default is the real `/links` client). Feedback (toasts, Undo) is left to
 * the section, so this hook stays free of the FeedbackProvider.
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
import type { LinkedItem, LinkSummary } from "./linked-items-model";
import { UNIVERSAL_RELATED_LINK } from "./constants";
import { useOnlineStatus } from "./use-online-status";

/** The injectable transport (defaults to the real `/links` client). */
export interface LinkedItemsTransport {
  readonly fetchItems: (
    anchorId: string,
    signal: AbortSignal,
  ) => Promise<readonly LinkedItem[]>;
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
  readonly reload: () => void;
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

  const [items, setItems] = useState<readonly LinkedItem[]>(
    initialItems ?? [],
  );
  const [status, setStatus] = useState<LinkedItemsStatus>(
    initialItems ? "ready" : "loading",
  );
  const mountedRef = useRef(true);
  const reloadSeq = useRef(0);
  const tempSeq = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(() => {
    const seq = reloadSeq.current + 1;
    reloadSeq.current = seq;
    const controller = new AbortController();
    setStatus("loading");
    transport.fetchItems(anchorId, controller.signal).then(
      (loaded) => {
        if (!mountedRef.current || reloadSeq.current !== seq) return;
        setItems(loaded);
        setStatus("ready");
      },
      () => {
        if (!mountedRef.current || reloadSeq.current !== seq) return;
        setStatus("error");
      },
    );
  }, [anchorId, transport]);

  // Load on mount / when the anchor changes, unless the caller supplied items.
  useEffect(() => {
    if (initialItems) {
      setItems(initialItems);
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
    reload,
    searchTargets,
    loadSummary,
    link,
    unlink,
  };
}
