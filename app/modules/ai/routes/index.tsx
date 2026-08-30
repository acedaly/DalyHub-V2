/**
 * AI-01 / AI-04 — Ask DalyHub.
 *
 * A bounded question surface over the owner's own records. It is NOT a general
 * assistant: no internet access, no conversation history, no tools, no memory
 * between questions. It answers from evidence DalyHub selected, cites what it
 * used, and says so plainly when the evidence does not support an answer.
 *
 * Questions DalyHub can answer itself — counts, the latest Meeting, the Inbox
 * state — never reach a provider. That is not an optimisation: it is the correct
 * answer, arrived at deterministically and for nothing.
 */

import { env } from "cloudflare:workers";
import { useCallback, useId, useState, type FormEvent } from "react";

import {
  AiCitationList,
  AiFailure,
  AiProgress,
  AiRunDetails,
  AiSendNotice,
  AiUnavailable,
  asAnswer,
  useAiRequest,
  type AiSurfaceState,
} from "~/shared/ai";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { readAiAvailability } from "~/platform/ai";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Ask DalyHub · DalyHub" },
    {
      name: "description",
      content: "Ask questions about your own records, answered with citations.",
    },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const availability = await readAiAvailability(
    scope,
    session.user.subject,
    "workspace-question-answer",
    env,
  );
  return { availability };
}

export default function AskDalyHubRoute({ loaderData }: Route.ComponentProps) {
  const { availability } = loaderData;
  const controller = useAiRequest();
  const [question, setQuestion] = useState("");
  const [nonce, setNonce] = useState(0);
  const fieldId = useId();

  const unavailable: AiSurfaceState | null = !availability.enabled
    ? { kind: "disabled" }
    : !availability.providerConfigured
      ? { kind: "unconfigured" }
      : !availability.featureAllowed
        ? { kind: "feature_blocked" }
        : availability.budgetExhausted
          ? { kind: "budget_exhausted" }
          : null;

  /*
   * RECALL-00-F (DEBT-227) — the five deterministic intents (overdue/open/inbox
   * counts, latest/upcoming meeting) are answered server-side BEFORE any
   * provider gate, contact no provider and cost nothing — so a disabled or
   * unconfigured provider must not hide the question form that reaches them.
   * The calm unavailable notice stays, beside the form, for the provider-backed
   * features; a non-deterministic question still fails closed server-side with
   * the same calm explanation it gets today. Feature-blocked and
   * budget-exhausted remain fully gated: both presuppose an activated provider.
   */
  const deterministicStillAnswers =
    unavailable !== null &&
    (unavailable.kind === "disabled" || unavailable.kind === "unconfigured");

  const ask = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const trimmed = question.trim();
      if (trimmed.length === 0) return;
      const next = nonce + 1;
      setNonce(next);
      void controller.run({
        feature: "workspace-question-answer",
        question: trimmed,
        // Derived from the question plus a per-submit counter: a refresh replays
        // nothing, and a deliberate re-ask is a new, separately-budgeted request.
        idempotencyKey: `ask:${next}:${trimmed}`.slice(0, 200),
      });
    },
    [controller, question, nonce],
  );

  const state = controller.state;
  const answer = state.kind === "result" ? asAnswer(state.result) : null;

  return (
    <div className="dh-ask">
      <header className="dh-ask__header">
        <h1 className="dh-ask__title">Ask DalyHub</h1>
        <p className="dh-ask__lead">
          Questions about your own records — Meetings, Notes, Tasks and
          Projects. DalyHub answers from what it can find and shows you the
          records it used. It has no access to the internet and keeps no
          conversation history.
        </p>
      </header>

      {unavailable !== null && !deterministicStillAnswers ? (
        <AiUnavailable state={unavailable} />
      ) : (
        <>
          {unavailable !== null ? <AiUnavailable state={unavailable} /> : null}
          <form className="dh-ask__form" onSubmit={ask}>
            <label className="dh-ask__label" htmlFor={fieldId}>
              Your question
            </label>
            <textarea
              id={fieldId}
              className="dh-ask__input"
              value={question}
              maxLength={400}
              rows={3}
              placeholder="What follow-ups do I still owe?"
              onChange={(event) => setQuestion(event.target.value)}
            />
            <div className="dh-ask__actions">
              <button
                type="submit"
                className="dh-btn dh-btn--primary"
                disabled={
                  question.trim().length === 0 ||
                  state.kind === "running" ||
                  state.kind === "cancelling"
                }
              >
                Ask
              </button>
              <span className="dh-ask__budget">
                {availability.monthSpentUsd.toFixed(2)} of{" "}
                {availability.monthlyBudgetUsd.toFixed(2)} USD used this month
              </span>
            </div>
          </form>

          {deterministicStillAnswers ? (
            // Honest in the off state: nothing leaves DalyHub. The questions it
            // can answer itself, it answers; the rest are declined calmly.
            <AiSendNotice>
              With AI off, DalyHub still answers the questions it can from your
              records alone — how many tasks are overdue, open or in the Inbox,
              and your latest or next meeting. Nothing is sent anywhere; other
              questions are declined until a provider is set up.
            </AiSendNotice>
          ) : (
            <AiSendNotice>
              Your question and the records DalyHub selects are sent to your
              configured AI provider. Only ask about information you are
              permitted to share with them.
            </AiSendNotice>
          )}

          {state.kind === "running" || state.kind === "cancelling" ? (
            <AiProgress
              label={
                state.kind === "cancelling"
                  ? "Cancelling…"
                  : "Finding relevant records and preparing an answer…"
              }
              onCancel={
                state.kind === "running" ? controller.cancel : undefined
              }
            />
          ) : null}

          {state.kind === "error" ? (
            <AiFailure message={state.message} />
          ) : null}

          {state.kind === "deterministic" ? (
            <section className="dh-ask__answer" aria-label="Answer">
              <p className="dh-ask__badge">Based on DalyHub records</p>
              <p className="dh-ask__summary">{state.summary}</p>
              {state.citations.length > 0 ? (
                <ul className="dh-ai__citations">
                  {state.citations.map((citation, index) => (
                    <li key={index} className="dh-ai__citation">
                      {citation.href !== null ? (
                        <a
                          className="dh-ai__citation-link"
                          href={citation.href}
                        >
                          {citation.title}
                        </a>
                      ) : (
                        <span className="dh-ai__citation-link">
                          {citation.title}
                        </span>
                      )}
                      {citation.date !== null ? (
                        <time
                          className="dh-ai__citation-date"
                          dateTime={citation.date}
                        >
                          {citation.date}
                        </time>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="dh-ask__note">
                DalyHub answered this itself. No AI provider was contacted, and
                nothing was sent anywhere.
              </p>
            </section>
          ) : null}

          {state.kind === "result" && answer !== null ? (
            <section className="dh-ask__answer" aria-label="Answer">
              <p className="dh-ask__badge">
                {answer.status === "answered"
                  ? "Based on DalyHub records"
                  : answer.status === "needs_narrowing"
                    ? "Too broad to answer from the records found"
                    : "Not enough evidence"}
              </p>
              <p className="dh-ask__summary">{answer.summary}</p>

              {answer.statements.length > 0 ? (
                <ul className="dh-ask__statements">
                  {answer.statements.map((statement, index) => (
                    <li key={index} className="dh-ask__statement">
                      <p className="dh-ask__statement-text">{statement.text}</p>
                      <p className="dh-ask__classification">
                        {statement.classification === "observation"
                          ? "From your records"
                          : "AI inference"}
                      </p>
                      <AiCitationList
                        citations={state.citations}
                        ids={statement.evidenceIds}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}

              {answer.uncertainties.length > 0 ? (
                <div className="dh-ask__uncertainties">
                  <h2 className="dh-ask__subheading">Not certain about</h2>
                  <ul>
                    {answer.uncertainties.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {state.disclosure.truncated ? (
                <p className="dh-ask__note">
                  Not every matching record was included. Ask a narrower
                  question for a more complete answer.
                </p>
              ) : null}

              <AiRunDetails detail={state.detail} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
