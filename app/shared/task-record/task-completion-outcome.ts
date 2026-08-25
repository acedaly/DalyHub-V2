/**
 * DEBT-89 — what the canonical Task-completion route actually SAID.
 *
 * `POST /tasks/:taskId` with `intent=complete` genuinely refuses a completion.
 * An archived Project (`TaskProjectArchivedError` / `SpineParentUnavailableError`),
 * a Task deleted in another tab, any storage failure — each comes back as
 * `{ kind: "completion", ok: false, message }` or as a 404 body, with a 200-ish
 * fetcher settling either way. Announcing "Task completed." for every settled
 * response tells the owner, and a screen reader through a `role="status"`
 * region, that work finished when it did not.
 *
 * ── Why this is SHARED rather than a second copy ────────────────────────────
 * It was written for the guided weekly Review's Inbox step, because an automated
 * review of #117 caught the defect there. The TASKS-04 Review Inbox had the same
 * defect and kept it, because a feature PR is the wrong place for a drive-by fix
 * in another module (AGENTS.md §13) — and the architecturally correct home was
 * never the Reviews module anyway: this is a fact about the TASK route's answer,
 * so it belongs beside the other shared Task-record contracts, where a third
 * surface completing a Task from a queue can reach it without importing a
 * module-private view-model.
 *
 * Pure and outside React, so the decision is unit-tested directly rather than
 * through a fetcher — and so the ANNOUNCEMENT can never drift from the VISIBLE
 * message, because both come from this one value.
 */

export interface TaskCompletionOutcome {
  readonly ok: boolean;
  /** The sentence to show AND announce. Never a storage detail. */
  readonly message: string;
}

/** The message shown when the route refused but said nothing useful. */
export const TASK_COMPLETION_FALLBACK_ERROR =
  "That task couldn’t be completed. Please try again.";

/** What the route said, as one value both the toast and the live region read. */
export function taskCompletionOutcome(data: unknown): TaskCompletionOutcome {
  const result = (data ?? {}) as {
    readonly ok?: unknown;
    readonly message?: unknown;
    readonly formError?: unknown;
  };
  if (result.ok === false) {
    const message =
      typeof result.message === "string" && result.message.length > 0
        ? result.message
        : typeof result.formError === "string" && result.formError.length > 0
          ? result.formError
          : TASK_COMPLETION_FALLBACK_ERROR;
    return { ok: false, message };
  }
  return { ok: true, message: "Task completed." };
}
