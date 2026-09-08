/**
 * V2.15 ASSIST — the ONE proposal review surface.
 *
 * Finance categorisation, an obligation follow-up and a Review reflection draft
 * are three very different suggestions. They are reviewed the same way, because
 * the roadmap's rule is that domain-specific RENDERING is fine and
 * domain-specific ACTION SEMANTICS are not: three tick boxes that mean three
 * slightly different things is how a product teaches its owner not to trust
 * any of them.
 *
 * ## What this surface guarantees
 *
 * **Suggested and Applied are different sections, and nothing crosses between
 * them without a press.** Nothing starts selected, there is no toggle that
 * applies on change, no hover behaviour, no timeout and no confidence
 * threshold. The only path from a suggestion to a change is the Apply button,
 * and it says how many changes it is about to make.
 *
 * **Every change shows its before and after.** `Uncategorised → Groceries`,
 * rendered by DalyHub from values it holds, so the owner never has to infer the
 * change from prose.
 *
 * **Every result is stated, per item.** Applied, Already done, Not applied —
 * changed, Refused. A stale row does not silently disappear from a batch of
 * twenty; it says what happened to it and why.
 *
 * **Undo is offered where there is something to undo**, and it is the server's
 * own inverse payload rather than a guess this component assembles.
 *
 * ## What it deliberately is not
 *
 * No purple gradient, no sparkle, no robot, no confidence gauge and no percentage.
 * A suggestion is a reviewable product change and it is painted like one.
 */

import { useCallback, useMemo, useState } from "react";

import type { FactBlock } from "~/kernel/ai";
import { Button, Checkbox, Select, Textarea } from "~/shared/ui";

import { AiFactCitations } from "./AiGrounded";
import {
  applySummary,
  patchRow,
  proposalOutcomeLabel,
  selectedRows,
  setAllSelected,
  type ProposalRowDraft,
  type ProposalRowOutcome,
} from "./proposal-view";

export interface AiProposalReviewProps {
  /** The heading for the suggestions, in the owner's nouns. */
  readonly title: string;
  /** One sentence about what was looked at, and what was not. */
  readonly lead?: string;
  readonly rows: readonly ProposalRowDraft[];
  readonly onRowsChange: (rows: readonly ProposalRowDraft[]) => void;
  /** The facts the suggestions cited, so "why this?" resolves to real figures. */
  readonly facts: FactBlock | null;
  /** The verb on the primary control. "Apply selected", "Add selected". */
  readonly applyLabel?: string;
  readonly busy: boolean;
  readonly onApply: (rows: readonly ProposalRowDraft[]) => void;
  readonly onReject: () => void;
  /** Per-row results, keyed by row id. Empty until an apply has happened. */
  readonly outcomes: ReadonlyMap<string, ProposalRowOutcome>;
  /** Offered only when at least one applied row reported an inverse. */
  readonly onUndo: (() => void) | null;
}

export function AiProposalReview({
  title,
  lead,
  rows,
  onRowsChange,
  facts,
  applyLabel = "Apply selected",
  busy,
  onApply,
  onReject,
  outcomes,
  onUndo,
}: AiProposalReviewProps) {
  const [showWhy, setShowWhy] = useState<string | null>(null);

  const chosen = useMemo(() => selectedRows(rows), [rows]);
  const allSelected = rows.length > 0 && chosen.length === rows.length;

  const toggle = useCallback(
    (id: string, selected: boolean) => {
      onRowsChange(patchRow(rows, id, { selected }));
    },
    [rows, onRowsChange],
  );

  const choose = useCallback(
    (id: string, chosenOptionId: string) => {
      onRowsChange(patchRow(rows, id, { chosenOptionId }));
    },
    [rows, onRowsChange],
  );

  const edit = useCallback(
    (id: string, draftText: string) => {
      onRowsChange(patchRow(rows, id, { draftText }));
    },
    [rows, onRowsChange],
  );

  const applied = outcomes.size > 0;

  if (rows.length === 0) {
    return (
      <section className="dh-ai-proposal" aria-labelledby="ai-proposal-title">
        <h3 id="ai-proposal-title" className="dh-ai-review__heading">
          {title}
        </h3>
        <p className="dh-ai-review__empty">
          Nothing was suggested. That is a legitimate answer — where there is
          not enough to go on, DalyHub would rather say so than guess.
        </p>
      </section>
    );
  }

  return (
    <section className="dh-ai-proposal" aria-labelledby="ai-proposal-title">
      <h3 id="ai-proposal-title" className="dh-ai-review__heading">
        {applied ? "Applied" : title}
      </h3>
      {lead === undefined ? null : (
        <p className="dh-ai-proposal__lead">{lead}</p>
      )}

      {applied || rows.length < 2 ? null : (
        <div className="dh-ai-proposal__bulk">
          <Checkbox
            label={allSelected ? "Clear all" : "Select all"}
            checked={allSelected}
            disabled={busy}
            onChange={(event) =>
              onRowsChange(setAllSelected(rows, event.target.checked))
            }
          />
        </div>
      )}

      <ul className="dh-ai-review__list">
        {rows.map((row) => {
          const outcome = outcomes.get(row.id) ?? null;
          const optionLabel =
            row.editable === "text"
              ? row.draftText
              : (row.options.find((option) => option.id === row.chosenOptionId)
                  ?.label ?? row.proposedLabel);
          const edited = optionLabel !== row.proposedLabel;
          return (
            <li key={row.id} className="dh-ai-review__proposal">
              {outcome === null ? (
                <Checkbox
                  checked={row.selected}
                  disabled={busy}
                  onChange={(event) => toggle(row.id, event.target.checked)}
                  label={
                    <span className="dh-ai-proposal__subject">
                      {row.subject}
                    </span>
                  }
                />
              ) : (
                <p className="dh-ai-proposal__subject">{row.subject}</p>
              )}

              {row.context === null ? null : (
                <p className="dh-ai-proposal__context">{row.context}</p>
              )}

              {/*
               * The difference view. `current → proposed`, both rendered by
               * DalyHub from values it holds — never a sentence the owner has
               * to parse to work out what would change. The arrow is decorative
               * and carries an accessible word beside it, because a screen
               * reader must not have to interpret a glyph.
               *
               * A TEXT row before it is applied shows only what would be
               * replaced: the editor below it IS the proposed side, and
               * rendering a paragraph of draft prose twice would be noise
               * rather than a difference.
               */}
              {row.editable === "text" && outcome === null ? (
                row.currentLabel === null ? null : (
                  <p className="dh-ai-proposal__change">
                    <span className="dh-ai-proposal__label">Replaces</span>
                    <span className="dh-ai-proposal__current">
                      {row.currentLabel}
                    </span>
                  </p>
                )
              ) : (
                <p className="dh-ai-proposal__change">
                  {row.currentLabel === null ? (
                    <span className="dh-ai-proposal__proposed">
                      {optionLabel}
                    </span>
                  ) : (
                    <>
                      <span className="dh-ai-proposal__current">
                        {row.currentLabel}
                      </span>
                      <span
                        aria-hidden="true"
                        className="dh-ai-proposal__arrow"
                      >
                        →
                      </span>
                      <span className="dh-ai-proposal__sr"> changes to </span>
                      <span className="dh-ai-proposal__proposed">
                        {optionLabel}
                      </span>
                    </>
                  )}
                  {edited ? (
                    <span className="dh-ai-proposal__edited">
                      {" "}
                      (your choice)
                    </span>
                  ) : null}
                </p>
              )}

              {outcome === null && row.editable === "option" ? (
                <label className="dh-ai-review__field">
                  <span className="dh-ai-review__label">Category</span>
                  <Select
                    value={row.chosenOptionId}
                    disabled={busy}
                    onChange={(event) => choose(row.id, event.target.value)}
                  >
                    {row.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.note === undefined
                          ? option.label
                          : `${option.label} — ${option.note}`}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}

              {outcome === null && row.editable === "text" ? (
                /*
                 * The draft, editable in place. The moment the owner changes a
                 * word it is THEIR text: the server validates it exactly as it
                 * validates anything else they type, and the audit says the
                 * proposal was adjusted before it was accepted.
                 */
                <div className="dh-ai-review__field">
                  <label
                    className="dh-ai-review__label"
                    htmlFor={`ai-draft-${row.id}`}
                  >
                    Draft
                  </label>
                  <Textarea
                    id={`ai-draft-${row.id}`}
                    className="dh-ai-review__body"
                    rows={8}
                    value={row.draftText}
                    disabled={busy}
                    onChange={(event) => edit(row.id, event.target.value)}
                    data-testid="ai-reflection-draft"
                  />
                </div>
              ) : null}

              {outcome === null ? (
                <>
                  <p className="dh-ai-review__item-text">{row.reason}</p>
                  <Button
                    variant="subtle"
                    size="sm"
                    aria-expanded={showWhy === row.id}
                    onClick={() =>
                      setShowWhy(showWhy === row.id ? null : row.id)
                    }
                  >
                    Why this?
                  </Button>
                  {showWhy === row.id ? (
                    <AiFactCitations block={facts} ids={row.factIds} />
                  ) : null}
                </>
              ) : (
                <p
                  className="dh-ai-proposal__outcome"
                  data-outcome={outcome.outcome}
                >
                  <strong>{proposalOutcomeLabel(outcome)}</strong>
                  {outcome.message === null ? null : ` — ${outcome.message}`}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="dh-ai-review__actions">
        {applied ? (
          onUndo === null ? null : (
            <Button variant="secondary" disabled={busy} onClick={onUndo}>
              Undo
            </Button>
          )
        ) : (
          <>
            <Button
              variant="primary"
              disabled={busy || chosen.length === 0}
              onClick={() => onApply(chosen)}
            >
              {applyLabel}
            </Button>
            <Button variant="subtle" disabled={busy} onClick={onReject}>
              Reject
            </Button>
            <p className="dh-ai-proposal__count" aria-live="polite">
              {applySummary(rows)}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
