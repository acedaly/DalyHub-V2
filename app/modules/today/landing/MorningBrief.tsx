/**
 * TODAY-08 / POLISH-02 — the Today hero.
 *
 * The first thing the owner reads, and now the only place the day is summarised.
 * It answers, in one band and without scrolling: who is being greeted, what day it
 * is, what shape the day has, how far through it they are, and what is competing
 * for their attention right now.
 *
 * ── What POLISH-02 changed ────────────────────────────────────────────────────
 * The brief used to be a narrow card in the right-hand column carrying three
 * numbers (planned / overdue / inbox) that My day's own summary strip stated again
 * a few hundred pixels away. Two statements of the same fact is one too many, and
 * the one in the corner was the one nobody read. The strip moved UP into the hero,
 * gained the cross-module counts that were previously only reachable by scrolling
 * (today's meetings, what is waiting on other people, projects that need a look),
 * and My day now leads with its tasks rather than with a restatement of the header.
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
 * Today's own signals stay, because they are real numbers derived from the owner's
 * actual records.
 *
 * ── Colour ───────────────────────────────────────────────────────────────────
 * A stat is neutral unless it is genuinely asking for something. `attention` is
 * reserved for work that has slipped, `positive` for what has been finished today;
 * everything else — meetings, waiting, inbox — is a plain fact in the plain colour.
 * The tone is always a reinforcement: the LABEL names the signal, so nothing here
 * depends on seeing a colour (AGENTS.md §15).
 */

import { Link } from "react-router";

import { ProgressMeter } from "~/shared/progress";

import type { MorningBriefData } from "./types";

/** One number in the hero's "at a glance" rail. */
export interface BriefStat {
  readonly id: string;
  readonly value: number;
  /** The word under the number. Always present — never a colour on its own. */
  readonly label: string;
  /** Where the number is answered, when it has an in-app destination. */
  readonly href?: string;
  readonly tone?: "neutral" | "attention" | "positive";
}

/** How far through the day's committed work the owner is. */
export interface BriefProgress {
  readonly done: number;
  readonly total: number;
}

export interface MorningBriefProps {
  readonly data: MorningBriefData;
  readonly onCapture: () => void;
  /**
   * The at-a-glance rail. Defaults to the brief's own three counts so a caller
   * without cross-module facts still renders a complete hero.
   */
  readonly stats?: readonly BriefStat[];
  /** Today's completion, when there is anything committed to measure. */
  readonly progress?: BriefProgress;
}

export function MorningBrief({
  data,
  onCapture,
  stats,
  progress,
}: MorningBriefProps) {
  const rail: readonly BriefStat[] = stats ?? [
    { id: "planned", value: data.plannedTodayCount, label: "planned" },
    {
      id: "overdue",
      value: data.overdueCount,
      label: "overdue",
      tone: data.overdueCount > 0 ? "attention" : "neutral",
    },
    { id: "inbox", value: data.inboxCount, label: "in inbox" },
  ];

  return (
    <div className="dh-hero">
      <div className="dh-hero__intro">
        <p className="dh-hero__greeting">
          {data.greeting}
          {data.ownerName ? `, ${data.ownerName}` : ""}.
        </p>
        <p className="dh-hero__date">{data.dateLong}</p>
        <p className="dh-hero__focus">{data.focusLine}</p>

        {progress && progress.total > 0 ? (
          <div className="dh-hero__progress">
            <ProgressMeter
              label="Today’s progress"
              percent={(progress.done / progress.total) * 100}
              summary={`${progress.done} of ${progress.total} done`}
            />
          </div>
        ) : null}

        <button
          type="button"
          className="dh-today__secondary dh-hero__capture"
          onClick={onCapture}
        >
          Capture a thought
        </button>
      </div>

      <div
        className="dh-hero__stats"
        role="group"
        aria-label="Today at a glance"
      >
        {rail.map((stat) => (
          <BriefStatTile key={stat.id} stat={stat} />
        ))}
      </div>
    </div>
  );
}

function BriefStatTile({ stat }: { readonly stat: BriefStat }) {
  const body = (
    <>
      <span className="dh-hero__stat-value">{stat.value}</span>
      <span className="dh-hero__stat-label">{stat.label}</span>
    </>
  );
  // A stat with somewhere to go is a link; one without is plain text. A tile that
  // looks clickable and is not is worse than a tile that does not look clickable.
  return stat.href ? (
    <Link
      className="dh-hero__stat"
      data-tone={stat.tone ?? "neutral"}
      to={stat.href}
    >
      {body}
    </Link>
  ) : (
    <p className="dh-hero__stat" data-tone={stat.tone ?? "neutral"}>
      {body}
    </p>
  );
}
