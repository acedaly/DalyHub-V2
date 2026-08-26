/**
 * FOLLOW-01 — what became of the work a period was asked to hold.
 *
 * Pure, storage-free, clock-free, React-free. Every input is a fact a caller
 * already read — a named {@link ActivityWindow}, the Task's own plan history as
 * normalised Activity, and the Task as it stands now — and every output is a
 * plain reading of them. **Nothing here is stored** ([ADR-110]): the account of
 * a week is recomputed from the append-only Activity stream on every read, so it
 * cannot drift from the events that produced it, and deleting or reopening a
 * record changes the account correctly and immediately.
 *
 * ── The four questions this file exists to keep apart ───────────────────────
 * A plan can fail in ways that look identical once they are flattened into
 * "completed / not completed", which is all DalyHub could say before this:
 *
 *   1. **did it happen at all**, inside the period;
 *   2. **did it happen on the day it was planned for** — which is a claim about
 *      the plan IN FORCE AT THE MOMENT OF COMPLETION, not about whatever date
 *      the Task happens to carry now;
 *   3. **did the plan move**, and how many times;
 *   4. **was it still owed** when the period closed, or had it been taken off
 *      the plan, pushed out of the week, or dropped altogether.
 *
 * (2) and (3) are deliberately ORTHOGONAL. A Task moved on Tuesday and finished
 * on its new Thursday kept the day it was planned for AND moved — those are
 * different questions and the vocabulary answers both rather than collapsing
 * them into a verdict.
 *
 * ── Causality, not coincidence ──────────────────────────────────────────────
 * "Done later than planned" means the HISTORY supports that conclusion: the plan
 * pointed at an earlier day of the period at the moment the work was completed.
 * It never means "the Task carries an old date", which is a statement about now
 * and would call a Task finished early on Monday and re-planned for Friday
 * "late". The plan is reconstructed forwards from the events; the Task's current
 * `scheduled_date` is used for ONE thing only, and it is stated where it happens
 * ({@link resolvePlanAtWindowOpen}).
 *
 * ── No score ────────────────────────────────────────────────────────────────
 * There is no percentage, no grade, no streak and no ranking of one period
 * against another. Counts with their denominators, in the product's own nouns.
 * [ADR-110] decision 4.
 */

import {
  activityWindowPhase,
  isInActivityWindow,
  type ActivityWindow,
} from "./activity-window";

/* -------------------------------------------------------------------------- */
/* The normalised history                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What one recorded event DID to a Task, in this module's own vocabulary.
 *
 * Deliberately NOT the stored Activity type names. Which stored event types
 * carry a plan change is a storage question — `task.planned`,
 * `task.rescheduled` and `task.plan_cleared` are the domain authority, and an
 * `entity.updated` whose payload names `scheduledDate` is the same fact written
 * by a different path — so the adapter normalises and this kernel never learns a
 * storage event name. That is the same seam every other kernel evaluator uses.
 */
export type TaskPlanEventKind =
  "planned" | "rescheduled" | "cleared" | "completed" | "reopened";

/** True for the three kinds that move the plan. */
export function isPlanMovement(kind: TaskPlanEventKind): boolean {
  return kind === "planned" || kind === "rescheduled" || kind === "cleared";
}

/**
 * One normalised historical fact about one Task.
 *
 * `planBefore` / `planAfter` are the wall-calendar days the plan pointed at
 * either side of the event, and they are what makes the history reconstructible
 * without a second record: `task.rescheduled` and `task.plan_cleared` already
 * carry `previous`, and `task.planned` carries no `previous` precisely because
 * there was no plan before it.
 */
export interface TaskPlanEvent {
  readonly taskId: string;
  readonly kind: TaskPlanEventKind;
  /** The event's own UTC instant, as stored. */
  readonly occurredAtIso: string;
  /** The plan the event REPLACED. Null when there was none. */
  readonly planBefore: string | null;
  /** The plan the event LEFT IN FORCE. Null for a clear, and for completion. */
  readonly planAfter: string | null;
}

/**
 * The Task itself, as it stands NOW — the small set of current-state facts the
 * account genuinely needs, and no more.
 *
 * `scheduledDate` is present for one purpose only (see
 * {@link resolvePlanAtWindowOpen}) and `abandonedNow` for one other: work the
 * owner has since CANCELLED or parked is not unfinished work. That is GATE-02's
 * `isTaskOutOfCommitment` read with `completed: false` — deliberately the
 * non-completion half of it, because completion has an instant and is therefore
 * a historical fact this module folds, whereas cancelling and parking do not and
 * can only be read as they stand now.
 */
export interface TaskPlanSubject {
  readonly id: string;
  readonly title: string;
  /** The Task's plan now. */
  readonly scheduledDate: string | null;
  /** The spine's completion instant, or null. */
  readonly completedAtIso: string | null;
  /** Cancelled or Someday/Maybe NOW — never "completed", which is folded. */
  readonly abandonedNow: boolean;
  /** The Project/Area the Task sits under, for the account's own links. */
  readonly parent: {
    readonly kind: string;
    readonly id: string;
    readonly title: string;
  } | null;
}

/* -------------------------------------------------------------------------- */
/* The vocabulary                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What became of ONE Task the period's plan held — or, for `unplanned`, of one
 * it never held.
 *
 * Eight, and each one is a different thing to have happened rather than a
 * different shade of failure. The three completions are separated because
 * "finished on the day I said" and "finished three days later" are the two
 * halves of the question this whole feature exists to answer, and because
 * finishing something EARLY is not a defect and must not be filed with lateness.
 */
export const TASK_PLAN_OUTCOMES = [
  /** Completed inside the period, on the day the plan pointed at. */
  "kept",
  /** Completed inside the period, after the day the plan pointed at. */
  "completed_late",
  /** Completed inside the period, before the day the plan pointed at. */
  "completed_early",
  /** Still owed at the period's close, still planned inside the period. */
  "carried",
  /** Still owed, but the plan now points at a day outside the period. */
  "moved_out",
  /** Still owed, and the plan was taken off entirely. */
  "cleared",
  /** No longer being done — cancelled or parked since. */
  "dropped",
  /** Completed inside the period without the period's plan ever holding it. */
  "unplanned",
] as const;

export type TaskPlanOutcome = (typeof TASK_PLAN_OUTCOMES)[number];

/** True for the three outcomes that mean the work was finished in the period. */
export function isCompletedOutcome(outcome: TaskPlanOutcome): boolean {
  return (
    outcome === "kept" ||
    outcome === "completed_late" ||
    outcome === "completed_early" ||
    outcome === "unplanned"
  );
}

/**
 * One Task's account, with every fact that produced its outcome beside it.
 *
 * The facts travel with the verdict on purpose: a surface renders the words, and
 * an owner who disagrees with the rule can see the dates it read rather than
 * having to trust it. It is the same discipline REVIEW-03's `reason` established.
 */
export interface TaskPlanAccountEntry {
  readonly taskId: string;
  readonly title: string;
  readonly outcome: TaskPlanOutcome;
  /** The plan in force when the period opened, or null. */
  readonly plannedDayAtOpen: string | null;
  /** The plan in force when the period closed (or now, for a running one). */
  readonly plannedDayAtClose: string | null;
  /**
   * The day inside the period the work was actually MEASURED against — the plan
   * in force at completion, or the last day inside the period the plan pointed
   * at before it. Null when the period's plan never held this Task.
   */
  readonly plannedDayJudged: string | null;
  /** The owner-calendar day the work was completed on, when inside the period. */
  readonly completedDay: string | null;
  /** Every day INSIDE the period the plan pointed at, in the order it did. */
  readonly plannedDays: readonly string[];
  /** Date-to-date plan changes made INSIDE the period. Never a boolean. */
  readonly reschedules: number;
  /** Plan changes of any kind made inside the period (placed, moved, cleared). */
  readonly planChanges: number;
  /** True when the plan moved into the period FROM ANOTHER DAY during it. */
  readonly movedIn: boolean;
  /** True when work with no plan at all was PLACED into the period during it. */
  readonly addedDuring: boolean;
  /**
   * True when the period is still running and this Task's planned day has not
   * arrived. ADR-110 decision 5: a day that has not happened is not a miss.
   */
  readonly planStillAhead: boolean;
  readonly parent: TaskPlanSubject["parent"];
}

/**
 * The period's account: the entries, the counts, and the window they cover.
 *
 * `bounded` is true when the read behind it hit its limit — the surface then
 * says so, exactly as REVIEW-03's `InsightMeasure` does, rather than presenting
 * a partial count as a complete one.
 */
export interface PeriodPlanAccount {
  readonly window: ActivityWindow;
  readonly phase: ReturnType<typeof activityWindowPhase>;
  readonly entries: readonly TaskPlanAccountEntry[];
  readonly counts: PeriodPlanCounts;
  readonly bounded: boolean;
  /** False when the read failed. The surface then says so, never shows zero. */
  readonly available: boolean;
}

/** Every count the account states. Each one has its denominator beside it in
 * `planned`, and none of them is combined into a score. */
export interface PeriodPlanCounts {
  /** Tasks the period's plan held at any point. The denominator for the rest. */
  readonly planned: number;
  readonly kept: number;
  readonly completedLate: number;
  readonly completedEarly: number;
  /** Planned work still owed at the close, whose day has passed. */
  readonly carried: number;
  /** Planned work still owed whose day has not arrived (a running period only). */
  readonly carriedAhead: number;
  readonly movedOut: number;
  readonly cleared: number;
  readonly dropped: number;
  /** Completed inside the period without the period's plan holding it. */
  readonly unplanned: number;
  /** Everything finished inside the period, planned or not. */
  readonly completed: number;
  /** Date-to-date plan changes made inside the period, across every Task. */
  readonly reschedules: number;
  /** How many Tasks were rescheduled at least once inside the period. */
  readonly rescheduled: number;
  /** Tasks whose plan moved into the period from another day, during it. */
  readonly movedIn: number;
  /** Tasks with no plan at all that were placed into the period during it. */
  readonly added: number;
}

const EMPTY_COUNTS: PeriodPlanCounts = {
  planned: 0,
  kept: 0,
  completedLate: 0,
  completedEarly: 0,
  carried: 0,
  carriedAhead: 0,
  movedOut: 0,
  cleared: 0,
  dropped: 0,
  unplanned: 0,
  completed: 0,
  reschedules: 0,
  rescheduled: 0,
  movedIn: 0,
  added: 0,
};

/** The account a caller shows when the read behind it failed. Never zeroes
 * presented as measurements — `available` is what the surface reads. */
export function unavailablePlanAccount(
  window: ActivityWindow,
  todayIso: string,
): PeriodPlanAccount {
  return {
    window,
    phase: activityWindowPhase(window, todayIso),
    entries: [],
    counts: EMPTY_COUNTS,
    bounded: false,
    available: false,
  };
}

/* -------------------------------------------------------------------------- */
/* The derivation                                                              */
/* -------------------------------------------------------------------------- */

/** Deterministic order: instant, then the caller's own sequence, so two events
 * written in the same millisecond keep the order they were recorded in. */
function orderEvents(events: readonly TaskPlanEvent[]): TaskPlanEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const instant = a.event.occurredAtIso.localeCompare(
        b.event.occurredAtIso,
      );
      return instant !== 0 ? instant : a.index - b.index;
    })
    .map((entry) => entry.event);
}

/**
 * The plan in force when the window OPENED.
 *
 * Four sources, in descending order of directness, and the order is the whole
 * argument:
 *
 *   1. the LAST plan event before the window — it states the plan it left in
 *      force, so nothing has to be inferred;
 *   2. the FIRST plan event inside the window — its `planBefore` is that same
 *      statement read from the other side;
 *   3. the FIRST plan event after the window — likewise, and this is what makes
 *      a Task the owner withdrew from a closed week the following Monday still
 *      appear in that week's account;
 *   4. and ONLY when the Task has no plan event at all: the Task's current
 *      `scheduled_date`.
 *
 * (4) is not "inferring history from current state where Activity is the
 * authority" — it is the INITIAL CONDITION the events record deltas from. A Task
 * created with a planned day emits `entity.created` and no planning event, so
 * for a Task nothing has ever re-planned, the day it carries now is the day it
 * has carried since it existed. Wherever a plan event exists, the event wins.
 */
export function resolvePlanAtWindowOpen(
  window: ActivityWindow,
  ordered: readonly TaskPlanEvent[],
  subject: TaskPlanSubject,
): string | null {
  const movements = ordered.filter((event) => isPlanMovement(event.kind));
  const before = movements.filter(
    (event) => event.occurredAtIso < window.startInstantIso,
  );
  if (before.length > 0) return before[before.length - 1].planAfter;
  const fromWindowOnwards = movements.filter(
    (event) => event.occurredAtIso >= window.startInstantIso,
  );
  if (fromWindowOnwards.length > 0) return fromWindowOnwards[0].planBefore;
  return subject.scheduledDate;
}

/** What the caller must supply so this module never touches a timezone. */
export interface PeriodPlanAccountInput {
  readonly window: ActivityWindow;
  /** The owner's calendar day (ADR-022), so a running period is not judged. */
  readonly todayIso: string;
  readonly subjects: readonly TaskPlanSubject[];
  readonly events: readonly TaskPlanEvent[];
  /** An instant to the owner's calendar day. Supplied, never derived here. */
  readonly ownerDayOf: (instantIso: string) => string;
  /** True when the read behind `subjects` hit its bound. */
  readonly bounded?: boolean;
}

/**
 * Derive one period's account. Pure and total: the same input always produces
 * the same output, which is what makes the history matrix testable and the
 * surface checkable.
 */
export function derivePeriodPlanAccount(
  input: PeriodPlanAccountInput,
): PeriodPlanAccount {
  const { window, todayIso, ownerDayOf } = input;
  const phase = activityWindowPhase(window, todayIso);

  const byTask = new Map<string, TaskPlanEvent[]>();
  for (const event of input.events) {
    const bucket = byTask.get(event.taskId) ?? [];
    bucket.push(event);
    byTask.set(event.taskId, bucket);
  }

  const entries: TaskPlanAccountEntry[] = [];
  for (const subject of input.subjects) {
    const entry = accountFor(
      window,
      phase,
      todayIso,
      subject,
      orderEvents(byTask.get(subject.id) ?? []),
      ownerDayOf,
    );
    if (entry !== null) entries.push(entry);
  }

  entries.sort((a, b) => {
    const left = a.plannedDayJudged ?? a.completedDay ?? "9999-99-99";
    const right = b.plannedDayJudged ?? b.completedDay ?? "9999-99-99";
    const day = left.localeCompare(right);
    if (day !== 0) return day;
    const title = a.title.localeCompare(b.title);
    return title !== 0 ? title : a.taskId.localeCompare(b.taskId);
  });

  return {
    window,
    phase,
    entries,
    counts: countAccount(entries),
    bounded: input.bounded === true,
    available: true,
  };
}

/** One Task's account, or null when the period neither held nor finished it. */
function accountFor(
  window: ActivityWindow,
  phase: ReturnType<typeof activityWindowPhase>,
  todayIso: string,
  subject: TaskPlanSubject,
  ordered: readonly TaskPlanEvent[],
  ownerDayOf: (instantIso: string) => string,
): TaskPlanAccountEntry | null {
  const inside = ordered.filter(
    (event) =>
      event.occurredAtIso >= window.startInstantIso &&
      event.occurredAtIso < window.endInstantIso,
  );

  const planAtOpen = resolvePlanAtWindowOpen(window, ordered, subject);

  /*
   * Walk the period forwards. `plan` is the plan in force at each instant, and
   * `judged` remembers the last day INSIDE the period the plan pointed at — the
   * day the work is measured against even if the plan was later cleared, because
   * "you said Tuesday and did it on Thursday" stays true when Wednesday's
   * decision was to take it off the list.
   */
  let plan = planAtOpen;
  let judged = isInActivityWindow(window, plan) ? plan : null;
  const plannedDays: string[] = [];
  if (judged !== null) plannedDays.push(judged);

  let reschedules = 0;
  let planChanges = 0;
  let movedIn = false;
  let addedDuring = false;

  /*
   * Completion is FOLDED rather than read off the Task, so a completion the
   * owner undid inside the period does not report as a finished week — and, just
   * as importantly, a completion made AFTER the period does not reach back into
   * it. The fold starts from what was true when the period opened.
   */
  const completedAtOpen =
    subject.completedAtIso !== null &&
    subject.completedAtIso < window.startInstantIso;
  let completedInPeriodAt: string | null = null;
  let planWhenCompleted: string | null = null;

  for (const event of inside) {
    if (isPlanMovement(event.kind)) {
      planChanges += 1;
      if (event.planBefore !== null && event.planAfter !== null) {
        reschedules += 1;
      }
      const wasInside = isInActivityWindow(window, plan);
      plan = event.planAfter;
      if (isInActivityWindow(window, plan)) {
        if (!wasInside) {
          if (event.planBefore === null) addedDuring = true;
          else movedIn = true;
        }
        if (plan !== null && plannedDays[plannedDays.length - 1] !== plan) {
          plannedDays.push(plan);
        }
        judged = plan;
      }
      continue;
    }
    if (event.kind === "completed") {
      completedInPeriodAt = event.occurredAtIso;
      planWhenCompleted = isInActivityWindow(window, plan) ? plan : judged;
      continue;
    }
    // `reopened` — the period did not finish this work after all.
    completedInPeriodAt = null;
    planWhenCompleted = null;
  }

  const heldByThePeriod = plannedDays.length > 0;
  const finishedInPeriod = completedInPeriodAt !== null;

  /*
   * Work that was ALREADY finished when the period opened and that the period
   * did not touch is not this period's business, whatever date it still carries.
   * Reporting it would put last week's completed Task into this week's account
   * because nobody cleared its planned day afterwards.
   */
  if (completedAtOpen && inside.length === 0) return null;
  if (!heldByThePeriod && !finishedInPeriod) return null;

  const completedDay = finishedInPeriod
    ? ownerDayOf(completedInPeriodAt as string)
    : null;
  const plannedDayJudged = heldByThePeriod
    ? (planWhenCompleted ?? judged)
    : null;

  const planStillAhead =
    phase !== "closed" &&
    plan !== null &&
    isInActivityWindow(window, plan) &&
    plan >= todayIso;

  const outcome = classify({
    window,
    heldByThePeriod,
    finishedInPeriod,
    completedDay,
    plannedDayJudged,
    planAtClose: plan,
    abandonedNow: subject.abandonedNow,
  });

  return {
    taskId: subject.id,
    title: subject.title,
    outcome,
    plannedDayAtOpen: planAtOpen,
    plannedDayAtClose: plan,
    plannedDayJudged,
    completedDay,
    plannedDays,
    reschedules,
    planChanges,
    movedIn,
    addedDuring,
    planStillAhead,
    parent: subject.parent,
  };
}

/** The outcome rule, split out so the matrix can drive it directly. */
export function classify(input: {
  readonly window: ActivityWindow;
  readonly heldByThePeriod: boolean;
  readonly finishedInPeriod: boolean;
  readonly completedDay: string | null;
  readonly plannedDayJudged: string | null;
  readonly planAtClose: string | null;
  readonly abandonedNow: boolean;
}): TaskPlanOutcome {
  if (!input.heldByThePeriod) return "unplanned";
  if (input.finishedInPeriod) {
    const planned = input.plannedDayJudged;
    const done = input.completedDay;
    if (planned === null || done === null) return "unplanned";
    if (done === planned) return "kept";
    return done > planned ? "completed_late" : "completed_early";
  }
  /*
   * Not finished inside the period. Finishing it LATER does not change that —
   * the period closed with the work still owed — so completion is deliberately
   * NOT consulted here. Only cancelling and parking are, and both are read as
   * they stand now because neither records an instant.
   */
  if (input.abandonedNow) return "dropped";
  if (input.planAtClose === null) return "cleared";
  return isInActivityWindow(input.window, input.planAtClose)
    ? "carried"
    : "moved_out";
}

function countAccount(
  entries: readonly TaskPlanAccountEntry[],
): PeriodPlanCounts {
  const counts = { ...EMPTY_COUNTS } as {
    -readonly [K in keyof PeriodPlanCounts]: PeriodPlanCounts[K];
  };
  for (const entry of entries) {
    if (entry.outcome !== "unplanned") counts.planned += 1;
    counts.reschedules += entry.reschedules;
    if (entry.reschedules > 0) counts.rescheduled += 1;
    if (entry.movedIn) counts.movedIn += 1;
    if (entry.addedDuring) counts.added += 1;
    if (isCompletedOutcome(entry.outcome)) counts.completed += 1;
    switch (entry.outcome) {
      case "kept":
        counts.kept += 1;
        break;
      case "completed_late":
        counts.completedLate += 1;
        break;
      case "completed_early":
        counts.completedEarly += 1;
        break;
      case "carried":
        if (entry.planStillAhead) counts.carriedAhead += 1;
        else counts.carried += 1;
        break;
      case "moved_out":
        counts.movedOut += 1;
        break;
      case "cleared":
        counts.cleared += 1;
        break;
      case "dropped":
        counts.dropped += 1;
        break;
      case "unplanned":
        counts.unplanned += 1;
        break;
    }
  }
  return counts;
}
