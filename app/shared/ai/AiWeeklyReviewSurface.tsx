/**
 * AI-01 — the Weekly Review assistant surface.
 *
 * It sits inside the existing guided flow (REVIEW-02) and changes nothing about
 * it. The assistant is a deliberate action: it does NOT run when the Review
 * opens, it does not complete the Review, it does not create Tasks, and it never
 * overwrites text the owner authored. What it offers is text the owner may copy
 * into their own next-period focus — through the Review's own repository and its
 * optimistic-concurrency contract, which is why acceptance here hands the text
 * back to the caller rather than writing anything itself.
 */

import { useCallback, useState } from "react";

import {
  AiEvidenceDisclosure,
  AiFailure,
  AiProgress,
  AiRunDetails,
  AiSendNotice,
  AiUnavailable,
} from "./AiPanel";
import { AiCitationList } from "./AiPanel";
import { asWeeklyReview, type AiSurfaceState } from "./ai-view";
import { useAiRequest } from "./use-ai-request";

export interface AiWeeklyReviewSurfaceProps {
  readonly reviewId: string;
  readonly availability: {
    readonly enabled: boolean;
    readonly providerConfigured: boolean;
    readonly featureAllowed: boolean;
    readonly budgetExhausted: boolean;
  };
  /**
   * Called when the owner accepts text. The CALLER writes it, through the Review
   * repository, appending to whatever the owner already wrote — this component
   * never touches Review data.
   */
  readonly onAccept: (text: string) => void;
}

export function AiWeeklyReviewSurface({
  reviewId,
  availability,
  onAccept,
}: AiWeeklyReviewSurfaceProps) {
  const controller = useAiRequest();
  const [run, setRun] = useState(0);
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());

  const unavailable: AiSurfaceState | null = !availability.enabled
    ? { kind: "disabled" }
    : !availability.providerConfigured
      ? { kind: "unconfigured" }
      : !availability.featureAllowed
        ? { kind: "feature_blocked" }
        : availability.budgetExhausted
          ? { kind: "budget_exhausted" }
          : null;

  const start = useCallback(() => {
    const next = run + 1;
    setRun(next);
    setChosen(new Set());
    void controller.run({
      feature: "weekly-review-assistant",
      recordId: reviewId,
      idempotencyKey: `weekly-review-assistant:${reviewId}:${next}`,
    });
  }, [controller, reviewId, run]);

  const state = controller.state;
  const summary = state.kind === "result" ? asWeeklyReview(state.result) : null;

  if (unavailable !== null) {
    return (
      <section className="dh-ai-review" aria-label="Review assistant">
        <AiUnavailable state={unavailable} />
      </section>
    );
  }

  return (
    <section className="dh-ai-review" aria-label="Review assistant">
      {state.kind === "idle" ? (
        <>
          <AiEvidenceDisclosure summary="DalyHub will send the numbers it has already calculated for this period, plus a small set of your open Tasks, to your configured AI provider." />
          <AiSendNotice />
          <button
            type="button"
            className="dh-btn dh-btn--primary"
            onClick={start}
          >
            Generate assistant summary
          </button>
        </>
      ) : null}

      {state.kind === "running" || state.kind === "cancelling" ? (
        <AiProgress
          label={
            state.kind === "cancelling"
              ? "Cancelling…"
              : "Reading this period and preparing a summary…"
          }
          onCancel={state.kind === "running" ? controller.cancel : undefined}
        />
      ) : null}

      {state.kind === "error" ? (
        <AiFailure message={state.message} onRetry={start} />
      ) : null}

      {state.kind === "result" && summary !== null ? (
        <>
          <p className="dh-ai-review__lead">
            Nothing here has been written into your Review. Copy the overview or
            accept the priorities you want; the rest is discarded.
          </p>

          <section className="dh-ai-review__block">
            <h3 className="dh-ai-review__heading">Overview</h3>
            <p className="dh-ai-review__summary">{summary.overview}</p>
            <button
              type="button"
              className="dh-btn dh-btn--ghost"
              onClick={() => onAccept(summary.overview)}
            >
              Copy the overview into my reflection
            </button>
          </section>

          {summary.notableProgress.length > 0 ? (
            <section className="dh-ai-review__block">
              <h3 className="dh-ai-review__heading">Notable progress</h3>
              <ul className="dh-ai-review__list">
                {summary.notableProgress.map((entry, index) => (
                  <li key={index} className="dh-ai-review__item">
                    <p className="dh-ai-review__item-text">{entry.text}</p>
                    <AiCitationList
                      citations={state.citations}
                      ids={entry.evidenceIds}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {summary.attentionItems.length > 0 ? (
            <section className="dh-ai-review__block">
              <h3 className="dh-ai-review__heading">Worth a look</h3>
              <ul className="dh-ai-review__list">
                {summary.attentionItems.map((entry, index) => (
                  <li key={index} className="dh-ai-review__item">
                    <p className="dh-ai-review__item-text">{entry.text}</p>
                    <p className="dh-ai-review__confidence">{entry.reason}</p>
                    <AiCitationList
                      citations={state.citations}
                      ids={entry.evidenceIds}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {summary.patterns.length > 0 ? (
            <section className="dh-ai-review__block">
              <h3 className="dh-ai-review__heading">Patterns</h3>
              <ul className="dh-ai-review__list">
                {summary.patterns.map((entry, index) => (
                  <li key={index} className="dh-ai-review__item">
                    <p className="dh-ai-review__item-text">{entry.text}</p>
                    {/* The classification is the whole point: an inference is
                        labelled as one, not presented as a recorded fact. */}
                    <p className="dh-ai-review__confidence">
                      {entry.classification === "observation"
                        ? "From your records"
                        : "AI inference"}
                    </p>
                    <AiCitationList
                      citations={state.citations}
                      ids={entry.evidenceIds}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {summary.proposedNextWeekPriorities.length > 0 ? (
            <section className="dh-ai-review__block">
              <h3 className="dh-ai-review__heading">
                Suggested priorities for next week
              </h3>
              <ul className="dh-ai-review__list">
                {summary.proposedNextWeekPriorities.map((entry, index) => (
                  <li key={index} className="dh-ai-review__proposal">
                    <label className="dh-ai-review__select">
                      <input
                        type="checkbox"
                        checked={chosen.has(index)}
                        onChange={(event) =>
                          setChosen((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(index);
                            else next.delete(index);
                            return next;
                          })
                        }
                      />
                      <span>{entry.text}</span>
                    </label>
                    <AiCitationList
                      citations={state.citations}
                      ids={entry.evidenceIds}
                    />
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="dh-btn dh-btn--primary"
                disabled={chosen.size === 0}
                onClick={() =>
                  onAccept(
                    summary.proposedNextWeekPriorities
                      .filter((_, index) => chosen.has(index))
                      .map((entry) => `- ${entry.text}`)
                      .join("\n"),
                  )
                }
              >
                Add {chosen.size} to next week’s focus
              </button>
            </section>
          ) : null}

          {summary.uncertainties.length > 0 ? (
            <section className="dh-ai-review__block">
              <h3 className="dh-ai-review__heading">Not certain about</h3>
              <ul className="dh-ai-review__list">
                {summary.uncertainties.map((line, index) => (
                  <li key={index} className="dh-ai-review__item">
                    <p className="dh-ai-review__item-text">{line}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <AiRunDetails detail={state.detail} />
        </>
      ) : null}
    </section>
  );
}
