/**
 * V2.15 ASSIST-02 — "Draft this reflection", inside the guided Weekly Review.
 *
 * ## The distinction from V2.14, in one line each
 *
 * V2.14's Weekly Review assistant says *here is what stands out*. This says
 * *here is a draft you may choose to put into your reflection*. The FACTS are
 * identical — the same block, built by the same builder, because a period's
 * facts do not change because the ask did — and what differs is that this one's
 * output can become the owner's own writing.
 *
 * ## Which is why it carries the strongest guard in V2.15
 *
 * The draft is generated against a specific version of the section. Accepting
 * it sends that version back, and REVIEW-02's existing optimistic concurrency
 * refuses the write if the owner has typed since. There is no force, no merge
 * and no "are you sure": the owner's writing wins, and they are told why.
 *
 * Undo restores the exact prior text under the same guard, so an undo cannot
 * eat writing that came after the thing it is undoing either.
 */

import {
  AiAssistSurface,
  asReflection,
  asReflectionContext,
  reflectionItem,
  reflectionRows,
  type AiSurfaceAvailabilityGate,
  type ProposalRowDraft,
} from "~/shared/ai";

export interface ReviewReflectionDraftProps {
  readonly reviewId: string;
  /** The section the draft would be written into. */
  readonly sectionId: string;
  /** The prompt's own label, so the row names what it would replace. */
  readonly sectionLabel: string;
  readonly availability: AiSurfaceAvailabilityGate;
  /** True when the Review is completed or archived. */
  readonly readOnly: boolean;
}

export function ReviewReflectionDraft({
  reviewId,
  sectionId,
  sectionLabel,
  availability,
  readOnly,
}: ReviewReflectionDraftProps) {
  return (
    <section
      className="dh-review-reflection-draft"
      aria-label="Draft this reflection"
      data-testid="review-ai-draft"
    >
      <AiAssistSurface
        feature="review-reflection-draft"
        scopeKey={`${reviewId}:${sectionId}`}
        request={{ recordId: reviewId, sectionId }}
        availability={availability}
        startLabel="Draft this reflection"
        applyLabel="Use this draft"
        reviewTitle="Suggested reflection"
        disclosure="This period's own figures — the ones already shown in this Review — will be sent to your configured AI provider. Your existing writing is not sent."
        readOnly={readOnly}
        readOnlyMessage="This Review is finished, so nothing can be written into it."
        toRows={({ result }) => {
          const answer = asReflection(result.result);
          const context = asReflectionContext(result.proposal);
          if (answer === null || context === null) return [];
          return reflectionRows(answer, context, sectionLabel);
        }}
        /*
         * `expectedUpdatedAt` comes from the CONTEXT — the version the draft
         * was generated against — and never from anything the browser has seen
         * since. Recomputing it from a fresher read would be the client quietly
         * telling the server "no, nothing has changed", which is the one thing
         * the guard exists to stop it saying.
         */
        toItem={(row: ProposalRowDraft, state) =>
          reflectionItem(asReflectionContext(state.proposal), row.draftText)
        }
      />
    </section>
  );
}
