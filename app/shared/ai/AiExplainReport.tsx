/**
 * V2.14 GROUND-03 shared — "Explain this report".
 *
 * ## Why it lives in `~/shared/ai` and not in the Reports module
 *
 * Reports imports nothing from the AI kernel, platform or module, and
 * `test/unit/reports/report-boundaries.test.ts` asserts it. The rule is not a
 * formality: the deterministic Reports module must stay complete and usable
 * with every AI file deleted, which is what makes the figures on that page
 * DalyHub's rather than a model's. So the AI surface is a shared component the
 * report screen RENDERS, taking two pieces of plain data — the report's
 * definition and the identity of the result on screen — and Reports learns
 * nothing about providers, prompts or features by handing them over.
 *
 * ## The report stays primary
 *
 * This is one control and one bounded panel below the figures. It never
 * replaces the table, never redraws it, and never changes a number. The owner
 * can always see the facts and the interpretation side by side, which is the
 * whole design.
 *
 * ## Nothing happens until the owner asks
 *
 * No provider call is made in any loader. `/reports` and `/reports/:id` load at
 * exactly the speed they loaded before V2.14, and the first byte of AI work
 * happens on a click. The in-flight guard lives in `useAiRequest`, so five
 * clicks are one request; the server's idempotency key makes a refresh one too.
 */

import { useCallback, useState } from "react";

import type { FactBlock } from "~/kernel/ai";

import {
  AiFactList,
  AiFactsWithoutExplanation,
  AiGroundedAnswer,
} from "./AiGrounded";
import { AiFailure, AiProgress, AiRunDetails } from "./AiPanel";
import { asGrounded } from "./ai-view";
import { useAiRequest } from "./use-ai-request";

export interface AiExplainReportProps {
  /**
   * The report's definition, serialised by the Reports codec. The server parses
   * it with the same total parser a stored row goes through and executes it
   * itself — the browser never sends a figure.
   */
  readonly definition: string;
  /** The built-in or saved report id, where there is one. */
  readonly reportId: string | null;
  /**
   * The identity of the RESULT on screen (`reportResultDigest`).
   *
   * The server re-executes the definition and compares. If the figures have
   * moved since this page was drawn, the request is refused as stale rather
   * than answered — because prose paired with numbers it was not written about
   * is worse than no prose.
   */
  readonly resultDigest: string;
  /**
   * A development-provider scenario, for the E2E suite. Inert in production:
   * the server discards it unless `AI_FAKE_PROVIDER=1` and the `ENVIRONMENT` is
   * development or test.
   */
  readonly scenario?: string;
}

/** The Explain control and its bounded panel. */
export function AiExplainReport({
  definition,
  reportId,
  resultDigest,
  scenario,
}: AiExplainReportProps) {
  const controller = useAiRequest();
  const [nonce, setNonce] = useState(0);
  const state = controller.state;
  const busy = state.kind === "running" || state.kind === "cancelling";

  const explain = useCallback(() => {
    const next = nonce + 1;
    setNonce(next);
    void controller.run({
      feature: "report-explanation",
      definition,
      reportId: reportId ?? "",
      factBlockHash: "",
      resultDigest,
      // Derived from the exact figures plus a per-press counter: a refresh
      // replays nothing, and a deliberate second press is a new, separately
      // budgeted request.
      idempotencyKey: `report:${resultDigest}:${next}`.slice(0, 200),
      ...(scenario === undefined ? {} : { scenario }),
    });
  }, [controller, definition, reportId, resultDigest, nonce, scenario]);

  const grounded = state.kind === "result" ? asGrounded(state.result) : null;
  const facts: FactBlock | null =
    state.kind === "result" ? state.facts : (errorFacts(state) ?? null);

  return (
    <section className="dh-report-explain" aria-label="Explain this report">
      <div className="dh-report-explain__actions">
        <button
          type="button"
          className="dh-btn dh-btn--subtle"
          onClick={explain}
          disabled={busy}
        >
          {state.kind === "result" || state.kind === "error"
            ? "Explain again"
            : "Explain this report"}
        </button>
      </div>

      {busy ? (
        <AiProgress
          label={
            state.kind === "cancelling"
              ? "Cancelling…"
              : "Reading the figures and preparing an explanation…"
          }
          onCancel={state.kind === "running" ? controller.cancel : undefined}
        />
      ) : null}

      {state.kind === "error" ? (
        <>
          <AiFailure message={state.message} />
          {/*
            The deterministic half survives every failure. Whatever went wrong —
            the provider is off, unconfigured, slow, refused, over budget, or
            answered with something DalyHub would not verify — these are the
            figures it would have explained, and they are DalyHub's own.
          */}
          <AiFactsWithoutExplanation
            block={facts}
            message="Here are the figures DalyHub would have explained."
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
          />
          <AiRunDetails detail={state.detail} />
        </>
      ) : null}

      {state.kind === "result" && grounded === null ? (
        <AiFactList block={state.facts} open />
      ) : null}
    </section>
  );
}

/**
 * The facts carried on a FAILED response.
 *
 * The assist route builds the block BEFORE it contacts a provider and returns
 * it on every outcome, so "AI is turned off" and "the answer could not be
 * verified" both still show the owner what DalyHub knows. This narrowing exists
 * because the error state is deliberately a small, closed shape — a code and a
 * sentence — and the facts ride beside it rather than inside it.
 */
function errorFacts(state: {
  readonly kind: string;
  readonly facts?: FactBlock | null;
}): FactBlock | null {
  return state.facts ?? null;
}
