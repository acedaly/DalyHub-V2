/**
 * TODAY-08 — the Morning Brief widget body.
 *
 * The calm orientation the owner reads first: a greeting, the date, the shape of
 * the day, and honest PLACEHOLDERS for the integrations DalyHub does not have yet
 * (weather, the calendar). Placeholders never pretend to have data — they say what
 * will live there, matching the `ModuleComingSoon` honesty rule. A single primary
 * "Capture" affordance focuses the Quick Capture field (no second capture store).
 */

import type { MorningBriefData } from "./types";

export interface MorningBriefProps {
  readonly data: MorningBriefData;
  readonly onCapture: () => void;
}

export function MorningBrief({ data, onCapture }: MorningBriefProps) {
  return (
    <div className="dh-morning-brief">
      <p className="dh-morning-brief__greeting">{data.greeting}.</p>
      <p className="dh-morning-brief__date">{data.dateLong}</p>
      <p className="dh-morning-brief__focus">{data.focusLine}</p>

      <div
        className="dh-morning-brief__signals"
        role="group"
        aria-label="At a glance"
      >
        <BriefSignal value={data.plannedTodayCount} label="planned" />
        <BriefSignal value={data.overdueCount} label="overdue" />
        <BriefSignal value={data.inboxCount} label="in inbox" />
      </div>

      <div className="dh-morning-brief__placeholders">
        <div className="dh-morning-brief__placeholder">
          <span className="dh-morning-brief__placeholder-label">Weather</span>
          <span className="dh-morning-brief__placeholder-note">
            Local weather will appear here once connected.
          </span>
        </div>
        <div className="dh-morning-brief__placeholder">
          <span className="dh-morning-brief__placeholder-label">
            Upcoming calendar
          </span>
          <span className="dh-morning-brief__placeholder-note">
            Your next meetings will appear here once a calendar is connected.
          </span>
        </div>
      </div>

      <button
        type="button"
        className="dh-today__secondary dh-morning-brief__capture"
        onClick={onCapture}
      >
        Capture a thought
      </button>
    </div>
  );
}

function BriefSignal({
  value,
  label,
}: {
  readonly value: number;
  readonly label: string;
}) {
  return (
    <p className="dh-morning-brief__signal">
      <span className="dh-morning-brief__signal-value">{value}</span>
      <span className="dh-morning-brief__signal-label">{label}</span>
    </p>
  );
}
