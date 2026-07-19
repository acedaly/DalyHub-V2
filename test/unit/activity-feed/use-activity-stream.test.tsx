/**
 * DS-05 — the stream state hook: initial load, load-more, retry, and the guard
 * that a stream with the automatic initial load disabled can still be started via
 * `loadMore` (no permanently-empty, inert surface).
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useActivityStream } from "~/shared/activity-feed";
import type { ActivityStreamPage } from "~/shared/activity-feed";

const emptyPage: ActivityStreamPage = {
  items: [],
  nextCursor: null,
  hasMore: false,
};

describe("useActivityStream", () => {
  it("auto-loads the first page by default", async () => {
    const loadPage = vi.fn(async () => emptyPage);
    renderHook(() => useActivityStream({ loadPage }));
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));
    expect(loadPage).toHaveBeenCalledWith(null);
  });

  it("does not auto-load when disabled, but loadMore starts the first page", async () => {
    const loadPage = vi.fn(async () => emptyPage);
    const { result } = renderHook(() =>
      useActivityStream({ loadPage, autoLoadInitial: false }),
    );

    // Nothing loads on its own.
    expect(loadPage).not.toHaveBeenCalled();
    expect(result.current.hasLoaded).toBe(false);

    // loadMore initiates the very first page (cursor null, nothing loaded yet).
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(loadPage).toHaveBeenCalledWith(null);
  });
});
