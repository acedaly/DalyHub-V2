/**
 * MOBILE-01 — the shared server-backed option-search hook.
 *
 * Several surfaces need the same thing: a `SelectField` whose options come from a
 * bounded, workspace-scoped JSON endpoint, debounced while typing, with the
 * in-flight request cancelled when the query changes, and previously-selected
 * options remembered so a chosen value keeps its label after the result set moves
 * on. Before this hook that logic was re-written per module
 * (`use-attendee-search`, `use-task-parent-search`), which is exactly the "bespoke
 * duplicate" AGENTS.md §9.8 calls debt the moment it merges.
 *
 * It is deliberately generic over the ENDPOINT, not over the entity: the caller
 * supplies a function that builds the request URL from the query, and the hook
 * owns the debounce, the abort, the loading flag and the selected-option memory.
 * Server-backed pickers stay server-backed — this hook never fetches a whole
 * collection to filter locally (the performance requirement).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { SelectOption } from "./types";

/** How long typing settles before a request is issued. */
export const OPTION_SEARCH_DEBOUNCE_MS = 180;

export type UseOptionSearchOptions = {
  /** Build the request URL for a (already trimmed) query. */
  readonly buildUrl: (query: string) => string;
  /** Run an initial empty-query search on mount. Defaults to true. */
  readonly searchOnMount?: boolean;
};

export type UseOptionSearchResult = {
  /** True while a request is in flight. */
  readonly loading: boolean;
  /** Run a search (debounced; supersedes any in-flight request). */
  readonly search: (query: string) => void;
  /** The current result options. */
  readonly options: readonly SelectOption[];
  /**
   * The result options plus any previously-seen option for the given selected
   * id(s), so a selection keeps its human label once the query moves on.
   */
  readonly withSelected: (
    selected: string | readonly string[],
  ) => readonly SelectOption[];
};

/** Normalise the `withSelected` argument to a list of ids. */
function toIds(selected: string | readonly string[]): readonly string[] {
  if (typeof selected === "string") {
    return selected.length > 0 ? [selected] : [];
  }
  return selected;
}

export function useOptionSearch({
  buildUrl,
  searchOnMount = true,
}: UseOptionSearchOptions): UseOptionSearchResult {
  const [options, setOptions] = useState<readonly SelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  // Every option ever seen, so a selected value never degrades to a raw id.
  const seenRef = useRef(new Map<string, SelectOption>());
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hold the latest builder in a ref so an inline arrow at the call site does not
  // restart the search on every render.
  const buildUrlRef = useRef(buildUrl);
  buildUrlRef.current = buildUrl;

  const search = useCallback((query: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    timerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(buildUrlRef.current(query.trim()), {
            signal: controller.signal,
            headers: { accept: "application/json" },
          });
          if (!response.ok) {
            throw new Error("Option search failed");
          }
          const data = (await response.json()) as {
            readonly options?: readonly SelectOption[];
          };
          const next = data.options ?? [];
          for (const option of next) {
            seenRef.current.set(option.value, option);
          }
          setOptions(next);
        } catch (error) {
          if ((error as { name?: string }).name !== "AbortError") {
            setOptions([]);
          }
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      })();
    }, OPTION_SEARCH_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (searchOnMount) {
      search("");
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      abortRef.current?.abort();
    };
  }, [search, searchOnMount]);

  const withSelected = useCallback(
    (selected: string | readonly string[]): readonly SelectOption[] => {
      const merged = new Map<string, SelectOption>();
      for (const id of toIds(selected)) {
        const known = seenRef.current.get(id);
        merged.set(id, known ?? { value: id, label: id });
      }
      for (const option of options) {
        merged.set(option.value, option);
      }
      return [...merged.values()];
    },
    [options],
  );

  return { loading, search, options, withSelected };
}
