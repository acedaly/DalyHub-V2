/**
 * AI-01 shared — the extraction proposal review surface.
 *
 * This is where the product rule becomes an interface: nothing here has happened
 * to DalyHub yet. Every proposed Task starts UNSELECTED, every field is editable
 * before acceptance, individual items can be rejected, and the whole proposal can
 * be rejected. There is an "Accept selected" control and there is no route that
 * accepts everything without the owner having chosen each item — "Accept all" is
 * never the only way through.
 *
 * On a phone the list reviews one item at a time by construction: each proposal
 * is a full-width block with its own controls, so nothing needs a horizontal
 * scroll and nothing depends on a wide table.
 */

import { useCallback, useState } from "react";

import type { ActionExtractionResult } from "~/kernel/ai";

import { AiCitationList } from "./AiPanel";
import {
  acceptancePayload,
  dateBasisLabel,
  draftsFromExtraction,
  type AiCitation,
  type TaskDraft,
} from "./ai-view";

/** A link the owner may accept. Only allowlisted targets ever appear. */
interface LinkDraft {
  readonly targetEntityId: string;
  readonly title: string;
  readonly reason: string;
  readonly evidenceIds: readonly string[];
  readonly selected: boolean;
}

export interface AiExtractionReviewProps {
  readonly result: ActionExtractionResult;
  readonly citations: readonly AiCitation[];
  /** The record the proposal was generated from — the link source. */
  readonly sourceEntityId: string;
  /** Allowlisted Projects, for the per-Task Project picker. */
  readonly projectOptions: readonly {
    readonly id: string;
    readonly title: string;
  }[];
  /** Allowlisted link targets, so an invented target can never be offered. */
  readonly linkOptions: readonly {
    readonly id: string;
    readonly title: string;
    readonly type: string;
  }[];
  readonly busy: boolean;
  readonly onAccept: (items: readonly Record<string, unknown>[]) => void;
  readonly onReject: () => void;
}

export function AiExtractionReview({
  result,
  citations,
  sourceEntityId,
  projectOptions,
  linkOptions,
  busy,
  onAccept,
  onReject,
}: AiExtractionReviewProps) {
  const [drafts, setDrafts] = useState<readonly TaskDraft[]>(() =>
    draftsFromExtraction(result),
  );
  const [links, setLinks] = useState<readonly LinkDraft[]>(() =>
    result.suggestedLinks
      // A target that is not in the allowlist is not offered at all. The schema
      // validator already refused an invented id; this is the second guarantee.
      .filter((link) =>
        linkOptions.some((option) => option.id === link.targetEntityId),
      )
      .map((link) => ({
        targetEntityId: link.targetEntityId,
        title:
          linkOptions.find((option) => option.id === link.targetEntityId)
            ?.title ?? link.targetEntityId,
        reason: link.reason,
        evidenceIds: link.evidenceIds,
        selected: false,
      })),
  );

  const patch = useCallback((index: number, change: Partial<TaskDraft>) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.index === index ? { ...draft, ...change } : draft,
      ),
    );
  }, []);

  const remove = useCallback((index: number) => {
    setDrafts((current) => current.filter((draft) => draft.index !== index));
  }, []);

  const selectedCount =
    drafts.filter((draft) => draft.selected).length +
    links.filter((link) => link.selected).length;

  return (
    <section className="dh-ai-review" aria-label="AI proposal">
      <p className="dh-ai-review__lead">
        Nothing here has been added to DalyHub. Choose what to keep, edit
        anything, and the rest is discarded.
      </p>

      <section className="dh-ai-review__block" aria-labelledby="ai-summary">
        <h3 id="ai-summary" className="dh-ai-review__heading">
          Summary
        </h3>
        <p className="dh-ai-review__summary">{result.summary}</p>
      </section>

      {result.decisions.length > 0 ? (
        <section className="dh-ai-review__block" aria-labelledby="ai-decisions">
          <h3 id="ai-decisions" className="dh-ai-review__heading">
            Decisions
          </h3>
          <ul className="dh-ai-review__list">
            {result.decisions.map((decision, index) => (
              <li key={index} className="dh-ai-review__item">
                <p className="dh-ai-review__item-text">{decision.text}</p>
                <p className="dh-ai-review__confidence">
                  Confidence: {decision.confidence}
                </p>
                <AiCitationList
                  citations={citations}
                  ids={decision.evidenceIds}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="dh-ai-review__block" aria-labelledby="ai-tasks">
        <h3 id="ai-tasks" className="dh-ai-review__heading">
          Proposed Tasks
        </h3>
        {drafts.length === 0 ? (
          <p className="dh-ai-review__empty">No Tasks were proposed.</p>
        ) : (
          <ul className="dh-ai-review__list">
            {drafts.map((draft) => (
              <li key={draft.index} className="dh-ai-review__proposal">
                <label className="dh-ai-review__select">
                  <input
                    type="checkbox"
                    checked={draft.selected}
                    onChange={(event) =>
                      patch(draft.index, { selected: event.target.checked })
                    }
                  />
                  <span>Add this Task</span>
                </label>

                <label className="dh-ai-review__field">
                  <span className="dh-ai-review__label">Title</span>
                  <input
                    type="text"
                    className="dh-input"
                    value={draft.title}
                    maxLength={200}
                    onChange={(event) =>
                      patch(draft.index, { title: event.target.value })
                    }
                  />
                </label>

                <div className="dh-ai-review__dates">
                  <label className="dh-ai-review__field">
                    <span className="dh-ai-review__label">Due</span>
                    <input
                      type="date"
                      className="dh-input"
                      value={draft.dueDate}
                      onChange={(event) =>
                        patch(draft.index, { dueDate: event.target.value })
                      }
                    />
                  </label>
                  <label className="dh-ai-review__field">
                    <span className="dh-ai-review__label">Scheduled</span>
                    <input
                      type="date"
                      className="dh-input"
                      value={draft.scheduledDate}
                      onChange={(event) =>
                        patch(draft.index, {
                          scheduledDate: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                {dateBasisLabel(draft.dateBasis) ? (
                  <p className="dh-ai-review__hint">
                    {dateBasisLabel(draft.dateBasis)}
                  </p>
                ) : null}

                <label className="dh-ai-review__field">
                  <span className="dh-ai-review__label">Project</span>
                  <select
                    className="dh-select"
                    value={draft.projectId}
                    onChange={(event) =>
                      patch(draft.index, { projectId: event.target.value })
                    }
                  >
                    <option value="">Inbox (no Project)</option>
                    {projectOptions.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </select>
                </label>

                {draft.suggestedOwnerPersonId !== null ? (
                  <p className="dh-ai-review__hint">
                    A person was suggested as the owner. DalyHub does not assign
                    Tasks to other people automatically — link them yourself if
                    that’s right.
                  </p>
                ) : null}

                <p className="dh-ai-review__confidence">
                  Confidence: {draft.confidence}
                </p>
                <AiCitationList citations={citations} ids={draft.evidenceIds} />

                <button
                  type="button"
                  className="dh-btn dh-btn--ghost"
                  onClick={() => remove(draft.index)}
                >
                  Remove this suggestion
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {links.length > 0 ? (
        <section className="dh-ai-review__block" aria-labelledby="ai-links">
          <h3 id="ai-links" className="dh-ai-review__heading">
            Suggested links
          </h3>
          <ul className="dh-ai-review__list">
            {links.map((link, index) => (
              <li key={link.targetEntityId} className="dh-ai-review__proposal">
                <label className="dh-ai-review__select">
                  <input
                    type="checkbox"
                    checked={link.selected}
                    onChange={(event) =>
                      setLinks((current) =>
                        current.map((entry, position) =>
                          position === index
                            ? { ...entry, selected: event.target.checked }
                            : entry,
                        ),
                      )
                    }
                  />
                  <span>Link to {link.title}</span>
                </label>
                <p className="dh-ai-review__item-text">{link.reason}</p>
                <AiCitationList citations={citations} ids={link.evidenceIds} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.unresolvedQuestions.length > 0 ? (
        <section className="dh-ai-review__block" aria-labelledby="ai-questions">
          <h3 id="ai-questions" className="dh-ai-review__heading">
            Still open
          </h3>
          <ul className="dh-ai-review__list">
            {result.unresolvedQuestions.map((question, index) => (
              <li key={index} className="dh-ai-review__item">
                <p className="dh-ai-review__item-text">{question.text}</p>
                <AiCitationList
                  citations={citations}
                  ids={question.evidenceIds}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="dh-ai-review__actions">
        <button
          type="button"
          className="dh-btn dh-btn--primary"
          disabled={busy || selectedCount === 0}
          onClick={() =>
            onAccept(acceptancePayload(drafts, links, sourceEntityId))
          }
        >
          {selectedCount === 0
            ? "Select what to add"
            : `Add ${selectedCount} selected`}
        </button>
        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          disabled={busy}
          onClick={onReject}
        >
          Reject the whole proposal
        </button>
      </div>
    </section>
  );
}
