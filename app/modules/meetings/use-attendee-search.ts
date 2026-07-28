import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SelectOption } from "~/shared/forms/types";

export function useAttendeeSearch(options?: {
  readonly meetingId?: string;
  readonly excludeIds?: readonly string[];
}) {
  const [results, setResults] = useState<readonly SelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<
    ReadonlyMap<string, SelectOption>
  >(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const excludeKey = useMemo(
    () => (options?.excludeIds ?? []).slice().sort().join(","),
    [options?.excludeIds],
  );
  const excludeIds = useMemo(
    () => (excludeKey ? excludeKey.split(",").filter(Boolean) : []),
    [excludeKey],
  );

  const runSearch = useCallback(
    (query: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      timeoutRef.current = setTimeout(() => {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (options?.meetingId) params.set("meetingId", options.meetingId);
        for (const id of excludeIds) params.append("exclude", id);
        void fetch(`/meetings/attendee-options?${params.toString()}`, {
          signal: controller.signal,
        })
          .then((response) => {
            if (!response.ok) throw new Error("Attendee search failed");
            return response.json() as Promise<{
              readonly options: readonly SelectOption[];
            }>;
          })
          .then((data) => {
            setResults(data.options);
          })
          .catch((error: unknown) => {
            if ((error as { name?: string }).name !== "AbortError") {
              setResults([]);
            }
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      }, 180);
    },
    [excludeIds, options?.meetingId],
  );

  useEffect(() => {
    runSearch("");
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      abortRef.current?.abort();
    };
  }, [runSearch]);

  const optionsWithSelected = useCallback(
    (ids: readonly string[]) => {
      const byId = new Map(selectedOptions);
      for (const option of results) byId.set(option.value, option);
      return [
        ...ids
          .filter((id) => !byId.has(id))
          .map((id) => ({ value: id, label: id })),
        ...byId.values(),
      ];
    },
    [results, selectedOptions],
  );

  const rememberSelected = useCallback(
    (ids: readonly string[]) => {
      setSelectedOptions((prev) => {
        const next = new Map(prev);
        for (const option of results) {
          if (ids.includes(option.value)) next.set(option.value, option);
        }
        return next;
      });
    },
    [results],
  );

  return {
    loading,
    search: runSearch,
    optionsWithSelected,
    rememberSelected,
  };
}
