/**
 * V2.10 LIFE-02 — the client half of the subject search.
 *
 * One function, so every surface that offers "what is this about?" asks the same
 * bounded, workspace-scoped, accessible-only search. It calls the module's own
 * resource route, which delegates to `searchLinkTargets` — the SAME search the
 * link picker uses — so the two can never disagree about which records exist.
 */

import type { ObligationSubjectOption } from "~/shared/obligations";

export async function searchSubjectOptions(
  query: string,
  signal: AbortSignal,
): Promise<readonly ObligationSubjectOption[]> {
  const response = await fetch(
    `/obligations/subjects?q=${encodeURIComponent(query)}`,
    { signal },
  );
  if (!response.ok) return [];
  const data = (await response.json()) as {
    readonly options?: readonly ObligationSubjectOption[];
  };
  return data.options ?? [];
}
