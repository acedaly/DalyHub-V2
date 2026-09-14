/**
 * AI-01 / AI-04 / UNTITLED-17 — Ask DalyHub.
 *
 * A bounded question surface over the owner's own records. It is NOT a general
 * assistant: no internet access, no conversation history, no tools, no memory
 * between questions. It answers from evidence DalyHub selected, cites what it
 * used, and says so plainly when the evidence does not support an answer.
 *
 * Questions DalyHub can answer itself — counts, the latest Meeting, the Inbox
 * state — never reach a provider. That is not an optimisation: it is the correct
 * answer, arrived at deterministically and for nothing.
 *
 * ── UNTITLED-17: why this is not a chat thread ──────────────────────────────
 *
 * The obvious redesign for an "AI page" in 2026 is a message thread with a
 * sticky composer, and it would be wrong here — not merely unfashionable to
 * avoid, but a lie about what the product does. DalyHub keeps NO conversation
 * history and has no follow-up turn: every question is answered from evidence
 * selected for that question alone. A thread would draw a memory the surface
 * does not have, and the first thing an owner would do with it is ask a
 * follow-up that silently loses every word of context.
 *
 * So the page is what it actually is: a question, its answer, and the evidence
 * behind the answer. One column, one measure, in reading order.
 *
 *     Ask DalyHub                     ← what it is, and its bounds, stated
 *     ─────────────────────────────
 *     [ Your question            ]    ← the composer, with ⌘↵
 *     [ Ask ]  ⌘↵ · budget used
 *     Start with one of these         ← a FEW contextual starting points
 *     [ chip ] [ chip ] [ chip ]
 *     ─────────────────────────────
 *     Answer                          ← focus moves here when one arrives
 *
 * ── What this pass changed, and what it did not ─────────────────────────────
 *
 * Not one contract: the availability gates, the deterministic-first path, the
 * fail-closed refusal, the budget line, the send notice and every citation are
 * untouched. What changed is that the surface was drawn by `ai.css` — a bare
 * `<textarea class="dh-ask__input">` with its own border and focus ring, a bare
 * `<button>`, and the four starting points as a BULLETED LIST of bold text that
 * did not look pressable at all (see the capture in the migration record). The
 * composer is Untitled's `Textarea`, the actions are Untitled's `Button`, and
 * the starting points are a wrapped row of real buttons.
 */

import { env } from "cloudflare:workers";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  AiCitationList,
  AiFactList,
  AiFactsWithoutExplanation,
  AiFailure,
  AiGroundedAnswer,
  AiProgress,
  AiRunDetails,
  AiSendNotice,
  AiUnavailable,
  asAnswer,
  asGrounded,
  useAiRequest,
  type AiSurfaceState,
} from "~/shared/ai";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { GROUNDED_ASK_EXAMPLES, readAiAvailability } from "~/platform/ai";
import type { Route } from "./+types/index";
import { Button, Textarea } from "~/shared/ui";
import { SectionHeading } from "~/shared/ui/untitled/overrides/section-heading";

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
  /*
   * The examples come from the PARSER's own list, so what the page offers and
   * what DalyHub can actually resolve cannot drift apart. They are static
   * examples of a closed capability — not AI-generated suggestions, and not a
   * read of the owner's workspace.
   */
  return { availability, examples: GROUNDED_ASK_EXAMPLES };
}

export default function AskDalyHubRoute({ loaderData }: Route.ComponentProps) {
  const { availability, examples } = loaderData;
  const controller = useAiRequest();
  const [question, setQuestion] = useState("");
  const [nonce, setNonce] = useState(0);
  const fieldId = useId();
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const answerRef = useRef<HTMLHeadingElement | null>(null);

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
    (event?: FormEvent) => {
      event?.preventDefault();
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
  const grounded = state.kind === "result" ? asGrounded(state.result) : null;
  const busy = state.kind === "running" || state.kind === "cancelling";
  const settled = state.kind === "result" || state.kind === "deterministic";

  /*
   * AGENTS.md §15 — the answer is ANNOUNCED by moving focus to its heading, not
   * by a live region wrapped around it.
   *
   * A `aria-live` container around a result that arrives in one piece would be
   * read once and would then re-read every time any part of it changed —
   * opening the facts disclosure, for instance. Moving focus says "here is the
   * answer" exactly once, puts the keyboard where the reader wants it, and
   * leaves the region an ordinary landmark they can come back to.
   *
   * The GROUNDED path renders `AiGroundedAnswer`, which draws its own labelled
   * region; the ref is not attached there, so the effect is a no-op and that
   * path is reached by landmark rather than by focus. It only fires against a
   * configured provider, which no test in this repository exercises — named
   * here rather than papered over.
   */
  useEffect(() => {
    if (settled) answerRef.current?.focus();
  }, [settled, nonce]);

  /**
   * ⌘↵ / Ctrl+↵ asks.
   *
   * Deliberately NOT bare Enter: this is a multi-line field for a question an
   * owner may want to phrase over two lines, and a chat box's Enter-to-send is
   * the convention of a surface that expects one line at a time. The hint is
   * printed beside the button rather than left to be discovered.
   */
  const onComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      if (!busy) ask();
    },
    [ask, busy],
  );

  /** A starting point fills the composer and hands the owner the caret. */
  const applyExample = useCallback((text: string) => {
    setQuestion(text);
    fieldRef.current?.focus();
  }, []);

  return (
    <div className="dh-ask">
      <header className="dh-ask__header">
        <h1 className="dh-ask__title">Ask DalyHub</h1>
        <p className="dh-ask__lead">
          Questions about your own records. DalyHub works out the figures
          itself, then explains them — so every number you read here is one
          DalyHub calculated, and you can open the record it came from. It has
          no access to the internet and keeps no conversation history.
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
            {/*
             * Untitled's `Textarea` through the shared primitive: the same box,
             * radius, ring and focus treatment every other field in the product
             * has. `.dh-ask__input` used to draw all four itself.
             */}
            <Textarea
              id={fieldId}
              ref={fieldRef}
              className="dh-ask__input"
              value={question}
              maxLength={400}
              rows={3}
              placeholder="What follow-ups do I still owe?"
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={onComposerKeyDown}
            />
            <div className="dh-ask__actions">
              <Button
                type="submit"
                variant="primary"
                disabled={question.trim().length === 0 || busy}
                loading={busy}
              >
                Ask
              </Button>
              <p className="dh-ask__budget">
                <span className="dh-ask__shortcut">
                  <kbd className="rounded border border-secondary px-1 font-sans text-xs text-secondary">
                    ⌘
                  </kbd>
                  <kbd className="rounded border border-secondary px-1 font-sans text-xs text-secondary">
                    ↵
                  </kbd>{" "}
                  to ask
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {availability.monthSpentUsd.toFixed(2)} of{" "}
                  {availability.monthlyBudgetUsd.toFixed(2)} USD used this month
                </span>
              </p>
            </div>
          </form>

          {/*
           * A FEW starting points, as real buttons.
           *
           * They were a `<ul>` of bold text with list bullets showing: a run of
           * headings nobody would think to press. They are the parser's own
           * closed list, so there are four of them rather than a grid of
           * everything AI can do (§35).
           */}
          <section className="dh-ask__starters" aria-labelledby="ask-starters">
            <SectionHeading
              id="ask-starters"
              level={2}
              title="Questions DalyHub can work out"
              description="DalyHub resolves these itself, from your own records."
            />
            <ul className="dh-ask__examples">
              {examples.map((example) => (
                <li key={example.intent}>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => applyExample(example.question)}
                  >
                    {example.question}
                  </Button>
                </li>
              ))}
            </ul>
            <p className="dh-ask__note">
              Anything else is answered from the Notes, Meetings, Tasks and
              Projects DalyHub can find, or declined honestly when it cannot
              find enough.
            </p>
          </section>

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

          {busy ? (
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
            <>
              <AiFailure message={state.message} />
              {/* The deterministic half survives every failure. */}
              <AiFactsWithoutExplanation
                block={state.facts}
                message="Here are the figures DalyHub worked out for that question."
              />
            </>
          ) : null}

          {grounded !== null && state.kind === "result" ? (
            <>
              <AiGroundedAnswer
                status={grounded.status}
                summary={grounded.summary}
                observations={grounded.observations}
                block={state.facts}
                assumptions={state.assumptions}
                label="Answer"
              />
              <AiRunDetails detail={state.detail} />
            </>
          ) : null}

          {state.kind === "result" && grounded === null && answer === null ? (
            <AiFactList block={state.facts} open />
          ) : null}

          {state.kind === "deterministic" ? (
            <section className="dh-ask__answer" aria-label="Answer">
              <h2
                className="dh-ask__answer-heading"
                tabIndex={-1}
                ref={answerRef}
              >
                Answer
              </h2>
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
              <h2
                className="dh-ask__answer-heading"
                tabIndex={-1}
                ref={answerRef}
              >
                Answer
              </h2>
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
                  <h3 className="dh-ask__subheading">Not certain about</h3>
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
