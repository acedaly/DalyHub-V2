/**
 * V2.15 ASSIST — the ONE surface every proposal feature runs through.
 *
 * `AiExtractionSurface` is AI-01's equivalent for Meetings and Notes, and this
 * is deliberately built to the same shape: the same availability gate, the same
 * disclosure, the same progress announcement, the same calm refusals, the same
 * explicit owner action. What differs is what a proposal IS — a change to a
 * record rather than a new one — which is why the review it renders is
 * `AiProposalReview` and why acceptance hands back an inverse.
 *
 * ## Nothing here runs by itself
 *
 * No effect starts a request. Nothing runs when a page opens, on a timer, on a
 * revalidation, on hover or in the background. `start` is called from a press
 * and from nowhere else, and the whole file contains no `useEffect`.
 *
 * ## The undo is the server's, not this component's
 *
 * Each applied item comes back with the exact payload that reverses it. This
 * component stores those payloads and posts them back; it never assembles an
 * inverse itself, because a client that could compose a reversal could compose
 * a mutation.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRevalidator } from "react-router";

import { useFeedback } from "~/shared/feedback";

import { AiProposalReview } from "./AiProposalReview";
import {
  AiEvidenceDisclosure,
  AiFailure,
  AiProgress,
  AiRunDetails,
  AiSendNotice,
  AiUnavailable,
} from "./AiPanel";
import { type AiSurfaceState } from "./ai-view";
import type { ProposalRowDraft, ProposalRowOutcome } from "./proposal-view";
import { useAiRequest } from "./use-ai-request";

/** What the record's own loader resolved about AI, server-side. */
export interface AiSurfaceAvailabilityGate {
  readonly enabled: boolean;
  readonly providerConfigured: boolean;
  readonly featureAllowed: boolean;
  readonly budgetExhausted: boolean;
}

export interface AiAssistSurfaceProps {
  readonly feature:
    | "finance-categorisation"
    | "obligation-follow-up"
    | "review-reflection-draft";
  /** Extra request fields the feature needs (`recordId`, `sectionId`). */
  readonly request?: Readonly<Record<string, string>>;
  /** A stable key for this surface's idempotency keys. */
  readonly scopeKey: string;
  readonly availability: AiSurfaceAvailabilityGate;
  /** The label on the control that starts it, in the owner's nouns. */
  readonly startLabel: string;
  /** What is sent, said before it is sent. */
  readonly disclosure: string;
  readonly reviewTitle: string;
  readonly applyLabel?: string;
  /** True when the record cannot accept changes at all. */
  readonly readOnly?: boolean;
  readonly readOnlyMessage?: string;
  /**
   * Turn one validated result into reviewable rows. Returns an empty list when
   * the answer proposes nothing, which is a legitimate answer.
   */
  readonly toRows: (state: {
    readonly result: AiSurfaceState & { kind: "result" };
  }) => readonly ProposalRowDraft[];
  /** Turn one reviewed row into the acceptance payload for its kind. */
  readonly toItem: (
    row: ProposalRowDraft,
    state: AiSurfaceState & { kind: "result" },
  ) => Record<string, unknown>;
}

/** One applied result, as the apply route reports it. */
interface AppliedResponseItem {
  readonly index: number;
  readonly kind?: string;
  readonly ok: boolean;
  readonly id?: string;
  readonly outcome?: string;
  readonly message?: string;
  readonly undo?: Record<string, unknown>;
}

export function AiAssistSurface(props: AiAssistSurfaceProps) {
  const controller = useAiRequest();
  const revalidator = useRevalidator();
  const feedback = useFeedback();

  const [run, setRun] = useState(0);
  const [rows, setRows] = useState<readonly ProposalRowDraft[]>([]);
  const [outcomes, setOutcomes] = useState<
    ReadonlyMap<string, ProposalRowOutcome>
  >(new Map());
  const [undoPayloads, setUndoPayloads] = useState<
    readonly Record<string, unknown>[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const unavailable: AiSurfaceState | null = !props.availability.enabled
    ? { kind: "disabled" }
    : !props.availability.providerConfigured
      ? { kind: "unconfigured" }
      : !props.availability.featureAllowed
        ? { kind: "feature_blocked" }
        : props.availability.budgetExhausted
          ? { kind: "budget_exhausted" }
          : null;

  const state = controller.state;

  const start = useCallback(() => {
    const next = run + 1;
    setRun(next);
    setRows([]);
    setOutcomes(new Map());
    setUndoPayloads([]);
    setNotice(null);
    void controller.run({
      ...props.request,
      feature: props.feature,
      // One deliberate owner action = one key. A refresh replays nothing; a
      // second deliberate run is a new, separately-budgeted request.
      idempotencyKey: `${props.feature}:${props.scopeKey}:${next}`,
    });
  }, [controller, props.feature, props.request, props.scopeKey, run]);

  /*
   * The rows, derived from the result rather than stored beside it — until the
   * owner touches one, after which `rows` holds their working copy and their
   * selections survive every re-render that is not a new run.
   *
   * `toRows` is deliberately read through a ref rather than listed as a
   * dependency. It is a per-render closure over loader data, so depending on it
   * would re-derive on every render and silently discard the owner's edits and
   * selections; the RESULT is what identifies a set of rows, and it is the only
   * thing that should produce a new one.
   */
  const toRowsRef = useRef(props.toRows);
  toRowsRef.current = props.toRows;
  const derived = useMemo(
    () => (state.kind === "result" ? toRowsRef.current({ result: state }) : []),
    [state],
  );
  const current = rows.length > 0 ? rows : derived;

  const accept = useCallback(
    async (chosen: readonly ProposalRowDraft[]) => {
      if (state.kind !== "result" || chosen.length === 0) return;
      setBusy(true);
      try {
        const response = (await controller.apply({
          intent: "accept",
          usageId: state.usageId,
          items: JSON.stringify(chosen.map((row) => props.toItem(row, state))),
        })) as { ok?: boolean; applied?: readonly AppliedResponseItem[] };

        const applied = response.applied ?? [];
        const map = new Map<string, ProposalRowOutcome>();
        const inverses: Record<string, unknown>[] = [];
        applied.forEach((entry, position) => {
          const row = chosen[position];
          if (row === undefined) return;
          map.set(row.id, {
            ok: entry.ok,
            outcome: (entry.outcome ??
              (entry.ok
                ? "updated"
                : "failed")) as ProposalRowOutcome["outcome"],
            message: entry.message ?? null,
            undo: entry.undo ?? null,
          });
          if (entry.ok && entry.undo !== undefined) inverses.push(entry.undo);
        });
        setRows(chosen);
        setOutcomes(map);
        setUndoPayloads(inverses);

        /*
         * The sentence is the TRUTH about what happened, per outcome class.
         * "Some were not applied" is never rounded up to a success, and a
         * stale row is named as stale rather than as a failure — the owner's
         * own newer choice surviving is not an error.
         */
        const failures = applied.filter((entry) => !entry.ok).length;
        setNotice(
          failures === 0
            ? "Applied. These are ordinary DalyHub changes now — edit or undo them as usual."
            : `${applied.length - failures} of ${applied.length} applied. The rest are listed below with what happened.`,
        );
        void revalidator.revalidate();
      } finally {
        setBusy(false);
      }
    },
    [controller, props, revalidator, state],
  );

  const undo = useCallback(async () => {
    if (state.kind !== "result" || undoPayloads.length === 0) return;
    setBusy(true);
    try {
      const response = (await controller.apply({
        intent: "undo",
        usageId: state.usageId,
        items: JSON.stringify(undoPayloads),
      })) as { ok?: boolean; applied?: readonly AppliedResponseItem[] };
      const reversed = (response.applied ?? []).filter(
        (entry) => entry.ok,
      ).length;
      const failed = (response.applied ?? []).length - reversed;
      setUndoPayloads([]);
      setNotice(
        failed === 0
          ? "Undone. Everything is back as it was."
          : `${reversed} undone. ${failed} could not be — they changed again after the change was applied, and your newer version is still there.`,
      );
      void revalidator.revalidate();
    } finally {
      setBusy(false);
    }
  }, [controller, revalidator, state, undoPayloads]);

  const reject = useCallback(async () => {
    if (state.kind === "result") {
      // Rejection writes NOTHING to DalyHub data. It records the disposition
      // on the usage row that has already been charged for the generation, and
      // it does not contact a provider again.
      await controller.apply({ intent: "reject", usageId: state.usageId });
    }
    controller.reset();
    setRows([]);
    setOutcomes(new Map());
    setUndoPayloads([]);
    setNotice(null);
  }, [controller, state]);

  const onUndo = useCallback(() => {
    void undo().then(() => {
      feedback.notifySuccess("Change undone", {
        message: "DalyHub is back as it was.",
      });
    });
  }, [feedback, undo]);

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
          <AiEvidenceDisclosure summary={props.disclosure} />
          <AiSendNotice />
          <button
            type="button"
            className="dh-btn dh-btn--primary"
            disabled={props.readOnly === true}
            onClick={start}
          >
            {props.startLabel}
          </button>
          {props.readOnly === true && props.readOnlyMessage !== undefined ? (
            <p className="dh-ai-review__hint">{props.readOnlyMessage}</p>
          ) : null}
        </>
      ) : null}

      {state.kind === "running" || state.kind === "cancelling" ? (
        <AiProgress
          label={
            state.kind === "cancelling"
              ? "Cancelling…"
              : "Reading what DalyHub knows and preparing suggestions…"
          }
          onCancel={state.kind === "running" ? controller.cancel : undefined}
        />
      ) : null}

      {state.kind === "error" ? (
        <AiFailure message={state.message} onRetry={start} />
      ) : null}

      {state.kind === "result" ? (
        <>
          {notice === null ? null : (
            <p className="dh-ai-review__lead" role="status">
              {notice}
            </p>
          )}
          <AiProposalReview
            title={props.reviewTitle}
            rows={current}
            onRowsChange={setRows}
            facts={state.facts}
            applyLabel={props.applyLabel}
            busy={busy}
            onApply={(chosen) => void accept(chosen)}
            onReject={() => void reject()}
            outcomes={outcomes}
            onUndo={undoPayloads.length > 0 ? onUndo : null}
          />
          <AiRunDetails detail={state.detail} />
        </>
      ) : null}
    </section>
  );
}
