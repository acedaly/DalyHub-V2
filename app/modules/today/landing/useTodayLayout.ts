/**
 * TODAY-08 — the Today landing personalisation hook.
 *
 * Wraps the pure `layout` model with client-side (per-device) persistence. It is
 * SSR-safe: the server and the first client render both use the DEFAULT layout, so
 * the markup matches (no hydration mismatch); the persisted arrangement is applied
 * in an effect after mount. Nothing here is workspace data — the arrangement is a
 * cosmetic per-device preference, so localStorage is the right store (ADR-016 keeps
 * the *workspace* server-derived; a widget arrangement is not workspace state).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  defaultTodayLayout,
  moveWidget,
  parseTodayLayout,
  serialiseTodayLayout,
  toggleCollapsed,
  toggleHidden,
  togglePinned,
  TODAY_LAYOUT_STORAGE_KEY,
  type TodayLayout,
  type TodayWidgetId,
} from "./layout";

export interface TodayLayoutController {
  readonly layout: TodayLayout;
  /** True once the persisted layout has been read (so chrome can appear). */
  readonly hydrated: boolean;
  readonly toggleCollapsed: (id: TodayWidgetId) => void;
  readonly toggleHidden: (id: TodayWidgetId) => void;
  readonly togglePinned: (id: TodayWidgetId) => void;
  readonly move: (id: TodayWidgetId, direction: "up" | "down") => void;
  readonly reset: () => void;
}

function readStored(): TodayLayout {
  if (typeof window === "undefined") {
    return defaultTodayLayout();
  }
  try {
    return parseTodayLayout(
      window.localStorage.getItem(TODAY_LAYOUT_STORAGE_KEY),
    );
  } catch {
    // localStorage can throw (private mode, disabled storage) — degrade to default.
    return defaultTodayLayout();
  }
}

export function useTodayLayout(): TodayLayoutController {
  const [layout, setLayout] = useState<TodayLayout>(defaultTodayLayout);
  const [hydrated, setHydrated] = useState(false);
  // Guards the persistence effect from writing the default over a real snapshot
  // before it has been read on mount.
  const readyRef = useRef(false);

  // Read the persisted arrangement once, after mount (SSR-safe).
  useEffect(() => {
    setLayout(readStored());
    setHydrated(true);
    readyRef.current = true;
  }, []);

  // Persist every change once hydrated. A failed write is non-fatal.
  useEffect(() => {
    if (!readyRef.current || typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(
        TODAY_LAYOUT_STORAGE_KEY,
        serialiseTodayLayout(layout),
      );
    } catch {
      // Ignore quota / disabled-storage errors — the preference just won't persist.
    }
  }, [layout]);

  return {
    layout,
    hydrated,
    toggleCollapsed: useCallback(
      (id) => setLayout((prev) => toggleCollapsed(prev, id)),
      [],
    ),
    toggleHidden: useCallback(
      (id) => setLayout((prev) => toggleHidden(prev, id)),
      [],
    ),
    togglePinned: useCallback(
      (id) => setLayout((prev) => togglePinned(prev, id)),
      [],
    ),
    move: useCallback(
      (id, direction) => setLayout((prev) => moveWidget(prev, id, direction)),
      [],
    ),
    reset: useCallback(() => setLayout(defaultTodayLayout()), []),
  };
}
