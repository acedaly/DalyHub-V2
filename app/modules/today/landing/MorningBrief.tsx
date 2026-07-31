/**
 * TODAY-08 — the Morning Brief widget body.
 *
 * The calm orientation the owner reads first: a greeting, the date, the shape of
 * the day, and a single "Capture" affordance that focuses the Quick Capture field
 * (no second capture store).
 *
 * ── The weather and calendar placeholders were REMOVED (THEME-01) ─────────────
 * This widget used to reserve two panels labelled "Weather" and "Upcoming
 * calendar", each saying the data would appear "once connected". They were honest
 * about having no data, but they were still wrong for a product being called
 * finished: they took permanent space on the most-used screen in the app, every
 * single day, to advertise two integrations that do not exist and are not being
 * built. A panel that has never once shown information is not a placeholder — it
 * is a promise the product keeps failing to keep.
 *
 * The decision (option 3 of the milestone's three honest outcomes): remove them
 * from V2 and record both as deferred. There is no weather data source, no
 * provider, no configuration and no key, so shipping a widget would have meant
 * shipping either fake data or a permanently-empty box. When a real source exists,
 * weather returns as an OPTIONAL widget that is off until configured — not as a
 * reserved space. Recorded in ROADMAP_V2 and PRODUCT_DEBT (DEBT-53).
 *
 * Today's own signals — planned, overdue, inbox — stay, because they are real
 * numbers derived from the owner's actual records.
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
