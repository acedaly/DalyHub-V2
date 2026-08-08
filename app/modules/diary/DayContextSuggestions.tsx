/**
 * DIARY-02 — "From this day": same-day records the reader may CHOOSE to relate.
 *
 * The distinction this component exists to protect is the one that keeps
 * DalyHub's relationship model trustworthy:
 *
 *   **Related**      — records with a real, persisted EntityLink. Rendered by the
 *                      shared Linked Items section, above this one.
 *   **From this day** — records that merely happened on the same owner-calendar
 *                      day. NOTHING is written for them until the reader presses
 *                      Link.
 *
 * A meeting on Tuesday and an entry written on Tuesday are not evidence that the
 * entry is about the meeting. So the two lists are separate sections with separate
 * headings, each candidate is announced as a suggestion (`Suggested`, in text —
 * never colour alone), and the only mutation is the explicit Link button, which
 * posts to the ordinary `/links` endpoint and creates the ordinary `link.related`
 * EntityLink. There is no inference here, no matching on titles or words, and no
 * AI (AGENTS.md §8).
 *
 * The section renders nothing at all when there are no candidates — an entry with
 * a quiet day must not grow an empty panel.
 */

import { useCallback, useEffect, useState } from "react";

import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import { createLink } from "~/shared/linked-items";

import type {
  DayContextCandidate,
  DayContextResponse,
} from "./routes/day-context";

export interface DayContextSuggestionsProps {
  readonly entryId: string;
  /** Called after a candidate becomes a real relationship, to refresh Related. */
  readonly onLinked?: () => void;
}

export function DayContextSuggestions({
  entryId,
  onLinked,
}: DayContextSuggestionsProps) {
  const feedback = useFeedback();
  const [candidates, setCandidates] = useState<readonly DayContextCandidate[]>(
    [],
  );
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCandidates([]);
    fetch(`/diary/${encodeURIComponent(entryId)}/day-context`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then((response) =>
        response.ok ? (response.json() as Promise<unknown>) : null,
      )
      .then((body) => {
        // The response is untrusted like every other fetch in the product: only
        // a well-formed candidate list is rendered, never a cast.
        const candidateList = (body as DayContextResponse | null)?.candidates;
        if (Array.isArray(candidateList)) setCandidates(candidateList);
      })
      .catch(() => {
        // A suggestion that cannot be offered is simply not offered. It is an
        // enrichment beside the entry — it never becomes an error the reader of a
        // diary entry has to deal with.
      });
    return () => controller.abort();
  }, [entryId]);

  const link = useCallback(
    async (candidate: DayContextCandidate) => {
      setPendingId(candidate.id);
      const outcome = await createLink({
        anchorId: entryId,
        targetId: candidate.id,
        direction: "outgoing",
      }).catch(() => ({ ok: false, message: undefined }));
      setPendingId(null);
      if (!outcome.ok) {
        feedback.notifyError(
          outcome.message ?? "Couldn’t link that record. Try again.",
        );
        return;
      }
      // It is a real relationship now, so it leaves the suggestions and appears
      // under Related — the two lists are never allowed to show the same record.
      setCandidates((current) =>
        current.filter((item) => item.id !== candidate.id),
      );
      feedback.notifySuccess(`Linked ${candidate.title || "record"}.`);
      onLinked?.();
    },
    [entryId, feedback, onLinked],
  );

  if (candidates.length === 0) return null;

  return (
    <section
      className="dh-diary-detail__section dh-day-context"
      aria-labelledby={`dh-day-context-${entryId}`}
    >
      <h4
        className="dh-diary-detail__section-heading"
        id={`dh-day-context-${entryId}`}
      >
        From this day
      </h4>
      <p className="dh-day-context__help">
        These happened on the same day. Nothing is linked until you choose it.
      </p>
      <ul className="dh-day-context__list">
        {candidates.map((candidate) => (
          <li key={candidate.id} className="dh-day-context__item">
            <span className="dh-day-context__identity">
              <span className="dh-day-context__icon" aria-hidden="true">
                <EntityIcon type={candidate.type} />
              </span>
              <span className="dh-day-context__title">
                {candidate.title || "Untitled"}
              </span>
              <span className="dh-day-context__meta">
                {candidate.type === "meeting" ? "Meeting" : "Task"}
                {candidate.detail ? ` · ${candidate.detail}` : ""}
                {" · Suggested"}
              </span>
            </span>
            <button
              type="button"
              className="dh-btn dh-btn--secondary dh-day-context__link"
              disabled={pendingId === candidate.id}
              onClick={() => void link(candidate)}
              aria-label={`Link ${candidate.title || "record"} to this diary entry`}
            >
              Link
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
