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

/**
 * FIND-01 — Search now issues ONE request the moment it opens, for the recency
 * list. Every test below this line is about what happens to TYPED queries, so
 * this wrapper answers that opening request immediately and keeps it out of the
 * test's own bookkeeping. The assertions are unchanged; only the baseline moved.
 */
function typedOnly(fn: SearchFn): SearchFn {
  return (q, signal, options) =>
    q === ""
      ? Promise.resolve(assembleOutcome("", []))
      : fn(q, signal, options);
}

/** Let the opening recency request settle before the test's own work starts. */
async function settleOpeningRequest(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
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
  /*
   * FIND-01 reversed this test's subject. It used to assert that an empty query
   * "stays idle and never fetches", which is exactly the dead end [DEBT-195]
   * recorded: the shell was useless until a keystroke. An empty query is now a
   * real request for the workspace's recently worked-on records.
   *
   * What has NOT changed, and is asserted below: an empty query still executes
   * no PROVIDER. That decision moved to the server, which answers `q=` from the
   * recency read — `MIN_QUERY_LENGTH` still means what it always meant.
   */
  it("fetches recent records for an empty query instead of dead-ending", async () => {
    const search = vi.fn<SearchFn>(async (q) => outcomeWith(q, "Recent thing"));
    const { result } = renderHook(() =>
      useSearchController({ search, debounceMs: 0 }),
    );
    await waitFor(() => expect(result.current.phase).toBe("ready"));

    expect(search).toHaveBeenCalledWith("", expect.any(AbortSignal));
    expect(result.current.isEmptyQuery).toBe(true);
    expect(result.current.flatResults.map((r) => r.title)).toEqual([
      "Recent thing",
    ]);
  });

  it("treats a whitespace-only query as the empty one", async () => {
    const search = vi.fn<SearchFn>(async (q) => outcomeWith(q, "X"));
    const { result } = renderHook(() =>
      useSearchController({ search, debounceMs: 0 }),
    );
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    search.mockClear();

    act(() => result.current.setQuery("   "));
    await waitFor(() => expect(result.current.isEmptyQuery).toBe(true));
    // Normalised to "" — never sent as whitespace.
    for (const call of search.mock.calls) {
      expect(call[0]).toBe("");
    }
  });

  it("debounces keystrokes into a single request", async () => {
    const search = vi.fn<SearchFn>(async (q) => outcomeWith(q, "Result"));
    const { result } = renderHook(() =>
      useSearchController({ search, debounceMs: 30 }),
    );
    // Let FIND-01's mount request for the recency list settle, then measure
    // ONLY the keystrokes — the coalescing claim is unchanged.
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    search.mockClear();

    act(() => result.current.setQuery("a"));
    act(() => result.current.setQuery("al"));
    act(() => result.current.setQuery("alp"));
    await waitFor(() => expect(result.current.query).toBe("alp"));
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

  /*
   * FIND-01 — clearing returns to the RECENCY LIST rather than to a dead idle
   * state, because an empty Search now has something to open. The claim this
   * test exists for is unchanged and still asserted: the cancelled request's
   * late resolution must never reach state.
   */
  it("cancels pending work when cleared, and returns to the recency list", async () => {
    const pending = deferred<SearchOutcome>();
    const calls: string[] = [];
    const search = vi.fn<SearchFn>((q) => {
      calls.push(q);
      // The mount request for the recency list resolves; the typed one hangs.
      return q === ""
        ? Promise.resolve(outcomeWith("", "Recent"))
        : pending.promise;
    });
    const { result } = renderHook(() =>
      useSearchController({ search, debounceMs: 0 }),
    );
    await waitFor(() => expect(result.current.phase).toBe("ready"));

    act(() => result.current.setQuery("alpha"));
    await waitFor(() => expect(calls).toContain("alpha"));

    act(() => result.current.clear());
    await waitFor(() => expect(result.current.isEmptyQuery).toBe(true));
    await waitFor(() =>
      expect(result.current.flatResults[0]?.title).toBe("Recent"),
    );

    // A late resolution of the cancelled request must not change state.
    await act(async () => {
      pending.resolve(outcomeWith("alpha", "Late"));
      await Promise.resolve();
    });
    expect(result.current.flatResults[0]?.title).toBe("Recent");
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
      const search: SearchFn = typedOnly((q) => {
        calls.push(q);
        return calls.length === 1 ? a.promise : b.promise;
      });
      const { result } = renderHook(() =>
        useSearchController({ search, debounceMs: 100 }),
      );

      await settleOpeningRequest();

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

  it("aborts the active request’s signal immediately when the query changes", async () => {
    vi.useFakeTimers();
    try {
      let signalA: AbortSignal | undefined;
      const search: SearchFn = typedOnly((_q, signal) => {
        if (signalA === undefined) {
          signalA = signal;
        }
        return new Promise<SearchOutcome>(() => {});
      });
      const { result } = renderHook(() =>
        useSearchController({ search, debounceMs: 50 }),
      );
      await settleOpeningRequest();
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
      const typed = vi.fn<SearchFn>(async (q) => outcomeWith(q, "X"));
      const search = typedOnly(typed);
      const { result } = renderHook(() =>
        useSearchController({ search, debounceMs: 100 }),
      );
      await settleOpeningRequest();

      act(() => result.current.setQuery("ab"));
      // Clear before the 100ms debounce fires.
      act(() => result.current.clear());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      // The typed query never reached the transport — the claim of this test.
      expect(typed).not.toHaveBeenCalled();
      // And clearing lands back on the recency list rather than a dead idle.
      expect(result.current.isEmptyQuery).toBe(true);
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
      const search: SearchFn = typedOnly((q) => {
        calls.push(q);
        return q === "a" ? a.promise : c.promise;
      });
      const { result } = renderHook(() =>
        useSearchController({ search, debounceMs: 100 }),
      );
      await settleOpeningRequest();
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
      const search: SearchFn = typedOnly((q) => {
        calls.push(q);
        return calls.length === 1
          ? first.promise
          : Promise.resolve(outcomeWith(q, "Retry"));
      });
      const { result } = renderHook(() =>
        useSearchController({ search, debounceMs: 50 }),
      );
      await settleOpeningRequest();
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

describe("useSearchController — stale active selection", () => {
  it("clears the active selection immediately when the query changes and re-arms only when new results are current", async () => {
    vi.useFakeTimers();
    try {
      const b = deferred<SearchOutcome>();
      let calls = 0;
      const search: SearchFn = typedOnly((q) => {
        calls += 1;
        return calls === 1
          ? Promise.resolve(outcomeWith(q, "Alpha"))
          : b.promise;
      });
      const { result } = renderHook(() =>
        useSearchController({ search, debounceMs: 100 }),
      );
      await settleOpeningRequest();

      // Query A resolves; select its result with ArrowDown.
      act(() => result.current.setQuery("alpha"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      act(() => result.current.moveDown());
      expect(result.current.activeIndex).toBe(0);
      expect(result.current.activeResult?.title).toBe("Alpha");
      expect(result.current.resultsAreCurrent).toBe(true);

      // Type B — before B's debounce fires the selection is cleared and the
      // stale results are no longer current (not activatable).
      act(() => result.current.setQuery("bravo"));
      expect(result.current.activeIndex).toBe(-1);
      expect(result.current.activeResult).toBeNull();
      expect(result.current.resultsAreCurrent).toBe(false);

      // B resolves — new results arrive with NO preselection.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      await act(async () => {
        b.resolve(outcomeWith("bravo", "Bravo"));
        await Promise.resolve();
      });
      expect(result.current.resultsAreCurrent).toBe(true);
      expect(result.current.activeResult).toBeNull();
      // ArrowDown now begins at B's first result.
      act(() => result.current.moveDown());
      expect(result.current.activeResult?.title).toBe("Bravo");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the selection on clear and on retry", async () => {
    vi.useFakeTimers();
    try {
      const search: SearchFn = typedOnly(async (q) => outcomeWith(q, "Alpha"));
      const { result } = renderHook(() =>
        useSearchController({ search, debounceMs: 0 }),
      );
      await settleOpeningRequest();
      act(() => result.current.setQuery("alpha"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => result.current.moveDown());
      expect(result.current.activeResult).not.toBeNull();

      act(() => result.current.retry());
      expect(result.current.activeIndex).toBe(-1); // retry clears selection
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.activeResult).toBeNull();

      act(() => result.current.moveDown());
      expect(result.current.activeResult).not.toBeNull();
      act(() => result.current.clear());
      expect(result.current.activeIndex).toBe(-1);
      // Clearing now returns to the recency list, with no selection carried.
      expect(result.current.isEmptyQuery).toBe(true);
      expect(result.current.activeResult).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never exposes an out-of-range active result when the count shrinks", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const search: SearchFn = typedOnly(async (q) => {
        calls += 1;
        return calls === 1
          ? assembleOutcome(q, [
              {
                providerId: "t.search",
                moduleId: "t",
                moduleLabel: "T",
                ok: true,
                items: [
                  {
                    id: "1",
                    title: `${q} one`,
                    entityType: "task",
                    target: { kind: "route", to: "/1" },
                  },
                  {
                    id: "2",
                    title: `${q} two`,
                    entityType: "task",
                    target: { kind: "route", to: "/2" },
                  },
                  {
                    id: "3",
                    title: `${q} three`,
                    entityType: "task",
                    target: { kind: "route", to: "/3" },
                  },
                ],
              },
            ])
          : outcomeWith(q, "Only one");
      });
      const { result } = renderHook(() =>
        useSearchController({ search, debounceMs: 0 }),
      );
      await settleOpeningRequest();
      act(() => result.current.setQuery("aaa"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => result.current.moveEnd()); // select the 3rd (index 2)
      expect(result.current.activeIndex).toBe(2);

      // A shorter result set arrives (1 item) — no stale index 2 leaks.
      act(() => result.current.setQuery("bbb"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.flatResults).toHaveLength(1);
      expect(result.current.activeIndex).toBe(-1);
      expect(result.current.activeResult).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes the record anchor (boostLinkedTo) through to the search transport", async () => {
    // Regression for Codex thread PRRT_kwDOTbatJs6T6Oym: the surface supplies the
    // current record's anchor and the controller must forward it to the transport.
    const search = vi.fn<SearchFn>(async (q) => outcomeWith(q, "X"));
    const { result } = renderHook(() =>
      useSearchController({ search, debounceMs: 0, boostLinkedTo: "note-42" }),
    );
    act(() => result.current.setQuery("hello"));
    await waitFor(() => expect(search).toHaveBeenCalled());
    expect(search).toHaveBeenCalledWith("hello", expect.any(AbortSignal), {
      boostLinkedTo: "note-42",
    });
  });

  it("invokes the transport with just query + signal when no anchor is supplied", async () => {
    const search = vi.fn<SearchFn>(async (q) => outcomeWith(q, "X"));
    const { result } = renderHook(() =>
      useSearchController({ search, debounceMs: 0 }),
    );
    act(() => result.current.setQuery("hello"));
    await waitFor(() => expect(search).toHaveBeenCalled());
    // A plain two-argument call — no trailing options object.
    expect(search.mock.calls[0]).toHaveLength(2);
    expect(search).toHaveBeenCalledWith("hello", expect.any(AbortSignal));
  });
});
