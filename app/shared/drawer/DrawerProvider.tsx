/**
 * DS-03 — the Drawer provider (mount once).
 *
 * The single component a surface mounts to gain drawers. It:
 *   - derives the open stack purely from the URL (a repeated `drawer` search
 *     param), so the rendered stack is a deterministic function of the address —
 *     deep-linkable, shareable, refresh-proof and Back/Forward-correct;
 *   - exposes an imperative controller (`useDrawer`) whose every mutation is a real
 *     navigation (open pushes a tagged history entry; close uses Back only for a
 *     level this provider actually pushed, else removes the top parameter in place);
 *   - renders the underlying page (`children`) and, when open, the drawer stack as
 *     a sibling so the stack can make the page — and the whole app shell — inert.
 *
 * It stays strictly entity-agnostic: the only thing it knows about a record is the
 * opaque key in the URL, which it hands to the caller-supplied `renderDrawer`.
 * Callers manage no focus traps, portals, history entries or z-index.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import type { ReactNode } from "react";

import { DrawerContext } from "./drawer-context";
import type { DrawerContextValue } from "./drawer-context";
import { DrawerStack } from "./DrawerStack";
import {
  DEFAULT_DRAWER_PARAM,
  DRAWER_PUSH_STATE_KEY,
  MAX_DRAWER_DEPTH,
  readDrawerStack,
  withAllDrawersRemoved,
  withDrawerPushed,
  withTopDrawerRemoved,
  withTopDrawerReplaced,
} from "./drawer-url";
import type { DrawerController, DrawerEntry, DrawerKey } from "./types";
import type { DrawerRenderResult } from "./types";

/**
 * Read the provider's push token off a history entry's state, if present. Only a
 * string stored by this provider under {@link DRAWER_PUSH_STATE_KEY} counts.
 */
function readPushToken(state: unknown): string | undefined {
  if (state !== null && typeof state === "object") {
    const value = (state as Record<string, unknown>)[DRAWER_PUSH_STATE_KEY];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

/** A per-instance-unique id, so push tokens never collide across provider
 * instances (e.g. a fresh instance after a refresh vs. tokens the browser
 * preserved in older history entries). */
function createInstanceId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `dh-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export interface DrawerProviderProps {
  /** The underlying page content the drawers open over. */
  readonly children: ReactNode;
  /**
   * Map an open stack entry to its presentation. Called for every level on every
   * render, including on a fresh deep-link load, so content must be derivable from
   * the key alone. Return `null` for an unknown key to get the graceful not-found
   * panel.
   */
  readonly renderDrawer: (entry: DrawerEntry) => DrawerRenderResult | null;
  /** The URL search-parameter name carrying the stack. Defaults to `drawer`. */
  readonly param?: string;
  /** Stack-depth ceiling guarding pathological loops. Defaults to 12. */
  readonly maxDepth?: number;
}

export function DrawerProvider({
  children,
  renderDrawer,
  param = DEFAULT_DRAWER_PARAM,
  maxDepth = MAX_DRAWER_DEPTH,
}: DrawerProviderProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  // The opener control per depth, captured synchronously at open time so focus
  // can return to it on close.
  const openers = useRef<(HTMLElement | null)[]>([]);

  // Session-scoped record of which history entries THIS provider instance pushed
  // via `openDrawer()`. A monotonic token tags each pushed entry's `history.state`
  // and is recorded here; on close, a token present in both the current entry's
  // state AND this set proves the level is ours to close with Back. The set is
  // empty after a refresh/remount, so a refreshed or deep-linked entry — whose
  // `history.state` token the browser preserved but this instance never issued —
  // correctly closes by removing the top parameter instead (ADR-018 §18.2).
  const pushTokenCounter = useRef(0);
  const providerPushTokens = useRef<Set<string>>(new Set());
  const instanceIdRef = useRef<string>("");
  if (instanceIdRef.current === "") {
    instanceIdRef.current = createInstanceId();
  }

  // The current entry's history state, kept in a ref so the navigation callbacks
  // read the latest value without being re-created on every location change.
  const locationStateRef = useRef(location.state);
  locationStateRef.current = location.state;

  const stack = useMemo(
    () => readDrawerStack(searchParams, param),
    [searchParams, param],
  );

  const entries = useMemo<DrawerEntry[]>(
    () =>
      stack.map((key, index) => ({
        key,
        depth: index,
        isTop: index === stack.length - 1,
      })),
    [stack],
  );

  const captureOpener = useCallback((depth: number) => {
    if (typeof document !== "undefined") {
      openers.current[depth] =
        (document.activeElement as HTMLElement | null) ?? null;
    }
  }, []);

  // Navigate to the current pathname with a new search string, changing ONLY the
  // search. Pathname and hash are carried explicitly because `setSearchParams`
  // (which navigates to `"?" + params`) drops the hash. `state` is passed through
  // so a push can tag the entry and a replace can preserve the existing tag.
  const navigateWithSearch = useCallback(
    (
      nextParams: URLSearchParams,
      options: { replace: boolean; state: unknown },
    ) => {
      const search = nextParams.toString();
      navigate(
        {
          pathname: location.pathname,
          search: search ? `?${search}` : "",
          hash: location.hash,
        },
        {
          replace: options.replace,
          preventScrollReset: true,
          state: options.state,
        },
      );
    },
    [navigate, location.pathname, location.hash],
  );

  const openDrawer = useCallback(
    (key: DrawerKey) => {
      const current = readDrawerStack(searchParams, param);
      if (current[current.length - 1] === key) {
        // Re-opening the current top is a no-op — never duplicate a level, and
        // never mint navigation metadata for a navigation that doesn't happen.
        return;
      }
      if (current.length >= maxDepth) {
        if (import.meta.env.DEV) {
          console.warn(
            `[drawer] maximum stack depth (${maxDepth}) reached; replacing the top level instead of stacking further.`,
          );
        }
        captureOpener(current.length - 1);
        // At the cap this is a replace, not a new push: preserve the current
        // entry's marker so its close behaviour is unchanged.
        navigateWithSearch(withTopDrawerReplaced(searchParams, key, param), {
          replace: true,
          state: locationStateRef.current,
        });
        return;
      }
      captureOpener(current.length);
      // Push a new level and tag the resulting history entry as provider-created,
      // so close() can safely use Back for it (and Forward can restore it).
      const token = `${instanceIdRef.current}:${(pushTokenCounter.current += 1)}`;
      providerPushTokens.current.add(token);
      navigateWithSearch(withDrawerPushed(searchParams, key, param), {
        replace: false,
        state: { [DRAWER_PUSH_STATE_KEY]: token },
      });
    },
    [searchParams, param, maxDepth, captureOpener, navigateWithSearch],
  );

  const replaceDrawer = useCallback(
    (key: DrawerKey) => {
      // Swap the top key within the SAME history entry, preserving its marker —
      // a replace must not be treated as a separately pushed level.
      navigateWithSearch(withTopDrawerReplaced(searchParams, key, param), {
        replace: true,
        state: locationStateRef.current,
      });
    },
    [searchParams, param, navigateWithSearch],
  );

  const closeDrawer = useCallback(() => {
    const current = readDrawerStack(searchParams, param);
    if (current.length === 0) {
      return;
    }
    const token = readPushToken(locationStateRef.current);
    const openedByProvider =
      token !== undefined && providerPushTokens.current.has(token);
    if (openedByProvider) {
      // This exact level was created by our own openDrawer push, so the previous
      // history entry is precisely the state before it opened: Back closes only
      // this level and keeps Forward able to restore it.
      navigate(-1);
    } else {
      // Deep-linked, refreshed, or otherwise not pushed by us: there is no trusted
      // previous entry, so remove ONLY the top drawer parameter in place (a
      // replace), preserving the pathname, hash and unrelated query parameters.
      navigateWithSearch(withTopDrawerRemoved(searchParams, param), {
        replace: true,
        state: locationStateRef.current,
      });
    }
  }, [searchParams, param, navigate, navigateWithSearch]);

  const closeAll = useCallback(() => {
    navigateWithSearch(withAllDrawersRemoved(searchParams, param), {
      replace: false,
      state: null,
    });
  }, [searchParams, param, navigateWithSearch]);

  const buildHref = useCallback(
    (nextParams: URLSearchParams) => {
      const query = nextParams.toString();
      return `${location.pathname}${query ? `?${query}` : ""}${location.hash}`;
    },
    [location.pathname, location.hash],
  );

  const buildOpenHref = useCallback(
    (key: DrawerKey) => buildHref(withDrawerPushed(searchParams, key, param)),
    [buildHref, searchParams, param],
  );

  const buildCloseHref = useCallback(
    () => buildHref(withTopDrawerRemoved(searchParams, param)),
    [buildHref, searchParams, param],
  );

  const controller = useMemo<DrawerController>(
    () => ({
      entries,
      depth: entries.length,
      isOpen: entries.length > 0,
      topKey: entries[entries.length - 1]?.key,
      openDrawer,
      replaceDrawer,
      closeDrawer,
      closeAll,
    }),
    [entries, openDrawer, replaceDrawer, closeDrawer, closeAll],
  );

  const contextValue = useMemo<DrawerContextValue>(
    () => ({ ...controller, param, buildOpenHref, buildCloseHref }),
    [controller, param, buildOpenHref, buildCloseHref],
  );

  // Focus safety net on close. A closing drawer restores focus to its opener when
  // it has one; a directly deep-linked drawer has none, so focus can fall to
  // `<body>`. When a close leaves focus there, place it sensibly: into the newly
  // revealed top drawer if the stack still has one (so a lower modal is never left
  // without focus), else the page's main region. The opener path is always
  // preferred — this only acts when focus was actually lost.
  const previousDepthRef = useRef(controller.depth);
  useEffect(() => {
    const previousDepth = previousDepthRef.current;
    previousDepthRef.current = controller.depth;
    if (controller.depth >= previousDepth || typeof document === "undefined") {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active !== null && active !== document.body) {
        return;
      }
      const topClose = document.querySelector<HTMLElement>(
        '[data-drawer-stack] .drawer[data-top="true"] .drawer__close',
      );
      if (topClose !== null) {
        topClose.focus();
        return;
      }
      document.getElementById("main-content")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [controller.depth]);

  return (
    <DrawerContext.Provider value={contextValue}>
      <div className="drawer-background">{children}</div>
      {controller.isOpen && (
        <DrawerStack
          entries={controller.entries}
          renderDrawer={renderDrawer}
          openers={openers}
          onRequestClose={closeDrawer}
        />
      )}
    </DrawerContext.Provider>
  );
}
