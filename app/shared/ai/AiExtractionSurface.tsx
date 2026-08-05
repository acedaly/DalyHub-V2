/**
 * AI-01 — the "Extract actions and decisions" surface, shared by Meetings and
 * Notes.
 *
 * One component means one behaviour: the same disclosure, the same progress
 * announcement, the same review surface, the same acceptance path, the same calm
 * refusals — on both records and on both desktop and phone.
 *
 * The action is always explicitly initiated by the owner. Nothing runs when a
 * record opens, nothing runs on a timer, and nothing runs in the background.
 */

import { useCallback, useState } from "react";
import { useRevalidator } from "react-router";

import { AiExtractionReview } from "./AiExtractionReview";
import {
  AiEvidenceDisclosure,
  AiFailure,
  AiProgress,
  AiRunDetails,
  AiSendNotice,
  AiUnavailable,
} from "./AiPanel";
import { asExtraction, type AiSurfaceState } from "./ai-view";
import { useAiRequest } from "./use-ai-request";

export interface AiExtractionSurfaceProps {
  /** `meeting-action-extraction` or `note-action-extraction`. */
  readonly feature: "meeting-action-extraction" | "note-action-extraction";
  readonly recordId: string;
  readonly recordLabel: string;
  /** Availability, resolved server-side by the record's own loader. */
  readonly availability: {
    readonly enabled: boolean;
    readonly providerConfigured: boolean;
    readonly featureAllowed: boolean;
    readonly budgetExhausted: boolean;
  };
  /** True when the record is archived or otherwise read-only. */
  readonly readOnly?: boolean;
}

export function AiExtractionSurface({
  feature,
  recordId,
  recordLabel,
  availability,
  readOnly = false,
}: AiExtractionSurfaceProps) {
  const controller = useAiRequest();
  const revalidator = useRevalidator();
  const [run, setRun] = useState(0);
  const [applied, setApplied] = useState<string | null>(null);

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
    setApplied(null);
    void controller.run({
      feature,
      recordId,
      // One deliberate owner action = one key. A refresh replays nothing; a
      // second deliberate run is a new, separately-budgeted request.
      idempotencyKey: `${feature}:${recordId}:${next}`,
    });
  }, [controller, feature, recordId, run]);

  const state = controller.state;
  const extraction =
    state.kind === "result" ? asExtraction(state.result) : null;

  const accept = useCallback(
    async (items: readonly Record<string, unknown>[]) => {
      if (state.kind !== "result") return;
      const response = (await controller.apply({
        intent: "accept",
        usageId: state.usageId,
        items: JSON.stringify(items),
      })) as { ok?: boolean; applied?: { ok: boolean; message?: string }[] };
      const failures = (response.applied ?? []).filter((entry) => !entry.ok);
      setApplied(
        failures.length === 0
          ? "Added to DalyHub. They’re ordinary records now — edit or delete them as usual."
          : `Some items couldn’t be added: ${failures
              .map((entry) => entry.message ?? "unknown reason")
              .join(" ")}`,
      );
      // The record's own loader is the source of truth for what now exists.
      void revalidator.revalidate();
    },
    [controller, revalidator, state],
  );

  const reject = useCallback(async () => {
    if (state.kind === "result") {
      await controller.apply({ intent: "reject", usageId: state.usageId });
    }
    controller.reset();
    setApplied(null);
  }, [controller, state]);

  if (unavailable !== null) {
    return (
      <section className="dh-ai-review" aria-label="AI assistance">
        <AiUnavailable state={unavailable} />
      </section>
    );
  }

  return (
    <section className="dh-ai-review" aria-label="AI assistance">
      {state.kind === "idle" ? (
        <>
          <AiEvidenceDisclosure
            summary={`This ${recordLabel}’s content, and the records explicitly linked to it, will be sent to your configured AI provider.`}
          />
          <AiSendNotice />
          <button
            type="button"
            className="dh-btn dh-btn--primary"
            disabled={readOnly}
            onClick={start}
          >
            Extract actions and decisions
          </button>
          {readOnly ? (
            <p className="dh-ai-review__hint">
              This {recordLabel} is archived, so nothing can be added to it.
            </p>
          ) : null}
        </>
      ) : null}

      {state.kind === "running" || state.kind === "cancelling" ? (
        <AiProgress
          label={
            state.kind === "cancelling"
              ? "Cancelling…"
              : `Reading this ${recordLabel} and preparing proposals…`
          }
          onCancel={state.kind === "running" ? controller.cancel : undefined}
        />
      ) : null}

      {state.kind === "error" ? (
        <AiFailure message={state.message} onRetry={start} />
      ) : null}

      {state.kind === "result" && extraction !== null ? (
        <>
          <AiEvidenceDisclosure
            summary={`${state.disclosure.recordCount} DalyHub ${
              state.disclosure.recordCount === 1 ? "record was" : "records were"
            } sent.`}
            disclosure={state.disclosure}
          />
          {applied !== null ? (
            <p className="dh-ai-review__lead" role="status">
              {applied}
            </p>
          ) : null}
          <AiExtractionReview
            result={extraction}
            citations={state.citations}
            sourceEntityId={recordId}
            projectOptions={state.candidates.projects}
            linkOptions={state.candidates.links}
            busy={false}
            onAccept={(items) => void accept(items)}
            onReject={() => void reject()}
          />
          <AiRunDetails detail={state.detail} />
        </>
      ) : null}
    </section>
  );
}
