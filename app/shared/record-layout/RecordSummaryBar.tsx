/**
 * RECORD-01 — the compact record summary band.
 *
 * The record-detail convergence's replacement for the per-module "roll-up
 * dashboard" card. Three modules had grown one — a Project's roll-up progress
 * card, an Area's momentum card, a Goal's contribution card — and each had
 * become the tallest thing on its record. The Project's measured 505px at
 * 1280×800, which alone pushed the task list 60px past the bottom of the
 * viewport; the Area's spent 240px restating that nothing was happening.
 *
 * They grew tall for the same reason: each stated the record's current state
 * three ways — a meter, a list of derived signals, and then a key/value grid
 * repeating the very signals above it. This band states it once.
 *
 *     ┌ progress ─────────────────┐ ┌ state ┐
 *     [████████────────] 9 of 24 complete  ● At risk
 *     3 tasks past their due date · 2 of 15 open tasks waiting
 *     Area Home & Property · Goal Finish the ground-floor renovation
 *
 * It is a BAND on the page canvas, not a card. A record that genuinely carries
 * prose (a Goal's definition of done, a Note's description) still uses the
 * DS-02 `RecordSummary` card; this is for records whose summary is derived
 * state, which is most of them. Both regions are `aria-label`led so assistive
 * tech still hears a summary either way.
 *
 * Deliberately not a dashboard: it renders values the caller already has,
 * derives nothing, and has a hard budget of one meter, one state chip, one
 * signal line and one context line. Anything that does not fit belongs in a tab
 * or in the record's Settings details.
 */

import { ProgressMeter } from "~/shared/progress";

import type { RecordSummaryBarProps } from "./types";

export function RecordSummaryBar({
  description,
  progress,
  state,
  signals,
  facts,
  note,
  label = "Summary",
}: RecordSummaryBarProps) {
  const hasSignals = signals !== undefined && signals.length > 0;
  const hasFacts = facts !== undefined && facts.length > 0;
  const hasHead = progress !== undefined || state !== undefined;
  const hasDescription = description !== undefined && description !== null;

  if (
    !hasHead &&
    !hasSignals &&
    !hasFacts &&
    !hasDescription &&
    note === undefined
  ) {
    return null;
  }

  return (
    <section
      className="dh-record-summary-bar"
      aria-label={label}
      // The container is EARNED by prose, exactly as `RecordSummary` decides it.
      data-density={hasDescription ? "full" : "sparse"}
    >
      {note !== undefined && (
        <p className="dh-record-summary-bar__note">{note}</p>
      )}

      {hasDescription && (
        <div className="dh-record-summary-bar__description">{description}</div>
      )}

      {hasHead && (
        <div className="dh-record-summary-bar__head">
          {progress !== undefined && (
            <div className="dh-record-summary-bar__progress">
              <ProgressMeter {...progress} />
            </div>
          )}
          {state !== undefined && (
            <div className="dh-record-summary-bar__state">{state}</div>
          )}
        </div>
      )}

      {hasSignals && (
        <ul className="dh-record-summary-bar__signals">
          {signals.map((signal) => (
            <li
              key={signal.id}
              className="dh-record-summary-bar__signal"
              data-tone={signal.tone ?? "neutral"}
            >
              {signal.text}
            </li>
          ))}
        </ul>
      )}

      {hasFacts && (
        <dl className="dh-record-summary-bar__facts">
          {facts.map((fact) => (
            <div key={fact.id} className="dh-record-summary-bar__fact">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
