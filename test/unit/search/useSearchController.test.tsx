import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSearchController } from "~/shared/search/useSearchController";
import { assembleOutcome, type SearchOutcome } from "~/shared/search/model";
import type { SearchFn } from "~/shared/search/client";

function outcomeWith(query: string, title: string): SearchOutcome {
  return assembleOutcome(query, [
    {
      providerId: "t.search",
      moduleId: "t",
      moduleLabel: "T",
      ok: true,
      items: [
        {
          id: title,
          title,
          entityType: "task",
          target: { kind: "route", to: "/x" },
        },
      ],
    },
  ]);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useSearchController", () => {
  it("stays idle and never fetches for an empty query", async () => {
    const search = vi.fn<SearchFn>(async (q) => outcomeWith(q, "X"));
    const { result } = renderHook(() =>
      useSearchController({ search, debounceMs: 0 }),
    );
    act(() => result.current.setQuery("   "));
    await act(async () => {
      await Promise.resolve();
    });
    expect(search).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("idle");
  });

  it("debounces keystrokes into a single request", async () => {
    const search = vi.fn<SearchFn>(async (q) => outcomeWith(q, "Result"));
    const { result } = renderHook(() =>
      useSearchController({ search, debounceMs: 30 }),
    );
    act(() => result.current.setQuery("a"));
    act(() => result.current.setQuery("al"));
    act(() => result.current.setQuery("alp"));
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("alp", expect.any(AbortSignal));
  });

  it("never lets a slower earlier response replace a newer one", async () => {
    const first = deferred<SearchOutcome>();
    const second = deferred<SearchOutcome>();
    const calls: string[] = [];
    const search: SearchFn = (q) => {
      calls.push(q);
      return calls.length === 1 ? first.promise : second.promise;
    };
    const { result } = renderHook(() =>
      useSearchController({ search, debounceMs: 0 }),
    );

    act(() => result.current.setQuery("a"));
    await waitFor(() => expect(calls).toHaveLength(1));
    act(() => result.current.setQuery("ab"));
    await waitFor(() => expect(calls).toHaveLength(2));

    // B (the newer request) resolves first...
    await act(async () => {
      second.resolve(outcomeWith("ab", "Beta"));
      await Promise.resolve();
    });
    expect(result.current.flatResults[0]?.title).toBe("Beta");

    // ...then A (the older request) resolves later — it must be ignored.
    await act(async () => {
      first.resolve(outcomeWith("a", "Alpha"));
      await Promise.resolve();
    });
    expect(result.current.flatResults[0]?.title).toBe("Beta");
  });

  it("returns to idle and cancels pending work when cleared", async () => {
    const pending = deferred<SearchOutcome>();
    const search = vi.fn<SearchFn>(() => pending.promise);
    const { result } = renderHook(() =>
      useSearchController({ search, debounceMs: 0 }),
    );
    act(() => result.current.setQuery("alpha"));
    await waitFor(() => expect(search).toHaveBeenCalled());
    act(() => result.current.clear());
    expect(result.current.phase).toBe("idle");
    // A late resolution of the cancelled request must not change state.
    await act(async () => {
      pending.resolve(outcomeWith("alpha", "Late"));
      await Promise.resolve();
    });
    expect(result.current.phase).toBe("idle");
  });

  it("surfaces a retryable error and recovers on retry", async () => {
    let mode: "fail" | "ok" = "fail";
    const search: SearchFn = async (q) => {
      if (mode === "fail") {
        throw new Error("network");
      }
      return outcomeWith(q, "Recovered");
    };
    const { result } = renderHook(() =>
      useSearchController({ search, debounceMs: 0 }),
    );
    act(() => result.current.setQuery("alpha"));
    await waitFor(() => expect(result.current.phase).toBe("error"));
    mode = "ok";
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.flatResults[0]?.title).toBe("Recovered");
  });

  it("shows healthy results when a newer request is partial", async () => {
    const search: SearchFn = async (q) =>
      assembleOutcome(q, [
        {
          providerId: "a.search",
          moduleId: "a",
          moduleLabel: "A",
          ok: true,
          items: [
            {
              id: "1",
              title: `Healthy ${q}`,
              entityType: "task",
              target: { kind: "route", to: "/x" },
            },
          ],
        },
        {
          providerId: "b.search",
          moduleId: "b",
          moduleLabel: "B",
          ok: false,
          items: [],
        },
      ]);
    const { result } = renderHook(() =>
      useSearchController({ search, debounceMs: 0 }),
    );
    act(() => result.current.setQuery("alpha"));
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.isPartial).toBe(true);
    expect(result.current.hasResults).toBe(true);
  });

  it("does not update state after unmount", async () => {
    const pending = deferred<SearchOutcome>();
    const search: SearchFn = () => pending.promise;
    const { result, unmount } = renderHook(() =>
      useSearchController({ search, debounceMs: 0 }),
    );
    act(() => result.current.setQuery("alpha"));
    await waitFor(() => expect(result.current.phase).toBe("loading"));
    unmount();
    // Resolving after unmount must not throw or warn.
    await act(async () => {
      pending.resolve(outcomeWith("alpha", "After"));
      await Promise.resolve();
    });
  });
});

describe("useSearchController — immediate stale invalidation", () => {
  it("an older in-flight request cannot update results after the query changes (non-zero debounce)", async () => {
    vi.useFakeTimers();
    try {
      const a = deferred<SearchOutcome>();
      const b = deferred<SearchOutcome>();
      const calls: string[] = [];
      const search: SearchFn = (q) => {
        calls.push(q);
        return calls.length === 1 ? a.promise : b.promise;
      };
      const { result } = renderHook(() =>
        useSearchController({ search, debounceMs: 100 }),
      );

      // (1) query A starts, (2) A remains unresolved after its debounce fires.
      act(() => result.current.setQuery("a"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(calls).toEqual(["a"]);

      // (3) user types B — B's debounce has NOT fired yet.
      act(() => result.current.setQuery("ab"));

      // (5) A resolves now — (6) it must NOT update the visible results.
      await act(async () => {
        a.resolve(outcomeWith("a", "Alpha"));
        await Promise.resolve();
      });
      expect(result.current.hasResults).toBe(false);

      // (7) B's debounce fires, (8) B resolves, (9) only B appears.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(calls).toEqual(["a", "ab"]);
      await act(async () => {
        b.resolve(outcomeWith("ab", "Beta"));
        await Promise.resolve();
      });
      expect(result.current.flatResults[0]?.title).toBe("Beta");
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts the active request's signal immediately when the query changes", async () => {
    vi.useFakeTimers();
    try {
      let signalA: AbortSignal | undefined;
      const search: SearchFn = (_q, signal) => {
        if (signalA === undefined) {
          signalA = signal;
        }
        return new Promise<SearchOutcome>(() => {});
      };
      const { result } = renderHook(() =>
        useSearchController({ search, debounceMs: 50 }),
      );
      act(() => result.current.setQuery("a"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(signalA?.aborted).toBe(false);
      // Changing the query aborts the in-flight request synchronously.
      act(() => result.current.setQuery("ab"));
      expect(signalA?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clearing before the debounced request starts cancels it", async () => {
    vi.useFakeTimers();
    try {
      const search = vi.fn<SearchFn>(async (q) => outcomeWith(q, "X"));
      const { result } = renderHook(() =>
        useSearchController({ search, debounceMs: 100 }),
      );
      act(() => result.current.setQuery("ab"));
      // Clear before the 100ms debounce fires.
      act(() => result.current.clear());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(search).not.toHaveBeenCalled();
      expect(result.current.phase).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rapid A -> B -> C typing with A in flight resolves only C", async () => {
    vi.useFakeTimers();
    try {
      const a = deferred<SearchOutcome>();
      const c = deferred<SearchOutcome>();
      const calls: string[] = [];
      const search: SearchFn = (q) => {
        calls.push(q);
        return q === "a" ? a.promise : c.promise;
      };
      const { result } = renderHook(() =>
        useSearchController({ search, debounceMs: 100 }),
      );
      act(() => result.current.setQuery("a"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(calls).toEqual(["a"]); // A in flight
      // Type B then C before either debounce fires — B never dispatches.
      act(() => result.current.setQuery("ab"));
      act(() => result.current.setQuery("abc"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(calls).toEqual(["a", "abc"]);
      await act(async () => {
        a.resolve(outcomeWith("a", "Alpha"));
        c.resolve(outcomeWith("abc", "Gamma"));
        await Promise.resolve();
      });
      expect(result.current.flatResults[0]?.title).toBe("Gamma");
    } finally {
      vi.useRealTimers();
    }
  });

  it("retry invalidates any pending request", async () => {
    vi.useFakeTimers();
    try {
      const first = deferred<SearchOutcome>();
      const calls: string[] = [];
      const search: SearchFn = (q) => {
        calls.push(q);
        return calls.length === 1
          ? first.promise
          : Promise.resolve(outcomeWith(q, "Retry"));
      };
      const { result } = renderHook(() =>
        useSearchController({ search, debounceMs: 50 }),
      );
      act(() => result.current.setQuery("alpha"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(calls).toHaveLength(1); // first request in flight
      // Retry starts a fresh request immediately and invalidates the first.
      act(() => result.current.retry());
      await act(async () => {
        first.resolve(outcomeWith("alpha", "Stale"));
        await Promise.resolve();
      });
      expect(calls).toHaveLength(2);
      expect(result.current.flatResults[0]?.title).toBe("Retry");
    } finally {
      vi.useRealTimers();
    }
  });
});
