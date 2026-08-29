/**
 * DS-08 Shared Search — the incremental search controller (React).
 *
 * Deterministic incremental search with no arbitrary timeouts:
 *
 *   - a restrained debounce coalesces keystrokes into at most one in-flight
 *     request per pause;
 *   - each new request aborts the previous one and carries a monotonic sequence
 *     number, so a slower earlier response can NEVER replace a newer one (the
 *     sequence guard is authoritative; the abort is best-effort cleanup);
 *   - an EMPTY query is a real request, not a dead end (FIND-01): it asks the
 *     server for the workspace's recently worked-on records, which arrive as an
 *     ordinary `SearchOutcome` and move through the same selection, activation
 *     and aria machinery as any other result. It still executes NO provider —
 *     that decision belongs to the server, which answers an empty query from the
 *     recency read instead;
 *   - loading keeps valid prior results visible rather than flashing empty;
 *   - a partial provider failure still shows healthy results;
 *   - clearing the query cancels pending work; nothing updates state after unmount;
 *   - no raw error text is ever surfaced.
 *
 * The `search` function is injected (default: the server transport), so the demo
 * route and component tests drive the exact same controller with a local function.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { fetchSearch, type SearchFn } from "./client";
import { flattenGroups } from "./grouping";
import { firstIndex, lastIndex, nextIndex, previousIndex } from "./selection";
import { isExecutableQuery, normaliseQuery } from "./query";
import type {
  RankedSearchResult,
  SearchOutcome,
  SearchResultGroup,
} from "./types";

/** The restrained debounce before a query is dispatched (ms). */
export const SEARCH_DEBOUNCE_MS = 160;

export type SearchPhase = "idle" | "loading" | "ready" | "error";

type State = {
  readonly query: string;
  readonly phase: SearchPhase;
  readonly outcome: SearchOutcome | null;
  readonly activeIndex: number;
};

type Action =
  | { readonly type: "setQuery"; readonly query: string }
  | { readonly type: "idle" }
  | { readonly type: "loading" }
  | { readonly type: "resolved"; readonly outcome: SearchOutcome }
  | { readonly type: "error" }
  | { readonly type: "move"; readonly index: number };

const INITIAL: State = {
  query: "",
  phase: "idle",
  outcome: null,
  activeIndex: -1,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "setQuery":
      return { ...state, query: action.query };
    case "idle":
      return { ...state, phase: "idle", outcome: null, activeIndex: -1 };
    case "loading":
      // Keep the previous outcome visible while loading, but CLEAR the active
      // selection: those results are stale relative to the new input and must not
      // stay actionable (pressing Enter during the debounce must not open a result
      // from the previous query).
      return { ...state, phase: "loading", activeIndex: -1 };
    case "resolved":
      return {
        ...state,
        phase: action.outcome.status === "error" ? "error" : "ready",
        outcome: action.outcome,
        activeIndex: -1,
      };
    case "error":
      return { ...state, phase: "error" };
    case "move":
      return { ...state, activeIndex: action.index };
    default:
      return state;
  }
}

export type SearchController = {
  readonly query: string;
  readonly phase: SearchPhase;
  readonly outcome: SearchOutcome | null;
  readonly groups: readonly SearchResultGroup[];
  readonly flatResults: readonly RankedSearchResult[];
  readonly activeIndex: number;
  readonly activeResult: RankedSearchResult | null;
  readonly isEmpty: boolean;
  /**
   * FIND-01 — true when the input is empty, so the displayed results (if any)
   * are the RECENCY list rather than matches. The surface reads this to head
   * the list and to word its empty state: "nothing recent yet" and "nothing
   * matched <query>" are different facts and must not share a sentence.
   */
  readonly isEmptyQuery: boolean;
  readonly isPartial: boolean;
  readonly hasResults: boolean;
  /**
   * True only when the displayed results correspond to the CURRENT input (phase
   * `ready`). While a new query loads, prior results may stay visible but are NOT
   * current — the surface must not activate them (keyboard or pointer).
   */
  readonly resultsAreCurrent: boolean;
  setQuery(next: string): void;
  clear(): void;
  retry(): void;
  moveDown(): void;
  moveUp(): void;
  moveHome(): void;
  moveEnd(): void;
  setActiveIndex(index: number): void;
};

export type UseSearchControllerOptions = {
  /** The search function (default: the server transport). */
  readonly search?: SearchFn;
  /** Debounce in ms (default {@link SEARCH_DEBOUNCE_MS}). */
  readonly debounceMs?: number;
  /**
   * The anchor entity id of the record the search is opened from, if any. Carried
   * through to the transport so the server boosts that record's directly-linked
   * entities. Read at request time (a ref), so navigating between records updates
   * it without re-running the current query.
   */
  readonly boostLinkedTo?: string;
};

export function useSearchController(
  options: UseSearchControllerOptions = {},
): SearchController {
  const { search = fetchSearch, debounceMs = SEARCH_DEBOUNCE_MS } = options;

  const [state, dispatch] = useReducer(reducer, INITIAL);

  const mountedRef = useRef(true);
  // One authoritative generation. Every meaningful input change reserves a new
  // generation (and aborts the in-flight request) IMMEDIATELY — not when the
  // debounce fires — so a request for a stale query can never update state after
  // the input has moved on. Only the request whose captured generation still
  // equals `generationRef` may resolve.
  const generationRef = useRef(0);
  const currentQueryRef = useRef(""); // normalised query of the current generation
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchRef = useRef<SearchFn>(search);
  searchRef.current = search;
  // The record anchor is read at request time so a navigation that changes it does
  // not itself re-run the in-flight query (only a query change dispatches a run).
  const boostLinkedToRef = useRef<string | undefined>(options.boostLinkedTo);
  boostLinkedToRef.current = options.boostLinkedTo;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Abort any in-flight request and advance the generation. Returns the new
  // generation the next request must carry.
  const invalidateInFlight = useCallback((): number => {
    if (abortRef.current !== null) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    generationRef.current += 1;
    return generationRef.current;
  }, []);

  // Dispatch the request for an already-reserved generation. Assumes the phase is
  // already `loading` (set at reservation) and the query is executable.
  const run = useCallback((normalised: string, generation: number) => {
    const controller = new AbortController();
    abortRef.current = controller;

    const boostLinkedTo = boostLinkedToRef.current;
    // Pass the options object ONLY when there is a record anchor, so the common
    // (unboosted) call stays a plain two-argument invocation.
    const request = boostLinkedTo
      ? searchRef.current(normalised, controller.signal, { boostLinkedTo })
      : searchRef.current(normalised, controller.signal);
    request.then(
      (outcome) => {
        if (!mountedRef.current || generation !== generationRef.current) {
          return; // stale generation or unmounted — never replace newer results
        }
        dispatch({ type: "resolved", outcome });
      },
      () => {
        if (controller.signal.aborted) {
          return; // superseded/cleared — an aborted request is never an error
        }
        if (!mountedRef.current || generation !== generationRef.current) {
          return;
        }
        dispatch({ type: "error" });
      },
    );
  }, []);

  const setQuery = useCallback(
    (next: string) => {
      dispatch({ type: "setQuery", query: next });

      const normalised = normaliseQuery(next);

      // No meaningful change (e.g. trailing whitespace) while the same query is
      // already reserved/in-flight — keep the existing request/debounce.
      if (
        normalised === currentQueryRef.current &&
        (abortRef.current !== null || timerRef.current !== null)
      ) {
        return;
      }

      // Meaningful change: invalidate the in-flight request NOW, keep prior
      // results visible as stale-loading, then debounce a fresh request under the
      // reserved generation.
      clearTimer();
      const generation = invalidateInFlight();
      currentQueryRef.current = normalised;
      dispatch({ type: "loading" });
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        run(normalised, generation);
      }, debounceMs);
    },
    [clearTimer, debounceMs, invalidateInFlight, run],
  );

  const clear = useCallback(() => {
    // Clearing returns to the recency list, not to a dead idle state — the
    // whole point of FIND-01 is that an empty Search still has something to
    // open, and emptying the input is the commonest way to reach it.
    setQuery("");
  }, [setQuery]);

  const retry = useCallback(() => {
    // An empty query is retryable too: its failure mode is the recency read's,
    // and "Try again" must mean the same thing on both.
    const normalised = normaliseQuery(state.query);
    clearTimer();
    const generation = invalidateInFlight(); // invalidate any previous request
    currentQueryRef.current = normalised;
    dispatch({ type: "loading" });
    run(normalised, generation);
  }, [clearTimer, invalidateInFlight, run, state.query]);

  /*
   * FIND-01 — ask for the recency list as soon as Search opens.
   *
   * Immediately rather than through the debounce: the debounce exists to
   * coalesce KEYSTROKES, and there are none here. `AGENTS.md` §16 budgets
   * Search's local results at 50 ms, and spending 160 ms of it waiting for a
   * timer that is protecting against nothing would be the surface feeling slow
   * for a reason invented in this file.
   *
   * It lives in the SAME effect as the mounted flag, after it, and it is
   * deliberately NOT guarded by a "did this already run" ref. Under React's
   * development double-invoke the guard is a deadlock rather than an
   * optimisation: the first pass fires the request, the cleanup aborts it and
   * marks the hook unmounted, and a ref-guarded second pass then declines to
   * ask again — leaving the surface saying "Searching…" forever, which is
   * exactly what it did before this comment existed. Re-running is correct and
   * costs one extra read in development only.
   *
   * Every LATER empty query — clearing the input, deleting the last character —
   * arrives through `setQuery` and is debounced normally, because those are
   * keystrokes.
   */
  useEffect(() => {
    mountedRef.current = true;

    const generation = invalidateInFlight();
    currentQueryRef.current = "";
    dispatch({ type: "loading" });
    run("", generation);

    return () => {
      mountedRef.current = false;
      clearTimer();
      if (abortRef.current !== null) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [clearTimer, invalidateInFlight, run]);

  const outcome = state.outcome;
  const groups = useMemo(() => outcome?.groups ?? [], [outcome]);
  const flatResults = useMemo(() => flattenGroups(groups), [groups]);
  const count = flatResults.length;

  const move = useCallback(
    (index: number) => dispatch({ type: "move", index }),
    [],
  );

  // Results are "current" only in the ready phase and only when the displayed
  // outcome corresponds to the current normalised input. While loading, prior
  // results may be visible but are stale — never activatable.
  const resultsAreCurrent =
    state.phase === "ready" &&
    outcome !== null &&
    outcome.query === normaliseQuery(state.query);

  const activeResult =
    resultsAreCurrent && state.activeIndex >= 0 && state.activeIndex < count
      ? flatResults[state.activeIndex]
      : null;

  return {
    query: state.query,
    phase: state.phase,
    outcome,
    groups,
    flatResults,
    activeIndex: resultsAreCurrent ? state.activeIndex : -1,
    activeResult,
    resultsAreCurrent,
    isEmpty: state.phase === "ready" && count === 0,
    isEmptyQuery: !isExecutableQuery(normaliseQuery(state.query)),
    isPartial: outcome?.status === "partial",
    hasResults: count > 0,
    setQuery,
    clear,
    retry,
    moveDown: () => move(nextIndex(state.activeIndex, count)),
    moveUp: () => move(previousIndex(state.activeIndex, count)),
    moveHome: () => move(firstIndex(count)),
    moveEnd: () => move(lastIndex(count)),
    setActiveIndex: (index: number) => move(index),
  };
}
