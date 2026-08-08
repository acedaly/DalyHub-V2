/**
 * MEET-02 / AUDIT-13 — the Meeting follow-up / Task-conversion entry points.
 *
 * Homed in `app/platform` rather than the Meetings module since AI-02, so the AI
 * acceptance path can route through this ONE conversion authority without
 * breaching the module-boundary rule. See `./index.ts` for that reasoning.
 *
 * ── What changed in AUDIT-13 ─────────────────────────────────────────────────
 *
 * This module used to BE the orchestration: it called `createTask`, then up to two
 * `updateTask`s, then `linkFollowUpTask`, then `entityLinks.create` — five
 * transactions — with a compensating `spine.softDelete` if anything after the
 * first failed. Compensation narrowed the failure window and could not close it:
 * a process death between the Task committing and the mapping committing left a
 * Task with no mapping, invisible to the Follow-up surface, so a retry created a
 * SECOND Task. That is the August 2026 audit's AUDIT-13 finding.
 *
 * The conversion is now ONE storage transaction, owned by
 * `scope.meetingTaskConversions` (`MeetingTaskConversionRepository`). Everything
 * that made this file an orchestrator — the commit point, the compensation, the
 * post-commit link, the conflict recovery — moved into that repository, where it
 * is expressed as statement ordering and database constraints rather than as
 * application-level bookkeeping. What is left here is the two THIN entry points
 * modules call, plus the one genuine piece of domain logic that is not storage:
 * deciding which meeting item an AI proposal converts.
 */

import {
  MeetingArchivedError,
  MeetingItemNotFoundError,
  MeetingNotFoundError,
  type MeetingTaskConversionResult,
  type MeetingTaskFields,
} from "~/kernel/meetings";
import type { WorkspaceScope } from "~/platform/workspaces";

/**
 * The Task planning fields a conversion/follow-up form may supply. An alias of the
 * kernel's `MeetingTaskFields` so existing importers are unaffected; the shape now
 * lives beside the conversion contract it feeds.
 */
export type FollowUpTaskFields = MeetingTaskFields;

/** An alias of the kernel conversion result, for the same reason. */
export type ConvertResult = MeetingTaskConversionResult;

/**
 * MEET-03 moved these to the kernel (`~/kernel/meetings`), beside the repository
 * contract that also throws them, so the module orchestration and the repository
 * share ONE error family rather than two identically-named ones that could drift.
 * Re-exported here so existing importers are unaffected.
 */
export { MeetingArchivedError, MeetingItemNotFoundError, MeetingNotFoundError };

/**
 * Convert a specific agenda item / decision / outcome into a Task.
 *
 * Atomic, idempotent per source item, and safe against concurrent
 * double-conversion — see `MeetingTaskConversionRepository`, which owns all three
 * guarantees. This function exists so callers keep naming the operation rather
 * than the repository.
 */
export async function convertMeetingItemToTask(
  scope: WorkspaceScope,
  meetingId: string,
  itemId: string,
  fields: FollowUpTaskFields,
): Promise<ConvertResult> {
  return scope.meetingTaskConversions.convert({
    meetingId,
    itemId,
    task: fields,
  });
}

/**
 * AI-02 / DEBT-90 — convert an owner-approved PROPOSED follow-up into a Task
 * through this same authority.
 *
 * An AI proposal has no `meeting_items` row behind it: DalyHub read the meeting's
 * agenda, notes and items as evidence, and the model wrote a title. So before the
 * conversion can happen there must be an action item to convert, and this is the
 * one place that decides which:
 *
 *   - **Reuse** an existing `action` item whose body is exactly the approved
 *     text. That is the case where the owner had already written the action down
 *     and the model proposed the same thing — converting the item they already
 *     have is right, and creating a second identical one would be wrong.
 *   - **Create** one otherwise, through the ordinary `addItem` contract, so the
 *     Meeting durably records the action exactly as a hand-typed one would.
 *
 * Reuse is also what makes ACCEPTANCE idempotent, and it is idempotent through
 * the integrity constraints rather than around them: a replay finds the item the
 * first acceptance created, the conversion finds its live mapping, and the SAME
 * Task comes back with `created: false`. No uniqueness error is caught and
 * ignored anywhere on this path.
 *
 * Comparison is on the exact trimmed body. Two proposals whose text differs are
 * two different actions, and DalyHub does not fuzzy-match the owner's words.
 *
 * **The one write that is deliberately NOT inside the conversion's transaction**
 * is `addItem`. Recording an action the owner approved is a legitimate change to
 * the Meeting in its own right — `addItem` is atomic, has its own ordinal-conflict
 * retry, and an item that exists without a Task is a state the Meetings module
 * already models and shows. If the conversion then fails, the owner sees the
 * action on the meeting and no Task, and a retry REUSES that item rather than
 * adding a second: there is no duplicate and nothing is silently lost.
 */
export async function convertMeetingProposalToTask(
  scope: WorkspaceScope,
  meetingId: string,
  input: {
    /** The action item's body — the owner's approved Task title. */
    readonly itemBody: string;
    readonly fields: FollowUpTaskFields;
  },
): Promise<ConvertResult> {
  // Read (and lifecycle-check) the meeting BEFORE writing an item to it. A
  // meeting archived or deleted since the proposal was generated refuses here,
  // so no item is added to a record that cannot accept one.
  const meeting = await scope.meetings.get(meetingId);
  if (!meeting) throw new MeetingNotFoundError();
  if (meeting.archivedAt) {
    throw new MeetingArchivedError(
      "This meeting is archived — restore it to create follow-up tasks.",
    );
  }
  const body = input.itemBody.trim();

  const existing = meeting.items.find(
    (item) => item.kind === "action" && item.bodyMarkdown.trim() === body,
  );
  const item =
    existing ?? (await scope.meetings.addItem(meetingId, "action", body));

  return convertMeetingItemToTask(scope, meetingId, item.id, input.fields);
}

/** Create a Task that is a direct meeting follow-up (not tied to a specific item). */
export async function createMeetingFollowUpTask(
  scope: WorkspaceScope,
  meetingId: string,
  fields: FollowUpTaskFields,
): Promise<ConvertResult> {
  return scope.meetingTaskConversions.convert({
    meetingId,
    itemId: null,
    task: fields,
  });
}
