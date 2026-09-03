/**
 * TODAY-03 — the Waiting collection view-model (pure, React-free, testable).
 *
 * What is left of it after V2.8 CONV-02, and why. The Waiting rows are the
 * shared `TaskRow` now (ADR-115 decision 2): the list item is the shared
 * `SerializedTaskListItem`, the waiting subject, "since · elapsed" and the
 * follow-up state are the row's own optional fact built by the shared
 * `taskRowWaitingFact` and formatted by the canonical helpers in
 * `~/shared/task-record/task-view`, and the due/overdue words are the row's
 * date column. The Card-shaped derivations this file used to own
 * (`WaitingCardData`, `toWaitingCardData`, the preview shape) went with the
 * Card, so no second waiting formatter survives anywhere.
 *
 * What is genuinely the SURFACE's — and stays here, away from the route's
 * `cloudflare:workers` import so it can be unit-tested directly — is the one
 * sentence the surface states about its own population.
 */

import type { TaskFollowUpState } from "~/kernel/tasks";

/** How each follow-up state describes the population it narrows a page to. */
const FOLLOW_UP_SUBTITLES: Record<TaskFollowUpState, string> = {
  due: "with a follow-up due",
  due_today: "with a follow-up due today",
  overdue: "with an overdue follow-up",
  upcoming: "with a follow-up still to come",
  none: "with no follow-up date",
};

/**
 * V2.7 RECALL-03 — the Waiting subtitle, which may only ever state a number the
 * surface can actually show (DEBT-232).
 *
 * This is the whole of that debt. The old line read
 * "`${count} tasks are waiting…`" over a page capped at 100, so a workspace with
 * 150 waiting Tasks was told it had 100 — the truncated bound presented as the
 * population, on the surface whose entire job is "what am I waiting on".
 *
 * It now counts what is LOADED and says so while more remain: true after the
 * first page, true after each "Load more", and true once the collection is
 * exhausted — without a second COUNT query to keep in step with the list. It
 * lives here, beside the surface's own words and away from the route's
 * `cloudflare:workers` import, so it can be unit-tested directly.
 */
export function waitingSubtitle(input: {
  /** How many rows the surface is actually showing. */
  readonly loaded: number;
  /** Whether a further page exists behind the cursor. */
  readonly hasMore: boolean;
  /** The follow-up filter narrowing the page, or null. */
  readonly followUp: TaskFollowUpState | null;
  readonly failed: boolean;
}): string {
  if (input.failed) return "We couldn’t load your waiting tasks.";
  const qualifier =
    input.followUp === null ? "" : ` ${FOLLOW_UP_SUBTITLES[input.followUp]}`;
  if (input.hasMore) {
    return `Showing the first ${input.loaded} waiting tasks${qualifier} — load more to see the rest.`;
  }
  if (input.loaded === 1) {
    return `1 task is waiting on someone or something else${qualifier}.`;
  }
  return `${input.loaded} tasks are waiting on someone or something else${qualifier}.`;
}
