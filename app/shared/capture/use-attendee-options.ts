/**
 * MOBILE-01 — attendee options for Quick Capture, over the shared option search.
 *
 * The capture sheet is a SHELL surface, so it cannot import the Meetings module's
 * hook (the module import boundary, AGENTS.md §9.1) — but it must not fork the
 * behaviour either. It therefore uses the shared `useOptionSearch` pointed at the
 * SAME trusted, workspace-scoped `/meetings/attendee-options` endpoint the
 * Meetings module's own picker queries. One endpoint, one debounce/abort
 * implementation, no second people search.
 */

import { useCallback } from "react";

import { useOptionSearch } from "~/shared/forms/use-option-search";

export function useAttendeeOptions() {
  const buildUrl = useCallback((query: string) => {
    const params = new URLSearchParams();
    if (query) {
      params.set("q", query);
    }
    const suffix = params.toString();
    return suffix
      ? `/meetings/attendee-options?${suffix}`
      : "/meetings/attendee-options";
  }, []);

  return useOptionSearch({ buildUrl });
}
