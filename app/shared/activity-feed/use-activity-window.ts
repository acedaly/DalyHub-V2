/**
 * DS-05 — the measured windowing hook for virtualised rendering.
 *
 * Wraps the pure `computeWindow` math with DOM measurement: it observes each
 * rendered row's real height (variable-height content is supported), keeps a
 * cumulative-offset model, tracks the scroll container's position and height, and
 * returns the slice of rows to render plus the top/bottom spacer sizes that keep
 * the scrollbar stable. Only rows near the viewport are rendered, so thousands of
 * events stay smooth without a data-grid dependency.
 *
 * When `enabled` is false (short streams, or an environment that cannot measure)
 * it returns the full range with no spacers, so semantics and tests are unaffected.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import { buildRowOffsets, computeWindow } from "./activity-window";

/** A ref callback that registers a row element for measurement. */
export type RowRefCallback = (element: HTMLElement | null) => void;

export interface UseActivityWindowOptions {
  readonly rowKeys: readonly string[];
  /** Estimated height for a not-yet-measured row (used until it is measured). */
  readonly estimateRowHeight: (index: number) => number;
  readonly overscan?: number;
  readonly enabled: boolean;
  readonly scrollElementRef: RefObject<HTMLElement | null>;
}

export interface ActivityWindowState {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly paddingTop: number;
  readonly paddingBottom: number;
  readonly totalHeight: number;
  readonly isVirtualized: boolean;
  /** Get the stable ref callback for the row with this key. */
  readonly rowRef: (key: string) => RowRefCallback;
}

// SSR/tests fall back to a layout-free effect.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function useActivityWindow(
  options: UseActivityWindowOptions,
): ActivityWindowState {
  const { rowKeys, estimateRowHeight, enabled, scrollElementRef } = options;
  const overscan = options.overscan ?? 6;
  const count = rowKeys.length;

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  // A version counter bumped whenever a measured height actually changes.
  const [measureVersion, setMeasureVersion] = useState(0);

  const heightsRef = useRef<Map<string, number>>(new Map());
  const rowRefCallbacks = useRef<Map<string, RowRefCallback>>(new Map());
  const observerRef = useRef<ResizeObserver | null>(null);
  const observedRef = useRef<Map<Element, string>>(new Map());

  const recordHeight = useCallback((key: string, height: number) => {
    if (!Number.isFinite(height) || height <= 0) {
      return;
    }
    const prev = heightsRef.current.get(key);
    if (prev !== undefined && Math.abs(prev - height) < 0.5) {
      return;
    }
    heightsRef.current.set(key, height);
    setMeasureVersion((v) => v + 1);
  }, []);

  // One shared ResizeObserver keeps variable-height rows measured as they change.
  useEffect(() => {
    if (!enabled || typeof ResizeObserver === "undefined") {
      return;
    }
    const observed = observedRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const key = observed.get(entry.target);
        if (key !== undefined) {
          recordHeight(key, entry.target.getBoundingClientRect().height);
        }
      }
    });
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
      observed.clear();
    };
  }, [enabled, recordHeight]);

  const rowRef = useCallback(
    (key: string): RowRefCallback => {
      let callback = rowRefCallbacks.current.get(key);
      if (!callback) {
        callback = (element: HTMLElement | null) => {
          const observer = observerRef.current;
          if (element) {
            recordHeight(key, element.getBoundingClientRect().height);
            if (observer) {
              observer.observe(element);
              observedRef.current.set(element, key);
            }
          }
        };
        rowRefCallbacks.current.set(key, callback);
      }
      return callback;
    },
    [recordHeight],
  );

  // Track the scroll container's position and height.
  useIsoLayoutEffect(() => {
    const element = scrollElementRef.current;
    if (!enabled || !element) {
      return;
    }
    let frame = 0;
    const sync = () => {
      frame = 0;
      setScrollTop(element.scrollTop);
      setViewportHeight(element.clientHeight);
    };
    const onScroll = () => {
      if (frame === 0) {
        frame =
          typeof requestAnimationFrame !== "undefined"
            ? requestAnimationFrame(sync)
            : (sync(), 0);
      }
    };
    setScrollTop(element.scrollTop);
    setViewportHeight(element.clientHeight);
    element.addEventListener("scroll", onScroll, { passive: true });
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => setViewportHeight(element.clientHeight))
        : null;
    ro?.observe(element);
    return () => {
      element.removeEventListener("scroll", onScroll);
      if (frame !== 0 && typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(frame);
      }
      ro?.disconnect();
    };
  }, [enabled, scrollElementRef]);

  const { offsets, totalHeight } = useMemo(() => {
    const heights = rowKeys.map(
      (key, index) => heightsRef.current.get(key) ?? estimateRowHeight(index),
    );
    return buildRowOffsets(heights);
    // measureVersion invalidates when a measured height changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKeys, estimateRowHeight, measureVersion]);

  if (!enabled) {
    return {
      startIndex: 0,
      endIndex: count,
      paddingTop: 0,
      paddingBottom: 0,
      totalHeight,
      isVirtualized: false,
      rowRef,
    };
  }

  const windowResult = computeWindow({
    offsets,
    totalHeight,
    count,
    scrollTop,
    viewportHeight: viewportHeight > 0 ? viewportHeight : 600,
    overscan,
  });

  return { ...windowResult, isVirtualized: true, rowRef };
}
