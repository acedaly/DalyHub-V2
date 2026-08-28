/**
 * PROJ-01 / PROJ-05 — the shared "Area or Goal" server-backed search hook.
 *
 * The set of eligible parents (every active Area and Goal in the workspace) can
 * exceed any static bound, so both the New-Project create form AND the Project
 * Settings "Area or Goal" (organisation) picker query the SAME bounded
 * `/projects/parent-options?q=` endpoint rather than each growing its own search
 * plumbing. In-flight searches are aborted so a slower earlier response can never
 * clobber a newer one; a previously-known option (including the current
 * selection) is retained so its label always resolves even once it scrolls out of
 * the current result page.
 */

import { useCallback, useRef, useState } from "react";

import type { SelectOption } from "~/shared/forms/types";

export interface ParentOptionsSearch {
  readonly options: readonly SelectOption[];
  readonly loading: boolean;
  readonly onSearch: (query: string) => void;
  /** The shown options with `value`'s known option merged in, so its label
   * always resolves even when it has scrolled out of the current result page. */
  readonly withSelected: (value: string) => readonly SelectOption[];
}

export function useParentOptionsSearch(
  seed: readonly SelectOption[],
): ParentOptionsSearch {
  const [options, setOptions] = useState<readonly SelectOption[]>(seed);
  const [loading, setLoading] = useState(false);
  const known = useRef<Map<string, SelectOption>>(
    new Map(seed.map((option) => [option.value, option])),
  );
  const abort = useRef<AbortController | null>(null);

  const onSearch = useCallback((query: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    void (async () => {
      try {
        const url = new URL("/projects/parent-options", window.location.origin);
        url.searchParams.set("q", query);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) {
          setLoading(false);
          return;
        }
        const body = (await response.json()) as {
          readonly options?: readonly SelectOption[];
        };
        if (!Array.isArray(body.options)) {
          setLoading(false);
          return;
        }
        for (const option of body.options) {
          known.current.set(option.value, option);
        }
        setOptions(body.options);
        setLoading(false);
      } catch (error) {
        // An aborted request is expected when the user keeps typing — ignore it.
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLoading(false);
        }
      }
    })();
  }, []);

  const withSelected = useCallback(
    (value: string): readonly SelectOption[] => {
      if (value.length === 0 || options.some((o) => o.value === value)) {
        return options;
      }
      const selected = known.current.get(value);
      return selected ? [selected, ...options] : options;
    },
    [options],
  );

  return { options, loading, onSearch, withSelected };
}
