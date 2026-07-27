/**
 * Shared task-parent search hook.
 *
 * A Task structurally requires exactly one parent — an Area OR a Project. This hook
 * backs the DS-06 `SelectField` parent picker used by BOTH the `/tasks` quick-create
 * form and the MEET-02 meeting follow-up form, querying the bounded, workspace-scoped
 * `/tasks/parent-options?q=` endpoint. It remembers each option's KIND so a submit
 * can send the correct `parentKind`, aborts in-flight searches so a slow earlier
 * response can't clobber a newer one, and retains a previously-known option (incl.
 * the current selection) so its label resolves once it scrolls out of the page.
 *
 * Lives in `~/shared/task-record` (not a module) so it is not a per-module bespoke
 * copy — the Universal-relationship "shared over bespoke" rule (AGENTS.md §9.8).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { SelectOption } from "~/shared/forms/types";

/** The bounded `/tasks/parent-options` JSON option shape (kept local to avoid a
 * shared → module import; the endpoint owns the canonical contract). */
interface TaskParentOption {
  readonly id: string;
  readonly kind: "area" | "project";
  readonly title: string;
  readonly context?: string | null;
}

export interface TaskParentSearch {
  readonly options: readonly SelectOption[];
  readonly loading: boolean;
  readonly search: (query: string) => void;
  readonly kindOf: (id: string) => "area" | "project" | null;
  readonly withSelected: (value: string) => readonly SelectOption[];
}

export function useTaskParentSearch(): TaskParentSearch {
  const [options, setOptions] = useState<readonly SelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const kinds = useRef<Map<string, "area" | "project">>(new Map());
  const known = useRef<Map<string, SelectOption>>(new Map());
  const abort = useRef<AbortController | null>(null);

  const search = useCallback((query: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    void (async () => {
      try {
        const url = new URL("/tasks/parent-options", window.location.origin);
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
          readonly options?: readonly TaskParentOption[];
        };
        if (!Array.isArray(body.options)) {
          setLoading(false);
          return;
        }
        const mapped = body.options.map((option): SelectOption => {
          kinds.current.set(option.id, option.kind);
          const selectOption: SelectOption = {
            value: option.id,
            label: option.title,
            description: option.context ?? undefined,
          };
          known.current.set(option.id, selectOption);
          return selectOption;
        });
        setOptions(mapped);
        setLoading(false);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLoading(false);
        }
      }
    })();
  }, []);

  // Seed the picker with a first, unfiltered page so it is usable before typing.
  useEffect(() => {
    search("");
    return () => abort.current?.abort();
  }, [search]);

  const kindOf = useCallback(
    (id: string): "area" | "project" | null => kinds.current.get(id) ?? null,
    [],
  );

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

  return { options, loading, search, kindOf, withSelected };
}
