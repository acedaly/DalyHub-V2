/**
 * V2.15 ASSIST-02 — "Draft a follow-up" on an overdue commitment.
 *
 * ## What a follow-up IS in DalyHub, and what it is not
 *
 * It is a **Task**, linked to the obligation, created through the same three
 * writes the existing "Track as task" control performs. It is not an email, an
 * SMS, a message, a calendar event or an API call: V2.15 sends nothing to
 * anybody, and there is no code path here that could.
 *
 * That is why the proposal kind is `obligation_task` rather than `obligation`.
 * A kind names the MUTATION, and the mutation is a Task creation plus an
 * obligation pointer — nothing about the obligation record itself is proposed,
 * and the V2.9 sketch's `obligation` kind would have named the source instead.
 *
 * ## It appears only where it makes sense
 *
 * Overdue, open, and not already tracked as a Task. A commitment that is
 * completed, dismissed, on hold or not yet due has no follow-up to draft, and
 * one that already has an open Task has somewhere for the work to go — the
 * server refuses all four cases anyway, and this simply does not offer them.
 */

import {
  AiAssistSurface,
  asFollowUp,
  asFollowUpContext,
  followUpItem,
  followUpRows,
  type AiSurfaceAvailabilityGate,
  type ProposalRowDraft,
} from "~/shared/ai";
import type { SerializedObligation } from "~/shared/obligations";

export interface ObligationFollowUpProps {
  readonly obligation: SerializedObligation;
  readonly availability: AiSurfaceAvailabilityGate;
}

/**
 * True when drafting a follow-up is a sensible thing to offer.
 *
 * The same conditions the server applies before it will build a fact block,
 * restated here so a control the owner cannot use is never shown. The server
 * remains the authority — this is courtesy, not enforcement.
 *
 * `taskId === null`, NOT `!taskOpen`. They differ in exactly the case that
 * matters: an obligation whose linked Task has been COMPLETED reports
 * `taskOpen: false` while still pointing at that Task. Offering the control
 * there would have spent a real provider request on a proposal
 * `applyObligationTask` refuses by construction — it will not move a pointer
 * off an existing Task, because doing so would orphan work the owner can no
 * longer reach from the commitment it is about. A charged request that can
 * never be accepted is worse than an absent control.
 */
export function canDraftFollowUp(obligation: SerializedObligation): boolean {
  return (
    obligation.status === "open" &&
    obligation.state === "overdue" &&
    obligation.dueDate !== null &&
    obligation.taskId === null
  );
}

export function ObligationFollowUp({
  obligation,
  availability,
}: ObligationFollowUpProps) {
  if (!canDraftFollowUp(obligation)) return null;

  return (
    <section
      className="dh-obligation-followup"
      aria-label="Draft a follow-up"
      data-testid="obligation-ai-followup"
    >
      <AiAssistSurface
        feature="obligation-follow-up"
        scopeKey={obligation.id}
        request={{ recordId: obligation.id }}
        availability={availability}
        startLabel="Draft a follow-up"
        applyLabel="Add selected"
        reviewTitle="Suggested next actions"
        disclosure="What this commitment is, when it was due, how far past due it is, and whether a Task is already open for it — will be sent to your configured AI provider. Nothing is sent to anybody else, and DalyHub cannot contact anyone on your behalf."
        toRows={({ result }) => {
          const answer = asFollowUp(result.result);
          const context = asFollowUpContext(result.proposal);
          if (answer === null || context === null) return [];
          return followUpRows(answer, context);
        }}
        /*
         * A context that did not parse cannot name an obligation, and
         * `followUpItem` answers that case with an incomplete item the server
         * refuses. Guessing an id from the page would be the browser choosing a
         * mutation target, which the apply path does not permit.
         */
        toItem={(row: ProposalRowDraft, state) =>
          followUpItem(row, asFollowUpContext(state.proposal))
        }
      />
    </section>
  );
}
