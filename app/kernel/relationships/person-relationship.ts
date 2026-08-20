/**
 * PEOPLE-03 Relationship intelligence kernel — the pure, storage-independent
 * relationship model.
 *
 * A DERIVED, NON-PERSISTED projection over the FND-04 EntityLinks a Person holds
 * and the FND-05 Activity stream those linked records write to (the SAME two
 * primitives PEOPLE-02's unified relationship Timeline is a projection over —
 * ADR-052). Nothing here is stored, cached or backfilled: a relationship's summary
 * and its stay-in-touch state are recomputed from live facts on every read, so they
 * can never drift from the timeline the owner is looking at. This mirrors PROJ-02
 * project health and AREA-03 goal alignment exactly ("derived, never cached").
 *
 * This module owns ONLY the rules. The facts are gathered by the workspace-scoped
 * `RelationshipRepository` (`relationship-repository.ts`) in a fixed number of
 * grouped queries, and every value it needs is a number, a `Date` or a date-only
 * string — never a display string, and never a private field.
 *
 * The evaluator is a pure function of (facts, context): given the same facts and
 * the same injected clock it returns the same result, so the whole rule matrix is
 * unit-tested WITHOUT a database, a React tree or the wall clock.
 *
 * Tone is governed by AGENTS.md §5 — **care, not a CRM**. There are no streaks, no
 * scores, no badges and no red "overdue" relationship. The strongest thing this
 * model will ever say is that it has been a while, stated as a fact, once. Colour
 * never carries meaning on its own; the label always does.
 */

import type { FollowUpFrequency } from "~/kernel/people";

/* -------------------------------------------------------------------------- */
/* Domain thresholds — named, documented constants (never buried in React)     */
/* -------------------------------------------------------------------------- */

/**
 * An interaction within this many owner-calendar days reads as **recently
 * connected**. A fortnight is the same calm cadence PROJ-02 uses for momentum:
 * long enough that an ordinary busy week never flips the signal, short enough that
 * "we spoke recently" still means something.
 */
export const RECENTLY_CONNECTED_WITHIN_DAYS = 14;

/**
 * No interaction for this many owner-calendar days reads as an **extended
 * absence**. Six months is deliberately long: DalyHub is not a sales pipeline, and
 * a friend you see twice a year is not a lapsed lead (AGENTS.md §5). Below this,
 * the only thing that can produce a follow-up signal is a cadence the owner chose
 * or a rhythm the relationship itself demonstrably has.
 */
export const EXTENDED_ABSENCE_AFTER_DAYS = 180;

/**
 * The owner's chosen follow-up frequency, expressed in owner-calendar days. This is
 * the ONLY place the PEOPLE-01 vocabulary is given a duration; the field has been
 * persisted since PEOPLE-01 and nothing read it until now.
 */
export const FOLLOW_UP_CADENCE_DAYS: Readonly<
  Record<FollowUpFrequency, number>
> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  quarterly: 91,
  biannually: 182,
  annually: 365,
};

/**
 * How much of a relationship's OWN observed rhythm must elapse before a follow-up
 * is suggested when the owner has NOT chosen a cadence. Twice the average interval
 * means the signal only appears once the relationship has genuinely fallen out of
 * its own pattern — never merely because a normal gap is in progress.
 */
export const OBSERVED_RHYTHM_MULTIPLIER = 2;

/**
 * The minimum number of distinct interaction days needed before a rhythm is
 * inferred at all. Two points make a line, but not a habit; three is the smallest
 * honest sample. Below it, no cadence is invented.
 */
export const MIN_DAYS_FOR_OBSERVED_RHYTHM = 3;

/** Mean days per Gregorian month, for expressing a cadence as "times a month". */
const DAYS_PER_MONTH = 30.436_875;

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The activity event types that count as a genuine **interaction** with a Person.
 *
 * The rule the roadmap set for PEOPLE-03 is that a signal derived from
 * `person.updated` would be dishonest — editing someone's phone number is not
 * seeing them. So an interaction is an event on a record the Person is LINKED to
 * (a meeting, a diary entry, a note, a commitment, a review), never an event on
 * their contact card.
 *
 * Deliberately EXCLUDED, and why:
 *   - every `person.*` type — record maintenance on the contact card itself;
 *   - every `entity_link.*` type — relationship bookkeeping, not a moment;
 *   - `entity.updated` — a rename;
 *   - `entity.deleted` / `entity.restored` — tidying up;
 *   - archive / restore / status-change types — filing, not contact;
 *   - **HARDEN-06D (F-06)** — every `*.updated` / `*.content_updated` type on a
 *     LINKED record: `meeting.updated`, `diary_entry.updated` and
 *     `note.content_updated`.
 *
 * That last exclusion is this rule applied ONE LEVEL OUT, and it took a defect to
 * see that it belonged there. The vocabulary reasoned carefully about the
 * Person's own record — editing someone's phone number is not seeing them — and
 * then treated every linked record's maintenance event as contact. Two
 * consequences followed, both reproduced:
 *
 *   - one meeting, typed up in ten debounced autosaves, reported "Total
 *     interactions: 11 · across 1 day". `meeting.updated` fires for every
 *     keystroke batch in the agenda or notes editor;
 *   - fixing a typo in a six-month-old meeting's TITLE moved `lastInteractionAt`
 *     to today, which flipped the Person out of `due_for_follow_up` /
 *     `out_of_touch` and removed the follow-up signal entirely.
 *
 * The durable rule is now stated once: **a record's CREATION and the product's
 * explicit contact and commitment events are the moments; editing a record
 * afterwards is maintenance.** A meeting still counts through `meeting.created`
 * and, far more strongly, `meeting.held`; a diary entry through
 * `diary_entry.created`; a note through its `entity.created`. Nothing an owner
 * genuinely did with a person became invisible — only the autosaves did.
 *
 * The cadence arithmetic never had this problem (it reduces its sample to
 * DISTINCT owner-calendar days, so ten saves in one day were always one day). It
 * was `totalInteractions`, an exact event count, and `lastInteractionAt`, an
 * instant, that carried it.
 *
 * Each moment is counted exactly ONCE: modules with their own repository emit only
 * their own creation event (`meeting.created`, `diary_entry.created`,
 * `review.created`), and records created through the generic entity/spine path
 * (Notes, Tasks, Projects) emit only `entity.created` — the two never both fire for
 * one creation.
 *
 * A module that contributes real contact joins this vocabulary and nothing else
 * changes — MEET-03's `meeting.held` did exactly that, and a future Email/Calls
 * module will too.
 *
 * `meeting.held` is the STRONGEST interaction the product records: MEET-03 names
 * the Meeting AND every active attendee Person as subjects of one multi-subject
 * event (ADR-055), so it is an interaction with each attendee IN THEIR OWN RIGHT.
 * It therefore survives the attendee link later being removed, where the rest of
 * this vocabulary — which reaches a Person only through a live link — does not.
 */
export const INTERACTION_ACTIVITY_TYPES = [
  "entity.created",
  "diary_entry.created",
  "meeting.created",
  "meeting.held",
  "meeting.item_converted_to_task",
  "meeting.follow_up_created",
  "task.completed",
  "task.reopened",
  "review.created",
  "review.completed",
] as const;

/**
 * The presentation tone of a relationship signal. A strict subset of the shared
 * `CardTone`/`RecordTone` vocabulary (identical string values), so it drops straight
 * into a Card or Record status pill. `warning` and `danger` are deliberately
 * ABSENT: a relationship is never an error state (AGENTS.md §5). Meaning is always
 * carried by the paired label too, never by colour alone.
 */
export type RelationshipTone = "neutral" | "success" | "info";

/**
 * The stable, machine-readable stay-in-touch state. Chosen not to collide with any
 * existing DalyHub vocabulary (project health, task display state, review status).
 *
 * - `no_history`          — nothing shared yet; an invitation, not a deficiency.
 * - `recently_connected`  — an interaction within the recent window.
 * - `in_touch`            — interacting, and still inside the expected rhythm.
 * - `due_for_follow_up`   — past the cadence the owner chose, or past this
 *                           relationship's own demonstrated rhythm.
 * - `out_of_touch`        — no interaction for an extended period.
 */
export const RELATIONSHIP_STATES = [
  "no_history",
  "recently_connected",
  "in_touch",
  "due_for_follow_up",
  "out_of_touch",
] as const;
export type RelationshipState = (typeof RELATIONSHIP_STATES)[number];

/**
 * A stable, machine-readable reason code. Every result carries at least one,
 * primary first — the UI shows secondary context without discarding it, and tests
 * assert on the code and its structured numbers, never on display prose.
 */
export const RELATIONSHIP_REASON_CODES = [
  "no_interactions",
  "recent_interaction",
  "steady_rhythm",
  "single_interaction",
  "cadence_elapsed",
  "follow_up_date_passed",
  "rhythm_elapsed",
  "extended_absence",
] as const;
export type RelationshipReasonCode = (typeof RELATIONSHIP_REASON_CODES)[number];

/** Where the expected interval used for the follow-up signal came from. */
export type ExpectedIntervalSource = "follow_up_frequency" | "observed_rhythm";

/* -------------------------------------------------------------------------- */
/* Facts (the evaluator's input)                                               */
/* -------------------------------------------------------------------------- */

/**
 * How many records of each kind a Person shares, gathered from their ACTIVE
 * EntityLinks to ACTIVE, in-workspace records. These are structural counts only —
 * no title, body, agenda or private field is read to produce them.
 */
export type RelationshipRecordCounts = {
  /** Meetings the Person is linked to (attended or scheduled). */
  readonly meetings: number;
  /** Diary entries that mention the Person (linked). */
  readonly diaryEntries: number;
  /** Notes linked to the Person. */
  readonly notes: number;
  /** Tasks linked to the Person. */
  readonly tasks: number;
  /** Of those tasks, the ones that are not yet complete. */
  readonly openTasks: number;
  /** Projects the Person participates in. */
  readonly projects: number;
  /** Of those projects, the ones that are neither complete nor archived. */
  readonly activeProjects: number;
  /** Reviews that mention the Person. */
  readonly reviews: number;
  /** Every other linked record kind (assets, goals, areas, other people …). */
  readonly otherRecords: number;
  /** Every linked record, whatever its kind. */
  readonly total: number;
};

/** An empty inventory — the honest zero shape for a Person with no relationships. */
export const EMPTY_RELATIONSHIP_RECORD_COUNTS: RelationshipRecordCounts = {
  meetings: 0,
  diaryEntries: 0,
  notes: 0,
  tasks: 0,
  openTasks: 0,
  projects: 0,
  activeProjects: 0,
  reviews: 0,
  otherRecords: 0,
  total: 0,
};

/**
 * The raw, workspace-scoped facts one Person's relationship is derived from —
 * gathered in a fixed number of grouped, N+1-free queries by the
 * `RelationshipRepository`.
 */
export type PersonRelationshipFacts = {
  readonly personId: string;
  /** The structural inventory of shared records. */
  readonly records: RelationshipRecordCounts;
  /** The earliest qualifying interaction instant, or null when there is none. */
  readonly firstInteractionAt: Date | null;
  /** The most recent qualifying interaction instant, or null when there is none. */
  readonly lastInteractionAt: Date | null;
  /** Every qualifying interaction event, counted exactly once. Exact, unbounded. */
  readonly totalInteractions: number;
  /**
   * A BOUNDED, newest-first sample of qualifying interaction instants, used only
   * for cadence arithmetic (averages and gaps). Bounding it keeps one read cheap;
   * `interactionSampleTruncated` says so honestly, and the totals above stay exact.
   */
  readonly interactionSample: readonly Date[];
  /** True when older interactions exist beyond the sample bound. */
  readonly interactionSampleTruncated: boolean;
};

/** The honest zero facts for a Person with no relationships and no history. */
export function emptyPersonRelationshipFacts(
  personId: string,
): PersonRelationshipFacts {
  return {
    personId,
    records: EMPTY_RELATIONSHIP_RECORD_COUNTS,
    firstInteractionAt: null,
    lastInteractionAt: null,
    totalInteractions: 0,
    interactionSample: [],
    interactionSampleTruncated: false,
  };
}

/**
 * The injected clock + owner-calendar seam, plus the two Person-owned inputs the
 * signal is allowed to consider. Passed in (never read from the ambient wall clock)
 * so the rule matrix is deterministic.
 */
export type RelationshipEvaluationContext = {
  /** The instant the relationship is evaluated at. */
  readonly now: Date;
  /** The owner's current calendar date `YYYY-MM-DD`. */
  readonly todayIso: string;
  /** Map an arbitrary instant to its owner-calendar date `YYYY-MM-DD`. */
  readonly calendarIsoOf: (instant: Date) => string;
  /** The cadence the owner chose for this Person, or null when they chose none. */
  readonly followUpFrequency: FollowUpFrequency | null;
  /** The explicit next-follow-up date `YYYY-MM-DD` the owner set, or null. */
  readonly nextFollowUpIso: string | null;
};

/* -------------------------------------------------------------------------- */
/* Result (the evaluator's output — fully JSON-safe)                           */
/* -------------------------------------------------------------------------- */

/** One explained reason. Structured fields drive tests and the UI; `summary` is a
 * calm factual fallback string. */
export type RelationshipReason = {
  readonly code: RelationshipReasonCode;
  readonly tone: RelationshipTone;
  /** A calm, factual, non-judgmental one-liner. */
  readonly summary: string;
  /** A relevant duration in owner-calendar days, when the reason has one. */
  readonly days?: number;
  /** A relevant owner-calendar date `YYYY-MM-DD`, when the reason has one. */
  readonly date?: string;
  /** A relevant count, when the reason has one. */
  readonly count?: number;
};

/** The relationship's cadence — how often, how long, how steady. All JSON-safe. */
export type RelationshipCadence = {
  /** Owner-calendar days since the most recent interaction, or null when none. */
  readonly daysSinceLastInteraction: number | null;
  /** Mean owner-calendar days between interaction days, or null below two days. */
  readonly averageIntervalDays: number | null;
  /**
   * The longest CLOSED gap between two recorded interaction days, or null below
   * two days. Deliberately separate from `daysSinceLastInteraction`: an in-progress
   * silence is not yet a historical fact.
   */
  readonly longestGapDays: number | null;
  /** Distinct owner-calendar days on which an interaction was recorded (sample). */
  readonly interactionDays: number;
  /** Owner-calendar days spanned by the sample, first to last, or null. */
  readonly observedSpanDays: number | null;
  /** Interactions per month implied by the average interval, 1 dp, or null. */
  readonly interactionsPerMonth: number | null;
  /** The interval the follow-up signal was measured against, or null when none. */
  readonly expectedIntervalDays: number | null;
  /** Where that interval came from, or null when no cadence could be established. */
  readonly expectedIntervalSource: ExpectedIntervalSource | null;
  /** True when cadence was computed over a bounded sample of a longer history. */
  readonly sampleTruncated: boolean;
};

/** The supporting relationship facts the summary cards render (all JSON-safe). */
export type RelationshipSummary = {
  readonly totalInteractions: number;
  readonly meetings: number;
  readonly diaryEntries: number;
  readonly notes: number;
  readonly tasks: number;
  readonly openTasks: number;
  readonly projects: number;
  readonly activeProjects: number;
  readonly reviews: number;
  readonly otherRecords: number;
  /** Every linked record, whatever its kind. */
  readonly sharedRecords: number;
  /** The first interaction instant (ISO-8601 UTC), or null. */
  readonly firstInteractionIso: string | null;
  /** The first interaction's owner-calendar date `YYYY-MM-DD`, or null. */
  readonly firstInteractionDate: string | null;
  /** The most recent interaction instant (ISO-8601 UTC), or null. */
  readonly lastInteractionIso: string | null;
  /** The most recent interaction's owner-calendar date `YYYY-MM-DD`, or null. */
  readonly lastInteractionDate: string | null;
};

/**
 * A Person's derived relationship state — a stable state, a calm label, a tone,
 * explained reasons, the summary facts and the cadence. Entirely JSON-serialisable,
 * so a loader returns it straight to the browser.
 */
export type PersonRelationship = {
  readonly personId: string;
  readonly state: RelationshipState;
  /** The calm user-facing label for the primary state. */
  readonly label: string;
  /** The presentation tone (the primary reason's tone). */
  readonly tone: RelationshipTone;
  /** One or more reasons, primary first. Never empty. */
  readonly reasons: readonly RelationshipReason[];
  readonly summary: RelationshipSummary;
  readonly cadence: RelationshipCadence;
  /** The instant the relationship was evaluated (ISO-8601 UTC). */
  readonly evaluatedAtIso: string;
};

/* -------------------------------------------------------------------------- */
/* Pure date-only helpers (no timezone — operate on `YYYY-MM-DD` dates)         */
/* -------------------------------------------------------------------------- */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a `YYYY-MM-DD` calendar date to a UTC-midnight epoch-day count. Date-only
 * values are never routed through a timezone (ADR-030); UTC midnight is a stable,
 * DST-free anchor for day arithmetic. */
function epochDay(iso: string): number {
  if (!ISO_DATE.test(iso)) {
    throw new RangeError(`Not a YYYY-MM-DD calendar date: ${iso}`);
  }
  const [y, m, d] = iso.split("-").map((part) => Number(part));
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Whole owner-calendar days from `fromIso` up to `toIso` (positive when `toIso` is
 * later). Both are date-only `YYYY-MM-DD`.
 */
export function relationshipDaysBetween(
  fromIso: string,
  toIso: string,
): number {
  return epochDay(toIso) - epochDay(fromIso);
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

const STATE_LABELS: Readonly<Record<RelationshipState, string>> = {
  no_history: "No shared history yet",
  recently_connected: "Recently connected",
  in_touch: "In touch",
  due_for_follow_up: "Due for follow-up",
  out_of_touch: "It’s been a while",
};

/** The calm, user-facing label for a stay-in-touch state. */
export function relationshipStateLabel(state: RelationshipState): string {
  return STATE_LABELS[state];
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function days(count: number): string {
  return `${count} ${plural(count, "day", "days")}`;
}

/* -------------------------------------------------------------------------- */
/* Cadence arithmetic                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Reduce a bounded sample of interaction instants to the DISTINCT owner-calendar
 * days they fall on, oldest first. Two events on one day are one day of contact —
 * a busy afternoon of edits must not read as a burst of interactions.
 */
function interactionDaysOf(
  sample: readonly Date[],
  calendarIsoOf: (instant: Date) => string,
): string[] {
  const seen = new Set<string>();
  for (const instant of sample) {
    seen.add(calendarIsoOf(instant));
  }
  return [...seen].sort();
}

/** The gaps, in owner-calendar days, between consecutive interaction days. */
function gapsBetween(orderedDays: readonly string[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < orderedDays.length; i += 1) {
    gaps.push(relationshipDaysBetween(orderedDays[i - 1], orderedDays[i]));
  }
  return gaps;
}

/** Round to one decimal place, avoiding `-0` and floating-point tails. */
function round1(value: number): number {
  return Math.round(value * 10) / 10 + 0;
}

/* -------------------------------------------------------------------------- */
/* The evaluator                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Derive a Person's relationship summary and stay-in-touch state from their facts
 * and the injected clock.
 *
 * Precedence for the PRIMARY state:
 *
 *     no_history → out_of_touch → due_for_follow_up → recently_connected → in_touch
 *
 * `no_history` wins because there is nothing to measure. An extended absence
 * outranks an elapsed cadence because it is the more complete statement (and it
 * holds even for a Person with no cadence set). Whichever state wins, EVERY
 * applicable reason is preserved in `reasons`, primary first, so the UI keeps the
 * secondary context.
 *
 * Pure and TOTAL: it never throws on empty facts, an unfamiliar cadence or a sample
 * whose instants are out of order, and it reads nothing but its two arguments.
 */
export function evaluatePersonRelationship(
  facts: PersonRelationshipFacts,
  ctx: RelationshipEvaluationContext,
): PersonRelationship {
  const evaluatedAtIso = ctx.now.toISOString();

  const lastDate =
    facts.lastInteractionAt === null
      ? null
      : ctx.calendarIsoOf(facts.lastInteractionAt);
  const firstDate =
    facts.firstInteractionAt === null
      ? null
      : ctx.calendarIsoOf(facts.firstInteractionAt);

  const summary: RelationshipSummary = {
    totalInteractions: Math.max(0, facts.totalInteractions),
    meetings: facts.records.meetings,
    diaryEntries: facts.records.diaryEntries,
    notes: facts.records.notes,
    tasks: facts.records.tasks,
    openTasks: facts.records.openTasks,
    projects: facts.records.projects,
    activeProjects: facts.records.activeProjects,
    reviews: facts.records.reviews,
    otherRecords: facts.records.otherRecords,
    sharedRecords: facts.records.total,
    firstInteractionIso: facts.firstInteractionAt?.toISOString() ?? null,
    firstInteractionDate: firstDate,
    lastInteractionIso: facts.lastInteractionAt?.toISOString() ?? null,
    lastInteractionDate: lastDate,
  };

  /* ---- cadence ---------------------------------------------------------- */

  const orderedDays = interactionDaysOf(
    facts.interactionSample,
    ctx.calendarIsoOf,
  );
  const gaps = gapsBetween(orderedDays);
  const averageIntervalDays =
    gaps.length === 0
      ? null
      : round1(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length);
  const longestGapDays = gaps.length === 0 ? null : Math.max(...gaps);
  const observedSpanDays =
    orderedDays.length < 2
      ? null
      : relationshipDaysBetween(
          orderedDays[0],
          orderedDays[orderedDays.length - 1],
        );
  const interactionsPerMonth =
    averageIntervalDays === null || averageIntervalDays <= 0
      ? null
      : round1(DAYS_PER_MONTH / averageIntervalDays);

  const daysSinceLastInteraction =
    lastDate === null
      ? null
      : Math.max(0, relationshipDaysBetween(lastDate, ctx.todayIso));

  let expectedIntervalDays: number | null = null;
  let expectedIntervalSource: ExpectedIntervalSource | null = null;
  if (ctx.followUpFrequency !== null) {
    const chosen = FOLLOW_UP_CADENCE_DAYS[ctx.followUpFrequency];
    if (typeof chosen === "number") {
      expectedIntervalDays = chosen;
      expectedIntervalSource = "follow_up_frequency";
    }
  }
  if (
    expectedIntervalDays === null &&
    averageIntervalDays !== null &&
    orderedDays.length >= MIN_DAYS_FOR_OBSERVED_RHYTHM
  ) {
    expectedIntervalDays = Math.max(
      Math.round(averageIntervalDays * OBSERVED_RHYTHM_MULTIPLIER),
      RECENTLY_CONNECTED_WITHIN_DAYS,
    );
    expectedIntervalSource = "observed_rhythm";
  }

  const cadence: RelationshipCadence = {
    daysSinceLastInteraction,
    averageIntervalDays,
    longestGapDays,
    interactionDays: orderedDays.length,
    observedSpanDays,
    interactionsPerMonth,
    expectedIntervalDays,
    expectedIntervalSource,
    sampleTruncated: facts.interactionSampleTruncated,
  };

  /* ---- state + reasons -------------------------------------------------- */

  const reasons: RelationshipReason[] = [];

  if (summary.totalInteractions === 0 || daysSinceLastInteraction === null) {
    reasons.push({
      code: "no_interactions",
      tone: "neutral",
      summary:
        summary.sharedRecords > 0
          ? "Nothing shared has happened yet — the linked records carry no recorded moments."
          : "Nothing shared yet. Link a meeting, note or diary entry to start this history.",
      count: summary.sharedRecords,
    });
    return {
      personId: facts.personId,
      state: "no_history",
      label: STATE_LABELS.no_history,
      tone: "neutral",
      reasons,
      summary,
      cadence,
      evaluatedAtIso,
    };
  }

  const extendedAbsence =
    daysSinceLastInteraction >= EXTENDED_ABSENCE_AFTER_DAYS;
  const followUpDatePassed =
    ctx.nextFollowUpIso !== null &&
    ISO_DATE.test(ctx.nextFollowUpIso) &&
    relationshipDaysBetween(ctx.nextFollowUpIso, ctx.todayIso) > 0;
  const cadenceElapsed =
    expectedIntervalDays !== null &&
    daysSinceLastInteraction > expectedIntervalDays;
  const recentlyConnected =
    daysSinceLastInteraction <= RECENTLY_CONNECTED_WITHIN_DAYS;

  const state: RelationshipState = extendedAbsence
    ? "out_of_touch"
    : followUpDatePassed || cadenceElapsed
      ? "due_for_follow_up"
      : recentlyConnected
        ? "recently_connected"
        : "in_touch";

  // Primary reason first, then the supporting context — the same shape PROJ-02's
  // health reasons use, so the shared panel renders both identically.
  if (extendedAbsence) {
    reasons.push({
      code: "extended_absence",
      tone: "info",
      summary: `No shared activity since ${lastDate}.`,
      days: daysSinceLastInteraction,
      date: lastDate ?? undefined,
    });
  }
  if (followUpDatePassed) {
    reasons.push({
      code: "follow_up_date_passed",
      tone: "info",
      summary: `You planned to follow up on ${ctx.nextFollowUpIso}.`,
      date: ctx.nextFollowUpIso ?? undefined,
    });
  }
  if (cadenceElapsed && expectedIntervalDays !== null) {
    reasons.push({
      code: "cadence_elapsed",
      tone: "info",
      summary:
        expectedIntervalSource === "follow_up_frequency"
          ? `Last shared activity ${days(daysSinceLastInteraction)} ago; you chose to stay in touch about every ${days(expectedIntervalDays)}.`
          : `Last shared activity ${days(daysSinceLastInteraction)} ago; you usually connect about every ${days(expectedIntervalDays)}.`,
      days: daysSinceLastInteraction,
    });
  }
  if (!extendedAbsence && !followUpDatePassed && !cadenceElapsed) {
    if (recentlyConnected) {
      reasons.push({
        code: "recent_interaction",
        tone: "success",
        summary:
          daysSinceLastInteraction === 0
            ? "Shared activity today."
            : `Last shared activity ${days(daysSinceLastInteraction)} ago.`,
        days: daysSinceLastInteraction,
        date: lastDate ?? undefined,
      });
    } else {
      reasons.push({
        code: "steady_rhythm",
        tone: "neutral",
        summary: `Last shared activity ${days(daysSinceLastInteraction)} ago.`,
        days: daysSinceLastInteraction,
        date: lastDate ?? undefined,
      });
    }
  }
  if (averageIntervalDays === null) {
    reasons.push({
      code: "single_interaction",
      tone: "neutral",
      summary: "One recorded moment so far — not yet enough for a rhythm.",
      count: summary.totalInteractions,
    });
  } else if (
    !reasons.some(
      (reason) =>
        reason.code === "steady_rhythm" || reason.code === "cadence_elapsed",
    )
  ) {
    reasons.push({
      code: "steady_rhythm",
      tone: "neutral",
      summary: `About one shared moment every ${days(Math.round(averageIntervalDays))}.`,
      days: Math.round(averageIntervalDays),
    });
  }

  return {
    personId: facts.personId,
    state,
    label: STATE_LABELS[state],
    tone: reasons[0]?.tone ?? "neutral",
    reasons,
    summary,
    cadence,
    evaluatedAtIso,
  };
}
