/**
 * MEET-02 — the Meeting follow-up / Task-conversion orchestration, as a PLATFORM
 * service.
 *
 * It lived in `app/modules/meetings/` until AI-02, and moved here for the reason
 * the architecture already has a precedent for (ADR-033, and AREA-02's shared
 * `NewGoalForm`): a second module needs it. The AI module's acceptance path must
 * route a Meeting-derived Task through THIS conversion authority and no other
 * (DEBT-90), and the module-boundary rule — a module may import kernel contracts
 * and its own internals, never another module's files — correctly forbids
 * `app/modules/ai` from reaching into `app/modules/meetings`.
 *
 * The alternatives were both worse. Duplicating the orchestration would create
 * exactly the second conversion path the single-authority rule exists to
 * prevent; leaving it in Meetings and importing it anyway would evade a
 * load-bearing architecture test rather than satisfy it.
 *
 * Nothing about the orchestration itself changed in the move: it is
 * server-side cross-repository orchestration over the Meetings, Tasks, Spine and
 * EntityLink contracts, which is what `app/platform` is for — the same shape as
 * `app/platform/capture/capture-context.server.ts`. The Meetings module's own
 * follow-up route imports it from here unchanged.
 */

export {
  MeetingArchivedError,
  MeetingItemNotFoundError,
  MeetingNotFoundError,
  convertMeetingItemToTask,
  convertMeetingProposalToTask,
  createMeetingFollowUpTask,
  type ConvertResult,
  type FollowUpTaskFields,
} from "./follow-up-operations";
