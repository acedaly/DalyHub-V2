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

import { AbsenceText } from "~/shared/pill";
import { normaliseProgressPercent } from "~/shared/progress";
import type { MeterStatus } from "~/shared/progress";
import { LabelledProgressBar } from "~/shared/ui/untitled/overrides/labelled-progress-bar";

import type { RecordSummaryBarProps } from "./types";

/**
 * The band's meter — the shared `ProgressMeter` anatomy (label, authoritative
 * summary text, then the bar) drawn with the Untitled progress composition.
 *
 * The accessibility contract is unchanged and is the reason the bar is the
 * labelled override rather than upstream's bare `ProgressBarBase`: the value is
 * always ALSO present as visible text, and the bar carries the same sentence as
 * its `aria-valuetext`, so the meaning never depends on seeing it.
 *
 * `available: false` stays a designed state, not 0%: a project with no tasks is
 * not a project that is 0% done, so the bar is replaced by the absence wording.
 */
function SummaryMeter({
  label,
  percent,
  summary,
  available = true,
  status,
}: {
  readonly label: string;
  readonly percent: number;
  readonly summary: string;
  readonly available?: boolean;
  readonly status?: MeterStatus;
}) {
  const value = normaliseProgressPercent(percent);
  return (
    <div
      className="dh-progress flex flex-col gap-1"
      data-available={available ? "true" : "false"}
    >
      <p className="dh-progress__header m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="dh-progress__label text-tertiary">{label}</span>
        {available ? (
          <span className="dh-progress__summary font-medium text-secondary">
            {summary}
          </span>
        ) : (
          <AbsenceText>{summary}</AbsenceText>
        )}
      </p>
      {available ? (
        <LabelledProgressBar
          label={label}
          value={value}
          valueText={summary}
          tone={METER_TONE[status ?? "neutral"]}
        />
      ) : null}
    </div>
  );
}

/** The meter's status vocabulary, in the shared bar's tone vocabulary. */
const METER_TONE: Record<
  MeterStatus,
  "neutral" | "positive" | "caution" | "critical"
> = {
  neutral: "neutral",
  info: "neutral",
  success: "positive",
  warning: "caution",
  danger: "critical",
};

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
      /*
       * UNTITLED-04 — the band takes Untitled's bounded card grammar, the same
       * boundary the record's tab panel and the migrated collection tables use.
       * It stays a BAND in the sense that matters — one meter, one state chip,
       * one signal line, one context line, and no second heading — but it is
       * visibly the same object family as everything else on the record.
       */
      className={[
        "dh-record-summary-bar flex min-w-0 flex-col rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary max-md:p-4",
        // A band carrying PROSE breathes; a band of derived state is tight.
        hasDescription ? "gap-4" : "gap-2",
      ].join(" ")}
      aria-label={label}
      // The container is EARNED by prose, exactly as `RecordSummary` decides it.
      data-density={hasDescription ? "full" : "sparse"}
    >
      {note !== undefined && (
        <p className="dh-record-summary-bar__note m-0 text-sm text-tertiary">
          {note}
        </p>
      )}

      {hasDescription && (
        <div className="dh-record-summary-bar__description flex min-w-0 flex-col gap-4 text-sm text-secondary">
          {description}
        </div>
      )}

      {hasHead && (
        // Progress and state read as ONE statement, so they share a row and only
        // wrap when the container genuinely cannot hold them.
        <div className="dh-record-summary-bar__head flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          {progress !== undefined && (
            <div className="dh-record-summary-bar__progress min-w-0 flex-[1_1_18rem]">
              <SummaryMeter {...progress} />
            </div>
          )}
          {state !== undefined && (
            <div className="dh-record-summary-bar__state shrink-0">{state}</div>
          )}
        </div>
      )}

      {hasSignals && (
        // One wrapped line of short sentences, mid-dot separated. Tone tints a
        // sentence; it never replaces the words.
        <ul className="dh-record-summary-bar__signals m-0 flex min-w-0 list-none flex-wrap items-baseline gap-x-2 gap-y-1 p-0 text-sm text-tertiary">
          {signals.map((signal, index) => (
            <li
              key={signal.id}
              className={`dh-record-summary-bar__signal min-w-0 ${SIGNAL_TONE[signal.tone ?? "neutral"] ?? ""}`}
              data-tone={signal.tone ?? "neutral"}
            >
              {index > 0 ? (
                <span className="pr-2 text-quaternary" aria-hidden="true">
                  ·
                </span>
              ) : null}
              {signal.text}
            </li>
          ))}
        </ul>
      )}

      {hasFacts && (
        // Quiet secondary context, the same weight as the header's context line
        // so a fact reads the same wherever the record chose to put it.
        <dl className="dh-record-summary-bar__facts m-0 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          {facts.map((fact, index) => (
            <div
              key={fact.id}
              className="dh-record-summary-bar__fact flex min-w-0 items-baseline gap-1"
            >
              {index > 0 ? (
                <span className="pr-1 text-quaternary" aria-hidden="true">
                  ·
                </span>
              ) : null}
              <dt className="text-tertiary">{fact.label}</dt>
              <dd className="m-0 font-medium break-words text-secondary">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** A signal's tint. Reinforcement only — the sentence states the fact. */
const SIGNAL_TONE: Record<string, string> = {
  neutral: "",
  danger: "text-error-primary",
  warning: "text-warning-primary",
  success: "text-success-primary",
};
