/**
 * TODAY-02 — surface a failed Today-card completion.
 *
 * The Today focus card completes optimistically and writes through the shared
 * `/today/task/:id` action via `useFetcher()`. A revalidation reconciles the
 * optimistic override with the server result, but a FAILED completion must not be
 * silent — this hook watches the fetcher's returned outcome and raises a calm error
 * notification (the same DS-10 feedback the Drawer's completion uses), so the owner
 * always learns when a completion did not persist.
 */

import { useEffect } from "react";

import { useFeedback } from "~/shared/feedback";

import type { TaskActionData } from "~/shared/task-record/contract";

export function useCompletionFailureFeedback(
  result: TaskActionData | undefined,
): void {
  const { notifyError } = useFeedback();
  useEffect(() => {
    if (result?.kind === "completion" && result.ok === false) {
      notifyError(
        result.message ?? "That couldn't be saved. Please try again.",
      );
    }
  }, [result, notifyError]);
}
