/**
 * V2.15 ASSIST-01 — the "Suggest categories" control on the uncategorised queue.
 *
 * ## Deterministic first, and visibly so
 *
 * A row whose payee key already has a manually confirmed category is answered
 * by `suggestCategories` and offered on the row as a one-tap button. Those rows
 * are removed from the batch BEFORE a provider is contacted — by
 * `buildFinanceCategorisationFacts`, server-side — so AI is offered only the
 * residue. This panel says so in a sentence, because "AI looked at 7 of the 20
 * rows because DalyHub already knew the other 13" is both the honest
 * description and the one that explains the bill.
 *
 * ## It is beside the queue, not instead of it
 *
 * The queue works with AI off, with AI unconfigured, with the feature not
 * allowed, over budget, and with the provider failing. Every one of those
 * states renders a calm sentence in this panel and changes nothing else on the
 * page — the deterministic suggestions, the picker and the one-tap accept are
 * all still there. Nothing about clearing a queue depends on a model.
 */

import {
  AiAssistSurface,
  categorisationItem,
  categorisationRows,
  asCategorisation,
  asCategorisationContext,
  type AiSurfaceAvailabilityGate,
  type ProposalRowDraft,
} from "~/shared/ai";
import { money } from "~/shared/finance";
import { buttonClassName } from "~/shared/ui";

export interface FinanceCategorySuggestionsProps {
  /** Availability, resolved server-side by the transactions loader. */
  readonly availability: AiSurfaceAvailabilityGate & {
    readonly financialAllowed: boolean;
  };
  /** How many uncategorised rows there are, for the disclosure sentence. */
  readonly queueSize: number;
}

export function FinanceCategorySuggestions({
  availability,
  queueSize,
}: FinanceCategorySuggestionsProps) {
  /*
   * CONSENT, said before the request rather than after it.
   *
   * A categorisation request IS the payee and the amount, so there is no
   * reduced form of this feature that avoids the disclosure. Without the
   * owner's `financial` allowance the runtime refuses it — correctly — but
   * being told afterwards that a thing was not allowed is a worse experience
   * than being told beforehand what it would need. The gate itself is the
   * server's and is not re-implemented here.
   */
  if (
    availability.enabled &&
    availability.providerConfigured &&
    availability.featureAllowed &&
    !availability.financialAllowed
  ) {
    return (
      <div className="dh-finance-suggestions" data-testid="finance-ai-suggest">
        <div className="dh-ai__unavailable">
          <p className="dh-ai__unavailable-text">
            Suggesting categories would send this transaction’s payee, account
            and amount to your AI provider. DalyHub has not been allowed to send
            financial content, so it will not offer to. The suggestions DalyHub
            works out itself are unaffected.
          </p>
          <a
            className={buttonClassName({ variant: "subtle" })}
            href="/settings?section=ai"
          >
            Open AI settings
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="dh-finance-suggestions" data-testid="finance-ai-suggest">
      <AiAssistSurface
        feature="finance-categorisation"
        scopeKey="uncategorised-queue"
        availability={availability}
        startLabel="Suggest categories"
        applyLabel="Apply selected"
        reviewTitle="Suggested categories"
        disclosure={
          queueSize === 0
            ? "There is nothing uncategorised to look at."
            : "The payee, the account, the date and the amount of a bounded batch of uncategorised transactions — plus your own category names — will be sent to your configured AI provider. Rows DalyHub can already categorise from your past choices are not sent."
        }
        readOnly={queueSize === 0}
        readOnlyMessage="Nothing is uncategorised, so there is nothing to suggest."
        toRows={({ result }) => {
          const answer = asCategorisation(result.result);
          const context = asCategorisationContext(result.proposal);
          if (answer === null || context === null) return [];
          return categorisationRows(answer, context, money);
        }}
        toItem={(row: ProposalRowDraft) => categorisationItem(row)}
      />
    </div>
  );
}
